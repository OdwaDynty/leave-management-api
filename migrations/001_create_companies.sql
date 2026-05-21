-- ─── COMPANIES TABLE ──────────────────────────────────
-- Each company is a tenant in our SaaS system
-- Every other table links back to a company via company_id
CREATE TABLE IF NOT EXISTS companies (

  -- Unique identifier for each company (UUID is better than integer for SaaS)
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The company's display name e.g. "Acme Corporation"
  name          VARCHAR(255) NOT NULL,

  -- URL-friendly identifier e.g. "acme" → acme.yoursaas.com
  -- Must be unique across all companies
  subdomain     VARCHAR(100) NOT NULL UNIQUE,

  -- Subscription plan: free | starter | professional | enterprise
  plan          VARCHAR(50) NOT NULL DEFAULT 'free',

  -- Account status: active | suspended | cancelled
  status        VARCHAR(50) NOT NULL DEFAULT 'active',

  -- When the company registered
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- When the company record was last updated
  updated_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index on subdomain for fast tenant lookups on every request
CREATE INDEX IF NOT EXISTS idx_companies_subdomain ON companies(subdomain);