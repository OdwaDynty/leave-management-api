// ─── AUTH CONTROLLER ──────────────────────────────────
// Handles all authentication logic:
// - Registering a new company and its first admin user
// - Logging in and returning a JWT token
// - Returning the current logged-in user's profile

const bcrypt          = require('bcryptjs');
const { v4: uuidv4 }  = require('uuid');
const { query, getClient } = require('../config/db');
const { generateToken }    = require('../utils/jwt');


const crypto = require('crypto');
const {
  sendPasswordResetEmail,
  sendPasswordResetSuccess,
} = require('../utils/emailService');

// ─── REGISTER ─────────────────────────────────────────
// POST /api/auth/register
// Creates a new company AND its first super_admin user in one transaction
// A transaction means both inserts succeed together or both fail — no half-created data
const register = async (req, res) => {
  // Destructure expected fields from the request body
  const {
    company_name,
    subdomain,
    first_name,
    last_name,
    email,
    password
  } = req.body;

  // ── Basic Validation ──────────────────────────────
  // Check all required fields are present
  if (!company_name || !subdomain || !first_name || !last_name || !email || !password) {
    return res.status(400).json({
      error: 'All fields are required: company_name, subdomain, first_name, last_name, email, password'
    });
  }

  // Password must be at least 8 characters
  if (password.length < 8) {
    return res.status(400).json({
      error: 'Password must be at least 8 characters long.'
    });
  }

  // Subdomain must be lowercase letters and numbers only (URL-safe)
  const subdomainRegex = /^[a-z0-9-]+$/;
  if (!subdomainRegex.test(subdomain)) {
    return res.status(400).json({
      error: 'Subdomain can only contain lowercase letters, numbers, and hyphens.'
    });
  }

  // Get a dedicated client for the transaction
  const client = await getClient();

  try {
    // Start the transaction — all queries below must succeed together
    await client.query('BEGIN');

    // ── Check for Duplicates ──────────────────────
    // Check if subdomain is already taken by another company
    const existingCompany = await client.query(
      'SELECT id FROM companies WHERE subdomain = $1',
      [subdomain.toLowerCase()]
    );
    if (existingCompany.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: 'This subdomain is already taken. Please choose another.'
      });
    }

    // Check if email is already registered
    const existingUser = await client.query(
      'SELECT id FROM users WHERE email = $1',
      [email.toLowerCase()]
    );
    if (existingUser.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: 'An account with this email already exists.'
      });
    }

    // ── Create the Company ────────────────────────
    const companyId = uuidv4();
    await client.query(
      `INSERT INTO companies (id, name, subdomain, plan, status, created_at, updated_at)
       VALUES ($1, $2, $3, 'free', 'active', NOW(), NOW())`,
      [companyId, company_name, subdomain.toLowerCase()]
    );

    // ── Hash the Password ─────────────────────────
    // bcrypt salt rounds = 12 — higher is more secure but slower
    // 12 is a good balance for a production app
    const salt         = await bcrypt.genSalt(12);
    const passwordHash = await bcrypt.hash(password, salt);

    // ── Create the Admin User ─────────────────────
    const userId = uuidv4();
    await client.query(
      `INSERT INTO users
         (id, company_id, first_name, last_name, email, password_hash, role, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'super_admin', true, NOW(), NOW())`,
      [userId, companyId, first_name, last_name, email.toLowerCase(), passwordHash]
    );

    // ── Commit the Transaction ────────────────────
    // Both inserts succeeded — make them permanent
    await client.query('COMMIT');

    // ── Generate JWT Token ────────────────────────
    // The user is automatically logged in after registration
    const token = generateToken({
      userId:    userId,
      companyId: companyId,
      role:      'super_admin',
    });

    // ── Send Response ─────────────────────────────
    return res.status(201).json({
      message: 'Company and admin account created successfully.',
      token,
      user: {
        id:         userId,
        first_name,
        last_name,
        email:      email.toLowerCase(),
        role:       'super_admin',
        company: {
          id:        companyId,
          name:      company_name,
          subdomain: subdomain.toLowerCase(),
          plan:      'free',
        }
      }
    });

  } catch (err) {
    // Something went wrong — undo all database changes
    await client.query('ROLLBACK');
    console.error('Registration error:', err.message);
    return res.status(500).json({ error: 'Registration failed. Please try again.' });

  } finally {
    // Always release the client back to the pool when done
    client.release();
  }
};

// ─── LOGIN ────────────────────────────────────────────
// POST /api/auth/login
// Verifies email and password, returns a JWT token
const login = async (req, res) => {
  const { email, password } = req.body;

  // Check required fields
  if (!email || !password) {
    return res.status(400).json({
      error: 'Email and password are required.'
    });
  }

  try {
    // ── Find the User ─────────────────────────────
    // Join with companies table to get company info in one query
    const result = await query(
      `SELECT
         u.id,
         u.company_id,
         u.first_name,
         u.last_name,
         u.email,
         u.password_hash,
         u.role,
         u.is_active,
         c.name        AS company_name,
         c.subdomain   AS company_subdomain,
         c.plan        AS company_plan,
         c.status      AS company_status
       FROM users u
       JOIN companies c ON c.id = u.company_id
       WHERE u.email = $1`,
      [email.toLowerCase()]
    );

    // Use a generic error message for security
    // Never reveal whether the email exists or not
    if (result.rows.length === 0) {
      return res.status(401).json({
        error: 'Invalid email or password.'
      });
    }

    const user = result.rows[0];

    // ── Check Account Status ──────────────────────
    if (!user.is_active) {
      return res.status(403).json({
        error: 'Your account has been deactivated. Please contact HR.'
      });
    }

    if (user.company_status !== 'active') {
      return res.status(403).json({
        error: 'Your company account is suspended. Please contact support.'
      });
    }

    // ── Verify Password ───────────────────────────
    // bcrypt.compare hashes the input and compares it to the stored hash
    // We never decrypt the stored hash — bcrypt is one-way
    const passwordMatch = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatch) {
      return res.status(401).json({
        error: 'Invalid email or password.'
      });
    }

    // ── Generate JWT Token ────────────────────────
    const token = generateToken({
      userId:    user.id,
      companyId: user.company_id,
      role:      user.role,
    });

    // ── Send Response ─────────────────────────────
    // Never send the password_hash back to the client
    return res.json({
      message: 'Login successful.',
      token,
      user: {
        id:         user.id,
        first_name: user.first_name,
        last_name:  user.last_name,
        email:      user.email,
        role:       user.role,
        company: {
          id:        user.company_id,
          name:      user.company_name,
          subdomain: user.company_subdomain,
          plan:      user.company_plan,
        }
      }
    });

  } catch (err) {
    console.error('Login error:', err.message);
    return res.status(500).json({ error: 'Login failed. Please try again.' });
  }
};

// ─── GET PROFILE ──────────────────────────────────────
// GET /api/auth/me
// Returns the currently logged-in user's profile
// Requires: authenticate middleware (JWT token in header)
const getProfile = async (req, res) => {
  try {
    // req.user is set by the authenticate middleware
    // We fetch fresh data to ensure it's up to date
    const result = await query(
      `SELECT
         u.id,
         u.company_id,
         u.first_name,
         u.last_name,
         u.email,
         u.role,
         u.department,
         u.job_title,
         u.phone,
         u.created_at,
         c.name      AS company_name,
         c.subdomain AS company_subdomain,
         c.plan      AS company_plan
       FROM users u
       JOIN companies c ON c.id = u.company_id
       WHERE u.id = $1`,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }

    return res.json({ user: result.rows[0] });

  } catch (err) {
    console.error('Get profile error:', err.message);
    return res.status(500).json({ error: 'Could not retrieve profile.' });
  }
};


// ─── FORGOT PASSWORD ──────────────────────────────────
// POST /api/auth/forgot-password
// Step 1 of the password reset flow
// User submits their email address
// System sends a reset link to that email
//
// Security notes:
//   - Always returns success even if email not found
//     This prevents email enumeration attacks where
//     attackers can discover which emails are registered
//   - Token is stored as a bcrypt hash not plain text
//   - Token expires after 1 hour
//   - Old tokens for the same user are deleted first
const forgotPassword = async (req, res) => {
  const { email } = req.body;

  // Basic validation
  if (!email) {
    return res.status(400).json({
      error: 'Email address is required.'
    });
  }

  try {
    // Look up the user by email
    const userResult = await query(
      `SELECT id, first_name, last_name, email, is_active
       FROM users WHERE email = $1`,
      [email.toLowerCase()]
    );

    // IMPORTANT: Always return success even if user
    // not found — prevents email enumeration attacks
    if (userResult.rows.length === 0) {
      return res.json({
        message: 'If that email exists in our system '
                + 'you will receive a reset link shortly.'
      });
    }

    const user = userResult.rows[0];

    // Do not send reset emails to deactivated accounts
    if (!user.is_active) {
      return res.json({
        message: 'If that email exists in our system '
                + 'you will receive a reset link shortly.'
      });
    }

    // ── Generate Secure Token ─────────────────────
    // crypto.randomBytes generates a cryptographically
    // secure random token — much stronger than Math.random
    const rawToken = crypto.randomBytes(32).toString('hex');

    // Hash the token before storing
    // If the database is compromised the hashed token
    // cannot be used directly by an attacker
    const salt      = await bcrypt.genSalt(10);
    const tokenHash = await bcrypt.hash(rawToken, salt);

    // ── Delete Old Tokens for This User ──────────
    // Prevent token accumulation — only one active
    // reset token per user at a time
    await query(
      `DELETE FROM password_reset_tokens
       WHERE user_id = $1`,
      [user.id]
    );

    // ── Store the New Token ───────────────────────
    // expires_at = 1 hour from now
    await query(
      `INSERT INTO password_reset_tokens
         (id, user_id, token_hash, expires_at, created_at)
       VALUES (
         gen_random_uuid(), $1, $2,
         NOW() + INTERVAL '1 hour',
         NOW()
       )`,
      [user.id, tokenHash]
    );

    // ── Send the Reset Email ──────────────────────
    // Fire and forget — do not await
    // The raw token (not the hash) goes in the email
    sendPasswordResetEmail({
      userEmail:  user.email,
      firstName:  user.first_name,
      resetToken: rawToken,
    });

    // Always return the same message regardless of
    // whether the email was found or not
    return res.json({
      message: 'If that email exists in our system '
              + 'you will receive a reset link shortly.'
    });

  } catch (err) {
    console.error('Forgot password error:', err.message);
    return res.status(500).json({
      error: 'Something went wrong. Please try again.'
    });
  }
};

// ─── RESET PASSWORD ───────────────────────────────────
// POST /api/auth/reset-password
// Step 2 of the password reset flow
// User submits the token from the email link
// along with their new password
//
// Security notes:
//   - Token must exist in database and not be expired
//   - Token must not have been used before
//   - Token is deleted after use — one use only
//   - All other reset tokens for this user are deleted
const resetPassword = async (req, res) => {
  const { token, new_password } = req.body;

  // Validation
  if (!token || !new_password) {
    return res.status(400).json({
      error: 'Token and new_password are required.'
    });
  }

  if (new_password.length < 8) {
    return res.status(400).json({
      error: 'Password must be at least 8 characters.'
    });
  }

  try {
    // ── Find All Active Tokens ────────────────────
    // We fetch all unexpired unused tokens and then
    // compare each one with bcrypt because we store
    // hashes not plain tokens
    const tokensResult = await query(
      `SELECT prt.*, u.id AS user_id,
              u.first_name, u.last_name, u.email
       FROM password_reset_tokens prt
       JOIN users u ON u.id = prt.user_id
       WHERE prt.expires_at > NOW()
         AND prt.is_used = false`,
      []
    );

    if (tokensResult.rows.length === 0) {
      return res.status(400).json({
        error: 'This reset link is invalid or has expired. '
             + 'Please request a new one.'
      });
    }

    // ── Find the Matching Token ───────────────────
    // Loop through active tokens and compare with bcrypt
    let matchedToken = null;
    for (const row of tokensResult.rows) {
      const matches = await bcrypt.compare(
        token, row.token_hash
      );
      if (matches) {
        matchedToken = row;
        break;
      }
    }

    // Token not found or does not match any hash
    if (!matchedToken) {
      return res.status(400).json({
        error: 'This reset link is invalid or has expired. '
             + 'Please request a new one.'
      });
    }

    // ── Hash the New Password ─────────────────────
    const salt        = await bcrypt.genSalt(12);
    const newPassHash = await bcrypt.hash(new_password, salt);

    // ── Update the User's Password ────────────────
    await query(
      `UPDATE users
       SET password_hash = $1, updated_at = NOW()
       WHERE id = $2`,
      [newPassHash, matchedToken.user_id]
    );

    // ── Mark Token as Used ────────────────────────
    // And delete all other tokens for this user
    await query(
      `DELETE FROM password_reset_tokens
       WHERE user_id = $1`,
      [matchedToken.user_id]
    );

    // ── Send Confirmation Email ───────────────────
    sendPasswordResetSuccess({
      userEmail: matchedToken.email,
      firstName: matchedToken.first_name,
    });

    return res.json({
      message: 'Password reset successfully. '
             + 'You can now log in with your new password.'
    });

  } catch (err) {
    console.error('Reset password error:', err.message);
    return res.status(500).json({
      error: 'Something went wrong. Please try again.'
    });
  }
};



module.exports = { register, 
                   login, 
                   getProfile, 
                  forgotPassword,
                  resetPassword};