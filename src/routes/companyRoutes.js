// ─── COMPANY ROUTES ───────────────────────────────────
// Endpoints for company settings management
// GET is available to all authenticated users
// PUT is restricted to super_admin only

const express = require('express');
const router  = express.Router();

const {
  getCompanySettings,
  updateCompanySettings,
} = require('../controllers/companyController');

const { authenticate, authorize } = require('../middleware/auth');

// All routes require authentication
router.use(authenticate);

// GET /api/company/settings
// All authenticated users can view company settings
router.get('/settings', getCompanySettings);

// PUT /api/company/settings
// Only super_admin can update company settings
router.put(
  '/settings',
  authorize('super_admin'),
  updateCompanySettings
);

module.exports = router;