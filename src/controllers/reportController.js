// ─── REPORT CONTROLLER ────────────────────────────────
// Generates reports for HR admins and managers
// All reports are scoped to the logged in user's company
// Reports return JSON — a frontend dashboard or Excel
// export can consume and format them as needed

const { query } = require('../config/db');

// ─── COMPANY LEAVE SUMMARY ────────────────────────────
// GET /api/reports/summary
// High level overview of leave usage across the whole company
// Broken down by leave type, request status, and most used types
// Only hr_admin and super_admin can access this
const getCompanySummary = async (req, res) => {
  try {
    const year = parseInt(req.query.year) || new Date().getFullYear();

    // ── Leave Totals Per Leave Type ───────────────
    // How many days entitled, used, pending, remaining
    // across ALL employees for each leave type
    const leaveByType = await query(
      `SELECT
         lt.name                     AS leave_type,
         lt.is_paid,
         COUNT(DISTINCT lb.user_id)  AS employees_with_balance,
         SUM(lb.entitled_days)       AS total_entitled_days,
         SUM(lb.used_days)           AS total_used_days,
         SUM(lb.pending_days)        AS total_pending_days,
         SUM(lb.remaining_days)      AS total_remaining_days
       FROM leave_balances lb
       JOIN leave_types lt ON lt.id = lb.leave_type_id
       JOIN users u        ON u.id  = lb.user_id
       WHERE u.company_id = $1
         AND lb.year      = $2
         AND u.is_active  = true
       GROUP BY lt.id, lt.name, lt.is_paid
       ORDER BY lt.name ASC`,
      [req.user.company_id, year]
    );

    // ── Request Status Breakdown ──────────────────
    // Count of requests and total days per status
    // e.g. 5 approved (20 days), 2 pending (8 days)
    const requestsByStatus = await query(
      `SELECT
         lr.status,
         COUNT(*)               AS total_requests,
         SUM(lr.days_requested) AS total_days
       FROM leave_requests lr
       JOIN users u ON u.id = lr.user_id
       WHERE u.company_id = $1
         AND EXTRACT(YEAR FROM lr.start_date) = $2
       GROUP BY lr.status
       ORDER BY lr.status ASC`,
      [req.user.company_id, year]
    );

    // ── Total Active Employees ────────────────────
    const headcount = await query(
      `SELECT COUNT(*) AS total_employees
       FROM users
       WHERE company_id = $1 AND is_active = true`,
      [req.user.company_id]
    );

    // ── Top 3 Most Used Leave Types ───────────────
    // Ranked by total days taken (approved only)
    const mostUsed = await query(
      `SELECT
         lt.name                AS leave_type,
         COUNT(lr.id)           AS total_requests,
         SUM(lr.days_requested) AS total_days_taken
       FROM leave_requests lr
       JOIN leave_types lt ON lt.id = lr.leave_type_id
       JOIN users u        ON u.id  = lr.user_id
       WHERE u.company_id = $1
         AND lr.status    = 'approved'
         AND EXTRACT(YEAR FROM lr.start_date) = $2
       GROUP BY lt.id, lt.name
       ORDER BY total_days_taken DESC
       LIMIT 3`,
      [req.user.company_id, year]
    );

    return res.json({
      year,
      total_employees:    parseInt(headcount.rows[0].total_employees),
      leave_by_type:      leaveByType.rows,
      requests_by_status: requestsByStatus.rows,
      most_used_leave:    mostUsed.rows,
    });

  } catch (err) {
    console.error('Company summary error:', err.message);
    return res.status(500).json({ error: 'Failed to generate company summary.' });
  }
};

// ─── EMPLOYEE LEAVE REPORT ────────────────────────────
// GET /api/reports/employee/:id
// Full leave history and balance breakdown for one employee
// HR admins and managers can view any employee in their company
const getEmployeeReport = async (req, res) => {
  try {
    const { id } = req.params;
    const year   = parseInt(req.query.year) || new Date().getFullYear();

    // ── Verify Employee Belongs to Same Company ───
    const employeeResult = await query(
      `SELECT
         id, first_name, last_name,
         email, department, job_title, created_at
       FROM users
       WHERE id = $1 AND company_id = $2`,
      [id, req.user.company_id]
    );

    if (employeeResult.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found.' });
    }

    const employee = employeeResult.rows[0];

    // ── Leave Balances for the Year ───────────────
    const balances = await query(
      `SELECT
         lt.name            AS leave_type,
         lb.entitled_days,
         lb.used_days,
         lb.pending_days,
         lb.remaining_days,
         lb.carried_over_days
       FROM leave_balances lb
       JOIN leave_types lt ON lt.id = lb.leave_type_id
       WHERE lb.user_id = $1
         AND lb.year    = $2
       ORDER BY lt.name ASC`,
      [id, year]
    );

    // ── Full Leave Request History ────────────────
    const requests = await query(
      `SELECT
         lr.id,
         lr.start_date,
         lr.end_date,
         lr.days_requested,
         lr.status,
         lr.reason,
         lr.rejection_reason,
         lr.created_at,
         lr.reviewed_at,
         lt.name                              AS leave_type,
         CONCAT(r.first_name,' ',r.last_name) AS reviewed_by
       FROM leave_requests lr
       JOIN leave_types lt ON lt.id = lr.leave_type_id
       LEFT JOIN users r   ON r.id  = lr.reviewed_by
       WHERE lr.user_id = $1
         AND EXTRACT(YEAR FROM lr.start_date) = $2
       ORDER BY lr.start_date DESC`,
      [id, year]
    );

    // ── Monthly Breakdown ─────────────────────────
    // How many days taken per month — useful for spotting patterns
    const byMonth = await query(
      `SELECT
         EXTRACT(MONTH FROM lr.start_date) AS month,
         SUM(lr.days_requested)            AS days_taken,
         COUNT(lr.id)                      AS total_requests
       FROM leave_requests lr
       WHERE lr.user_id = $1
         AND lr.status  = 'approved'
         AND EXTRACT(YEAR FROM lr.start_date) = $2
       GROUP BY EXTRACT(MONTH FROM lr.start_date)
       ORDER BY month ASC`,
      [id, year]
    );

    return res.json({
      year,
      employee,
      balances:          balances.rows,
      leave_requests:    requests.rows,
      monthly_breakdown: byMonth.rows,
    });

  } catch (err) {
    console.error('Employee report error:', err.message);
    return res.status(500).json({ error: 'Failed to generate employee report.' });
  }
};

// ─── TEAM OVERVIEW ────────────────────────────────────
// GET /api/reports/team
// Leave summary per employee for a manager's team
// Managers see their direct reports only
// HR admins see all employees across the whole company
const getTeamOverview = async (req, res) => {
  try {
    const year = parseInt(req.query.year) || new Date().getFullYear();

    // Build the WHERE clause based on the user's role
    let employeeFilter = '';
    let params         = [];

    if (['hr_admin', 'super_admin'].includes(req.user.role)) {
      // HR sees everyone in the company
      employeeFilter = `u.company_id = $1 AND u.is_active = true`;
      params         = [req.user.company_id, year];
    } else {
      // Manager sees only their direct reports
      employeeFilter = `u.manager_id = $1 AND u.is_active = true`;
      params         = [req.user.id, year];
    }

    const result = await query(
      `SELECT
         u.id,
         u.first_name,
         u.last_name,
         u.department,
         u.job_title,
         -- Count approved requests this year
         COUNT(CASE WHEN lr.status = 'approved'
               THEN 1 END)                         AS approved_requests,
         -- Count still pending
         COUNT(CASE WHEN lr.status = 'pending'
               THEN 1 END)                         AS pending_requests,
         -- Total days approved this year
         -- COALESCE returns 0 if no approved requests exist
         COALESCE(SUM(CASE WHEN lr.status = 'approved'
               THEN lr.days_requested END), 0)     AS total_days_taken
       FROM users u
       -- LEFT JOIN so employees with NO requests still appear
       LEFT JOIN leave_requests lr
         ON lr.user_id = u.id
         AND EXTRACT(YEAR FROM lr.start_date) = $2
       WHERE ${employeeFilter}
       GROUP BY u.id, u.first_name, u.last_name,
                u.department, u.job_title
       ORDER BY u.last_name ASC`,
      params
    );

    return res.json({
      year,
      total_employees: result.rows.length,
      team:            result.rows,
    });

  } catch (err) {
    console.error('Team overview error:', err.message);
    return res.status(500).json({ error: 'Failed to generate team overview.' });
  }
};

// ─── ABSENTEEISM REPORT ───────────────────────────────
// GET /api/reports/absenteeism
// Ranks employees by total days taken
// HR uses this to identify patterns or flag concerns
// Shows top 10 employees by days taken this year
const getAbsenteeismReport = async (req, res) => {
  try {
    const year = parseInt(req.query.year) || new Date().getFullYear();

    // ── Top 10 Employees by Days Taken ────────────
    const topAbsentees = await query(
      `SELECT
         u.id,
         u.first_name,
         u.last_name,
         u.department,
         COUNT(lr.id)               AS total_requests,
         SUM(lr.days_requested)     AS total_days_taken,
         -- Average days per request
         ROUND(AVG(lr.days_requested), 1) AS avg_days_per_request
       FROM leave_requests lr
       JOIN users u ON u.id = lr.user_id
       WHERE u.company_id = $1
         AND lr.status    = 'approved'
         AND EXTRACT(YEAR FROM lr.start_date) = $2
       GROUP BY u.id, u.first_name, u.last_name, u.department
       ORDER BY total_days_taken DESC
       LIMIT 10`,
      [req.user.company_id, year]
    );

    // ── Absenteeism by Department ─────────────────
    // Which department has the highest leave usage
    const byDepartment = await query(
      `SELECT
         u.department,
         COUNT(DISTINCT u.id)       AS employee_count,
         COUNT(lr.id)               AS total_requests,
         SUM(lr.days_requested)     AS total_days_taken,
         -- Average days per employee in this department
         ROUND(
           SUM(lr.days_requested) /
           NULLIF(COUNT(DISTINCT u.id), 0)
         , 1)                       AS avg_days_per_employee
       FROM leave_requests lr
       JOIN users u ON u.id = lr.user_id
       WHERE u.company_id = $1
         AND lr.status    = 'approved'
         AND EXTRACT(YEAR FROM lr.start_date) = $2
         AND u.department IS NOT NULL
       GROUP BY u.department
       ORDER BY total_days_taken DESC`,
      [req.user.company_id, year]
    );

    // ── Month with Most Leave ─────────────────────
    // Identifies the busiest leave months
    const byMonth = await query(
      `SELECT
         EXTRACT(MONTH FROM lr.start_date) AS month,
         COUNT(lr.id)                      AS total_requests,
         SUM(lr.days_requested)            AS total_days
       FROM leave_requests lr
       JOIN users u ON u.id = lr.user_id
       WHERE u.company_id = $1
         AND lr.status    = 'approved'
         AND EXTRACT(YEAR FROM lr.start_date) = $2
       GROUP BY EXTRACT(MONTH FROM lr.start_date)
       ORDER BY total_days DESC`,
      [req.user.company_id, year]
    );

    return res.json({
      year,
      top_absentees:    topAbsentees.rows,
      by_department:    byDepartment.rows,
      busiest_months:   byMonth.rows,
    });

  } catch (err) {
    console.error('Absenteeism report error:', err.message);
    return res.status(500).json({ error: 'Failed to generate absenteeism report.' });
  }
};

// ─── UPCOMING LEAVE ───────────────────────────────────
// GET /api/reports/upcoming
// Shows all approved leave coming up in the next 30 days
// Useful for managers to plan workload and coverage
// Optional: ?days=14 to look ahead 14 days instead of 30
const getUpcomingLeave = async (req, res) => {
  try {
    // How many days ahead to look — default 30
    const daysAhead = parseInt(req.query.days) || 30;

    const today   = new Date().toISOString().split('T')[0];
    const future  = new Date();
    future.setDate(future.getDate() + daysAhead);
    const futureDate = future.toISOString().split('T')[0];

    const result = await query(
      `SELECT
         lr.id,
         lr.start_date,
         lr.end_date,
         lr.days_requested,
         lr.is_half_day,
         lt.name                              AS leave_type,
         CONCAT(u.first_name,' ',u.last_name) AS employee_name,
         u.department,
         u.job_title,
         -- How many days until leave starts
         (lr.start_date - CURRENT_DATE)       AS days_until_start
       FROM leave_requests lr
       JOIN leave_types lt ON lt.id = lr.leave_type_id
       JOIN users u        ON u.id  = lr.user_id
       WHERE u.company_id   = $1
         AND lr.status      = 'approved'
         AND lr.start_date  >= $2
         AND lr.start_date  <= $3
       ORDER BY lr.start_date ASC`,
      [req.user.company_id, today, futureDate]
    );

    return res.json({
      from:           today,
      to:             futureDate,
      days_ahead:     daysAhead,
      total_upcoming: result.rows.length,
      upcoming_leave: result.rows,
    });

  } catch (err) {
    console.error('Upcoming leave error:', err.message);
    return res.status(500).json({ error: 'Failed to retrieve upcoming leave.' });
  }
};

module.exports = {
  getCompanySummary,
  getEmployeeReport,
  getTeamOverview,
  getAbsenteeismReport,
  getUpcomingLeave,
};