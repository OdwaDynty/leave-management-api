// ─── EMPLOYEE ROUTES ──────────────────────────────────
// Defines all URL endpoints for employee management
// All routes require authentication (JWT token)
// Some routes are restricted to hr_admin and super_admin only

const express = require('express');
const router  = express.Router();

// Import controller functions
const {
  addEmployee,
  listEmployees,
  getEmployee,
  updateEmployee,
  deactivateEmployee,
  reactivateEmployee,
} = require('../controllers/employeeController');

// Import auth middleware
const { authenticate, authorize } = require('../middleware/auth');

// ── All routes below require a valid JWT token ─────────
// authenticate runs first on every route in this file
router.use(authenticate);

// ── POST /api/employees ────────────────────────────────
// Add a new employee — hr_admin and super_admin only
router.post(
  '/',
  authorize('hr_admin', 'super_admin'),
  addEmployee
);

// ── GET /api/employees ─────────────────────────────────
// List all employees in the company
// Managers and above can see the full list
router.get(
  '/',
  authorize('manager', 'hr_admin', 'super_admin'),
  listEmployees
);

// ── GET /api/employees/:id ─────────────────────────────
// Get a single employee's details
// All authenticated users can call this
// (the controller handles restricting employees to their own profile)
router.get('/:id', getEmployee);

// ── PUT /api/employees/:id ─────────────────────────────
// Update an employee's details
// All authenticated users can call this
// (the controller restricts what each role can change)
router.put('/:id', updateEmployee);

// ── DELETE /api/employees/:id ──────────────────────────
// Deactivate an employee — hr_admin and super_admin only
router.delete(
  '/:id',
  authorize('hr_admin', 'super_admin'),
  deactivateEmployee
);

// ── PUT /api/employees/:id/reactivate ──────────────────
// Reactivate a deactivated employee — hr_admin and super_admin only
router.put(
  '/:id/reactivate',
  authorize('hr_admin', 'super_admin'),
  reactivateEmployee
);

module.exports = router;