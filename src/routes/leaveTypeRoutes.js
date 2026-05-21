// ─── LEAVE TYPE ROUTES ────────────────────────────────
// Defines all URL endpoints for leave type management
// All routes require authentication
// Create, Update and Delete are restricted to hr_admin and super_admin

const express = require('express');
const router  = express.Router();

// Import controller functions
const {
  createLeaveType,
  listLeaveTypes,
  getLeaveType,
  updateLeaveType,
  deactivateLeaveType,
} = require('../controllers/leaveTypeController');

// Import auth middleware
const { authenticate, authorize } = require('../middleware/auth');

// ── All routes require a valid JWT token ───────────────
router.use(authenticate);

// ── POST /api/leave-types ──────────────────────────────
// Create a new leave type — hr_admin and super_admin only
router.post(
  '/',
  authorize('hr_admin', 'super_admin'),
  createLeaveType
);

// ── GET /api/leave-types ───────────────────────────────
// List all leave types — all authenticated users can view
router.get('/', listLeaveTypes);

// ── GET /api/leave-types/:id ───────────────────────────
// Get a single leave type — all authenticated users can view
router.get('/:id', getLeaveType);

// ── PUT /api/leave-types/:id ───────────────────────────
// Update a leave type — hr_admin and super_admin only
router.put(
  '/:id',
  authorize('hr_admin', 'super_admin'),
  updateLeaveType
);

// ── DELETE /api/leave-types/:id ────────────────────────
// Deactivate a leave type — hr_admin and super_admin only
router.delete(
  '/:id',
  authorize('hr_admin', 'super_admin'),
  deactivateLeaveType
);

module.exports = router;