-- ─── LEAVE TYPES TABLE ────────────────────────────────
-- Each company defines their own leave types
-- e.g. Annual Leave, Sick Leave, Study Leave, Maternity Leave
CREATE TABLE IF NOT EXISTS leave_types (

  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Which company owns this leave type
  company_id          UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  -- Display name e.g. "Annual Leave", "Sick Leave"
  name                VARCHAR(100) NOT NULL,

  -- Description explaining when this leave type should be used
  description         TEXT,

  -- Default number of days per year an employee gets
  default_days        INTEGER NOT NULL DEFAULT 0,

  -- Whether employees are paid during this leave
  is_paid             BOOLEAN NOT NULL DEFAULT true,

  -- Whether a manager must approve this leave type
  -- e.g. Annual leave needs approval, sick leave may not
  requires_approval   BOOLEAN NOT NULL DEFAULT true,

  -- Whether unused days roll over to the next year
  carry_over          BOOLEAN NOT NULL DEFAULT false,

  -- Maximum days that can be carried over (0 = unlimited if carry_over is true)
  max_carry_over_days INTEGER NOT NULL DEFAULT 0,

  -- Whether employees can take half days for this leave type
  allow_half_day      BOOLEAN NOT NULL DEFAULT false,

  -- Whether this leave type is currently active
  is_active           BOOLEAN NOT NULL DEFAULT true,

  created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for fast retrieval of all leave types for a company
CREATE INDEX IF NOT EXISTS idx_leave_types_company_id ON leave_types(company_id);