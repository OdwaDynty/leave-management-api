// ─── PUBLIC HOLIDAY ROUTES ────────────────────────────
// All endpoints for managing public holidays
// All routes require authentication
// Add, seed, and delete are restricted to hr_admin and super_admin
// Listing holidays is available to all authenticated users

const express = require('express');
const router  = express.Router();

// Import controller functions
const {
  seedSAHolidays,
  addHoliday,
  listHolidays,
  deleteHoliday,
} = require('../controllers/publicHolidayController');

// Import auth middleware
const { authenticate, authorize } = require('../middleware/auth');

// ── All routes require a valid JWT token ───────────────
router.use(authenticate);

// ── POST /api/public-holidays/seed ────────────────────
// Seed all SA public holidays for a given year
// hr_admin and super_admin only
// NOTE: /seed must come BEFORE /:id to avoid Express
// treating "seed" as an id parameter
router.post(
  '/seed',
  authorize('hr_admin', 'super_admin'),
  seedSAHolidays
);

// ── POST /api/public-holidays ──────────────────────────
// Add a single custom holiday
// hr_admin and super_admin only
router.post(
  '/',
  authorize('hr_admin', 'super_admin'),
  addHoliday
);

// ── GET /api/public-holidays ───────────────────────────
// List all holidays — all authenticated users can view
// Optional: ?year=2026
router.get('/', listHolidays);

// ── DELETE /api/public-holidays/:id ───────────────────
// Remove a holiday — hr_admin and super_admin only
router.delete(
  '/:id',
  authorize('hr_admin', 'super_admin'),
  deleteHoliday
);

module.exports = router;