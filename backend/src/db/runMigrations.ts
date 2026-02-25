import fs from 'fs';
import path from 'path';
import { query } from '../utils/database';
import { logger } from '../utils/logger';

async function runMigrations() {
  try {
    logger.info('🔄 Starting database migrations...');

    // Create migrations tracking table if it doesn't exist
    const dbType = process.env.DB_TYPE || 'postgres';
    // choose the proper SQL depending on the database type.  the sqlite
    // version must use CURRENT_TIMESTAMP – `datetime('now')` is not allowed as
    // a DEFAULT expression and was causing a syntax error during the earlier
    // run.  this mirrors the format used by the other sqlite migrations.
    const createMigrationsTableSQL = dbType === 'sqlite'
      ? `CREATE TABLE IF NOT EXISTS migrations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL UNIQUE,
          executed_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`
      : `CREATE TABLE IF NOT EXISTS migrations (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) NOT NULL UNIQUE,
          executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`;

    // log the actual SQL in a single string so it can be debugged if it fails
    logger.info(`Create migrations table SQL: ${createMigrationsTableSQL.replace(/\n/g, ' ')}`);
    await query(createMigrationsTableSQL);

    logger.info('📋 Migrations tracking table ready');

    // In test environment, clear migrations tracking so tests always apply current SQL
    if (require('../config').NODE_ENV === 'test') {
      logger.info('🧹 Clearing migrations table for test environment');
      await query('DELETE FROM migrations');
    }

    // Read all migration files
    const migrationsDir = path.join(__dirname, '../../migrations');
    // Use SQLite migrations if DB_TYPE is sqlite
    const actualMigrationsDir = dbType === 'sqlite'
      ? path.join(__dirname, '../../migrations_sqlite')
      : migrationsDir;
    logger.info(`Using migrations dir: ${actualMigrationsDir} (dbType=${dbType})`);
    const migrationFiles = fs.readdirSync(actualMigrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort();

    logger.info(`Found ${migrationFiles.length} migration files`);

    for (const file of migrationFiles) {
      const migrationName = file.replace('.sql', '');
      
      // Check if migration already executed
      const result = await query(
        'SELECT * FROM migrations WHERE name = $1',
        [migrationName]
      );

      if ((result as any[]).length > 0) {
        logger.info(`✅ Migration already executed: ${migrationName}`);
        continue;
      }

      // Read and execute migration
      const filePath = path.join(actualMigrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf-8');

      logger.info(`🚀 Executing migration: ${migrationName}`);
      
      // Execute all statements in the SQL file
      // remove all single-line comments first so that semicolons inside them
      // don’t confuse our naive split.  then split on `;` and trim the results.
      const cleaned = sql.replace(/--.*$/gm, '');
      const statements = cleaned
        .split(';')
        .map(stmt => stmt.trim())
        .filter(stmt => stmt.length > 0);

      for (const statement of statements) {
        try {
          logger.info(`Executing SQL statement: ${statement.slice(0, 240).replace(/\n/g, ' ')}`);
          await query(statement);
        } catch (err) {
          logger.error('Error executing statement:', statement.slice(0,240).replace(/\n/g,' '));
          // Ignore benign errors that may occur when re-applying migrations
          const msg = err instanceof Error ? err.message : String(err);
          const ignorable = [
            'already exists',
            'duplicate column name',
            'no such column',
            'column already exists'
          ];

          if (ignorable.some(substr => msg.toLowerCase().includes(substr))) {
            logger.warn(`⚠️  Ignoring migration error: ${msg}`);
            continue;
          }

          throw err;
        }
      }

      // Record migration as executed
      await query(
        'INSERT INTO migrations (name) VALUES ($1)',
        [migrationName]
      );

      logger.info(`✨ Migration completed: ${migrationName}`);
    }

    logger.info('✅ All migrations completed successfully!');
    process.exit(0);
  } catch (err) {
    logger.error('❌ Migration failed:', err);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  runMigrations();
}

export { runMigrations };
