import express from 'express';
import { query } from '../utils/database';
import { logger } from '../utils/logger';

const router = express.Router();

// Only expose this endpoint in test environment.  It's used by the
// Playwright fixtures to clear everything between runs so records from one
// test don't leak into the next.  The handler runs simple DELETEs; you can
// expand it if new tables are added.
router.post('/reset', async (_req, res) => {
  if (process.env.NODE_ENV !== 'test') {
    return res.status(404).json({ error: 'Not available' });
  }

  try {
    // order matters because of foreign keys
    await query('DELETE FROM bookings');
    await query("DELETE FROM users WHERE role <> 'admin'");
    await query('DELETE FROM services');
    await query('DELETE FROM reviews');
    await query('DELETE FROM company_info');
    // keep migrations table intact so subsequent runs don't reapply them

    // after we clear everything, run the same seed logic used at startup so
    // that each reset leaves the database in a usable state.  this keeps the
    // tests from having to replicate the company/services/admin seeding.
    // `seedDatabase` is written to be safe when called multiple times and will
    // only insert rows if they don't already exist.
    try {
      const { seedDatabase } = await import('../db/seed');
      await seedDatabase();
      logger?.info?.('✅ Database reseeded after reset');
    } catch (seedErr) {
      // log but don't crash the reset handler; it could still be useful that
      // the tables were cleared even if the seed failed.
      console.error('Error reseeding database during reset:', seedErr);
    }

    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
