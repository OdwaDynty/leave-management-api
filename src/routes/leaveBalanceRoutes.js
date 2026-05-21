// ─── LEAVE BALANCE ROUTES ─────────────────────────────
// Defines all URL endpoints for leave balance management
// All routes require authentication

const express = require('express');
const router  = express.Router();

// Import controller functions
const {
  assignLeaveBalance,
  getMyBalances,
  getEmployeeBalances,
  adjustLeaveBalance,
  runCarryOver,
} = require('../controllers/leaveBalanceController');

// Import auth middleware
const { authenticate, authorize } = require('../middleware/auth');

// ── All routes require a valid JWT token ───────────────
router.use(authenticate);

// ── POST /api/leave-balances/assign ───────────────────
// Assign a leave balance to an employee
// hr_admin and super_admin only
router.post(
  '/assign',
  authorize('hr_admin', 'super_admin'),
  assignLeaveBalance
);

// ── GET /api/leave-balances/my ────────────────────────
// Any logged-in employee can view their own balances
router.get('/my', getMyBalances);

// ── GET /api/leave-balances/employee/:id ──────────────
// View any employee's balances — managers and above only
router.get(
  '/employee/:id',
  authorize('manager', 'hr_admin', 'super_admin'),
  getEmployeeBalances
);

// ── PUT /api/leave-balances/:id ───────────────────────
// Manually adjust a balance — hr_admin and super_admin only
router.put(
  '/:id',
  authorize('hr_admin', 'super_admin'),
  adjustLeaveBalance
);

// ── POST /api/leave-balances/carry-over ───────────────
// Run year end carry over — super_admin only
router.post(
  '/carry-over',
  authorize('super_admin'),
  runCarryOver
);

module.exports = router;