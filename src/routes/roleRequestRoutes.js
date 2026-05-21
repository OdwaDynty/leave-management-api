// ─── ROLE REQUEST ROUTES ──────────────────────────────
// Self-service promotion request endpoints

const express = require('express');
const router  = express.Router();

const {
  submitRoleRequest,
  getMyRoleRequests,
  getPendingRoleRequests,
  approveRoleRequest,
  rejectRoleRequest,
} = require('../controllers/roleRequestController');

const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate);

// POST /api/role-requests — any logged in user
router.post('/', submitRoleRequest);

// GET /api/role-requests/my — any logged in user
router.get('/my', getMyRoleRequests);

// GET /api/role-requests/pending — HR only
router.get(
  '/pending',
  authorize('hr_admin', 'super_admin'),
  getPendingRoleRequests
);

// PUT /api/role-requests/:id/approve — HR only
router.put(
  '/:id/approve',
  authorize('hr_admin', 'super_admin'),
  approveRoleRequest
);

// PUT /api/role-requests/:id/reject — HR only
router.put(
  '/:id/reject',
  authorize('hr_admin', 'super_admin'),
  rejectRoleRequest
);

module.exports = router;