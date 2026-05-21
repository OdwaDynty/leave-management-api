// ─── LEAVE POLICY ROUTES ──────────────────────────────
// Endpoints for managing role-based leave policies
// All routes are restricted to hr_admin and super_admin

const express = require('express');
const router  = express.Router();

const {
  createPolicy,
  listPolicies,
  updatePolicy,
  autoAssignBalances,
} = require('../controllers/leavePolicyController');

const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate);
router.use(authorize('hr_admin', 'super_admin'));

// POST /api/leave-policies/auto-assign
// Must come BEFORE /:id to avoid route conflict
router.post('/auto-assign', autoAssignBalances);

// POST /api/leave-policies
router.post('/', createPolicy);

// GET /api/leave-policies
router.get('/', listPolicies);

// PUT /api/leave-policies/:id
router.put('/:id', updatePolicy);

module.exports = router;