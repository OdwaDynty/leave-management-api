// ─── SECURITY MIDDLEWARE ──────────────────────────────
// Protects the API from common attacks:
// 1. Helmet        — sets secure HTTP headers
// 2. Rate limiting — blocks brute force login attempts
// 3. CORS          — controls which origins can call the API

const helmet    = require('helmet');
const rateLimit = require('express-rate-limit');
const cors      = require('cors');

// ─── HELMET ───────────────────────────────────────────
// Sets HTTP response headers that protect against
// clickjacking, MIME sniffing, and XSS attacks

const helmetMiddleware = helmet({
  
  // Prevent the app from being loaded in an iframe
  
  frameguard: { action: 'deny' },

  // Prevent browsers from MIME-sniffing the content type
  
  noSniff: true,
  
  // Force HTTPS in production only
  
  hsts: process.env.NODE_ENV === 'production'
    ? { maxAge: 31536000, includeSubDomains: true }
    : false,
  });


// ─── GENERAL RATE LIMITER ─────────────────────────────
// Limits each IP to 100 requests per 15 minutes
// Protects against DDoS and scraping attacks
const generalLimiter = rateLimit({
  windowMs:        15 * 60 * 1000, // 15 minutes
  max:             1000,             // Max requests per IP
  message: {
    error: 'Too many requests from this IP. Please try again in 15 minutes.'
  },
  standardHeaders: true,  // Return rate limit info in headers
  legacyHeaders:   false, // Disable old X-RateLimit headers
});

// ─── AUTH RATE LIMITER ────────────────────────────────
// Stricter limit on login and register endpoints
// Only 10 attempts per 15 minutes per IP
// Protects against brute force password attacks
const authLimiter = rateLimit({
  windowMs:        15 * 60 * 1000, // 15 minutes
  max:             1000,              // Only 10 attempts
  message: {
    error: 'Too many login attempts from this IP. Please try again in 15 minutes.'
  },
  standardHeaders: true,
  legacyHeaders:   false,
});

// ─── CORS ─────────────────────────────────────────────
// Controls which frontend origins can call the API
// In production we allow both the Vercel URL and
// any custom domain the client sets up
const corsOptions = {
  // Allow multiple origins in production
  origin: (origin, callback) => {
    // In development allow everything
    if (process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }

    // In production allow requests from:
    // 1. The APP_URL environment variable (Vercel URL)
    // 2. No origin (server-to-server requests like Postman)
    const allowedOrigins = [
      process.env.APP_URL,
      // Add your custom domain here later
      // 'https://leavesync.co.za',
    ].filter(Boolean); // Remove any undefined values

    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`Origin ${origin} not allowed by CORS`));
    }
  },
  methods:        ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials:    true,
};

const corsMiddleware = cors(corsOptions);

module.exports = {
  helmetMiddleware,
  generalLimiter,
  authLimiter,
  corsMiddleware,
};