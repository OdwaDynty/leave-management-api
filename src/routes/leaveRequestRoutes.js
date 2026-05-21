// ─── LEAVE REQUEST ROUTES ─────────────────────────────
// All endpoints for the leave request lifecycle
// All routes require a valid JWT token

const express = require('express');
const router  = express.Router();

// Import controller functions
const {
  submitLeaveRequest,
  getMyLeaveRequests,
  getPendingApprovals,
  getLeaveRequest,
  approveLeaveRequest,
  rejectLeaveRequest,
  cancelLeaveRequest,
  getLeaveCalendar,
  hrApproveLeaveRequest,
} = require('../controllers/leaveRequestController');

// Import auth middleware
const { authenticate, authorize } = require('../middleware/auth');

// ── All routes require a valid JWT token ───────────────
router.use(authenticate);

// ── POST /api/leave-requests ───────────────────────────
// Any authenticated employee can submit a leave request
router.post('/', submitLeaveRequest);

// ── IMPORTANT: Specific named routes must come BEFORE /:id
// Otherwise Express treats "my", "pending", "calendar"
// as id parameters and routes them to the wrong handler

// ── GET /api/leave-requests/my ────────────────────────
// Any employee views their own requests
router.get('/my', getMyLeaveRequests);

// ── GET /api/leave-requests/pending ───────────────────
// Managers and above view pending approvals
router.get(
  '/pending',
  authorize('manager', 'hr_admin', 'super_admin'),
  getPendingApprovals
);

// ── GET /api/leave-requests/calendar ──────────────────
// All authenticated users can view the leave calendar
router.get('/calendar', getLeaveCalendar);

// ── GET /api/leave-requests/:id ───────────────────────
// Get a single leave request by its ID
router.get('/:id', getLeaveRequest);

// ── PUT /api/leave-requests/:id/approve ───────────────
// Managers and HR approve a pending request
router.put(
  '/:id/approve',
  authorize('manager', 'hr_admin', 'super_admin'),
  approveLeaveRequest
);

// ── PUT /api/leave-requests/:id/reject ────────────────
// Managers and HR reject a pending request
router.put(
  '/:id/reject',
  authorize('manager', 'hr_admin', 'super_admin'),
  rejectLeaveRequest
);

// ── PUT /api/leave-requests/:id/cancel ────────────────
// Any employee can cancel their own pending request
router.put('/:id/cancel', cancelLeaveRequest);

// PUT /api/leave-requests/:id/hr-approve
// HR admin gives final approval on long leave requests
router.put(
  '/:id/hr-approve',
  authorize('hr_admin', 'super_admin'),
  hrApproveLeaveRequest
);

module.exports = router;