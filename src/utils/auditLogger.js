// ─── AUDIT LOGGER ─────────────────────────────────────
// Central utility for writing audit log entries
// Called whenever a sensitive action happens in the system
//
// This is fire-and-forget like email — audit logging
// should NEVER cause an API request to fail
// If the log write fails it is logged to console only

const { query } = require('../config/db');
const { v4: uuidv4 } = require('uuid');

// ─── LOG ACTION ───────────────────────────────────────
// Writes a single audit log entry to the database
// All parameters are optional except action_type
// and company_id — the rest default to null
const logAction = async ({
  companyId,        // Which company (required)
  performedBy,      // UUID of the user who acted
  performedByName,  // Display name of the actor
  actionType,       // Type of action (required)
  targetUserId,     // UUID of the affected user
  targetUserName,   // Display name of the affected user
  oldValue,         // Value before the change
  newValue,         // Value after the change
  description,      // Human readable description
  ipAddress,        // Request IP address
}) => {
  try {
    await query(
      `INSERT INTO audit_logs (
         id, company_id, performed_by,
         performed_by_name, action_type,
         target_user_id, target_user_name,
         old_value, new_value,
         description, ip_address, created_at
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())`,
      [
        uuidv4(),
        companyId,
        performedBy      || null,
        performedByName  || null,
        actionType,
        targetUserId     || null,
        targetUserName   || null,
        oldValue         || null,
        newValue         || null,
        description      || null,
        ipAddress        || null,
      ]
    );
  } catch (err) {
    // Never throw — just log to console
    console.error('Audit log error:', err.message);
  }
};

// ─── ACTION TYPE CONSTANTS ────────────────────────────
// Centralised list of all action types
// Using constants prevents typos in action names
const ACTIONS = {
  ROLE_CHANGED:           'ROLE_CHANGED',
  EMPLOYEE_UPDATED:       'EMPLOYEE_UPDATED',
  EMPLOYEE_DEACTIVATED:   'EMPLOYEE_DEACTIVATED',
  EMPLOYEE_REACTIVATED:   'EMPLOYEE_REACTIVATED',
  BALANCE_ADJUSTED:       'BALANCE_ADJUSTED',
  BALANCE_ASSIGNED:       'BALANCE_ASSIGNED',
  LEAVE_APPROVED:         'LEAVE_APPROVED',
  LEAVE_REJECTED:         'LEAVE_REJECTED',
  LEAVE_CANCELLED:        'LEAVE_CANCELLED',
  LEAVE_HR_APPROVED:      'LEAVE_HR_APPROVED',
  LEAVE_HR_REJECTED:      'LEAVE_HR_REJECTED',
  ROLE_REQUEST_SUBMITTED: 'ROLE_REQUEST_SUBMITTED',
  ROLE_REQUEST_APPROVED:  'ROLE_REQUEST_APPROVED',
  ROLE_REQUEST_REJECTED:  'ROLE_REQUEST_REJECTED',
  POLICY_CREATED:         'POLICY_CREATED',
  POLICY_UPDATED:         'POLICY_UPDATED',
};

module.exports = { logAction, ACTIONS };