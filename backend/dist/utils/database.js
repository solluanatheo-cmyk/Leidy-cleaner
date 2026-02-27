"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.closeDatabase = exports.getDatabase = exports.getClient = exports.query = void 0;
exports.waitForDatabase = waitForDatabase;
const pg_1 = __importDefault(require("pg"));
const logger_1 = require("./logger");
const { Pool } = pg_1.default;
// Detect database type from environment
const getDBType = () => process.env.DB_TYPE || 'postgres';
const getDatabaseLocal = () => process.env.DATABASE_LOCAL;
logger_1.logger.info('Database module loaded');
// PostgreSQL configuration
let pool = null;
// SQLite configuration - only import when needed
let sqlite3 = null;
let sqliteDb = null;
// Initialize database connection based on type
const initDatabase = () => {
    const DB_TYPE = getDBType();
    const DATABASE_LOCAL = getDatabaseLocal();
    // log as a single message so value isn't dropped by winston
    logger_1.logger.info(`🔄 initDatabase called with DB_TYPE=${DB_TYPE}`);
    if (DB_TYPE === 'sqlite') {
        logger_1.logger.info('📱 Setting up SQLite database...');
        // SQLite setup
        if (!sqlite3) {
            try {
                sqlite3 = require('sqlite3');
            }
            catch (err) {
                logger_1.logger.error('❌ Failed to require sqlite3:', err);
                throw err;
            }
        }
        if (!sqliteDb) {
            sqliteDb = new sqlite3.Database(DATABASE_LOCAL || './database.sqlite', (err) => {
                if (err) {
                    logger_1.logger.error('❌ SQLite connection error:', err);
                }
                else {
                    logger_1.logger.info('✅ SQLite database connected');
                }
            });
        }
        return sqliteDb;
    }
    else {
        logger_1.logger.info('🐘 Setting up PostgreSQL database...');
        // PostgreSQL setup (default)
        if (!pool) {
            // Use DATABASE_URL if available, otherwise construct from individual vars
            const dbConfig = process.env.DATABASE_URL
                ? { connectionString: process.env.DATABASE_URL }
                : {
                    host: process.env.DB_HOST || 'localhost',
                    port: parseInt(process.env.DB_PORT || '5432'),
                    database: process.env.DB_NAME || (require('../config').NODE_ENV === 'test' ? 'leidycleaner_test' : 'leidycleaner_dev'),
                    user: process.env.DB_USER || 'postgres',
                    password: process.env.DB_PASSWORD || 'postgres',
                };
            pool = new Pool({
                ...dbConfig,
                max: 20,
                idleTimeoutMillis: 30000,
                connectionTimeoutMillis: 2000,
            });
            pool.on('connect', () => {
                logger_1.logger.info('✅ PostgreSQL pool connected');
            });
            pool.on('error', (error) => {
                logger_1.logger.error('❌ PostgreSQL pool error:', error);
            });
        }
        return pool;
    }
};
// Initialize immediately - REMOVED for lazy loading
// initDatabase();
// Universal query function
const query = async (text, params) => {
    // Lazy initialization
    const dbType = getDBType();
    if ((dbType === 'sqlite' && !sqliteDb) || (dbType !== 'sqlite' && !pool)) {
        initDatabase();
    }
    return new Promise((resolve, reject) => {
        // Add explicit timeout to prevent hanging
        const timeoutHandle = setTimeout(() => {
            reject(new Error(`Database query timeout after 10 seconds: ${text.slice(0, 100)}`));
        }, 10000);
        // Helper to clean timeout and resolve
        const wrappedResolve = (value) => {
            clearTimeout(timeoutHandle);
            resolve(value);
        };
        // Helper to clean timeout and reject
        const wrappedReject = (error) => {
            clearTimeout(timeoutHandle);
            reject(error);
        };
        if (getDBType() === 'sqlite' && sqliteDb) {
            // Preprocess SQL for SQLite compatibility
            let sql = text;
            const wantsReturning = /RETURNING\s+/i.test(sql);
            if (wantsReturning) {
                sql = sql.replace(/RETURNING[\s\S]*$/i, '');
            }
            sql = sql.replace(/\bNOW\(\)/ig, 'CURRENT_TIMESTAMP');
            // Convert PostgreSQL $N placeholders to SQLite ?
            sql = sql.replace(/\$\d+/g, '?');
            const trimmed = sql.trim().toLowerCase();
            if (trimmed.startsWith('select')) {
                sqliteDb.all(sql, params || [], (err, rows) => {
                    if (err)
                        wrappedReject(err);
                    else
                        wrappedResolve(rows);
                });
            }
            else {
                sqliteDb.run(sql, params || [], function (err) {
                    if (err)
                        return wrappedReject(err);
                    if (wantsReturning) {
                        // Try to detect table name for INSERT/UPDATE to fetch the affected row
                        const insertMatch = sql.match(/insert\s+into\s+["'`]?([a-zA-Z0-9_]+)["'`]?/i);
                        const updateMatch = sql.match(/update\s+["'`]?([a-zA-Z0-9_]+)["'`]?/i);
                        if (insertMatch) {
                            const table = insertMatch[1];
                            const lastID = this && this.lastID;
                            sqliteDb.all(`SELECT * FROM ${table} WHERE id = ?`, [lastID], (err2, rows) => {
                                if (err2)
                                    wrappedReject(err2);
                                else
                                    wrappedResolve(rows);
                            });
                        }
                        else if (updateMatch) {
                            const table = updateMatch[1];
                            // Assume the id was passed as the last parameter for updates using RETURNING
                            const idParam = params && params.length ? params[params.length - 1] : null;
                            if (idParam == null)
                                return wrappedResolve([]);
                            sqliteDb.all(`SELECT * FROM ${table} WHERE id = ?`, [idParam], (err2, rows) => {
                                if (err2)
                                    wrappedReject(err2);
                                else
                                    wrappedResolve(rows);
                            });
                        }
                        else {
                            wrappedResolve([]);
                        }
                    }
                    else {
                        wrappedResolve([]);
                    }
                });
            }
        }
        else if (pool) {
            pool.query(text, params)
                .then(result => wrappedResolve(result.rows))
                .catch(wrappedReject);
        }
        else {
            wrappedReject(new Error('Database not initialized'));
        }
    });
};
exports.query = query;
const getClient = async () => {
    if (getDBType() === 'sqlite' && sqliteDb) {
        return sqliteDb;
    }
    else if (pool) {
        return await pool.connect();
    }
    else {
        throw new Error('Database not initialized');
    }
};
exports.getClient = getClient;
// Initialize on module load - REMOVED to allow dotenv loading first
// const db = initDatabase();
// Export a function to get the database instance instead
const getDatabase = () => {
    if (getDBType() === 'sqlite') {
        return sqliteDb || initDatabase();
    }
    else {
        return pool || initDatabase();
    }
};
exports.getDatabase = getDatabase;
// wait until the database is accepting connections by issuing a simple query
async function waitForDatabase(options) {
    const timeout = options?.timeoutMs ?? 15000;
    const interval = options?.intervalMs ?? 200;
    const start = Date.now();
    while (Date.now() - start < timeout) {
        try {
            await (0, exports.query)('SELECT 1');
            return;
        }
        catch (err) {
            // if connection refused or similar, pause and retry
            await new Promise((r) => setTimeout(r, interval));
            continue;
        }
    }
    throw new Error(`Timed out waiting for database after ${timeout}ms`);
}
exports.default = exports.getDatabase;
const closeDatabaseGracefully = async () => {
    try {
        if (sqliteDb) {
            await new Promise((resolve, reject) => {
                try {
                    sqliteDb.close((err) => {
                        if (err) {
                            logger_1.logger.error('Error closing SQLite:', err);
                            return reject(err);
                        }
                        logger_1.logger.info('✅ SQLite database closed gracefully');
                        sqliteDb = null;
                        resolve();
                    });
                }
                catch (err) {
                    // if close throws synchronously
                    logger_1.logger.error('SQLite close threw error:', err);
                    sqliteDb = null;
                    return resolve();
                }
            });
        }
        else if (pool) {
            try {
                await pool.end();
                logger_1.logger.info('✅ PostgreSQL pool closed gracefully');
            }
            finally {
                pool = null;
            }
        }
    }
    catch (err) {
        // ignore
    }
};
process.on('SIGINT', closeDatabaseGracefully);
process.on('SIGTERM', closeDatabaseGracefully);
// Exported helper to allow tests to close DB connections gracefully
exports.closeDatabase = closeDatabaseGracefully;
//# sourceMappingURL=database.js.map