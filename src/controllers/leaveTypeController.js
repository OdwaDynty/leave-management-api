// ─── LEAVE TYPE CONTROLLER ────────────────────────────
// Handles all leave type management logic
// Leave types define the categories of leave a company offers
// e.g. Annual Leave, Sick Leave, Study Leave, Maternity Leave
// Only hr_admin and super_admin can manage leave types

const { v4: uuidv4 } = require('uuid');
const { query }      = require('../config/db');

// ─── CREATE LEAVE TYPE ────────────────────────────────
// POST /api/leave-types
// Creates a new leave type for the company
const createLeaveType = async (req, res) => {
  const {
    name,
    description,
    default_days,
    is_paid,
    requires_approval,
    carry_over,
    max_carry_over_days,
    allow_half_day,
  } = req.body;

  // ── Validation ────────────────────────────────────
  // Name is the only truly required field
  if (!name) {
    return res.status(400).json({
      error: 'Leave type name is required.'
    });
  }

  // default_days must be a positive number if provided
  if (default_days !== undefined && (isNaN(default_days) || default_days < 0)) {
    return res.status(400).json({
      error: 'default_days must be a positive number.'
    });
  }

  try {
    // ── Check for Duplicate Name ──────────────────
    // A company cannot have two leave types with the same name
    const existing = await query(
      `SELECT id FROM leave_types
       WHERE company_id = $1 AND LOWER(name) = LOWER($2)`,
      [req.user.company_id, name]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({
        error: `A leave type named "${name}" already exists.`
      });
    }

    // ── Insert the Leave Type ─────────────────────
    const id     = uuidv4();
    const result = await query(
      `INSERT INTO leave_types (
         id, company_id, name, description,
         default_days, is_paid, requires_approval,
         carry_over, max_carry_over_days, allow_half_day,
         is_active, created_at, updated_at
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true,NOW(),NOW())
       RETURNING *`,
      [
        id,
        req.user.company_id,
        name,
        description        || null,
        default_days       ?? 0,     // ?? means: use 0 if null or undefined
        is_paid            ?? true,  // Default: paid leave
        requires_approval  ?? true,  // Default: needs approval
        carry_over         ?? false, // Default: no carry over
        max_carry_over_days ?? 0,
        allow_half_day     ?? false,
      ]
    );

    return res.status(201).json({
      message:    'Leave type created successfully.',
      leave_type: result.rows[0],
    });

  } catch (err) {
    console.error('Create leave type error:', err.message);
    return res.status(500).json({ error: 'Failed to create leave type.' });
  }
};

// ─── LIST ALL LEAVE TYPES ─────────────────────────────
// GET /api/leave-types
// Returns all leave types for the logged-in user's company
// Optional filter: ?is_active=true to show only active types
const listLeaveTypes = async (req, res) => {
  try {
    const { is_active } = req.query;

    // Base query — always filter by company_id for tenant isolation
    let sql    = `
      SELECT
        id,
        name,
        description,
        default_days,
        is_paid,
        requires_approval,
        carry_over,
        max_carry_over_days,
        allow_half_day,
        is_active,
        created_at
      FROM leave_types
      WHERE company_id = $1
    `;
    const params = [req.user.company_id];

    // Optionally filter by active status
    if (is_active !== undefined) {
      sql += ` AND is_active = $2`;
      params.push(is_active === 'true');
    }

    // Sort alphabetically by name
    sql += ' ORDER BY name ASC';

    const result = await query(sql, params);

    return res.json({
      count:       result.rows.length,
      leave_types: result.rows,
    });

  } catch (err) {
    console.error('List leave types error:', err.message);
    return res.status(500).json({ error: 'Failed to retrieve leave types.' });
  }
};

// ─── GET SINGLE LEAVE TYPE ────────────────────────────
// GET /api/leave-types/:id
// Returns the full details of one leave type
const getLeaveType = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      `SELECT * FROM leave_types
       WHERE id = $1 AND company_id = $2`,
      [id, req.user.company_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Leave type not found.' });
    }

    return res.json({ leave_type: result.rows[0] });

  } catch (err) {
    console.error('Get leave type error:', err.message);
    return res.status(500).json({ error: 'Failed to retrieve leave type.' });
  }
};

// ─── UPDATE LEAVE TYPE ────────────────────────────────
// PUT /api/leave-types/:id
// Updates an existing leave type
// Only fields that are sent in the request body will be updated
const updateLeaveType = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      description,
      default_days,
      is_paid,
      requires_approval,
      carry_over,
      max_carry_over_days,
      allow_half_day,
    } = req.body;

    // ── Check Leave Type Exists ───────────────────
    const existing = await query(
      `SELECT id FROM leave_types
       WHERE id = $1 AND company_id = $2`,
      [id, req.user.company_id]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Leave type not found.' });
    }

    // ── Check New Name is Not Duplicate ───────────
    // Only check if name is being changed
    if (name) {
      const duplicate = await query(
        `SELECT id FROM leave_types
         WHERE company_id = $1
           AND LOWER(name) = LOWER($2)
           AND id != $3`,
        [req.user.company_id, name, id]
      );
      if (duplicate.rows.length > 0) {
        return res.status(409).json({
          error: `A leave type named "${name}" already exists.`
        });
      }
    }

    // ── Build Dynamic Update Query ────────────────
    // Only update the fields that were actually provided
    const updates = [];
    const params  = [];
    let   idx     = 1;

    if (name                !== undefined) { updates.push(`name                = $${idx++}`); params.push(name);                }
    if (description         !== undefined) { updates.push(`description         = $${idx++}`); params.push(description);         }
    if (default_days        !== undefined) { updates.push(`default_days        = $${idx++}`); params.push(default_days);        }
    if (is_paid             !== undefined) { updates.push(`is_paid             = $${idx++}`); params.push(is_paid);             }
    if (requires_approval   !== undefined) { updates.push(`requires_approval   = $${idx++}`); params.push(requires_approval);   }
    if (carry_over          !== undefined) { updates.push(`carry_over          = $${idx++}`); params.push(carry_over);          }
    if (max_carry_over_days !== undefined) { updates.push(`max_carry_over_days = $${idx++}`); params.push(max_carry_over_days); }
    if (allow_half_day      !== undefined) { updates.push(`allow_half_day      = $${idx++}`); params.push(allow_half_day);      }

    // Always stamp the update time
    updates.push(`updated_at = NOW()`);

    if (updates.length === 1) {
      return res.status(400).json({ error: 'No fields provided to update.' });
    }

    params.push(id);
    params.push(req.user.company_id);

    const result = await query(
      `UPDATE leave_types
       SET ${updates.join(', ')}
       WHERE id = $${idx++} AND company_id = $${idx}
       RETURNING *`,
      params
    );

    return res.json({
      message:    'Leave type updated successfully.',
      leave_type: result.rows[0],
    });

  } catch (err) {
    console.error('Update leave type error:', err.message);
    return res.status(500).json({ error: 'Failed to update leave type.' });
  }
};

// ─── DEACTIVATE LEAVE TYPE ────────────────────────────
// DELETE /api/leave-types/:id
// Deactivates a leave type — does not delete it
// Deactivated types no longer appear when employees apply for leave
// but existing requests using this type are preserved
const deactivateLeaveType = async (req, res) => {
  try {
    const { id } = req.params;

    // ── Check Leave Type Exists ───────────────────
    const existing = await query(
      `SELECT id, is_active FROM leave_types
       WHERE id = $1 AND company_id = $2`,
      [id, req.user.company_id]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Leave type not found.' });
    }

    if (!existing.rows[0].is_active) {
      return res.status(400).json({
        error: 'This leave type is already deactivated.'
      });
    }

    // ── Check for Pending Requests ────────────────
    // Warn if there are pending leave requests using this type
    // We still allow deactivation but surface the information
    const pendingRequests = await query(
      `SELECT COUNT(*) AS count
       FROM leave_requests
       WHERE leave_type_id = $1 AND status = 'pending'`,
      [id]
    );

    const pendingCount = parseInt(pendingRequests.rows[0].count);

    // ── Deactivate ────────────────────────────────
    await query(
      `UPDATE leave_types
       SET is_active = false, updated_at = NOW()
       WHERE id = $1 AND company_id = $2`,
      [id, req.user.company_id]
    );

    return res.json({
      message: 'Leave type deactivated successfully.',
      warning: pendingCount > 0
        ? `There are ${pendingCount} pending leave request(s) using this leave type. Please action them.`
        : null,
    });

  } catch (err) {
    console.error('Deactivate leave type error:', err.message);
    return res.status(500).json({ error: 'Failed to deactivate leave type.' });
  }
};

module.exports = {
  createLeaveType,
  listLeaveTypes,
  getLeaveType,
  updateLeaveType,
  deactivateLeaveType,
};