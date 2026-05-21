// ─── NOTIFICATION CONTROLLER ──────────────────────────
// Handles all notification management
// Notifications are created automatically by the system when:
// - An employee submits a leave request  (manager is notified)
// - A request is approved                (employee is notified)
// - A request is rejected                (employee is notified)
// This controller lets users VIEW and MANAGE their notifications

const { query } = require('../config/db');

// ─── GET MY NOTIFICATIONS ─────────────────────────────
// GET /api/notifications
// Returns all notifications for the logged in user
// Optional filters: ?is_read=false (unread only)
const getMyNotifications = async (req, res) => {
  try {
    const { is_read } = req.query;

    let sql    = `
      SELECT
        n.id,
        n.type,
        n.message,
        n.is_read,
        n.created_at,
        -- Include leave request details if available
        lr.start_date,
        lr.end_date,
        lr.status        AS request_status,
        lt.name          AS leave_type_name
      FROM notifications n
      LEFT JOIN leave_requests lr ON lr.id = n.leave_request_id
      LEFT JOIN leave_types    lt ON lt.id = lr.leave_type_id
      WHERE n.user_id = $1
    `;
    const params = [req.user.id];

    // Optionally filter to only unread notifications
    // e.g. GET /api/notifications?is_read=false
    if (is_read !== undefined) {
      sql += ` AND n.is_read = $2`;
      params.push(is_read === 'true');
    }

    // Most recent notifications first
    sql += ' ORDER BY n.created_at DESC';

    const result = await query(sql, params);

    // Count how many are unread — useful for a notification badge in the UI
    const unreadCount = result.rows.filter(n => !n.is_read).length;

    return res.json({
      total:         result.rows.length,
      unread:        unreadCount,
      notifications: result.rows,
    });

  } catch (err) {
    console.error('Get notifications error:', err.message);
    return res.status(500).json({ error: 'Failed to retrieve notifications.' });
  }
};

// ─── MARK ONE AS READ ─────────────────────────────────
// PUT /api/notifications/:id/read
// Marks a single notification as read
const markAsRead = async (req, res) => {
  try {
    const { id } = req.params;

    // Make sure the notification belongs to the logged in user
    const existing = await query(
      `SELECT id, is_read FROM notifications
       WHERE id = $1 AND user_id = $2`,
      [id, req.user.id]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({
        error: 'Notification not found.'
      });
    }

    if (existing.rows[0].is_read) {
      return res.json({ message: 'Notification is already marked as read.' });
    }

    // Mark as read
    await query(
      `UPDATE notifications
       SET is_read = true
       WHERE id = $1 AND user_id = $2`,
      [id, req.user.id]
    );

    return res.json({ message: 'Notification marked as read.' });

  } catch (err) {
    console.error('Mark as read error:', err.message);
    return res.status(500).json({ error: 'Failed to mark notification as read.' });
  }
};

// ─── MARK ALL AS READ ─────────────────────────────────
// PUT /api/notifications/read-all
// Marks ALL unread notifications as read for the logged in user
// Useful for a "Mark all as read" button in the UI
const markAllAsRead = async (req, res) => {
  try {
    const result = await query(
      `UPDATE notifications
       SET is_read = true
       WHERE user_id = $1 AND is_read = false
       RETURNING id`,
      [req.user.id]
    );

    // Tell the user how many were updated
    const count = result.rows.length;

    return res.json({
      message: count > 0
        ? `${count} notification(s) marked as read.`
        : 'No unread notifications to mark.',
      updated: count,
    });

  } catch (err) {
    console.error('Mark all as read error:', err.message);
    return res.status(500).json({ error: 'Failed to mark all notifications as read.' });
  }
};

// ─── DELETE NOTIFICATION ──────────────────────────────
// DELETE /api/notifications/:id
// Permanently deletes a single notification
// Users can only delete their own notifications
const deleteNotification = async (req, res) => {
  try {
    const { id } = req.params;

    // Verify ownership before deleting
    const existing = await query(
      `SELECT id FROM notifications
       WHERE id = $1 AND user_id = $2`,
      [id, req.user.id]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({
        error: 'Notification not found.'
      });
    }

    await query(
      `DELETE FROM notifications
       WHERE id = $1 AND user_id = $2`,
      [id, req.user.id]
    );

    return res.json({ message: 'Notification deleted successfully.' });

  } catch (err) {
    console.error('Delete notification error:', err.message);
    return res.status(500).json({ error: 'Failed to delete notification.' });
  }
};

module.exports = {
  getMyNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
};