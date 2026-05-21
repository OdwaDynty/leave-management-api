-- ─── USERS TABLE ──────────────────────────────────────
-- All people who use the system: employees, managers, HR admins, super admins
-- Every user belongs to exactly one company
CREATE TABLE IF NOT EXISTS users (

  -- Unique identifier for each user
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Which company this user belongs to
  -- ON DELETE CASCADE means if a company is deleted, all its users are deleted too
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  -- Basic personal details
  first_name      VARCHAR(100) NOT NULL,
  last_name       VARCHAR(100) NOT NULL,

  -- Email must be unique across the entire system (used for login)
  email           VARCHAR(255) NOT NULL UNIQUE,

  -- We never store plain passwords — only the bcrypt hash
  password_hash   VARCHAR(255) NOT NULL,

  -- Access level for this user:
  -- employee      → can only manage their own leave
  -- manager       → can approve/reject their team's leave
  -- hr_admin      → can manage all staff and leave policies
  -- super_admin   → full access including billing and company settings
  role            VARCHAR(50) NOT NULL DEFAULT 'employee',

  -- The manager this employee reports to (self-referencing)
  -- NULL means this user has no manager (e.g. the company owner)
  manager_id      UUID REFERENCES users(id) ON DELETE SET NULL,

  -- Department name e.g. "Engineering", "Finance", "HR"
  department      VARCHAR(100),

  -- Job title e.g. "Software Developer", "Accountant"
  job_title       VARCHAR(100),

  -- Phone number (optional, used for notifications)
  phone           VARCHAR(20),

  -- Whether this user can log in
  -- Set to false instead of deleting users (preserves leave history)
  is_active       BOOLEAN NOT NULL DEFAULT true,

  -- When the user account was created
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- When the user record was last updated
  updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for fast login lookups by email
CREATE INDEX IF NOT EXISTS idx_users_email      ON users(email);

-- Index for fast filtering of all users in a company
CREATE INDEX IF NOT EXISTS idx_users_company_id ON users(company_id);

-- Index for fast lookup of all employees under a manager
CREATE INDEX IF NOT EXISTS idx_users_manager_id ON users(manager_id);