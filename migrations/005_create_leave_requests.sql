-- ─── LEAVE REQUESTS TABLE ─────────────────────────────
-- The core table — every leave application submitted by an employee
CREATE TABLE IF NOT EXISTS leave_requests (

  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The employee who submitted this request
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- The type of leave being requested
  leave_type_id       UUID NOT NULL REFERENCES leave_types(id),

  -- The first day of leave
  start_date          DATE NOT NULL,

  -- The last day of leave
  end_date            DATE NOT NULL,

  -- Total working days being requested (excludes weekends and public holidays)
  days_requested      NUMERIC(5,1) NOT NULL,

  -- Current status of the request:
  -- pending    → just submitted, waiting for manager action
  -- approved   → manager approved it
  -- rejected   → manager rejected it
  -- cancelled  → employee cancelled it before it was actioned
  status              VARCHAR(50) NOT NULL DEFAULT 'pending',

  -- Optional note from the employee explaining why they need leave
  reason              TEXT,

  -- Who approved or rejected this request (manager or HR admin)
  reviewed_by         UUID REFERENCES users(id) ON DELETE SET NULL,

  -- When the request was approved or rejected
  reviewed_at         TIMESTAMP WITH TIME ZONE,

  -- If rejected, the manager must provide a reason
  rejection_reason    TEXT,

  -- Whether this is a half day request
  is_half_day         BOOLEAN NOT NULL DEFAULT false,

  -- For half days: morning | afternoon
  half_day_period     VARCHAR(20),

  -- Any file attached as supporting document (e.g. medical certificate)
  attachment_url      VARCHAR(500),

  created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for fast retrieval of all requests by an employee
CREATE INDEX IF NOT EXISTS idx_leave_requests_user_id       ON leave_requests(user_id);

-- Index for fast retrieval of all requests by status (e.g. all pending requests)
CREATE INDEX IF NOT EXISTS idx_leave_requests_status        ON leave_requests(status);

-- Index for date range queries (e.g. who is off this week)
CREATE INDEX IF NOT EXISTS idx_leave_requests_start_date    ON leave_requests(start_date);