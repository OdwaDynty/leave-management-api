// ─── AUDIT ROUTES ─────────────────────────────────────
// Read-only access to the audit trail
// Only hr_admin and super_admin can view audit logs

const express = require('express');
const router  = express.Router();

const {
  getAuditLog,
  getEmployeeAuditHistory,
  getActionTypes,
} = require('../controllers/auditController');

const { authenticate, authorize } = require('../middleware/auth');

// All audit routes require authentication
router.use(authenticate);

// All audit routes are HR admin and above only
router.use(authorize('hr_admin', 'super_admin'));

// GET /api/audit
// Full company audit log with optional filters
router.get('/', getAuditLog);

// GET /api/audit/action-types
// List of unique action types for filter dropdown
// NOTE: must come BEFORE /:id to avoid conflict
router.get('/action-types', getActionTypes);

// GET /api/audit/employee/:id
// Audit history for one specific employee
router.get('/employee/:id', getEmployeeAuditHistory);

module.exports = router;