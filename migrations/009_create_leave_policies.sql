-- ─── LEAVE POLICIES TABLE ─────────────────────────────
-- Defines leave entitlements per leave type per role
-- This allows different roles to get different amounts
-- of leave automatically when a new year starts
--
-- Examples:
--   Annual Leave → employee    → 15 days
--   Annual Leave → manager     → 20 days
--   Annual Leave → hr_admin    → 20 days
--   Annual Leave → super_admin → 25 days
--   Sick Leave   → ALL roles   → 10 days
--
-- When a new employee is added or a new year starts
-- the system checks this table to know how many days
-- to assign to each employee based on their role
CREATE TABLE IF NOT EXISTS leave_policies (

  -- Unique identifier for each policy rule
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Which company this policy belongs to
  company_id      UUID NOT NULL REFERENCES companies(id)
                  ON DELETE CASCADE,

  -- Which leave type this policy applies to
  leave_type_id   UUID NOT NULL REFERENCES leave_types(id)
                  ON DELETE CASCADE,

  -- Which role gets this entitlement
  -- Use 'all' to apply to every role equally
  -- Otherwise use: employee | manager | hr_admin | super_admin
  applies_to_role VARCHAR(50) NOT NULL DEFAULT 'all',

  -- How many days this role gets per year
  entitled_days   INTEGER NOT NULL DEFAULT 0,

  -- Whether this policy is currently active
  is_active       BOOLEAN NOT NULL DEFAULT true,

  created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Prevent duplicate policy for the same
  -- company + leave type + role combination
  UNIQUE(company_id, leave_type_id, applies_to_role)
);

-- Index for fast lookup of policies for a company
CREATE INDEX IF NOT EXISTS idx_leave_policies_company_id
  ON leave_policies(company_id);

-- Index for fast lookup by leave type
CREATE INDEX IF NOT EXISTS idx_leave_policies_leave_type_id
  ON leave_policies(leave_type_id);