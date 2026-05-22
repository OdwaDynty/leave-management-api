-- ─── SUBSCRIPTIONS TABLE ─────────────────────────────
-- Tracks company subscription plans and billing status
-- Updated automatically when PayFast sends payment
-- notifications to our webhook endpoint
--
-- Plan tiers:
--   free         → 0/month, max 5 employees
--   starter      → R199/month, max 25 employees
--   professional → R499/month, max 100 employees
--   enterprise   → R999/month, unlimited employees

CREATE TABLE IF NOT EXISTS subscriptions (

  -- Unique identifier
  id                UUID PRIMARY KEY
                    DEFAULT gen_random_uuid(),

  -- Which company this subscription belongs to
  company_id        UUID NOT NULL UNIQUE
                    REFERENCES companies(id)
                    ON DELETE CASCADE,

  -- Current plan name
  -- free | starter | professional | enterprise
  plan              VARCHAR(50) NOT NULL
                    DEFAULT 'free',

  -- Subscription status
  -- active | cancelled | past_due | trialing
  status            VARCHAR(50) NOT NULL
                    DEFAULT 'active',

  -- PayFast subscription token for recurring billing
  -- Null for free plan
  payfast_token     VARCHAR(255),

  -- PayFast payment ID for the last payment
  payfast_payment_id VARCHAR(255),

  -- Maximum employees allowed on this plan
  -- free: 5, starter: 25, professional: 100
  -- enterprise: 999999 (effectively unlimited)
  max_employees     INTEGER NOT NULL DEFAULT 5,

  -- Monthly price in South African Rand cents
  -- Stored in cents to avoid floating point issues
  -- e.g. R199.00 = 19900 cents
  price_cents       INTEGER NOT NULL DEFAULT 0,

  -- When the current billing period started
  current_period_start TIMESTAMP WITH TIME ZONE,

  -- When the current billing period ends
  -- If today > current_period_end the subscription
  -- has lapsed and should be downgraded
  current_period_end   TIMESTAMP WITH TIME ZONE,

  -- When the subscription was cancelled
  -- Null if still active
  cancelled_at      TIMESTAMP WITH TIME ZONE,

  created_at        TIMESTAMP WITH TIME ZONE
                    DEFAULT NOW(),

  updated_at        TIMESTAMP WITH TIME ZONE
                    DEFAULT NOW()
);

-- Index for fast lookup by company
CREATE INDEX IF NOT EXISTS idx_subscriptions_company_id
  ON subscriptions(company_id);

-- Index for finding expired subscriptions
CREATE INDEX IF NOT EXISTS idx_subscriptions_period_end
  ON subscriptions(current_period_end);