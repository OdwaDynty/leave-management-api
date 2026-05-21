// ─── REQUEST LOGGER ───────────────────────────────────
// Logs every incoming HTTP request to the console
// In development: colourful detailed logs
// In production: compact logs suitable for log aggregators
//
// Log format shows:
// METHOD /path STATUS responseTime ms - bytes
// e.g. POST /api/auth/login 200 23ms - 512b

const morgan = require('morgan');

// ── Development Logger ────────────────────────────────
// 'dev' format: colourful, concise output
// GREEN  = 2xx success
// YELLOW = 3xx redirect
// RED    = 4xx and 5xx errors
const devLogger = morgan('dev');

// ── Production Logger ─────────────────────────────────
// 'combined' format: Apache-style log with IP, user agent, etc.
// Suitable for sending to log management tools like Papertrail
const prodLogger = morgan('combined');

// Export the right logger based on environment
const requestLogger = process.env.NODE_ENV === 'production'
  ? prodLogger
  : devLogger;

module.exports = requestLogger;