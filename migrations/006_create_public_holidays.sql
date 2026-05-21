-- ─── PUBLIC HOLIDAYS TABLE ────────────────────────────
-- Stores public holidays per company
-- Used to automatically exclude public holidays from leave day counts
-- Pre-loaded with South African public holidays but companies can customise
CREATE TABLE IF NOT EXISTS public_holidays (

  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Which company this holiday applies to
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  -- Name of the holiday e.g. "Human Rights Day", "Heritage Day"
  name          VARCHAR(100) NOT NULL,

  -- The actual date of the holiday
  holiday_date  DATE NOT NULL,

  -- ISO country code e.g. ZA, US, UK
  country_code  VARCHAR(5) NOT NULL DEFAULT 'ZA',

  created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Prevent duplicate entries for the same date per company
  UNIQUE(company_id, holiday_date)
);

-- Index for fast date lookups when calculating working days
CREATE INDEX IF NOT EXISTS idx_public_holidays_company_id   ON public_holidays(company_id);
CREATE INDEX IF NOT EXISTS idx_public_holidays_date         ON public_holidays(holiday_date);