-- ─── UPDATE LEAVE REQUESTS — MULTI-LEVEL APPROVAL ─────
-- Adds fields to support two-level approval workflow:
--   Level 1: Manager approves
--   Level 2: HR admin does final sign-off
--
-- New status flow:
--   pending       → submitted, waiting for manager
--   pending_hr    → manager approved, waiting for HR
--   approved      → HR gave final approval
--   rejected      → rejected at any level
--   cancelled     → employee cancelled
--
-- The threshold_days field in leave_types controls
-- when multi-level approval kicks in:
--   e.g. requests > 5 days require HR sign-off
--   requests ≤ 5 days only need manager approval

-- Add the new status option and approval fields
ALTER TABLE leave_requests
  -- Who gave the first level approval (manager)
  ADD COLUMN IF NOT EXISTS first_reviewer_id
    UUID REFERENCES users(id) ON DELETE SET NULL,

  -- When the first level approved
  ADD COLUMN IF NOT EXISTS first_reviewed_at
    TIMESTAMP WITH TIME ZONE,

  -- Whether this request requires HR sign-off
  -- Set to true when days_requested > threshold
  ADD COLUMN IF NOT EXISTS requires_hr_approval
    BOOLEAN NOT NULL DEFAULT false;

-- Add threshold to leave_types so each leave type
-- can have its own multi-approval threshold
ALTER TABLE leave_types
  ADD COLUMN IF NOT EXISTS hr_approval_threshold
    INTEGER NOT NULL DEFAULT 0;
-- 0 means never require HR approval
-- 5 means requests over 5 days need HR approval