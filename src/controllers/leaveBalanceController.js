// ─── LEAVE BALANCE CONTROLLER ─────────────────────────
// Manages leave entitlements per employee per leave type per year
// Think of a balance as a "leave account" for each employee
// When a leave request is approved, days are deducted from the balance
// When a request is cancelled, days are credited back

const { v4: uuidv4 } = require('uuid');
const { query }      = require('../config/db');

const { logAction, ACTIONS } = require('../utils/auditLogger');

// ─── ASSIGN LEAVE BALANCE ─────────────────────────────
// POST /api/leave-balances/assign
// Assigns a leave balance to one employee for one leave type for a year
// HR runs this when onboarding a new employee or at the start of a new year
const assignLeaveBalance = async (req, res) => {
  const {
    user_id,        // The employee to assign the balance to
    leave_type_id,  // Which leave type e.g. Annual Leave
    year,           // The year this balance applies to e.g. 2025
    entitled_days,  // How many days they are entitled to
  } = req.body;

  // ── Validation ────────────────────────────────────
  if (!user_id || !leave_type_id || !year || entitled_days === undefined) {
    return res.status(400).json({
      error: 'user_id, leave_type_id, year and entitled_days are all required.'
    });
  }

  if (isNaN(entitled_days) || entitled_days < 0) {
    return res.status(400).json({
      error: 'entitled_days must be a positive number.'
    });
  }

  const currentYear = new Date().getFullYear();
  if (year < 2000 || year > currentYear + 1) {
    return res.status(400).json({
      error: `Year must be between 2000 and ${currentYear + 1}.`
    });
  }

  try {
    // ── Verify Employee Belongs to Same Company ───
    const employeeCheck = await query(
      `SELECT id FROM users
       WHERE id = $1 AND company_id = $2 AND is_active = true`,
      [user_id, req.user.company_id]
    );
    if (employeeCheck.rows.length === 0) {
      return res.status(404).json({
        error: 'Employee not found or does not belong to your company.'
      });
    }

    // ── Verify Leave Type Belongs to Same Company ─
    const leaveTypeCheck = await query(
      `SELECT id, default_days FROM leave_types
       WHERE id = $1 AND company_id = $2 AND is_active = true`,
      [leave_type_id, req.user.company_id]
    );
    if (leaveTypeCheck.rows.length === 0) {
      return res.status(404).json({
        error: 'Leave type not found or does not belong to your company.'
      });
    }

    // ── Check for Duplicate Balance ───────────────
    // An employee can only have ONE balance per leave type per year
    const existing = await query(
      `SELECT id FROM leave_balances
       WHERE user_id = $1 AND leave_type_id = $2 AND year = $3`,
      [user_id, leave_type_id, year]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({
        error: 'A balance already exists for this employee, leave type and year. Use PUT to adjust it.'
      });
    }

    // ── Insert the Balance ────────────────────────
    // remaining_days starts equal to entitled_days
    // (no days used or pending yet)
    const id     = uuidv4();
    const result = await query(
      `INSERT INTO leave_balances (
         id, user_id, leave_type_id, year,
         entitled_days, used_days, pending_days,
         carried_over_days, remaining_days,
         created_at, updated_at
       )
       VALUES ($1,$2,$3,$4,$5, 0, 0, 0,$5, NOW(), NOW())
       RETURNING *`,
      [id, user_id, leave_type_id, year, entitled_days]
    );

    return res.status(201).json({
      message:       'Leave balance assigned successfully.',
      leave_balance: result.rows[0],
    });

  } catch (err) {
    console.error('Assign leave balance error:', err.message);
    return res.status(500).json({ error: 'Failed to assign leave balance.' });
  }
};

// ─── GET MY BALANCES ──────────────────────────────────
// GET /api/leave-balances/my
// Employees use this to check their own leave balances
// Optional filter: ?year=2025 (defaults to current year)
const getMyBalances = async (req, res) => {
  try {
    // Default to current year if not specified
    const year = parseInt(req.query.year) || new Date().getFullYear();

    const result = await query(
      `SELECT
         lb.id,
         lb.year,
         lb.entitled_days,
         lb.used_days,
         lb.pending_days,
         lb.carried_over_days,
         lb.remaining_days,
         lb.updated_at,
         -- Join leave type info so the employee sees the name
         lt.name          AS leave_type_name,
         lt.is_paid       AS is_paid,
         lt.allow_half_day AS allow_half_day
       FROM leave_balances lb
       JOIN leave_types lt ON lt.id = lb.leave_type_id
       WHERE lb.user_id = $1
         AND lb.year    = $2
         AND lt.is_active = true
       ORDER BY lt.name ASC`,
      [req.user.id, year]
    );

    return res.json({
      year,
      employee_id: req.user.id,
      balances:    result.rows,
    });

  } catch (err) {
    console.error('Get my balances error:', err.message);
    return res.status(500).json({ error: 'Failed to retrieve your leave balances.' });
  }
};

// ─── GET EMPLOYEE BALANCES ────────────────────────────
// GET /api/leave-balances/employee/:id
// HR admins and managers use this to view any employee's balances
// Optional filter: ?year=2025 (defaults to current year)
const getEmployeeBalances = async (req, res) => {
  try {
    const { id }  = req.params;
    const year    = parseInt(req.query.year) || new Date().getFullYear();

    // ── Verify Employee is in Same Company ────────
    const employeeCheck = await query(
      `SELECT id, first_name, last_name, email
       FROM users
       WHERE id = $1 AND company_id = $2`,
      [id, req.user.company_id]
    );
    if (employeeCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found.' });
    }

    const employee = employeeCheck.rows[0];

    const result = await query(
      `SELECT
         lb.id,
         lb.year,
         lb.entitled_days,
         lb.used_days,
         lb.pending_days,
         lb.carried_over_days,
         lb.remaining_days,
         lb.updated_at,
         lt.name           AS leave_type_name,
         lt.is_paid        AS is_paid,
         lt.allow_half_day AS allow_half_day
       FROM leave_balances lb
       JOIN leave_types lt ON lt.id = lb.leave_type_id
       WHERE lb.user_id = $1
         AND lb.year    = $2
       ORDER BY lt.name ASC`,
      [id, year]
    );

    return res.json({
      year,
      employee: {
        id:         employee.id,
        name:       `${employee.first_name} ${employee.last_name}`,
        email:      employee.email,
      },
      balances: result.rows,
    });

  } catch (err) {
    console.error('Get employee balances error:', err.message);
    return res.status(500).json({ error: 'Failed to retrieve employee balances.' });
  }
};

// ─── ADJUST LEAVE BALANCE ─────────────────────────────
// PUT /api/leave-balances/:id
// Allows HR to manually adjust an employee's entitlement
// e.g. granting extra days, correcting an error
const adjustLeaveBalance = async (req, res) => {
  try {
    const { id }          = req.params;
    const { entitled_days, note } = req.body;

    if (entitled_days === undefined) {
      return res.status(400).json({
        error: 'entitled_days is required.'
      });
    }

    if (isNaN(entitled_days) || entitled_days < 0) {
      return res.status(400).json({
        error: 'entitled_days must be a positive number.'
      });
    }

    // ── Fetch the Existing Balance ─────────────────
    // We need used_days and pending_days to recalculate remaining
    const existing = await query(
      `SELECT lb.*, u.company_id
       FROM leave_balances lb
       JOIN users u ON u.id = lb.user_id
       WHERE lb.id = $1`,
      [id]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Leave balance not found.' });
    }

    const balance = existing.rows[0];

    // ── Verify Balance Belongs to Same Company ────
    if (balance.company_id !== req.user.company_id) {
      return res.status(403).json({
        error: 'Access denied.'
      });
    }

    // ── Recalculate Remaining Days ─────────────────
    // remaining = new entitlement - already used - pending
    const newRemaining = parseFloat(entitled_days)
      - parseFloat(balance.used_days)
      - parseFloat(balance.pending_days);

    if (newRemaining < 0) {
      return res.status(400).json({
        error: `Cannot set entitled_days to ${entitled_days}. Employee has already used ${balance.used_days} days with ${balance.pending_days} pending.`
      });
    }

    const result = await query(
      `UPDATE leave_balances
       SET entitled_days  = $1,
           remaining_days = $2,
           updated_at     = NOW()
       WHERE id = $3
       RETURNING *`,
      [entitled_days, newRemaining, id]
    );



  // ── Write Audit Log ────────────────────────────
    logAction({
      companyId:       req.user.company_id,
      performedBy:     req.user.id,
      performedByName: `${req.user.first_name} ${req.user.last_name}`,
      actionType:      ACTIONS.BALANCE_ADJUSTED,
      targetUserId:    balance.user_id,
      description:
        `Balance adjusted from ${balance.entitled_days} `
        + `to ${entitled_days} days. Note: ${note || 'none'}`,
      oldValue:        String(balance.entitled_days),
      newValue:        String(entitled_days),
      ipAddress:       req.ip,
    });





    return res.json({
      message:       'Leave balance adjusted successfully.',
      note:          note || null,
      leave_balance: result.rows[0],
    });

  } catch (err) {
    console.error('Adjust leave balance error:', err.message);
    return res.status(500).json({ error: 'Failed to adjust leave balance.' });
  }
};

// ─── RUN CARRY OVER ───────────────────────────────────
// POST /api/leave-balances/carry-over
// Runs at year end — rolls over unused days to the next year
// Only processes leave types that have carry_over = true
// Respects the max_carry_over_days limit per leave type
const runCarryOver = async (req, res) => {
  const { from_year, to_year } = req.body;

  // ── Validation ────────────────────────────────────
  if (!from_year || !to_year) {
    return res.status(400).json({
      error: 'from_year and to_year are required. e.g. from_year: 2024, to_year: 2025'
    });
  }

  if (to_year !== from_year + 1) {
    return res.status(400).json({
      error: 'to_year must be exactly one year after from_year.'
    });
  }

  try {
    // ── Get All Leave Types That Allow Carry Over ──
    const leaveTypes = await query(
      `SELECT id, name, max_carry_over_days
       FROM leave_types
       WHERE company_id = $1
         AND carry_over  = true
         AND is_active   = true`,
      [req.user.company_id]
    );

    if (leaveTypes.rows.length === 0) {
      return res.json({
        message: 'No leave types with carry over enabled found.',
        processed: 0,
      });
    }

    let totalProcessed = 0;
    const summary      = [];

    // ── Process Each Leave Type ───────────────────
    for (const leaveType of leaveTypes.rows) {

      // Get all balances for this leave type for the from_year
      const balances = await query(
        `SELECT lb.id, lb.user_id, lb.remaining_days
         FROM leave_balances lb
         JOIN users u ON u.id = lb.user_id
         WHERE lb.leave_type_id = $1
           AND lb.year          = $2
           AND u.company_id     = $3
           AND u.is_active      = true`,
        [leaveType.id, from_year, req.user.company_id]
      );

      for (const balance of balances.rows) {
        // Calculate carry over — capped at max_carry_over_days
        // e.g. if 8 days remaining but max is 5, carry over 5
        const carryOverDays = leaveType.max_carry_over_days > 0
          ? Math.min(balance.remaining_days, leaveType.max_carry_over_days)
          : balance.remaining_days; // 0 max means carry all remaining

        if (carryOverDays <= 0) continue; // Nothing to carry over

        // ── Check if a Balance Already Exists for to_year ─
        const existingNext = await query(
          `SELECT id, entitled_days FROM leave_balances
           WHERE user_id       = $1
             AND leave_type_id = $2
             AND year          = $3`,
          [balance.user_id, leaveType.id, to_year]
        );

        if (existingNext.rows.length > 0) {
          // Balance already exists — add carry over days to it
          const nextBalance = existingNext.rows[0];
          const newEntitled  = parseFloat(nextBalance.entitled_days) + carryOverDays;

          await query(
            `UPDATE leave_balances
             SET entitled_days    = $1,
                 carried_over_days = $2,
                 remaining_days   = remaining_days + $2,
                 updated_at       = NOW()
             WHERE id = $3`,
            [newEntitled, carryOverDays, nextBalance.id]
          );
        } else {
          // No balance yet for to_year — create one with carried over days
          const newId = uuidv4();
          await query(
            `INSERT INTO leave_balances (
               id, user_id, leave_type_id, year,
               entitled_days, used_days, pending_days,
               carried_over_days, remaining_days,
               created_at, updated_at
             )
             VALUES ($1,$2,$3,$4,$5, 0, 0,$6,$5, NOW(), NOW())`,
            [newId, balance.user_id, leaveType.id, to_year, carryOverDays, carryOverDays]
          );
        }

        totalProcessed++;
      }

      summary.push({
        leave_type:      leaveType.name,
        employees_processed: balances.rows.length,
      });
    }

    return res.json({
      message:    `Carry over from ${from_year} to ${to_year} completed.`,
      total_employees_processed: totalProcessed,
      summary,
    });

  } catch (err) {
    console.error('Carry over error:', err.message);
    return res.status(500).json({ error: 'Failed to run carry over.' });
  }
};

module.exports = {
  assignLeaveBalance,
  getMyBalances,
  getEmployeeBalances,
  adjustLeaveBalance,
  runCarryOver,
};