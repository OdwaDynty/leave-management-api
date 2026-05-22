// ─── LOAD ENVIRONMENT VARIABLES ───────────────────────
// Must be the very first line so all files can access process.env
require('dotenv').config();

// ─── IMPORTS ──────────────────────────────────────────
const express = require('express');

// Database
const { pool } = require('./config/db');
// Import email verifier
const { verifyEmailConnection } = require('./config/email');

// Security middleware
const {
  helmetMiddleware,
  generalLimiter,
  authLimiter,
  corsMiddleware,
} = require('./middleware/security');

// Logging middleware
const requestLogger = require('./middleware/requestLogger');

// Error handlers
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

// Route files
const indexRoutes        = require('./routes/indexRoutes');
const authRoutes         = require('./routes/authRoutes');
const employeeRoutes     = require('./routes/employeeRoutes');
const leaveTypeRoutes    = require('./routes/leaveTypeRoutes');
const leaveBalanceRoutes = require('./routes/leaveBalanceRoutes');
const leaveRequestRoutes = require('./routes/leaveRequestRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const reportRoutes       = require('./routes/reportRoutes');
const publicHolidayRoutes = require('./routes/publicHolidayRoutes');

const auditRoutes       = require('./routes/auditRoutes');
const leavePolicyRoutes = require('./routes/leavePolicyRoutes');
const roleRequestRoutes = require('./routes/roleRequestRoutes');

const companyRoutes = require('./routes/companyRoutes');


// ─── INITIALISE EXPRESS ───────────────────────────────
const app  = express();

// Trust the first proxy in front of the app
// Required on Render, Railway, Heroku and similar platforms
// These platforms sit behind a load balancer that adds
// the X-Forwarded-For header — we must tell Express
// to trust it so rate limiting works correctly
// '1' means trust exactly one proxy level
app.set('trust proxy', 1);


const PORT = process.env.PORT || 3000;

// ─── SECURITY MIDDLEWARE ──────────────────────────────
// These run on every request before anything else

// Set secure HTTP headers
app.use(helmetMiddleware);

// Allow cross-origin requests from frontend
app.use(corsMiddleware);

// General rate limiting — 100 requests per 15 min per IP
app.use(generalLimiter);


// ─── REQUEST LOGGING ──────────────────────────────────
// Log every incoming request to the console
app.use(requestLogger);

// ─── BODY PARSING ─────────────────────────────────────
// Parse incoming JSON request bodies
app.use(express.json());

// Parse URL-encoded form data
app.use(express.urlencoded({ extended: true }));

// ─── HEALTH CHECK ─────────────────────────────────────
// Quick endpoint to confirm server and DB are running
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({
      status:      'ok',
      message:     'Leave Management API is running',
      database:    'connected',
      environment: process.env.NODE_ENV,
      time:        new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({
      status:   'error',
      message:  'Database not connected',
      database: 'disconnected',
    });
  }
});

// ─── ROUTES ───────────────────────────────────────────
// API index — lists all endpoints
app.use('/api', indexRoutes);

// Auth routes — stricter rate limiting on login/register
app.use('/api/auth', authLimiter, authRoutes);

// All other feature routes
app.use('/api/employees',      employeeRoutes);
app.use('/api/leave-types',    leaveTypeRoutes);
app.use('/api/leave-balances', leaveBalanceRoutes);
app.use('/api/leave-requests', leaveRequestRoutes);
app.use('/api/notifications',  notificationRoutes);
app.use('/api/reports',        reportRoutes);
app.use('/api/public-holidays', publicHolidayRoutes);

app.use('/api/audit',          auditRoutes);
app.use('/api/leave-policies', leavePolicyRoutes);
app.use('/api/role-requests',  roleRequestRoutes);

app.use('/api/company', companyRoutes);

// ─── ERROR HANDLERS ───────────────────────────────────
// 404 — must be AFTER all routes
app.use(notFoundHandler);

// Global error handler — must be LAST with 4 parameters
app.use(errorHandler);

// ─── START SERVER ─────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📋 API index:    http://localhost:${PORT}/api`);
  console.log(`❤️  Health check: http://localhost:${PORT}/api/health`);
  console.log(`🌍 Environment:  ${process.env.NODE_ENV}`);
  // Verify email connection after server starts
  verifyEmailConnection();
});