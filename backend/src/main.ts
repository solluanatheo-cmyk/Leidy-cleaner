import http from 'http';
import app from './app';
import { PORT } from './config';
import { logger } from './utils/logger-advanced';
import { Server as SocketServer } from 'socket.io';
import { setupSocketHandlers } from './socket/chat';
import { ReminderService } from './services/ReminderService';
import { cacheService } from './services/CacheService';
import { runMigrations } from './db/runMigrations';
import { seedDatabase } from './db/seed';
import { waitForDatabase } from './utils/database';

let server: http.Server | null = null;
let io: SocketServer | null = null;

async function startServer(): Promise<void> {
  // wait for the database server to be ready; on CI/containers this may take a
  // second or two after the postgres process exits its init script.
  try {
    await waitForDatabase({ timeoutMs: 20000 });
    logger.info('✅ Database is accepting connections');
  } catch (err) {
    logger.error('❌ Database did not become ready in time:', err);
  }

  // ensure database schema exists before handling any requests
  try {
    await runMigrations();
    logger.info('✅ Database migrations complete');
  } catch (err) {
    logger.error('❌ Migration error:', err);
    // continue anyway; tests may rely on tables already being present
  }

  // wait a moment for migrations to settle (allow all connections to see changes)
  await new Promise(r => setTimeout(r, 1000));

  // in test mode we seed the DB automatically (fresh sandbox)
  if (process.env.NODE_ENV === 'test') {
    try {
      await seedDatabase();
      logger.info('✅ Test database seeded');
    } catch (err) {
      logger.error('❌ Seeding error during startup:', err);
      // let the process continue; later requests will fail if seed is required
    }
  }

  server = http.createServer(app);

  // Initialize Socket.IO
  io = new SocketServer(server, {
    cors: {
      origin: process.env.FRONTEND_URL || "http://localhost:3000",
      methods: ["GET", "POST"]
    }
  });

  // Setup socket handlers
  setupSocketHandlers(io);

  // bind to both IPv6 and IPv4 loopback addresses so tests using ::1 or 127.0.0.1 work
  return new Promise((resolve) => {
    server!.listen(PORT, '::', async () => {
      logger.info(`✅ Backend running on http://localhost:${PORT}`);
      logger.info(`✅ Socket.IO enabled for real-time chat`);

      // Initialize existing reminders
      await ReminderService.initializeExistingReminders();

      // Initialize Redis cache
      await cacheService.connect();

      resolve();
    });
  });
}

if (require.main === module) {
  // when started directly, run and ignore the returned promise
  startServer().catch(err => {
    logger.error('Failed to start server:', err);
    process.exit(1);
  });
}

async function stopServer(): Promise<void> {
  if (server) {
    await new Promise<void>((resolve) => server!.close(() => resolve()));
  }
}

export { server, startServer, stopServer, io };
