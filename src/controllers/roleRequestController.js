// ─── ROLE REQUEST CONTROLLER ──────────────────────────
// Handles the self-service promotion request workflow
//
// Column names:
//   from_role = the role the employee currently has
//   to_role   = the role they are requesting
//
// Flow:
//   1. Employee submits request with reason
//   2. HR admin sees it in pending list
//   3. HR approves → role updated automatically
//      HR rejects  → request closed with reason

const { v4: uuidv4 } = require('uuid');
const { query }      = require('../config/db');
const { logAction, ACTIONS } = require('../utils/auditLogger');

// ─── SUBMIT ROLE REQUEST ──────────────────────────────
// POST /api/role-requests
// Any authenticated user can request a role change
const submitRoleRequest = async (req, res) => {
  const { requested_role, reason } = req.body;

  // ── Validation ──────────────────────────────────
  if (!requested_role || !reason) {
    return res.status(400).json({
      error: 'requested_role and reason are required.'
    });
  }

  // Cannot request the role you already have
  if (requested_role === req.user.role) {
    return res.status(400).json({
      error: `You already have the ${requested_role} role.`
    });
  }

  // Only allow requesting upward roles
  const validRoles = ['manager', 'hr_admin', 'super_admin'];
  if (!validRoles.includes(requested_role)) {
    return res.status(400).json({
      error: `You can only request: ${validRoles.join(', ')}`
    });
  }

  // Reason must be detailed enough to be meaningful
  if (reason.trim().length < 20) {
    return res.status(400).json({
      error: 'Please provide a more detailed reason '
           + '(at least 20 characters).'
    });
  }

  try {
    // Check if there is already a pending request
    // from this employee — only one allowed at a time
    const existing = await query(
      `SELECT id FROM role_requests
       WHERE user_id = $1 AND status = 'pending'`,
      [req.user.id]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({
        error: 'You already have a pending role request. '
             + 'Please wait for HR to review it.'
      });
    }

    // Insert the role request using from_role / to_role
    const id     = uuidv4();
    const result = await query(
      `INSERT INTO role_requests (
         id, user_id, company_id,
         from_role, to_role,
         reason, status,
         created_at, updated_at
       )
       VALUES ($1,$2,$3,$4,$5,$6,'pending',NOW(),NOW())
       RETURNING *`,
      [
        id,
        req.user.id,
        req.user.company_id,
        req.user.role,      // from_role = current role
        requested_role,     // to_role   = requested role
        reason.trim(),
      ]
    );

    // Write audit log
    logAction({
      companyId:       req.user.company_id,
      performedBy:     req.user.id,
      performedByName:`${req.user.first_name} ${req.user.last_name}`,
      actionType:      ACTIONS.ROLE_REQUEST_SUBMITTED,
      targetUserId:    req.user.id,
      targetUserName: `${req.user.first_name} ${req.user.last_name}`,
      oldValue:        req.user.role,
      newValue:        requested_role,
      description:
        `Role change requested: ${req.user.role} `
        + `→ ${requested_role}`,
      ipAddress:       req.ip,
    });

    return res.status(201).json({
      message:
        'Role request submitted successfully. '
        + 'HR will review your request.',
      role_request: result.rows[0],
    });

  } catch (err) {
    console.error('Submit role request error:', err.message);
    return res.status(500).json({
      error: 'Failed to submit role request.'
    });
  }
};

// ─── GET MY ROLE REQUESTS ─────────────────────────────
// GET /api/role-requests/my
// Employee views their own role request history
const getMyRoleRequests = async (req, res) => {
  try {
    const result = await query(
      `SELECT
         rr.id,
         rr.from_role,
         rr.to_role,
         rr.reason,
         rr.status,
         rr.rejection_reason,
         rr.approval_note,
         rr.reviewed_at,
         rr.created_at,
         CONCAT(r.first_name,' ',r.last_name)
           AS reviewed_by_name
       FROM role_requests rr
       LEFT JOIN users r ON r.id = rr.reviewed_by
       WHERE rr.user_id = $1
       ORDER BY rr.created_at DESC`,
      [req.user.id]
    );

    return res.json({
      count:         result.rows.length,
      role_requests: result.rows,
    });

  } catch (err) {
    console.error('Get my role requests error:', err.message);
    return res.status(500).json({
      error: 'Failed to retrieve role requests.'
    });
  }
};

// ─── GET ALL PENDING ROLE REQUESTS ────────────────────
// GET /api/role-requests/pending
// HR admin views all pending role requests company-wide
const getPendingRoleRequests = async (req, res) => {
  try {
    const result = await query(
      `SELECT
         rr.id,
         rr.from_role,
         rr.to_role,
         rr.reason,
         rr.status,
         rr.created_at,
         CONCAT(u.first_name,' ',u.last_name)
           AS employee_name,
         u.email      AS employee_email,
         u.department AS employee_department
       FROM role_requests rr
       JOIN users u ON u.id = rr.user_id
       WHERE rr.company_id = $1
         AND rr.status     = 'pending'
       ORDER BY rr.created_at ASC`,
      [req.user.company_id]
    );

    return res.json({
      count:         result.rows.length,
      role_requests: result.rows,
    });

  } catch (err) {
    console.error('Get pending role requests error:', err.message);
    return res.status(500).json({
      error: 'Failed to retrieve pending role requests.'
    });
  }
};

// ─── APPROVE ROLE REQUEST ─────────────────────────────
// PUT /api/role-requests/:id/approve
// HR approves the request — role is updated automatically
const approveRoleRequest = async (req, res) => {
  const { id }            = req.params;
  const { approval_note } = req.body;

  try {
    // Fetch the request with employee details
    const reqResult = await query(
      `SELECT
         rr.*,
         u.first_name,
         u.last_name,
         u.email
       FROM role_requests rr
       JOIN users u ON u.id = rr.user_id
       WHERE rr.id = $1 AND rr.company_id = $2`,
      [id, req.user.company_id]
    );

    if (reqResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Role request not found.'
      });
    }

    const roleReq = reqResult.rows[0];

    // Can only action pending requests
    if (roleReq.status !== 'pending') {
      return res.status(400).json({
        error: `This request is already ${roleReq.status}.`
      });
    }

    // Update the role request to approved
    await query(
      `UPDATE role_requests
       SET status        = 'approved',
           reviewed_by   = $1,
           reviewed_at   = NOW(),
           approval_note = $2,
           updated_at    = NOW()
       WHERE id = $3`,
      [req.user.id, approval_note || null, id]
    );

    // Update the user's actual role to the requested role
    await query(
      `UPDATE users
       SET role       = $1,
           updated_at = NOW()
       WHERE id = $2`,
      [roleReq.to_role, roleReq.user_id]
    );

    // Write audit log — this is a significant role change
    logAction({
      companyId:       req.user.company_id,
      performedBy:     req.user.id,
      performedByName:`${req.user.first_name} ${req.user.last_name}`,
      actionType:      ACTIONS.ROLE_REQUEST_APPROVED,
      targetUserId:    roleReq.user_id,
      targetUserName: `${roleReq.first_name} ${roleReq.last_name}`,
      oldValue:        roleReq.from_role,
      newValue:        roleReq.to_role,
      description:
        `Role request approved: `
        + `${roleReq.from_role} → ${roleReq.to_role}`,
      ipAddress:       req.ip,
    });

    return res.json({
      message:
        `${roleReq.first_name} ${roleReq.last_name} `
        + `has been promoted to ${roleReq.to_role}.`,
    });

  } catch (err) {
    console.error('Approve role request error:', err.message);
    return res.status(500).json({
      error: 'Failed to approve role request.'
    });
  }
};

// ─── REJECT ROLE REQUEST ──────────────────────────────
// PUT /api/role-requests/:id/reject
// HR rejects the request — role stays unchanged
const rejectRoleRequest = async (req, res) => {
  const { id }               = req.params;
  const { rejection_reason } = req.body;

  // Rejection reason is mandatory
  if (!rejection_reason) {
    return res.status(400).json({
      error: 'rejection_reason is required.'
    });
  }

  try {
    // Fetch the request
    const reqResult = await query(
      `SELECT rr.*, u.first_name, u.last_name
       FROM role_requests rr
       JOIN users u ON u.id = rr.user_id
       WHERE rr.id = $1 AND rr.company_id = $2`,
      [id, req.user.company_id]
    );

    if (reqResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Role request not found.'
      });
    }

    const roleReq = reqResult.rows[0];

    if (roleReq.status !== 'pending') {
      return res.status(400).json({
        error: `This request is already ${roleReq.status}.`
      });
    }

    // Update request to rejected with the reason
    await query(
      `UPDATE role_requests
       SET status           = 'rejected',
           reviewed_by      = $1,
           reviewed_at      = NOW(),
           rejection_reason = $2,
           updated_at       = NOW()
       WHERE id = $3`,
      [req.user.id, rejection_reason, id]
    );

    // Write audit log
    logAction({
      companyId:       req.user.company_id,
      performedBy:     req.user.id,
      performedByName:`${req.user.first_name} ${req.user.last_name}`,
      actionType:      ACTIONS.ROLE_REQUEST_REJECTED,
      targetUserId:    roleReq.user_id,
      targetUserName: `${roleReq.first_name} ${roleReq.last_name}`,
      oldValue:        roleReq.from_role,
      newValue:        roleReq.to_role,
      description:
        `Role request rejected. Reason: ${rejection_reason}`,
      ipAddress:       req.ip,
    });

    return res.json({
      message: 'Role request rejected.'
    });

  } catch (err) {
    console.error('Reject role request error:', err.message);
    return res.status(500).json({
      error: 'Failed to reject role request.'
    });
  }
};

module.exports = {
  submitRoleRequest,
  getMyRoleRequests,
  getPendingRoleRequests,
  approveRoleRequest,
  rejectRoleRequest,
};