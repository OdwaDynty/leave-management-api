-- ─── ROLE REQUESTS TABLE ──────────────────────────────
-- Stores promotion/role change requests submitted by
-- employees through the self-service portal
--
-- Columns renamed to avoid PostgreSQL reserved words:
--   from_role  = the role the employee currently has
--   to_role    = the role the employee is requesting
--
-- Workflow:
--   1. Employee submits a role request
--   2. HR admin reviews the request
--   3. HR approves → user role updated automatically
--      HR rejects  → request closed with a reason

CREATE TABLE IF NOT EXISTS role_requests (

  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The employee requesting the role change
  user_id         UUID NOT NULL REFERENCES users(id)
                  ON DELETE CASCADE,

  -- Which company this belongs to
  company_id      UUID NOT NULL REFERENCES companies(id)
                  ON DELETE CASCADE,

  -- The role the employee has at time of request
  from_role       VARCHAR(50) NOT NULL,

  -- The role the employee wants to move to
  to_role         VARCHAR(50) NOT NULL,

  -- Employee's reason for requesting this role
  reason          TEXT NOT NULL,

  -- pending | approved | rejected
  status          VARCHAR(50) NOT NULL DEFAULT 'pending',

  -- HR admin who reviewed this request
  reviewed_by     UUID REFERENCES users(id)
                  ON DELETE SET NULL,

  -- When the request was reviewed
  reviewed_at     TIMESTAMP WITH TIME ZONE,

  -- HR reason for rejecting (required on rejection)
  rejection_reason TEXT,

  -- HR note on approval (optional)
  approval_note   TEXT,

  created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for fast retrieval by employee
CREATE INDEX IF NOT EXISTS idx_role_requests_user_id
  ON role_requests(user_id);

-- Index for fast retrieval by company
CREATE INDEX IF NOT EXISTS idx_role_requests_company_id
  ON role_requests(company_id);

-- Index for filtering by status
CREATE INDEX IF NOT EXISTS idx_role_requests_status
  ON role_requests(status);