"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.io = exports.server = void 0;
exports.startServer = startServer;
exports.stopServer = stopServer;
const http_1 = __importDefault(require("http"));
const app_1 = __importDefault(require("./app"));
const config_1 = require("./config");
const logger_advanced_1 = require("./utils/logger-advanced");
const socket_io_1 = require("socket.io");
const chat_1 = require("./socket/chat");
const ReminderService_1 = require("./services/ReminderService");
const CacheService_1 = require("./services/CacheService");
const runMigrations_1 = require("./db/runMigrations");
const seed_1 = require("./db/seed");
const database_1 = require("./utils/database");
let server = null;
exports.server = server;
let io = null;
exports.io = io;
async function startServer() {
    // wait for the database server to be ready; on CI/containers this may take a
    // second or two after the postgres process exits its init script.
    try {
        await (0, database_1.waitForDatabase)({ timeoutMs: 20000 });
        logger_advanced_1.logger.info('✅ Database is accepting connections');
    }
    catch (err) {
        logger_advanced_1.logger.error('❌ Database did not become ready in time:', err);
    }
    // ensure database schema exists before handling any requests
    try {
        await (0, runMigrations_1.runMigrations)();
        logger_advanced_1.logger.info('✅ Database migrations complete');
    }
    catch (err) {
        logger_advanced_1.logger.error('❌ Migration error:', err);
        // continue anyway; tests may rely on tables already being present
    }
    // wait a moment for migrations to settle (allow all connections to see changes)
    await new Promise(r => setTimeout(r, 1000));
    // in test mode we seed the DB automatically (fresh sandbox)
    if (process.env.NODE_ENV === 'test') {
        try {
            await (0, seed_1.seedDatabase)();
            logger_advanced_1.logger.info('✅ Test database seeded');
        }
        catch (err) {
            logger_advanced_1.logger.error('❌ Seeding error during startup:', err);
            // let the process continue; later requests will fail if seed is required
        }
    }
    exports.server = server = http_1.default.createServer(app_1.default);
    // Initialize Socket.IO
    exports.io = io = new socket_io_1.Server(server, {
        cors: {
            origin: process.env.FRONTEND_URL || "http://localhost:3000",
            methods: ["GET", "POST"]
        }
    });
    // Setup socket handlers
    (0, chat_1.setupSocketHandlers)(io);
    // bind to both IPv6 and IPv4 loopback addresses so tests using ::1 or 127.0.0.1 work
    return new Promise((resolve) => {
        server.listen(config_1.PORT, '::', async () => {
            logger_advanced_1.logger.info(`✅ Backend running on http://localhost:${config_1.PORT}`);
            logger_advanced_1.logger.info(`✅ Socket.IO enabled for real-time chat`);
            // Initialize existing reminders
            await ReminderService_1.ReminderService.initializeExistingReminders();
            // Initialize Redis cache
            await CacheService_1.cacheService.connect();
            resolve();
        });
    });
}
if (require.main === module) {
    // when started directly, run and ignore the returned promise
    startServer().catch(err => {
        logger_advanced_1.logger.error('Failed to start server:', err);
        process.exit(1);
    });
}
async function stopServer() {
    if (server) {
        await new Promise((resolve) => server.close(() => resolve()));
    }
}
//# sourceMappingURL=main.js.map