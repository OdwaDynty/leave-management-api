-- ─── AUDIT LOGS TABLE ─────────────────────────────────
-- Records every significant action taken in the system
-- Used for compliance, debugging, and accountability
-- Especially important under South African POPIA
-- regulations which require records of data changes
--
-- Every time a sensitive action happens (role change,
-- employee edit, balance adjustment, deactivation)
-- the system writes a row here automatically
CREATE TABLE IF NOT EXISTS audit_logs (

  -- Unique identifier for each audit entry
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Which company this action belongs to
  -- Ensures audit logs are tenant-isolated
  company_id      UUID NOT NULL REFERENCES companies(id)
                  ON DELETE CASCADE,

  -- The user who performed the action
  -- e.g. the HR admin who changed a role
  performed_by    UUID REFERENCES users(id)
                  ON DELETE SET NULL,

  -- Display name of the person who acted
  -- Stored separately so it survives if the user
  -- is later deleted from the system
  performed_by_name VARCHAR(255),

  -- The type of action that was performed
  -- Examples:
  --   ROLE_CHANGED         → user role was updated
  --   EMPLOYEE_UPDATED     → employee details changed
  --   EMPLOYEE_DEACTIVATED → account was disabled
  --   EMPLOYEE_REACTIVATED → account was re-enabled
  --   BALANCE_ADJUSTED     → leave balance was changed
  --   LEAVE_APPROVED       → leave request approved
  --   LEAVE_REJECTED       → leave request rejected
  --   LEAVE_CANCELLED      → leave request cancelled
  --   ROLE_REQUEST_APPROVED→ promotion approved
  --   ROLE_REQUEST_REJECTED→ promotion rejected
  action_type     VARCHAR(100) NOT NULL,

  -- The user who was affected by the action
  -- e.g. the employee whose role was changed
  target_user_id  UUID REFERENCES users(id)
                  ON DELETE SET NULL,

  -- Display name of the affected user
  -- Stored separately for the same reason as above
  target_user_name VARCHAR(255),

  -- The value BEFORE the change
  -- Stored as text so any type of value can be recorded
  -- e.g. old role: "employee"
  old_value       TEXT,

  -- The value AFTER the change
  -- e.g. new role: "manager"
  new_value       TEXT,

  -- Additional context about the action
  -- e.g. "Changed via employee management page"
  description     TEXT,

  -- The IP address of the request
  -- Useful for security investigations
  ip_address      VARCHAR(45),

  -- When the action occurred
  -- Uses timezone so it is correct across regions
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for fast retrieval of all logs for a company
CREATE INDEX IF NOT EXISTS idx_audit_logs_company_id
  ON audit_logs(company_id);

-- Index for fast lookup of actions by a specific user
CREATE INDEX IF NOT EXISTS idx_audit_logs_performed_by
  ON audit_logs(performed_by);

-- Index for fast lookup of actions on a specific user
CREATE INDEX IF NOT EXISTS idx_audit_logs_target_user
  ON audit_logs(target_user_id);

-- Index for filtering by action type
CREATE INDEX IF NOT EXISTS idx_audit_logs_action_type
  ON audit_logs(action_type);

-- Index for date range queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at
  ON audit_logs(created_at);