"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const morgan_1 = __importDefault(require("morgan"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const path_1 = __importDefault(require("path"));
const logger_advanced_1 = require("./utils/logger-advanced");
const swagger_1 = require("./utils/swagger");
const sanitize_1 = require("./middleware/sanitize");
const errorHandler_1 = require("./middleware/errorHandler");
const userRateLimit_1 = require("./middleware/userRateLimit");
const routes_1 = require("./routes");
const config_1 = require("./config");
const app = (0, express_1.default)();
// Trust proxy for rate limiting
app.set('trust proxy', 1);
// Security middleware
app.use((0, helmet_1.default)({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "https://api.stripe.com"],
        },
    },
    hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
    }
}));
app.use((0, cors_1.default)({
    origin: function (origin, callback) {
        if (!origin)
            return callback(null, true);
        const allowed = Array.from(new Set([...config_1.CORS_ALLOWED, config_1.FRONTEND_URL].filter(Boolean)));
        if (allowed.includes(origin) || allowed.some(o => origin.startsWith(o))) {
            return callback(null, true);
        }
        return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));
app.use((0, cookie_parser_1.default)());
app.use((0, morgan_1.default)('combined', {
    stream: {
        write: (message) => logger_advanced_1.logger.info(message.trim())
    }
}));
// rate limiting
app.use('/api/v1/auth', userRateLimit_1.authRateLimit);
app.use('/api/v1', userRateLimit_1.userRateLimit);
app.use(express_1.default.json({ limit: '10mb' }));
app.use(express_1.default.urlencoded({ limit: '10mb', extended: true }));
app.use(sanitize_1.sanitizeInput);
app.use('/uploads', express_1.default.static(path_1.default.join(__dirname, '..', 'uploads')));
(0, swagger_1.setupSwagger)(app);
app.get('/health', async (_req, res) => {
    const { cacheService } = await Promise.resolve().then(() => __importStar(require('./services/CacheService')));
    const { ReminderService } = await Promise.resolve().then(() => __importStar(require('./services/ReminderService')));
    const { notificationService } = await Promise.resolve().then(() => __importStar(require('./services/NotificationService')));
    const health = {
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: process.env.npm_package_version || '1.0.0',
        environment: config_1.NODE_ENV,
        checks: {
            database: false,
            memory: true,
            disk: true,
            cache: false,
            notifications: false
        },
        services: {
            cache: { connected: false, keys: 0, memory: '0' },
            reminders: { total: 0, active: 0 },
            notifications: { smtp: false }
        }
    };
    try {
        const { query } = require('./utils/database');
        logger_advanced_1.logger.info('Testing database connection...');
        await new Promise(resolve => setTimeout(resolve, 100));
        const result = await query('SELECT 1 as test');
        logger_advanced_1.logger.info('Database test result:', result);
        health.checks.database = true;
    }
    catch (error) {
        health.status = 'error';
        health.checks.database = false;
        logger_advanced_1.logger.error('Health check failed - Database error details:', error.message);
        logger_advanced_1.logger.error('DB_TYPE:', process.env.DB_TYPE);
        logger_advanced_1.logger.error('DATABASE_LOCAL:', process.env.DATABASE_LOCAL);
    }
    // Verificar cache Redis
    try {
        const cacheStats = await cacheService.getStats();
        health.checks.cache = cacheStats.connected;
        health.services.cache = cacheStats;
    }
    catch (error) {
        logger_advanced_1.logger.error('Cache health check failed:', error);
    }
    // Verificar sistema de lembretes
    try {
        const reminderStats = ReminderService.getStats();
        health.services.reminders = reminderStats;
    }
    catch (error) {
        logger_advanced_1.logger.error('Reminders health check failed:', error);
    }
    // Verificar sistema de notificações
    try {
        const smtpOk = await notificationService.testConnection();
        health.checks.notifications = smtpOk;
        health.services.notifications.smtp = smtpOk;
    }
    catch (error) {
        logger_advanced_1.logger.error('Notifications health check failed:', error);
    }
    const memUsage = process.memoryUsage();
    const memUsageMB = {
        rss: Math.round(memUsage.rss / 1024 / 1024),
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
        external: Math.round(memUsage.external / 1024 / 1024)
    };
    if (memUsage.heapUsed / memUsage.heapTotal > 0.8) {
        health.checks.memory = false;
        health.status = 'warning';
    }
    const statusCode = health.status === 'ok' ? 200 : health.status === 'warning' ? 200 : 503;
    res.status(statusCode).json({
        ...health,
        memory: memUsageMB
    });
});
// API routes
app.use('/api/v1/auth', routes_1.authRoutes);
app.use('/api/v1/services', routes_1.serviceRoutes);
app.use('/api/v1/bookings', routes_1.bookingsRoutes);
app.use('/api/v1/payments', routes_1.paymentsRoutes);
app.use('/api/v1/company', routes_1.companyRoutes);
app.use('/api/v1/admin', routes_1.adminRoutes);
app.use('/api/v1/reviews', routes_1.reviewsRoutes);
app.use('/api/v1/staff', routes_1.staffRoutes);
app.use('/api/v1/chat', routes_1.chatRoutes);
app.use('/api/v1/analytics', routes_1.analyticsRoutes);
app.use('/api/v1/2fa', routes_1.twoFactorRoutes);
app.use('/api/v1/ai', routes_1.aiRoutes);
if (config_1.NODE_ENV === 'test') {
    app.use('/api/v1/test', routes_1.testRoutes);
}
app.get('/api/v1/status', (_req, res) => {
    res.json({
        message: 'Leidy Cleaner API v1',
        status: 'running',
        version: '2.0.0',
        features: {
            auth: 'JWT + Refresh Tokens',
            services: 'CRUD operations',
            database: 'PostgreSQL 15',
            cache: 'Redis 7'
        }
    });
});
// 404 handler (must come after all other routes)
app.use((req, res) => {
    res.status(404).json({
        error: 'Not Found',
        path: req.path,
        method: req.method
    });
});
// global error handler (last middleware)
app.use(errorHandler_1.errorHandler);
// export the configured express instance for use in tests / server startup
exports.default = app;
//# sourceMappingURL=app.js.map