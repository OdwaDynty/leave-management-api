// ─── NOTIFICATION ROUTES ──────────────────────────────
// All endpoints for notification management
// All routes require authentication
// Users can only manage their own notifications

const express = require('express');
const router  = express.Router();

// Import controller functions
const {
  getMyNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
} = require('../controllers/notificationController');

// Import auth middleware
const { authenticate } = require('../middleware/auth');

// ── All routes require a valid JWT token ───────────────
router.use(authenticate);

// ── GET /api/notifications ─────────────────────────────
// Get all notifications for the logged in user
// Optional: ?is_read=false for unread only
router.get('/', getMyNotifications);

// ── IMPORTANT: /read-all must come BEFORE /:id
// Otherwise Express will treat "read-all" as an id value

// ── PUT /api/notifications/read-all ───────────────────
// Mark all notifications as read
router.put('/read-all', markAllAsRead);

// ── PUT /api/notifications/:id/read ───────────────────
// Mark a single notification as read
router.put('/:id/read', markAsRead);

// ── DELETE /api/notifications/:id ─────────────────────
// Delete a single notification
router.delete('/:id', deleteNotification);

module.exports = router;