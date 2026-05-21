// ─── LEAVE REQUEST CONTROLLER ─────────────────────────
// The core of the leave management system
// Handles the full lifecycle of a leave request:
// Submit → Pending → Approved / Rejected
// Employees can also Cancel a pending request
//
// Balance changes per action:
// SUBMIT:   pending_days++, remaining_days--
// APPROVE:  pending_days--, used_days++
// REJECT:   pending_days--, remaining_days++
// CANCEL:   pending_days--, remaining_days++

const { v4: uuidv4 }       = require('uuid');
const { query, getClient } = require('../config/db');
const {
  notifyManagerRequestSubmitted,
  notifyEmployeeRequestApproved,
  notifyEmployeeRequestRejected,
  notifyManagerRequestCancelled,
} = require('../utils/emailService');

const { logAction, ACTIONS } = require('../utils/auditLogger');

// ─── HELPER: CALCULATE WORKING DAYS ──────────────────
// Counts working days between two dates
// Excludes weekends (Sat/Sun) and company public holidays
const calculateWorkingDays = async (startDate, endDate, companyId) => {
  // Fetch public holidays in this date range for this company
  const holidays = await query(
    `SELECT holiday_date FROM public_holidays
     WHERE company_id   = $1
       AND holiday_date BETWEEN $2 AND $3`,
    [companyId, startDate, endDate]
  );

  // Build a Set of holiday date strings for fast O(1) lookup
  const holidaySet = new Set(
    holidays.rows.map(h =>
      new Date(h.holiday_date).toISOString().split('T')[0]
    )
  );

  let count       = 0;
  let currentDate = new Date(startDate);
  const end       = new Date(endDate);

  // Walk through every day in the range
  while (currentDate <= end) {
    const dayOfWeek  = currentDate.getDay(); // 0=Sun, 6=Sat
    const dateString = currentDate.toISOString().split('T')[0];

    // Only count weekdays that are not public holidays
    if (dayOfWeek !== 0 && dayOfWeek !== 6 && !holidaySet.has(dateString)) {
      count++;
    }

    // Advance to the next day
    currentDate.setDate(currentDate.getDate() + 1);
  }

  return count;
};

// ─── SUBMIT LEAVE REQUEST ─────────────────────────────
// POST /api/leave-requests
// Employee submits a new leave request
// Validates dates, balance sufficiency, and overlapping requests
const submitLeaveRequest = async (req, res) => {
  const {
    leave_type_id,
    start_date,
    end_date,
    reason,
    is_half_day,
    half_day_period, // 'morning' or 'afternoon'
  } = req.body;

  // ── Required Field Validation ─────────────────────
  if (!leave_type_id || !start_date || !end_date) {
    return res.status(400).json({
      error: 'leave_type_id, start_date and end_date are required.'
    });
  }

  // End date cannot be before start date
  if (new Date(end_date) < new Date(start_date)) {
    return res.status(400).json({
      error: 'end_date cannot be before start_date.'
    });
  }

  // Cannot apply for leave starting in the past
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (new Date(start_date) < today) {
    return res.status(400).json({
      error: 'Cannot apply for leave that starts in the past.'
    });
  }

  // Validate half day period value if half day is requested
  if (is_half_day && !['morning', 'afternoon'].includes(half_day_period)) {
    return res.status(400).json({
      error: 'half_day_period must be "morning" or "afternoon".'
    });
  }

  try {
    // ── Verify Leave Type Exists and is Active ─────
    const leaveTypeResult = await query(
      `SELECT * FROM leave_types
       WHERE id = $1 AND company_id = $2 AND is_active = true`,
      [leave_type_id, req.user.company_id]
    );
    if (leaveTypeResult.rows.length === 0) {
      return res.status(404).json({ error: 'Leave type not found.' });
    }

    const lt = leaveTypeResult.rows[0];

    // Check if half day is allowed for this leave type
    if (is_half_day && !lt.allow_half_day) {
      return res.status(400).json({
        error: `${lt.name} does not allow half day requests.`
      });
    }

    // ── Calculate Days Being Requested ────────────
    // Half day is always 0.5 regardless of date range
    const daysRequested = is_half_day
      ? 0.5
      : await calculateWorkingDays(start_date, end_date, req.user.company_id);

    if (daysRequested === 0) {
      return res.status(400).json({
        error: 'The selected date range contains no working days.'
      });
    }

    // ── Check for Overlapping Requests ────────────
    // Prevent duplicate or overlapping leave submissions
    const overlap = await query(
      `SELECT id FROM leave_requests
       WHERE user_id    = $1
         AND status     IN ('pending', 'approved')
         AND start_date <= $2
         AND end_date   >= $3`,
      [req.user.id, end_date, start_date]
    );
    if (overlap.rows.length > 0) {
      return res.status(409).json({
        error: 'You already have a pending or approved request overlapping these dates.'
      });
    }

    // ── Check Leave Balance ────────────────────────
    const currentYear  = new Date(start_date).getFullYear();
    const balanceResult = await query(
      `SELECT * FROM leave_balances
       WHERE user_id       = $1
         AND leave_type_id = $2
         AND year          = $3`,
      [req.user.id, leave_type_id, currentYear]
    );

    if (balanceResult.rows.length === 0) {
      return res.status(400).json({
        error: `You have no ${lt.name} balance for ${currentYear}. Please contact HR.`
      });
    }

    const bal = balanceResult.rows[0];

    // Ensure employee has enough remaining days
    if (parseFloat(bal.remaining_days) < daysRequested) {
      return res.status(400).json({
        error: `Insufficient balance. You have ${bal.remaining_days} days remaining but requested ${daysRequested} days.`
      });
    }

    // ── Determine Initial Status ───────────────────
    // Leave types that don't require approval are auto-approved
    const initialStatus = lt.requires_approval ? 'pending' : 'approved';

    // ── Create Request and Update Balance ─────────
    // Use a transaction so both succeed or both fail together
    const client = await getClient();
    try {
      await client.query('BEGIN');

      // Insert the leave request
      const requestId = uuidv4();
      const result    = await client.query(
        `INSERT INTO leave_requests (
           id, user_id, leave_type_id,
           start_date, end_date, days_requested,
           status, reason, is_half_day, half_day_period,
           created_at, updated_at
         )
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW(),NOW())
         RETURNING *`,
        [
          requestId,
          req.user.id,
          leave_type_id,
          start_date,
          end_date,
          daysRequested,
          initialStatus,
          reason          || null,
          is_half_day     || false,
          half_day_period || null,
        ]
      );

      // Update the balance depending on whether auto-approved or pending
      if (initialStatus === 'pending') {
        // Days move to pending — not yet used
        await client.query(
          `UPDATE leave_balances
           SET pending_days   = pending_days   + $1,
               remaining_days = remaining_days - $1,
               updated_at     = NOW()
           WHERE user_id       = $2
             AND leave_type_id = $3
             AND year          = $4`,
          [daysRequested, req.user.id, leave_type_id, currentYear]
        );
      } else {
        // Auto-approved — days go straight to used
        await client.query(
          `UPDATE leave_balances
           SET used_days      = used_days      + $1,
               remaining_days = remaining_days - $1,
               updated_at     = NOW()
           WHERE user_id       = $2
             AND leave_type_id = $3
             AND year          = $4`,
          [daysRequested, req.user.id, leave_type_id, currentYear]
        );
      }

      // Notify the manager if approval is needed
      if (initialStatus === 'pending' && req.user.manager_id) {
        await client.query(
          `INSERT INTO notifications (
             id, user_id, leave_request_id,
             type, message, is_read, created_at
           )
           VALUES ($1,$2,$3,'request_submitted',$4,false,NOW())`,
          [
            uuidv4(),
            req.user.manager_id,
            requestId,
            `${req.user.first_name} ${req.user.last_name} submitted a ${lt.name} request for ${daysRequested} day(s).`,
          ]
        );
      }

      await client.query('COMMIT');




     // ── Send Email Notification ───────────────────
      // After commit — find the right person to notify
      // Rule 1: If employee has a manager → notify manager
      // Rule 2: If employee IS a manager with no manager above
      //         them → notify an HR admin instead so the
      //         request does not sit pending forever
      // Rule 3: If no manager and no HR admin → skip email
      if (initialStatus === 'pending') {
        try {
          let notifyEmail = null;
          let notifyName  = null;

          if (req.user.manager_id) {
            // ── Rule 1: Employee has a manager ────────
            // Look up the manager's details
            const managerRes = await query(
              `SELECT first_name, last_name, email
               FROM users WHERE id = $1`,
              [req.user.manager_id]
            );
            if (managerRes.rows.length > 0) {
              const mgr  = managerRes.rows[0];
              notifyEmail = mgr.email;
              notifyName  =
                `${mgr.first_name} ${mgr.last_name}`;
            }
          } else {
            // ── Rule 2: No manager assigned ───────────
            // This happens when:
            //   a) The user is a manager themselves
            //   b) HR forgot to assign a manager
            // In both cases route to an HR admin
            const hrRes = await query(
              `SELECT first_name, last_name, email
               FROM users
               WHERE company_id = $1
                 AND role IN ('hr_admin','super_admin')
                 AND is_active = true
               ORDER BY created_at ASC
               LIMIT 1`,
              [req.user.company_id]
            );
            if (hrRes.rows.length > 0) {
              const hr   = hrRes.rows[0];
              notifyEmail = hr.email;
              notifyName  =
                `${hr.first_name} ${hr.last_name}`;
            }
          }

          // Send the email if we found someone to notify
          if (notifyEmail) {
            notifyManagerRequestSubmitted({
              managerEmail:  notifyEmail,
              managerName:   notifyName,
              employeeName:
                `${req.user.first_name} ${req.user.last_name}`,
              leaveType:     lt.name,
              startDate:     start_date,
              endDate:       end_date,
              daysRequested: daysRequested,
              reason:        reason || null,
            });
          }
        } catch (emailErr) {
          // Never let email failure affect the API response
          console.error(
            'Submit email error:', emailErr.message
          );
        }
      }










      return res.status(201).json({
        message: initialStatus === 'approved'
          ? 'Leave request submitted and automatically approved.'
          : 'Leave request submitted successfully. Awaiting manager approval.',
        leave_request: result.rows[0],
      });

    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

  } catch (err) {
    console.error('Submit leave request error:', err.message);
    return res.status(500).json({ error: 'Failed to submit leave request.' });
  }
};

// ─── GET MY LEAVE REQUESTS ────────────────────────────
// GET /api/leave-requests/my
// Employee views their own leave history
// Optional filters: ?status=pending  ?year=2026
const getMyLeaveRequests = async (req, res) => {
  try {
    const { status, year } = req.query;

    let sql    = `
      SELECT
        lr.id,
        lr.start_date,
        lr.end_date,
        lr.days_requested,
        lr.status,
        lr.reason,
        lr.is_half_day,
        lr.half_day_period,
        lr.rejection_reason,
        lr.created_at,
        lr.reviewed_at,
        lt.name                              AS leave_type_name,
        lt.is_paid,
        CONCAT(r.first_name,' ',r.last_name) AS reviewed_by_name
      FROM leave_requests lr
      JOIN leave_types lt ON lt.id = lr.leave_type_id
      LEFT JOIN users r   ON r.id  = lr.reviewed_by
      WHERE lr.user_id = $1
    `;
    const params = [req.user.id];
    let   idx    = 2;

    // Filter by status if provided e.g. ?status=pending
    if (status) {
      sql += ` AND lr.status = $${idx++}`;
      params.push(status);
    }

    // Filter by year if provided e.g. ?year=2026
    if (year) {
      sql += ` AND EXTRACT(YEAR FROM lr.start_date) = $${idx++}`;
      params.push(parseInt(year));
    }

    // Most recent first
    sql += ' ORDER BY lr.created_at DESC';

    const result = await query(sql, params);

    return res.json({
      count:          result.rows.length,
      leave_requests: result.rows,
    });

  } catch (err) {
    console.error('Get my leave requests error:', err.message);
    return res.status(500).json({ error: 'Failed to retrieve your leave requests.' });
  }
};



// ─── GET PENDING APPROVALS ────────────────────────────
// GET /api/leave-requests/pending
// Returns pending leave requests that the logged-in
// user should action:
//
// For managers:
//   → Their direct reports (manager_id = req.user.id)
//   → PLUS any employee in the company with no manager
//     assigned, because those requests would otherwise
//     sit pending forever with no one to action them
//
// For hr_admin and super_admin:
//   → ALL pending requests company-wide
const getPendingApprovals = async (req, res) => {
  try {
    let sql    = '';
    let params = [];

    if (['hr_admin', 'super_admin'].includes(req.user.role)) {
      // ── HR sees ALL pending requests ──────────────
      // No filter by manager — see everything
      sql = `
        SELECT
          lr.id,
          lr.start_date,
          lr.end_date,
          lr.days_requested,
          lr.status,
          lr.reason,
          lr.is_half_day,
          lr.created_at,
          lt.name                              AS leave_type_name,
          CONCAT(e.first_name,' ',e.last_name) AS employee_name,
          e.email                              AS employee_email,
          e.department
        FROM leave_requests lr
        JOIN leave_types lt ON lt.id = lr.leave_type_id
        JOIN users e        ON e.id  = lr.user_id
        WHERE e.company_id = $1
          AND lr.status    = 'pending'
        ORDER BY lr.created_at ASC
      `;
      params = [req.user.company_id];

    } else {
      // ── Manager sees two groups ────────────────────
      // Group 1: Their direct reports
      // Group 2: Employees with NO manager assigned
      //          (so they don't get stuck)
      sql = `
        SELECT
          lr.id,
          lr.start_date,
          lr.end_date,
          lr.days_requested,
          lr.status,
          lr.reason,
          lr.is_half_day,
          lr.created_at,
          lt.name                              AS leave_type_name,
          CONCAT(e.first_name,' ',e.last_name) AS employee_name,
          e.email                              AS employee_email,
          e.department
        FROM leave_requests lr
        JOIN leave_types lt ON lt.id = lr.leave_type_id
        JOIN users e        ON e.id  = lr.user_id
        WHERE e.company_id = $1
          AND lr.status    = 'pending'
          AND (
            -- Direct reports of this manager
            e.manager_id = $2
            OR
            -- Employees with no manager assigned at all
            -- These need someone to action them
            e.manager_id IS NULL
          )
          -- Never show the manager their OWN request
          -- A manager cannot approve their own leave
          AND e.id != $2
        ORDER BY lr.created_at ASC
      `;
      params = [req.user.company_id, req.user.id];
    }

    const result = await query(sql, params);

    return res.json({
      count:          result.rows.length,
      leave_requests: result.rows,
    });

  } catch (err) {
    console.error('Get pending approvals error:', err.message);
    return res.status(500).json({
      error: 'Failed to retrieve pending approvals.'
    });
  }
};



// ─── GET SINGLE LEAVE REQUEST ─────────────────────────
// GET /api/leave-requests/:id
// Returns full details of one leave request
// Employees can only view their own requests
const getLeaveRequest = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      `SELECT
         lr.*,
         lt.name                              AS leave_type_name,
         lt.is_paid,
         CONCAT(e.first_name,' ',e.last_name) AS employee_name,
         e.email                              AS employee_email,
         CONCAT(r.first_name,' ',r.last_name) AS reviewed_by_name
       FROM leave_requests lr
       JOIN leave_types lt ON lt.id = lr.leave_type_id
       JOIN users e        ON e.id  = lr.user_id
       LEFT JOIN users r   ON r.id  = lr.reviewed_by
       WHERE lr.id = $1 AND e.company_id = $2`,
      [id, req.user.company_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Leave request not found.' });
    }

    const request = result.rows[0];

    // Employees can only view their own requests
    const isPrivileged = ['manager', 'hr_admin', 'super_admin'].includes(req.user.role);
    if (!isPrivileged && request.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    return res.json({ leave_request: request });

  } catch (err) {
    console.error('Get leave request error:', err.message);
    return res.status(500).json({ error: 'Failed to retrieve leave request.' });
  }
};

// ─── APPROVE LEAVE REQUEST ────────────────────────────
// PUT /api/leave-requests/:id/approve
// Moves days from pending_days to used_days on the balance
const approveLeaveRequest = async (req, res) => {
  const { id } = req.params;

  const client = await getClient();
  try {
    await client.query('BEGIN');

    // Fetch the request along with the employee's company
    const requestResult = await client.query(
      `SELECT lr.*, e.company_id, e.first_name, e.last_name
       FROM leave_requests lr
       JOIN users e ON e.id = lr.user_id
       WHERE lr.id = $1`,
      [id]
    );

    if (requestResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Leave request not found.' });
    }

    const request = requestResult.rows[0];

    // Ensure the request belongs to the same company
    if (request.company_id !== req.user.company_id) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Access denied.' });
    }

    // Only pending requests can be approved
    if (request.status !== 'pending') {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: `This request is already ${request.status}.`
      });
    }

    
    
    
    
    
    
    // Update the request to approved
    await client.query(
      `UPDATE leave_requests
       SET status      = 'approved',
           reviewed_by = $1,
           reviewed_at = NOW(),
           updated_at  = NOW()
       WHERE id = $2`,
      [req.user.id, id]
    );

    // Move days from pending to used on the balance
    const year = new Date(request.start_date).getFullYear();
    await client.query(
      `UPDATE leave_balances
       SET pending_days = pending_days - $1,
           used_days    = used_days    + $1,
           updated_at   = NOW()
       WHERE user_id       = $2
         AND leave_type_id = $3
         AND year          = $4`,
      [request.days_requested, request.user_id, request.leave_type_id, year]
    );

    // Notify the employee their request was approved
    await client.query(
      `INSERT INTO notifications (
         id, user_id, leave_request_id,
         type, message, is_read, created_at
       )
       VALUES ($1,$2,$3,'request_approved',$4,false,NOW())`,
      [
        uuidv4(),
        request.user_id,
        id,
        `Your ${request.start_date.toISOString().split('T')[0]} to ${request.end_date.toISOString().split('T')[0]} leave request has been approved.`,
      ]
    );

    await client.query('COMMIT');








    // ── Send Email to Employee ────────────────────
      try {
        const employeeRes = await query(
          `SELECT u.first_name, u.last_name, u.email,
                  lt.name AS leave_type_name
           FROM users u
           JOIN leave_requests lr ON lr.id = $1
           JOIN leave_types lt    ON lt.id = lr.leave_type_id
           WHERE u.id = $2`,
          [id, request.user_id]
        );
        if (employeeRes.rows.length > 0) {
          const emp = employeeRes.rows[0];
          notifyEmployeeRequestApproved({
            employeeEmail:  emp.email,
            employeeName:   `${emp.first_name} ${emp.last_name}`,
            managerName:    `${req.user.first_name} ${req.user.last_name}`,
            leaveType:      emp.leave_type_name,
            startDate:      request.start_date,
            endDate:        request.end_date,
            daysRequested:  request.days_requested,
          });
        }
      } catch (emailErr) {
        console.error('Approve email error:', emailErr.message);
      }

    

    // ── Check if HR Sign-off is Required ──────────
// Get the leave type threshold setting
const ltResult = await client.query(
  `SELECT hr_approval_threshold
   FROM leave_types WHERE id = $1`,
  [request.leave_type_id]
);

const threshold =
  ltResult.rows[0]?.hr_approval_threshold || 0;

// Requires HR if threshold > 0 AND
// days requested exceeds the threshold
const needsHR =
  threshold > 0 &&
  parseFloat(request.days_requested) > threshold;

if (needsHR) {

  // ── Two-Level Flow ─────────────────────────
  // Manager approved — now needs HR sign-off
  // Balance remains pending until HR approves
  await client.query(
    `UPDATE leave_requests
     SET status                 = 'pending_hr',
         first_reviewer_id      = $1,
         first_reviewed_at      = NOW(),
         requires_hr_approval   = true,
         updated_at             = NOW()
     WHERE id = $2`,
    [req.user.id, id]
  );

  // Notify HR admin
  await client.query(
    `INSERT INTO notifications (
       id,
       user_id,
       leave_request_id,
       type,
       message,
       is_read,
       created_at
     )
     SELECT
       $1,
       u.id,
       $2,
       'request_submitted',
       $3,
       false,
       NOW()
     FROM users u
     WHERE u.company_id = $4
       AND u.role IN ('hr_admin','super_admin')
       AND u.is_active = true
     LIMIT 1`,
    [
      uuidv4(),
      id,
      `Manager approved a ${request.days_requested}-day `
      + `leave request requiring HR sign-off. `
      + `Employee: ${request.first_name} `
      + `${request.last_name}.`,
      request.company_id,
    ]
  );

  await client.query('COMMIT');

  return res.json({
    message:
      'Manager approval recorded. '
      + 'This request now requires HR final approval '
      + `because it exceeds ${threshold} days.`,
    status: 'pending_hr',
  });

} else {

  // ── Single-Level Flow ──────────────────────
  // Fully approve immediately
  await client.query(
    `UPDATE leave_requests
     SET status      = 'approved',
         reviewed_by = $1,
         reviewed_at = NOW(),
         updated_at  = NOW()
     WHERE id = $2`,
    [req.user.id, id]
  );

  // Move days from pending to used
  const year =
    new Date(request.start_date).getFullYear();

  await client.query(
    `UPDATE leave_balances
     SET pending_days = pending_days - $1,
         used_days    = used_days    + $1,
         updated_at   = NOW()
     WHERE user_id       = $2
       AND leave_type_id = $3
       AND year          = $4`,
    [
      request.days_requested,
      request.user_id,
      request.leave_type_id,
      year,
    ]
  );

  // Create notification
  await client.query(
    `INSERT INTO notifications (
       id,
       user_id,
       leave_request_id,
       type,
       message,
       is_read,
       created_at
     )
     VALUES ($1,$2,$3,'request_approved',$4,false,NOW())`,
    [
      uuidv4(),
      request.user_id,
      id,
      `Your leave request from `
      + `${request.start_date.toISOString().split('T')[0]} `
      + `to `
      + `${request.end_date.toISOString().split('T')[0]} `
      + `has been approved.`,
    ]
  );

  await client.query('COMMIT');

  // ── Send Email to Employee ─────────────────
  try {
    const employeeRes = await query(
      `SELECT u.first_name,
              u.last_name,
              u.email,
              lt.name AS leave_type_name
       FROM users u
       JOIN leave_requests lr
         ON lr.id = $1
       JOIN leave_types lt
         ON lt.id = lr.leave_type_id
       WHERE u.id = $2`,
      [id, request.user_id]
    );

    if (employeeRes.rows.length > 0) {
      const emp = employeeRes.rows[0];

      notifyEmployeeRequestApproved({
        employeeEmail: emp.email,
        employeeName:
          `${emp.first_name} ${emp.last_name}`,
        managerName:
          `${req.user.first_name} ${req.user.last_name}`,
        leaveType: emp.leave_type_name,
        startDate: request.start_date,
        endDate: request.end_date,
        daysRequested: request.days_requested,
      });
    }

  } catch (emailErr) {
    console.error(
      'Approve email error:',
      emailErr.message
    );
  }

  // Write audit log
  logAction({
    companyId: req.user.company_id,
    performedBy: req.user.id,
    performedByName:
      `${req.user.first_name} ${req.user.last_name}`,
    actionType: ACTIONS.LEAVE_APPROVED,
    targetUserId: request.user_id,
    targetUserName:
      `${request.first_name} ${request.last_name}`,
    description:
      `Leave approved: ${request.days_requested} days`,
    ipAddress: req.ip,
  });

  return res.json({
    message: 'Leave request approved successfully.',
    status: 'approved',
  });
 }
   

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Approve leave request error:', err.message);
    return res.status(500).json({ error: 'Failed to approve leave request.' });
  } finally {
    client.release();
  }
};

// ─── REJECT LEAVE REQUEST ─────────────────────────────
// PUT /api/leave-requests/:id/reject
// Moves days from pending back to remaining on the balance
// A rejection reason is mandatory
const rejectLeaveRequest = async (req, res) => {
  const { id }               = req.params;
  const { rejection_reason } = req.body;

  if (!rejection_reason) {
    return res.status(400).json({
      error: 'rejection_reason is required when rejecting a request.'
    });
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');

    const requestResult = await client.query(
      `SELECT lr.*, e.company_id
       FROM leave_requests lr
       JOIN users e ON e.id = lr.user_id
       WHERE lr.id = $1`,
      [id]
    );

    if (requestResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Leave request not found.' });
    }

    const request = requestResult.rows[0];

    if (request.company_id !== req.user.company_id) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Access denied.' });
    }

    if (request.status !== 'pending') {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: `This request is already ${request.status}.`
      });
    }

    // Update request to rejected with the reason
    await client.query(
      `UPDATE leave_requests
       SET status           = 'rejected',
           reviewed_by      = $1,
           reviewed_at      = NOW(),
           rejection_reason = $2,
           updated_at       = NOW()
       WHERE id = $3`,
      [req.user.id, rejection_reason, id]
    );

    // Credit the days back — move from pending to remaining
    const year = new Date(request.start_date).getFullYear();
    await client.query(
      `UPDATE leave_balances
       SET pending_days   = pending_days   - $1,
           remaining_days = remaining_days + $1,
           updated_at     = NOW()
       WHERE user_id       = $2
         AND leave_type_id = $3
         AND year          = $4`,
      [request.days_requested, request.user_id, request.leave_type_id, year]
    );

    // Notify the employee their request was rejected
    await client.query(
      `INSERT INTO notifications (
         id, user_id, leave_request_id,
         type, message, is_read, created_at
       )
       VALUES ($1,$2,$3,'request_rejected',$4,false,NOW())`,
      [
        uuidv4(),
        request.user_id,
        id,
        `Your leave request was rejected. Reason: ${rejection_reason}`,
      ]
    );

    

  // ── Send Email to Employee ────────────────────
      try {
        const employeeRes = await query(
          `SELECT u.first_name, u.last_name, u.email,
                  lt.name AS leave_type_name
           FROM users u
           JOIN leave_requests lr ON lr.id = $1
           JOIN leave_types lt    ON lt.id = lr.leave_type_id
           WHERE u.id = $2`,
          [id, request.user_id]
        );
        if (employeeRes.rows.length > 0) {
          const emp = employeeRes.rows[0];
          notifyEmployeeRequestRejected({
            employeeEmail:    emp.email,
            employeeName:     `${emp.first_name} ${emp.last_name}`,
            managerName:      `${req.user.first_name} ${req.user.last_name}`,
            leaveType:        emp.leave_type_name,
            startDate:        request.start_date,
            endDate:          request.end_date,
            daysRequested:    request.days_requested,
            rejectionReason:  rejection_reason,
          });
        }
      } catch (emailErr) {
        console.error('Reject email error:', emailErr.message);
      }





    return res.json({ message: 'Leave request rejected.' });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Reject leave request error:', err.message);
    return res.status(500).json({ error: 'Failed to reject leave request.' });
  } finally {
    client.release();
  }
};

// ─── CANCEL LEAVE REQUEST ─────────────────────────────
// PUT /api/leave-requests/:id/cancel
// Employee cancels their own pending request
// Credits days back to remaining balance
const cancelLeaveRequest = async (req, res) => {
  const { id } = req.params;

  const client = await getClient();
  try {
    await client.query('BEGIN');

    // Only fetch the request if it belongs to the logged in user
    const requestResult = await client.query(
      `SELECT * FROM leave_requests
       WHERE id = $1 AND user_id = $2`,
      [id, req.user.id]
    );

    if (requestResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        error: 'Leave request not found or does not belong to you.'
      });
    }

    const request = requestResult.rows[0];

    // Can only cancel requests that are still pending
    if (request.status !== 'pending') {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: `Only pending requests can be cancelled. This request is ${request.status}.`
      });
    }

    // Update status to cancelled
    await client.query(
      `UPDATE leave_requests
       SET status     = 'cancelled',
           updated_at = NOW()
       WHERE id = $1`,
      [id]
    );

    // Credit days back from pending to remaining
    const year = new Date(request.start_date).getFullYear();
    await client.query(
      `UPDATE leave_balances
       SET pending_days   = pending_days   - $1,
           remaining_days = remaining_days + $1,
           updated_at     = NOW()
       WHERE user_id       = $2
         AND leave_type_id = $3
         AND year          = $4`,
      [request.days_requested, req.user.id, request.leave_type_id, year]
    );

    await client.query('COMMIT');



  // ── Send Cancellation Email ───────────────────
      // Same routing logic as submit:
      // Rule 1: Employee has a manager → notify manager
      // Rule 2: No manager → notify HR admin instead
      try {
        let notifyEmail = null;
        let notifyName  = null;

        if (req.user.manager_id) {
          // ── Rule 1: Notify the direct manager ─────
          const mgrRes = await query(
            `SELECT m.first_name, m.last_name, m.email,
                    lt.name AS leave_type_name
             FROM users m
             JOIN leave_requests lr
               ON lr.id = $1
             JOIN leave_types lt
               ON lt.id = lr.leave_type_id
             WHERE m.id = $2`,
            [id, req.user.manager_id]
          );
          if (mgrRes.rows.length > 0) {
            const mgr   = mgrRes.rows[0];
            notifyEmail = mgr.email;
            notifyName  =
              `${mgr.first_name} ${mgr.last_name}`;

            notifyManagerRequestCancelled({
              managerEmail:  notifyEmail,
              managerName:   notifyName,
              employeeName:
                `${req.user.first_name} ${req.user.last_name}`,
              leaveType:     mgr.leave_type_name,
              startDate:     request.start_date,
              endDate:       request.end_date,
              daysRequested: request.days_requested,
            });
          }
        } else {
          // ── Rule 2: No manager — notify HR admin ───
          const hrRes = await query(
            `SELECT u.first_name, u.last_name, u.email,
                    lt.name AS leave_type_name
             FROM users u
             JOIN leave_requests lr
               ON lr.id = $1
             JOIN leave_types lt
               ON lt.id = lr.leave_type_id
             WHERE u.company_id = $2
               AND u.role IN ('hr_admin','super_admin')
               AND u.is_active = true
             ORDER BY u.created_at ASC
             LIMIT 1`,
            [id, req.user.company_id]
          );
          if (hrRes.rows.length > 0) {
            const hr    = hrRes.rows[0];
            notifyManagerRequestCancelled({
              managerEmail:  hr.email,
              managerName:
                `${hr.first_name} ${hr.last_name}`,
              employeeName:
                `${req.user.first_name} ${req.user.last_name}`,
              leaveType:     hr.leave_type_name,
              startDate:     request.start_date,
              endDate:       request.end_date,
              daysRequested: request.days_requested,
            });
          }
        }
      } catch (emailErr) {
        console.error(
          'Cancel email error:', emailErr.message
        );
      }




    return res.json({ message: 'Leave request cancelled successfully.' });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Cancel leave request error:', err.message);
    return res.status(500).json({ error: 'Failed to cancel leave request.' });
  } finally {
    client.release();
  }
};

// ─── LEAVE CALENDAR ───────────────────────────────────
// GET /api/leave-requests/calendar
// Shows all approved leave for a given month
// Useful for managers to see who is off and plan accordingly
// Optional filters: ?month=6&year=2026
const getLeaveCalendar = async (req, res) => {
  try {
    const year  = parseInt(req.query.year)  || new Date().getFullYear();
    const month = parseInt(req.query.month) || new Date().getMonth() + 1;

    // Build first and last day of the requested month
    const startOfMonth = `${year}-${String(month).padStart(2, '0')}-01`;
    const endOfMonth   = new Date(year, month, 0).toISOString().split('T')[0];

    const result = await query(
      `SELECT
         lr.id,
         lr.start_date,
         lr.end_date,
         lr.days_requested,
         lr.is_half_day,
         lr.half_day_period,
         lt.name                              AS leave_type_name,
         lt.is_paid,
         CONCAT(e.first_name,' ',e.last_name) AS employee_name,
         e.department
       FROM leave_requests lr
       JOIN leave_types lt ON lt.id = lr.leave_type_id
       JOIN users e        ON e.id  = lr.user_id
       WHERE e.company_id  = $1
         AND lr.status     = 'approved'
         AND lr.start_date <= $2
         AND lr.end_date   >= $3
       ORDER BY lr.start_date ASC`,
      [req.user.company_id, endOfMonth, startOfMonth]
    );

    return res.json({
      year,
      month,
      total_on_leave: result.rows.length,
      calendar:       result.rows,
    });

  } catch (err) {
    console.error('Get leave calendar error:', err.message);
    return res.status(500).json({ error: 'Failed to retrieve leave calendar.' });
  }
};



// ─── HR FINAL APPROVAL ────────────────────────────────
// PUT /api/leave-requests/:id/hr-approve
// Second level of approval — HR gives final sign-off
// Only called when requires_hr_approval = true on
// the request (set automatically when days > threshold)
const hrApproveLeaveRequest = async (req, res) => {
  const { id } = req.params;

  const client = await getClient();
  try {
    await client.query('BEGIN');

    // Fetch the request
    const requestResult = await client.query(
      `SELECT lr.*, e.company_id,
              e.first_name, e.last_name, e.email,
              lt.name AS leave_type_name
       FROM leave_requests lr
       JOIN users       e  ON e.id  = lr.user_id
       JOIN leave_types lt ON lt.id = lr.leave_type_id
       WHERE lr.id = $1`,
      [id]
    );

    if (requestResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        error: 'Leave request not found.'
      });
    }

    const request = requestResult.rows[0];

    // Verify same company
    if (request.company_id !== req.user.company_id) {
      await client.query('ROLLBACK');
      return res.status(403).json({
        error: 'Access denied.'
      });
    }

    // Can only HR-approve requests in pending_hr status
    // pending_hr means manager already approved
    if (request.status !== 'pending_hr') {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: request.status === 'pending'
          ? 'This request still needs manager approval first.'
          : `This request is already ${request.status}.`
      });
    }

    // Update status to fully approved
    await client.query(
      `UPDATE leave_requests
       SET status      = 'approved',
           reviewed_by = $1,
           reviewed_at = NOW(),
           updated_at  = NOW()
       WHERE id = $2`,
      [req.user.id, id]
    );

    // Move days from pending to used in balance
    const year = new Date(request.start_date).getFullYear();
    await client.query(
      `UPDATE leave_balances
       SET pending_days = pending_days - $1,
           used_days    = used_days    + $1,
           updated_at   = NOW()
       WHERE user_id       = $2
         AND leave_type_id = $3
         AND year          = $4`,
      [
        request.days_requested,
        request.user_id,
        request.leave_type_id,
        year,
      ]
    );

    // Notify the employee
    await client.query(
      `INSERT INTO notifications (
         id, user_id, leave_request_id,
         type, message, is_read, created_at
       )
       VALUES ($1,$2,$3,'request_approved',$4,false,NOW())`,
      [
        uuidv4(),
        request.user_id,
        id,
        `Your ${request.leave_type_name} request has `
        + `received final HR approval.`,
      ]
    );

    await client.query('COMMIT');

    // Write audit log
    logAction({
      companyId:       req.user.company_id,
      performedBy:     req.user.id,
      performedByName:`${req.user.first_name} ${req.user.last_name}`,
      actionType:      ACTIONS.LEAVE_HR_APPROVED,
      targetUserId:    request.user_id,
      targetUserName: `${request.first_name} ${request.last_name}`,
      description:
        `HR final approval: ${request.leave_type_name} `
        + `${request.start_date.toISOString().split('T')[0]} `
        + `to ${request.end_date.toISOString().split('T')[0]}`,
      ipAddress:       req.ip,
    });

    // Send approval email to employee
    try {
      notifyEmployeeRequestApproved({
        employeeEmail: request.email,
        employeeName:  `${request.first_name} ${request.last_name}`,
        managerName:   `${req.user.first_name} ${req.user.last_name} (HR)`,
        leaveType:     request.leave_type_name,
        startDate:     request.start_date,
        endDate:       request.end_date,
        daysRequested: request.days_requested,
      });
    } catch (emailErr) {
      console.error('HR approve email error:', emailErr.message);
    }

    return res.json({
      message: 'Leave request given final HR approval.'
    });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('HR approve error:', err.message);
    return res.status(500).json({
      error: 'Failed to HR approve leave request.'
    });
  } finally {
    client.release();
  }
};



module.exports = {
  submitLeaveRequest,
  getMyLeaveRequests,
  getPendingApprovals,
  getLeaveRequest,
  approveLeaveRequest,
  rejectLeaveRequest,
  cancelLeaveRequest,
  getLeaveCalendar,
  hrApproveLeaveRequest,
};