// ─── AUDIT CONTROLLER ─────────────────────────────────
// Provides read access to the audit log
// HR admins and super admins can view:
//   - Full company audit trail
//   - Audit history for a specific employee
//   - Filtered by action type or date range

const { query } = require('../config/db');

// ─── GET COMPANY AUDIT LOG ────────────────────────────
// GET /api/audit
// Returns all audit log entries for the company
// Supports filters: ?action_type=ROLE_CHANGED
//                   ?user_id=UUID
//                   ?from=2026-01-01&to=2026-12-31
//                   ?limit=50
const getAuditLog = async (req, res) => {
  try {
    const {
      action_type, // Filter by specific action
      user_id,     // Filter by target user
      from,        // Start date filter
      to,          // End date filter
      limit = 100, // Max rows to return
    } = req.query;

    // Base query — always scoped to the company
    let sql = `
      SELECT
        al.id,
        al.action_type,
        al.performed_by_name,
        al.target_user_name,
        al.old_value,
        al.new_value,
        al.description,
        al.ip_address,
        al.created_at,
        -- Join user details for richer display
        CONCAT(p.first_name,' ',p.last_name)
          AS actor_name,
        p.role AS actor_role
      FROM audit_logs al
      LEFT JOIN users p ON p.id = al.performed_by
      WHERE al.company_id = $1
    `;
    const params = [req.user.company_id];
    let   idx    = 2;

    // Optional: filter by action type
    if (action_type) {
      sql += ` AND al.action_type = $${idx++}`;
      params.push(action_type);
    }

    // Optional: filter by affected user
    if (user_id) {
      sql += ` AND al.target_user_id = $${idx++}`;
      params.push(user_id);
    }

    // Optional: filter by date range
    if (from) {
      sql += ` AND al.created_at >= $${idx++}`;
      params.push(from);
    }
    if (to) {
      sql += ` AND al.created_at <= $${idx++}`;
      params.push(to + ' 23:59:59');
    }

    // Most recent entries first
    sql += ` ORDER BY al.created_at DESC`;

    // Cap results to prevent huge responses
    sql += ` LIMIT $${idx}`;
    params.push(parseInt(limit));

    const result = await query(sql, params);

    return res.json({
      count:      result.rows.length,
      audit_logs: result.rows,
    });

  } catch (err) {
    console.error('Get audit log error:', err.message);
    return res.status(500).json({
      error: 'Failed to retrieve audit log.'
    });
  }
};

// ─── GET EMPLOYEE AUDIT HISTORY ───────────────────────
// GET /api/audit/employee/:id
// Returns all audit entries for a specific employee
// Shows both actions they performed AND actions
// that were performed ON them
const getEmployeeAuditHistory = async (req, res) => {
  try {
    const { id } = req.params;

    // Verify employee belongs to same company
    const empCheck = await query(
      `SELECT id, first_name, last_name
       FROM users
       WHERE id = $1 AND company_id = $2`,
      [id, req.user.company_id]
    );

    if (empCheck.rows.length === 0) {
      return res.status(404).json({
        error: 'Employee not found.'
      });
    }

    const emp = empCheck.rows[0];

    // Get all entries where this user was either
    // the actor OR the target of an action
    const result = await query(
      `SELECT
         al.id,
         al.action_type,
         al.performed_by_name,
         al.target_user_name,
         al.old_value,
         al.new_value,
         al.description,
         al.created_at
       FROM audit_logs al
       WHERE al.company_id = $1
         AND (
           al.performed_by   = $2
           OR al.target_user_id = $2
         )
       ORDER BY al.created_at DESC
       LIMIT 200`,
      [req.user.company_id, id]
    );

    return res.json({
      employee: {
        id,
        name: `${emp.first_name} ${emp.last_name}`,
      },
      count:      result.rows.length,
      audit_logs: result.rows,
    });

  } catch (err) {
    console.error('Employee audit error:', err.message);
    return res.status(500).json({
      error: 'Failed to retrieve employee audit history.'
    });
  }
};

// ─── GET AUDIT ACTION TYPES ───────────────────────────
// GET /api/audit/action-types
// Returns a list of all unique action types in the log
// Used to populate the filter dropdown in the UI
const getActionTypes = async (req, res) => {
  try {
    const result = await query(
      `SELECT DISTINCT action_type,
              COUNT(*) AS occurrences
       FROM audit_logs
       WHERE company_id = $1
       GROUP BY action_type
       ORDER BY occurrences DESC`,
      [req.user.company_id]
    );

    return res.json({ action_types: result.rows });
  } catch (err) {
    console.error('Get action types error:', err.message);
    return res.status(500).json({
      error: 'Failed to retrieve action types.'
    });
  }
};

module.exports = {
  getAuditLog,
  getEmployeeAuditHistory,
  getActionTypes,
};