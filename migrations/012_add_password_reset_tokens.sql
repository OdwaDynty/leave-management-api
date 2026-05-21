-- ─── PASSWORD RESET TOKENS TABLE ─────────────────────
-- Stores temporary tokens for password reset requests
-- When a user requests a password reset:
--   1. A secure random token is generated
--   2. The token is stored here with an expiry time
--   3. An email is sent with a link containing the token
--   4. When the user clicks the link and submits a new
--      password the token is verified and deleted
--
-- Tokens expire after 1 hour for security
-- Only one active token per user at a time

CREATE TABLE IF NOT EXISTS password_reset_tokens (

  -- Unique identifier for this token record
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Which user this token belongs to
  user_id     UUID NOT NULL REFERENCES users(id)
              ON DELETE CASCADE,

  -- The secure random token sent in the email link
  -- Stored as a bcrypt hash so even if the database
  -- is compromised the tokens cannot be used
  token_hash  VARCHAR(255) NOT NULL,

  -- When this token expires
  -- Set to 1 hour from creation time
  expires_at  TIMESTAMP WITH TIME ZONE NOT NULL,

  -- Whether this token has already been used
  -- Once used it cannot be used again
  is_used     BOOLEAN NOT NULL DEFAULT false,

  -- When the token was created
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for fast token lookup during reset
CREATE INDEX IF NOT EXISTS idx_reset_tokens_user_id
  ON password_reset_tokens(user_id);

-- Index for fast cleanup of expired tokens
CREATE INDEX IF NOT EXISTS idx_reset_tokens_expires_at
  ON password_reset_tokens(expires_at);