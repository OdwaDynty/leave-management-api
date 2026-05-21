// ─── AUTH ROUTES ──────────────────────────────────────
// Defines the URL endpoints for authentication
// Each route maps a URL + HTTP method to a controller function

const express    = require('express');
const router     = express.Router();

// Import controller functions
const { register, login, getProfile, forgotPassword, resetPassword } = require('../controllers/authController');

// Import auth middleware
const { authenticate } = require('../middleware/auth');

// ── Public Routes ──────────────────────────────────────
// These routes do NOT require a token — anyone can call them

// Register a new company and admin user
// POST http://localhost:3000/api/auth/register
router.post('/register', register);

// Login with email and password
// POST http://localhost:3000/api/auth/login
router.post('/login', login);

// ── Protected Routes ───────────────────────────────────
// These routes REQUIRE a valid JWT token
// The authenticate middleware checks the token before the handler runs

// Get the currently logged-in user's profile
// GET http://localhost:3000/api/auth/me
router.get('/me', authenticate, getProfile);


// POST /api/auth/forgot-password
// User submits email to request a reset link
router.post('/forgot-password', forgotPassword);

// POST /api/auth/reset-password
// User submits token + new password to reset
router.post('/reset-password', resetPassword);

module.exports = router;