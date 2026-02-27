import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import path from 'path';
import { logger } from './utils/logger-advanced';
import { setupSwagger } from './utils/swagger';
import { sanitizeInput } from './middleware/sanitize';
import { errorHandler } from './middleware/errorHandler';
import { userRateLimit, authRateLimit } from './middleware/userRateLimit';
import {
  authRoutes,
  serviceRoutes,
  bookingsRoutes,
  paymentsRoutes,
  companyRoutes,
  adminRoutes,
  reviewsRoutes,
  staffRoutes,
  aiRoutes,
  chatRoutes,
  twoFactorRoutes,
  analyticsRoutes,
  testRoutes
} from './routes';
import { NODE_ENV, FRONTEND_URL, CORS_ALLOWED } from './config';

const app: Express = express();

// Trust proxy for rate limiting
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
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

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    const allowed = Array.from(new Set([...CORS_ALLOWED, FRONTEND_URL].filter(Boolean) as string[]));
    if (allowed.includes(origin) || allowed.some(o => origin.startsWith(o))) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

app.use(cookieParser());

app.use(morgan('combined', {
  stream: {
    write: (message: string) => logger.info(message.trim())
  }
}));

// rate limiting
app.use('/api/v1/auth', authRateLimit);
app.use('/api/v1', userRateLimit);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(sanitizeInput);

app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

setupSwagger(app);

app.get('/health', async (_req: Request, res: Response) => {
  const { cacheService } = await import('./services/CacheService');
  const { ReminderService } = await import('./services/ReminderService');
  const { notificationService } = await import('./services/NotificationService');

  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || '1.0.0',
    environment: NODE_ENV,
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
    logger.info('Testing database connection...');
    await new Promise(resolve => setTimeout(resolve, 100));
    const result = await query('SELECT 1 as test');
    logger.info('Database test result:', result);
    health.checks.database = true;
  } catch (error) {
    health.status = 'error';
    health.checks.database = false;
    logger.error('Health check failed - Database error details:', (error as Error).message);
    logger.error('DB_TYPE:', process.env.DB_TYPE);
    logger.error('DATABASE_LOCAL:', process.env.DATABASE_LOCAL);
  }

  // Verificar cache Redis
  try {
    const cacheStats = await cacheService.getStats();
    health.checks.cache = cacheStats.connected;
    health.services.cache = cacheStats;
  } catch (error) {
    logger.error('Cache health check failed:', error);
  }

  // Verificar sistema de lembretes
  try {
    const reminderStats = ReminderService.getStats();
    health.services.reminders = reminderStats;
  } catch (error) {
    logger.error('Reminders health check failed:', error);
  }

  // Verificar sistema de notificações
  try {
    const smtpOk = await notificationService.testConnection();
    health.checks.notifications = smtpOk;
    health.services.notifications.smtp = smtpOk;
  } catch (error) {
    logger.error('Notifications health check failed:', error);
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
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/services', serviceRoutes);
app.use('/api/v1/bookings', bookingsRoutes);
app.use('/api/v1/payments', paymentsRoutes);
app.use('/api/v1/company', companyRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/reviews', reviewsRoutes);
app.use('/api/v1/staff', staffRoutes);
app.use('/api/v1/chat', chatRoutes);
app.use('/api/v1/analytics', analyticsRoutes);
app.use('/api/v1/2fa', twoFactorRoutes);
app.use('/api/v1/ai', aiRoutes);

if (NODE_ENV === 'test') {
  app.use('/api/v1/test', testRoutes);
}

app.get('/api/v1/status', (_req: Request, res: Response) => {
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
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: 'Not Found',
    path: req.path,
    method: req.method
  });
});

// global error handler (last middleware)
app.use(errorHandler);

// export the configured express instance for use in tests / server startup
export default app;
