// ─── REPORT ROUTES ────────────────────────────────────
// All endpoints for generating reports
// All routes require authentication
// Most reports are restricted to managers and above

const express = require('express');
const router  = express.Router();

// Import controller functions
const {
  getCompanySummary,
  getEmployeeReport,
  getTeamOverview,
  getAbsenteeismReport,
  getUpcomingLeave,
} = require('../controllers/reportController');

// Import auth middleware
const { authenticate, authorize } = require('../middleware/auth');

// ── All routes require a valid JWT token ───────────────
router.use(authenticate);

// ── GET /api/reports/summary ───────────────────────────
// Company wide leave summary — hr_admin and super_admin only
router.get(
  '/summary',
  authorize('hr_admin', 'super_admin'),
  getCompanySummary
);

// ── GET /api/reports/team ──────────────────────────────
// Team overview — managers and above
router.get(
  '/team',
  authorize('manager', 'hr_admin', 'super_admin'),
  getTeamOverview
);

// ── GET /api/reports/absenteeism ───────────────────────
// Absenteeism rankings — hr_admin and super_admin only
router.get(
  '/absenteeism',
  authorize('hr_admin', 'super_admin'),
  getAbsenteeismReport
);

// ── GET /api/reports/upcoming ──────────────────────────
// Upcoming approved leave — managers and above
router.get(
  '/upcoming',
  authorize('manager', 'hr_admin', 'super_admin'),
  getUpcomingLeave
);

// ── GET /api/reports/employee/:id ─────────────────────
// Single employee report — managers and above
// NOTE: this must come LAST because :id is a wildcard
// and would otherwise match /summary, /team etc
router.get(
  '/employee/:id',
  authorize('manager', 'hr_admin', 'super_admin'),
  getEmployeeReport
);

module.exports = router;