-- ─── NOTIFICATIONS TABLE ──────────────────────────────
-- Records every notification sent to a user
-- e.g. "Your leave request was approved", "You have a pending approval"
CREATE TABLE IF NOT EXISTS notifications (

  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The user who should receive this notification
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- The leave request this notification is about (optional)
  leave_request_id  UUID REFERENCES leave_requests(id) ON DELETE CASCADE,

  -- Type of notification:
  -- request_submitted  → sent to manager when employee submits
  -- request_approved   → sent to employee when approved
  -- request_rejected   → sent to employee when rejected
  -- request_cancelled  → sent to manager when employee cancels
  type              VARCHAR(50) NOT NULL,

  -- The message to display to the user
  message           TEXT NOT NULL,

  -- Whether the user has read/seen this notification
  is_read           BOOLEAN NOT NULL DEFAULT false,

  created_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for fast retrieval of all notifications for a user
CREATE INDEX IF NOT EXISTS idx_notifications_user_id          ON notifications(user_id);

-- Index for fast retrieval of unread notifications only
CREATE INDEX IF NOT EXISTS idx_notifications_is_read          ON notifications(is_read);