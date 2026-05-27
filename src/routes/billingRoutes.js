// ─── BILLING ROUTES ───────────────────────────────────
// PayFast payment integration endpoints
//
// Public routes (no auth needed):
//   GET  /api/billing/plans    → pricing page
//   POST /api/billing/webhook  → PayFast ITN callback
//
// Protected routes (require JWT):
//   GET  /api/billing/subscription → current plan
//   POST /api/billing/initiate     → start payment
//   POST /api/billing/cancel       → cancel plan

const express = require('express');
const router  = express.Router();
const {
  getPlans,
  getSubscription,
  initiatePayment,
  handleWebhook,
  cancelSubscription,
} = require('../controllers/billingController');
const {
  authenticate,
  authorize,
} = require('../middleware/auth');

// ── Public: View Plans ─────────────────────────────────
// No auth — anyone can see pricing
router.get('/plans', getPlans);

// ── Public: PayFast Webhook ────────────────────────────
// No auth — PayFast calls this from their servers
// MUST be before router.use(authenticate) below
router.post('/webhook', handleWebhook);

// ── All routes below require login ────────────────────
router.use(authenticate);

// GET /api/billing/subscription
// Any logged in user can view the company plan
router.get('/subscription', getSubscription);

// POST /api/billing/initiate
// Only super_admin can start a payment
router.post(
  '/initiate',
  authorize('super_admin'),
  initiatePayment
);

// POST /api/billing/cancel
// Only super_admin can cancel
router.post(
  '/cancel',
  authorize('super_admin'),
  cancelSubscription
);

module.exports = router;