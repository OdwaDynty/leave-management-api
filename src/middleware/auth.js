// ─── AUTH MIDDLEWARE ──────────────────────────────────
// These functions protect routes from unauthorised access
// They run BEFORE the route handler on any protected route

const { verifyToken } = require('../utils/jwt');
const { query }       = require('../config/db');

// ─── AUTHENTICATE ─────────────────────────────────────
// Checks that the request has a valid JWT token
// Attaches the logged-in user object to req.user
// Usage: add as middleware on any route that requires login
// Example: router.get('/profile', authenticate, getProfile)
const authenticate = async (req, res, next) => {
  try {
    // The token is sent in the Authorization header as:
    // "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
    const authHeader = req.headers.authorization;

    // Reject if no Authorization header was sent
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Access denied. Please log in to continue.'
      });
    }

    // Extract the token part (remove the "Bearer " prefix)
    const token = authHeader.split(' ')[1];

    // Verify the token and decode its payload
    const decoded = verifyToken(token);

    // Fetch fresh user data from the database
    // We do this instead of trusting the token alone
    // because the user may have been deactivated since the token was issued
    const result = await query(
      `SELECT id, company_id, first_name, last_name,
              email, role, manager_id, department, is_active
       FROM users
       WHERE id = $1`,
      [decoded.userId]
    );

    // Reject if user no longer exists in the database
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'User account not found.' });
    }

    const user = result.rows[0];

    // Reject if the account has been deactivated
    if (!user.is_active) {
      return res.status(403).json({
        error: 'Your account has been deactivated. Please contact HR.'
      });
    }

    // Attach the user to the request so route handlers can access it
    // e.g. req.user.id, req.user.role, req.user.company_id
    req.user = user;

    // Pass control to the next middleware or route handler
    next();

  } catch (err) {
    // Handle specific JWT errors with clear messages
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'Your session has expired. Please log in again.'
      });
    }
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({
        error: 'Invalid token. Please log in again.'
      });
    }
    return res.status(500).json({ error: 'Authentication error.' });
  }
};

// ─── AUTHORIZE ────────────────────────────────────────
// Checks that the logged-in user has the required role
// Must be used AFTER authenticate (needs req.user to exist)
// Usage: authorize('hr_admin', 'super_admin')
// Example: router.delete('/users/:id', authenticate, authorize('super_admin'), deleteUser)
const authorize = (...roles) => {
  return (req, res, next) => {
    // This should never happen if middleware is set up correctly
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated.' });
    }

    // Check if the user's role is in the list of allowed roles
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Access denied. This action requires one of these roles: ${roles.join(', ')}.`
      });
    }

    // User has the required role — proceed
    next();
  };
};

module.exports = { authenticate, authorize };