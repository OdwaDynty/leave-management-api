// ─── GLOBAL ERROR HANDLER ─────────────────────────────
// Catches any unhandled errors thrown anywhere in the app
// Returns a consistent JSON error response
// The 4-parameter signature (err, req, res, next) is required
// by Express to recognise this as an error handling middleware

const errorHandler = (err, req, res, next) => {
  // Log the full error stack in development for debugging
  if (process.env.NODE_ENV !== 'production') {
    console.error('─── Unhandled Error ───────────────────');
    console.error('Route:  ', req.method, req.url);
    console.error('Message:', err.message);
    console.error('Stack:  ', err.stack);
    console.error('───────────────────────────────────────');
  } else {
    // In production only log the message — not the stack trace
    // Stack traces can leak internal implementation details
    console.error(`Error on ${req.method} ${req.url}: ${err.message}`);
  }

  // ── Handle Specific Error Types ───────────────────

  // PostgreSQL unique constraint violation
  // e.g. duplicate email or subdomain
  if (err.code === '23505') {
    return res.status(409).json({
      error: 'A record with this value already exists.'
    });
  }

  // PostgreSQL foreign key violation
  // e.g. referencing a user or company that doesn't exist
  if (err.code === '23503') {
    return res.status(400).json({
      error: 'Referenced record does not exist.'
    });
  }

  // PostgreSQL invalid UUID format
  if (err.code === '22P02') {
    return res.status(400).json({
      error: 'Invalid ID format provided.'
    });
  }

  // JWT errors (in case they bubble up)
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({ error: 'Invalid token.' });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      error: 'Token expired. Please log in again.'
    });
  }

  // ── Default Error Response ────────────────────────
  // Use the status code from the error if available
  // otherwise default to 500 Internal Server Error
  const statusCode = err.statusCode || err.status || 500;

  return res.status(statusCode).json({
    error: process.env.NODE_ENV === 'production'
      ? 'An unexpected error occurred.'   // Hide details in production
      : err.message,                       // Show details in development
  });
};

// ─── 404 HANDLER ──────────────────────────────────────
// Catches requests to routes that don't exist
// Must be registered AFTER all other routes
const notFoundHandler = (req, res) => {
  res.status(404).json({
    error:   `Route not found: ${req.method} ${req.url}`,
    message: 'Please check the API documentation for available endpoints.'
  });
};

module.exports = { errorHandler, notFoundHandler };