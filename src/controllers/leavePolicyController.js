// ─── LEAVE POLICY CONTROLLER ──────────────────────────
// Manages role-based leave entitlement policies
// Each policy says: "For this leave type, employees
// with role X get Y days per year automatically"
//
// When HR assigns balances or runs the new-year process
// the system uses these policies to know how many days
// to give each employee based on their role

const { v4: uuidv4 } = require('uuid');
const { query }      = require('../config/db');
const { logAction, ACTIONS } = require('../utils/auditLogger');

// ─── CREATE POLICY ────────────────────────────────────
// POST /api/leave-policies
// Creates a new role-based entitlement rule
const createPolicy = async (req, res) => {
  const {
    leave_type_id,
    applies_to_role,
    entitled_days,
  } = req.body;

  // ── Validation ──────────────────────────────────
  if (!leave_type_id || !applies_to_role ||
      entitled_days === undefined) {
    return res.status(400).json({
      error: 'leave_type_id, applies_to_role and '
           + 'entitled_days are required.'
    });
  }

  // Valid roles including 'all'
  const validRoles = [
    'all', 'employee', 'manager',
    'hr_admin', 'super_admin',
  ];
  if (!validRoles.includes(applies_to_role)) {
    return res.status(400).json({
      error: `applies_to_role must be one of: `
           + validRoles.join(', ')
    });
  }

  if (isNaN(entitled_days) || entitled_days < 0) {
    return res.status(400).json({
      error: 'entitled_days must be a positive number.'
    });
  }

  try {
    // Verify leave type belongs to same company
    const ltCheck = await query(
      `SELECT id, name FROM leave_types
       WHERE id = $1 AND company_id = $2`,
      [leave_type_id, req.user.company_id]
    );
    if (ltCheck.rows.length === 0) {
      return res.status(404).json({
        error: 'Leave type not found.'
      });
    }

    // Check for duplicate policy
    const existing = await query(
      `SELECT id FROM leave_policies
       WHERE company_id     = $1
         AND leave_type_id  = $2
         AND applies_to_role= $3`,
      [req.user.company_id, leave_type_id, applies_to_role]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({
        error: `A policy for ${applies_to_role} on `
             + `${ltCheck.rows[0].name} already exists. `
             + 'Use PUT to update it.'
      });
    }

    const id     = uuidv4();
    const result = await query(
      `INSERT INTO leave_policies (
         id, company_id, leave_type_id,
         applies_to_role, entitled_days,
         is_active, created_at, updated_at
       )
       VALUES ($1,$2,$3,$4,$5,true,NOW(),NOW())
       RETURNING *`,
      [
        id,
        req.user.company_id,
        leave_type_id,
        applies_to_role,
        entitled_days,
      ]
    );

    // Write audit log
    logAction({
      companyId:       req.user.company_id,
      performedBy:     req.user.id,
      performedByName:`${req.user.first_name} ${req.user.last_name}`,
      actionType:      ACTIONS.POLICY_CREATED,
      description:
        `Policy created: ${ltCheck.rows[0].name} → `
        + `${applies_to_role} → ${entitled_days} days`,
      ipAddress:       req.ip,
    });

    return res.status(201).json({
      message: 'Leave policy created successfully.',
      policy:  result.rows[0],
    });

  } catch (err) {
    console.error('Create policy error:', err.message);
    return res.status(500).json({
      error: 'Failed to create leave policy.'
    });
  }
};

// ─── LIST POLICIES ────────────────────────────────────
// GET /api/leave-policies
// Returns all leave policies for the company
// grouped by leave type for easy reading
const listPolicies = async (req, res) => {
  try {
    const result = await query(
      `SELECT
         lp.id,
         lp.applies_to_role,
         lp.entitled_days,
         lp.is_active,
         lp.updated_at,
         lt.id   AS leave_type_id,
         lt.name AS leave_type_name,
         lt.is_paid,
         lt.default_days
       FROM leave_policies lp
       JOIN leave_types lt
         ON lt.id = lp.leave_type_id
       WHERE lp.company_id = $1
       ORDER BY lt.name ASC, lp.applies_to_role ASC`,
      [req.user.company_id]
    );

    return res.json({
      count:    result.rows.length,
      policies: result.rows,
    });
  } catch (err) {
    console.error('List policies error:', err.message);
    return res.status(500).json({
      error: 'Failed to retrieve leave policies.'
    });
  }
};

// ─── UPDATE POLICY ────────────────────────────────────
// PUT /api/leave-policies/:id
// Updates the entitled_days for an existing policy
const updatePolicy = async (req, res) => {
  try {
    const { id }           = req.params;
    const { entitled_days } = req.body;

    if (entitled_days === undefined ||
        isNaN(entitled_days) || entitled_days < 0) {
      return res.status(400).json({
        error: 'entitled_days must be a positive number.'
      });
    }

    // Verify policy belongs to same company
    const existing = await query(
      `SELECT lp.*, lt.name AS leave_type_name
       FROM leave_policies lp
       JOIN leave_types lt ON lt.id = lp.leave_type_id
       WHERE lp.id = $1 AND lp.company_id = $2`,
      [id, req.user.company_id]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({
        error: 'Policy not found.'
      });
    }

    const old = existing.rows[0];

    const result = await query(
      `UPDATE leave_policies
       SET entitled_days = $1, updated_at = NOW()
       WHERE id = $2 AND company_id = $3
       RETURNING *`,
      [entitled_days, id, req.user.company_id]
    );

    // Write audit log
    logAction({
      companyId:       req.user.company_id,
      performedBy:     req.user.id,
      performedByName:`${req.user.first_name} ${req.user.last_name}`,
      actionType:      ACTIONS.POLICY_UPDATED,
      description:
        `Policy updated: ${old.leave_type_name} → `
        + `${old.applies_to_role}: `
        + `${old.entitled_days} → ${entitled_days} days`,
      oldValue:        String(old.entitled_days),
      newValue:        String(entitled_days),
      ipAddress:       req.ip,
    });

    return res.json({
      message: 'Policy updated successfully.',
      policy:  result.rows[0],
    });
  } catch (err) {
    console.error('Update policy error:', err.message);
    return res.status(500).json({
      error: 'Failed to update policy.'
    });
  }
};

// ─── AUTO-ASSIGN BALANCES FROM POLICIES ───────────────
// POST /api/leave-policies/auto-assign
// HR runs this to automatically assign leave balances
// to ALL active employees based on their role policies
// Useful at the start of a new year
const autoAssignBalances = async (req, res) => {
  const { year } = req.body;

  if (!year || isNaN(year)) {
    return res.status(400).json({
      error: 'year is required e.g. { "year": 2026 }'
    });
  }

  try {
    // Get all active employees in the company
    const employees = await query(
      `SELECT id, first_name, last_name, role
       FROM users
       WHERE company_id = $1 AND is_active = true`,
      [req.user.company_id]
    );

    // Get all active policies for this company
    const policies = await query(
      `SELECT * FROM leave_policies
       WHERE company_id = $1 AND is_active = true`,
      [req.user.company_id]
    );

    let assigned = 0;
    let skipped  = 0;
    const errors = [];

    // Loop through every employee
    for (const emp of employees.rows) {
      // Loop through every leave policy
      for (const policy of policies.rows) {

        // Check if this policy applies to this employee
        // Policy applies if:
        //   applies_to_role = 'all' → applies to everyone
        //   applies_to_role = emp.role → matches their role
        const policyApplies =
          policy.applies_to_role === 'all' ||
          policy.applies_to_role === emp.role;

        if (!policyApplies) continue;

        // Check if a balance already exists for this
        // employee + leave type + year combination
        const existingBalance = await query(
          `SELECT id FROM leave_balances
           WHERE user_id       = $1
             AND leave_type_id = $2
             AND year          = $3`,
          [emp.id, policy.leave_type_id, year]
        );

        if (existingBalance.rows.length > 0) {
          // Balance already exists — skip to avoid
          // overwriting manually adjusted values
          skipped++;
          continue;
        }

        // Create the balance for this employee
        try {
          await query(
            `INSERT INTO leave_balances (
               id, user_id, leave_type_id, year,
               entitled_days, used_days, pending_days,
               carried_over_days, remaining_days,
               created_at, updated_at
             )
             VALUES (
               $1,$2,$3,$4,$5,0,0,0,$5,NOW(),NOW()
             )`,
            [
              uuidv4(),
              emp.id,
              policy.leave_type_id,
              year,
              policy.entitled_days,
            ]
          );
          assigned++;
        } catch (balErr) {
          errors.push(
            `${emp.first_name} ${emp.last_name}: `
            + balErr.message
          );
        }
      }
    }

    // Write audit log for this bulk operation
    logAction({
      companyId:       req.user.company_id,
      performedBy:     req.user.id,
      performedByName:`${req.user.first_name} ${req.user.last_name}`,
      actionType:      ACTIONS.BALANCE_ASSIGNED,
      description:
        `Auto-assigned balances for ${year}: `
        + `${assigned} created, ${skipped} skipped`,
      ipAddress:       req.ip,
    });

    return res.json({
      message:    `Auto-assignment for ${year} complete.`,
      year,
      assigned,
      skipped,
      errors: errors.length > 0 ? errors : undefined,
    });

  } catch (err) {
    console.error('Auto-assign error:', err.message);
    return res.status(500).json({
      error: 'Failed to auto-assign balances.'
    });
  }
};

module.exports = {
  createPolicy,
  listPolicies,
  updatePolicy,
  autoAssignBalances,
};