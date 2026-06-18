require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const hpp = require('hpp');
const rateLimit = require('express-rate-limit');

const logger = require('./utils/logger');
const { testConnections } = require('./config/database');
const { errorHandler, notFound } = require('./middleware/errorHandler');

// Route imports
const authRoutes = require('./routes/auth');
const employeeRoutes = require('./routes/employees');
const attendanceRoutes = require('./routes/attendance');
const leaveRoutes = require('./routes/leaves');
const regularizationRoutes = require('./routes/regularization');
const reportRoutes = require('./routes/reports');
const notificationRoutes = require('./routes/notifications');
const adminRoutes = require('./routes/admin');
const biometricRoutes = require('./routes/biometric');

const app = express();

// Security middleware
app.use(helmet());
app.use(hpp());
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (server-to-server, Next.js proxy, curl)
    if (!origin) return callback(null, true);
    const allowed = (process.env.CORS_ORIGINS || 'http://localhost:3000')
      .split(',').map(s => s.trim());
    if (allowed.includes('*') || allowed.includes(origin)) return callback(null, true);
    callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Body parsing & compression (before rate limiting so auth limiter can read req.body)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(compression());

// Rate limiting - use X-Forwarded-For for proper client identification behind proxy
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
  keyGenerator: (req) => req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip,
});
app.use('/api/', limiter);

// Stricter rate limit for auth endpoints — keyed by email + IP to avoid shared-IP lockout
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many login attempts, please try again later.' },
  keyGenerator: (req) => {
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip;
    const email = (req.body && req.body.email) || '';
    return `${ip}:${email}`;
  },
});
app.use('/api/auth/login', authLimiter);

// Logging
app.use(morgan('combined', {
  stream: { write: (msg) => logger.info(msg.trim()) },
}));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/leaves', leaveRoutes);
app.use('/api/regularization', regularizationRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/biometric', biometricRoutes);

const managerRoutes = require('./routes/manager');
app.use('/api/manager', managerRoutes);

const hrRoutes = require('./routes/hr');
app.use('/api/hr', hrRoutes);

// Error handling
app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 4000;

async function startServer() {
  try {
    await testConnections();
    app.listen(PORT, () => {
      logger.info(`AttendEase API server running on port ${PORT}`);
    });
  } catch (err) {
    logger.error('Failed to start server', err);
    process.exit(1);
  }
}

// Start biometric sync job
if (process.env.NODE_ENV !== 'test') {
  require('./jobs/biometricSyncJob');
  require('./jobs/leaveAccrualJob');
  require('./jobs/absentMarkingJob');
  require('./jobs/attendanceEmailJob');
  require('./jobs/punchOutReminderJob');
  startServer();
}

module.exports = app;
