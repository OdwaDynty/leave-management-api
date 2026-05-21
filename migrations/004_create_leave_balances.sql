-- ─── LEAVE BALANCES TABLE ─────────────────────────────
-- Tracks how many leave days each employee has per leave type per year
-- This is updated every time a leave request is approved or cancelled
CREATE TABLE IF NOT EXISTS leave_balances (

  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The employee this balance belongs to
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- The type of leave this balance is for
  leave_type_id     UUID NOT NULL REFERENCES leave_types(id) ON DELETE CASCADE,

  -- The year this balance applies to e.g. 2025
  year              INTEGER NOT NULL,

  -- Total days the employee is entitled to this year
  -- (default_days + any carried over days)
  entitled_days     NUMERIC(5,1) NOT NULL DEFAULT 0,

  -- Days already taken and approved
  used_days         NUMERIC(5,1) NOT NULL DEFAULT 0,

  -- Days in pending requests (submitted but not yet approved)
  pending_days      NUMERIC(5,1) NOT NULL DEFAULT 0,

  -- Days carried over from the previous year
  carried_over_days NUMERIC(5,1) NOT NULL DEFAULT 0,

  -- Calculated field: entitled_days - used_days - pending_days
  -- Stored for performance (avoids recalculating on every request)
  remaining_days    NUMERIC(5,1) NOT NULL DEFAULT 0,

  created_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Prevent duplicate balance records for the same user/leave type/year
  UNIQUE(user_id, leave_type_id, year)
);

-- Index for fast balance lookups per user per year
CREATE INDEX IF NOT EXISTS idx_leave_balances_user_id       ON leave_balances(user_id);
CREATE INDEX IF NOT EXISTS idx_leave_balances_leave_type_id ON leave_balances(leave_type_id);