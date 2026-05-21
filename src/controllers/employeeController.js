// ─── EMPLOYEE CONTROLLER ──────────────────────────────
// Handles all employee management logic:
// - Adding new employees to a company
// - Listing all employees
// - Getting a single employee's details
// - Updating employee information
// - Deactivating an employee (we never hard-delete users)

const bcrypt         = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { query }      = require('../config/db');

// Import audit logger to record sensitive actions
const { logAction, ACTIONS } = require('../utils/auditLogger');

// ─── ADD EMPLOYEE ─────────────────────────────────────
// POST /api/employees
// Only hr_admin and super_admin can add employees
const addEmployee = async (req, res) => {
  const {
    first_name,
    last_name,
    email,
    password,
    role,
    department,
    job_title,
    phone,
    manager_id,
  } = req.body;

  // ── Validation ────────────────────────────────────
  if (!first_name || !last_name || !email || !password) {
    return res.status(400).json({
      error: 'first_name, last_name, email and password are required.'
    });
  }

  if (password.length < 8) {
    return res.status(400).json({
      error: 'Password must be at least 8 characters.'
    });
  }

  // Allowed roles that can be assigned to a new employee
  const allowedRoles = ['employee', 'manager', 'hr_admin', 'super_admin'];
  if (role && !allowedRoles.includes(role)) {
    return res.status(400).json({
      error: `Invalid role. Allowed roles: ${allowedRoles.join(', ')}`
    });
  }

  try {
    // ── Check Email is Unique ─────────────────────
    const existing = await query(
      'SELECT id FROM users WHERE email = $1',
      [email.toLowerCase()]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({
        error: 'An employee with this email already exists.'
      });
    }

    // ── If manager_id provided, verify the manager exists
    // and belongs to the same company ────────────────
    if (manager_id) {
      const managerCheck = await query(
        `SELECT id FROM users
         WHERE id = $1 AND company_id = $2 AND is_active = true`,
        [manager_id, req.user.company_id]
      );
      if (managerCheck.rows.length === 0) {
        return res.status(400).json({
          error: 'Manager not found or does not belong to your company.'
        });
      }
    }

    // ── Hash the Password ─────────────────────────
    const salt         = await bcrypt.genSalt(12);
    const passwordHash = await bcrypt.hash(password, salt);

    // ── Insert the New Employee ───────────────────
    // company_id comes from req.user (the logged-in admin)
    // This ensures employees are always added to the correct company
    const userId = uuidv4();
    const result = await query(
      `INSERT INTO users
         (id, company_id, first_name, last_name, email,
          password_hash, role, department, job_title, phone,
          manager_id, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true, NOW(), NOW())
       RETURNING
         id, company_id, first_name, last_name, email,
         role, department, job_title, phone, manager_id,
         is_active, created_at`,
      [
        userId,
        req.user.company_id,  // Taken from the logged-in admin's token
        first_name,
        last_name,
        email.toLowerCase(),
        passwordHash,
        role || 'employee',   // Default to employee if no role specified
        department || null,
        job_title  || null,
        phone      || null,
        manager_id || null,
      ]
    );

    return res.status(201).json({
      message:  'Employee added successfully.',
      employee: result.rows[0],
    });

  } catch (err) {
    console.error('Add employee error:', err.message);
    return res.status(500).json({ error: 'Failed to add employee.' });
  }
};

// ─── LIST ALL EMPLOYEES ───────────────────────────────
// GET /api/employees
// Returns all employees in the logged-in user's company
// Supports optional filters: ?department=Engineering&role=manager
const listEmployees = async (req, res) => {
  try {
    // Extract optional query string filters
    // e.g. GET /api/employees?department=Engineering&role=manager
    const { department, role, is_active } = req.query;

    // We build the query dynamically based on which filters were provided
    // $1 is always company_id — we never return employees from other companies
    let sql    = `
      SELECT
        u.id,
        u.first_name,
        u.last_name,
        u.email,
        u.role,
        u.department,
        u.job_title,
        u.phone,
        u.is_active,
        u.created_at,
        -- Get the manager's full name using a self-join
        CONCAT(m.first_name, ' ', m.last_name) AS manager_name
      FROM users u
      LEFT JOIN users m ON m.id = u.manager_id
      WHERE u.company_id = $1
    `;
    const params = [req.user.company_id];
    let   paramIndex = 2; // Next placeholder number

    // Dynamically add filters if they were provided in the query string
    if (department) {
      sql += ` AND u.department ILIKE $${paramIndex}`;
      params.push(`%${department}%`); // ILIKE = case-insensitive search
      paramIndex++;
    }

    if (role) {
      sql += ` AND u.role = $${paramIndex}`;
      params.push(role);
      paramIndex++;
    }

    // Filter by active status — default shows all employees
    if (is_active !== undefined) {
      sql += ` AND u.is_active = $${paramIndex}`;
      params.push(is_active === 'true'); // Convert string to boolean
      paramIndex++;
    }

    // Always sort by last name alphabetically
    sql += ' ORDER BY u.last_name ASC, u.first_name ASC';

    const result = await query(sql, params);

    return res.json({
      count:     result.rows.length,
      employees: result.rows,
    });

  } catch (err) {
    console.error('List employees error:', err.message);
    return res.status(500).json({ error: 'Failed to retrieve employees.' });
  }
};

// ─── GET SINGLE EMPLOYEE ──────────────────────────────
// GET /api/employees/:id
// Returns full details of one employee
// Employees can only view their own profile unless they are manager/admin
const getEmployee = async (req, res) => {
  try {
    const { id } = req.params;

    // Employees can only view their own profile
    // Managers, HR admins, and super admins can view anyone in their company
    const isPrivileged = ['manager', 'hr_admin', 'super_admin'].includes(req.user.role);
    if (!isPrivileged && req.user.id !== id) {
      return res.status(403).json({
        error: 'You can only view your own profile.'
      });
    }

    const result = await query(
      `SELECT
         u.id,
         u.first_name,
         u.last_name,
         u.email,
         u.role,
         u.department,
         u.job_title,
         u.phone,
         u.is_active,
         u.created_at,
         u.updated_at,
         CONCAT(m.first_name, ' ', m.last_name) AS manager_name,
         m.email                                 AS manager_email
       FROM users u
       LEFT JOIN users m ON m.id = u.manager_id
       WHERE u.id = $1 AND u.company_id = $2`,
      [id, req.user.company_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found.' });
    }

    return res.json({ employee: result.rows[0] });

  } catch (err) {
    console.error('Get employee error:', err.message);
    return res.status(500).json({ error: 'Failed to retrieve employee.' });
  }
};


// ─── UPDATE EMPLOYEE ──────────────────────────────────
// PUT /api/employees/:id
// Updates an employee's details
//
// Permission rules:
//   employee    → can only update their OWN basic info
//                 (first_name, last_name, phone)
//                 cannot change role, department, manager
//
//   manager     → can update their DIRECT REPORTS' details
//                 including department and job_title
//                 but CANNOT change role or manager_id
//                 cannot update employees outside their team
//
//   hr_admin    → can update ANYONE in the company
//   super_admin → can update ANYONE in the company
const updateEmployee = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      first_name,
      last_name,
      phone,
      department,
      job_title,
      role,
      manager_id,
    } = req.body;

    const isHR = ['hr_admin', 'super_admin']
      .includes(req.user.role);

    const isManager = req.user.role === 'manager';

    // ── Check Employee Exists in Same Company ──────
    const existing = await query(
      `SELECT id, manager_id FROM users
       WHERE id = $1 AND company_id = $2`,
      [id, req.user.company_id]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({
        error: 'Employee not found.'
      });
    }

    const targetEmployee = existing.rows[0];

    // ── Permission Check ───────────────────────────
    if (!isHR) {
      // Not HR — check if they are allowed to edit this person

      if (req.user.id === id) {
        // ── Editing Themselves ─────────────────────
        // Any user can edit their own basic details
        // But they cannot change their own role,
        // department or manager — only HR can do that
        if (role || department || manager_id) {
          return res.status(403).json({
            error: 'You cannot change your own role, '
                 + 'department or manager. '
                 + 'Please contact HR.'
          });
        }
        // Allow: first_name, last_name, phone only

      } else if (isManager) {
        // ── Manager Editing a Direct Report ───────
        // First verify the target employee actually
        // reports to this manager
        const isDirectReport =
          targetEmployee.manager_id === req.user.id;

        if (!isDirectReport) {
          return res.status(403).json({
            error: 'You can only edit employees who '
                 + 'report directly to you.'
          });
        }

        // Managers cannot change role or manager_id
        // Those are HR-only fields
        if (role || manager_id) {
          return res.status(403).json({
            error: 'Managers cannot change an '
                 + 'employee\'s role or manager. '
                 + 'Please contact HR admin.'
          });
        }
        // Allow managers to update: first_name, last_name,
        // phone, department, job_title

      } else {
        // ── Employee Trying to Edit Someone Else ──
        return res.status(403).json({
          error: 'You can only update your own profile.'
        });
      }
    }

    // ── Build Dynamic Update Query ─────────────────
    // We only update fields that were actually sent
    // in the request body — undefined fields are skipped
    const updates = [];
    const params  = [];
    let   idx     = 1;

    // Basic fields — any user can update these on self
    if (first_name !== undefined) {
      updates.push(`first_name  = $${idx++}`);
      params.push(first_name);
    }
    if (last_name !== undefined) {
      updates.push(`last_name   = $${idx++}`);
      params.push(last_name);
    }
    if (phone !== undefined) {
      updates.push(`phone       = $${idx++}`);
      params.push(phone);
    }

    // Department and job_title — manager and HR can update
    if (department !== undefined) {
      updates.push(`department  = $${idx++}`);
      params.push(department);
    }
    if (job_title !== undefined) {
      updates.push(`job_title   = $${idx++}`);
      params.push(job_title);
    }

    // Role and manager — HR only
    if (role !== undefined && isHR) {
      updates.push(`role        = $${idx++}`);
      params.push(role);
    }
    if (manager_id !== undefined && isHR) {
      updates.push(`manager_id  = $${idx++}`);
      params.push(manager_id);
    }

    // Always update the timestamp
    updates.push(`updated_at  = NOW()`);

    // Guard against empty update request
    if (updates.length === 1) {
      return res.status(400).json({
        error: 'No fields provided to update.'
      });
    }

    // Add the WHERE clause parameters
    params.push(id);
    params.push(req.user.company_id);

    const result = await query(
      `UPDATE users
       SET ${updates.join(', ')}
       WHERE id          = $${idx++}
         AND company_id  = $${idx}
       RETURNING
         id, first_name, last_name, email, role,
         department, job_title, phone,
         is_active, manager_id, updated_at`,
      params
    );





  // ── Write Audit Log ────────────────────────────
    // Record what was changed and who changed it
    // Build a human-readable description of the changes
    const changedFields = [];
    if (first_name)  changedFields.push('first name');
    if (last_name)   changedFields.push('last name');
    if (phone)       changedFields.push('phone');
    if (department)  changedFields.push('department');
    if (job_title)   changedFields.push('job title');
    if (role)        changedFields.push('role');
    if (manager_id)  changedFields.push('manager');

    logAction({
      companyId:       req.user.company_id,
      performedBy:     req.user.id,
      performedByName: `${req.user.first_name} ${req.user.last_name}`,
      actionType:      role
        ? ACTIONS.ROLE_CHANGED
        : ACTIONS.EMPLOYEE_UPDATED,
      targetUserId:    id,
      targetUserName:  `${result.rows[0].first_name} ${result.rows[0].last_name}`,
      oldValue:        role ? existing.rows[0]?.role : null,
      newValue:        role || null,
      description:     `Updated: ${changedFields.join(', ')}`,
      ipAddress:       req.ip,
    });








    return res.json({
      message:  'Employee updated successfully.',
      employee: result.rows[0],
    });

  } catch (err) {
    console.error('Update employee error:', err.message);
    return res.status(500).json({
      error: 'Failed to update employee.'
    });
  }
};



// ─── DEACTIVATE EMPLOYEE ──────────────────────────────
// DELETE /api/employees/:id
// We never hard-delete employees — this preserves leave history
// Instead we set is_active = false which blocks their login
const deactivateEmployee = async (req, res) => {
  try {
    const { id } = req.params;

    // Prevent an admin from deactivating themselves
    if (req.user.id === id) {
      return res.status(400).json({
        error: 'You cannot deactivate your own account.'
      });
    }

    // Check the employee exists in the same company
    const existing = await query(
      'SELECT id, is_active FROM users WHERE id = $1 AND company_id = $2',
      [id, req.user.company_id]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found.' });
    }

    if (!existing.rows[0].is_active) {
      return res.status(400).json({ error: 'Employee is already deactivated.' });
    }

    // Set is_active to false — they can no longer log in
    await query(
      `UPDATE users
       SET is_active = false, updated_at = NOW()
       WHERE id = $1 AND company_id = $2`,
      [id, req.user.company_id]
    );



  // ── Write Audit Log ────────────────────────────
    logAction({
      companyId:       req.user.company_id,
      performedBy:     req.user.id,
      performedByName: `${req.user.first_name} ${req.user.last_name}`,
      actionType:      ACTIONS.EMPLOYEE_DEACTIVATED,
      targetUserId:    id,
      targetUserName:  `${existing.rows[0].first_name} ${existing.rows[0].last_name}`,
      description:     'Employee account deactivated',
      ipAddress:       req.ip,
    });






    return res.json({
      message: 'Employee deactivated successfully. Their leave history has been preserved.'
    });

  } catch (err) {
    console.error('Deactivate employee error:', err.message);
    return res.status(500).json({ error: 'Failed to deactivate employee.' });
  }
};

// ─── REACTIVATE EMPLOYEE ──────────────────────────────
// PUT /api/employees/:id/reactivate
// Reactivates a previously deactivated employee
// Allows them to log back in and use the system
const reactivateEmployee = async (req, res) => {
  try {
    const { id } = req.params;

    // ── Prevent Self-Action ───────────────────────
    // Shouldn't happen but good to guard against
    if (req.user.id === id) {
      return res.status(400).json({
        error: 'You cannot reactivate your own account.'
      });
    }

    // ── Check Employee Exists in Same Company ─────
    const existing = await query(
      `SELECT id, first_name, last_name, is_active
       FROM users
       WHERE id = $1 AND company_id = $2`,
      [id, req.user.company_id]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found.' });
    }

    const employee = existing.rows[0];

    // ── Check They Are Actually Deactivated ───────
    if (employee.is_active) {
      return res.status(400).json({
        error: `${employee.first_name} ${employee.last_name} is already active.`
      });
    }

    // ── Reactivate ────────────────────────────────
    await query(
      `UPDATE users
       SET is_active  = true,
           updated_at = NOW()
       WHERE id = $1 AND company_id = $2`,
      [id, req.user.company_id]
    );




  // ── Write Audit Log ────────────────────────────
    logAction({
      companyId:       req.user.company_id,
      performedBy:     req.user.id,
      performedByName: `${req.user.first_name} ${req.user.last_name}`,
      actionType:      ACTIONS.EMPLOYEE_REACTIVATED,
      targetUserId:    id,
      targetUserName:  `${employee.first_name} ${employee.last_name}`,
      description:     'Employee account reactivated',
      ipAddress:       req.ip,
    });




    return res.json({
      message: `${employee.first_name} ${employee.last_name} has been reactivated successfully.`
    });

  } catch (err) {
    console.error('Reactivate employee error:', err.message);
    return res.status(500).json({ error: 'Failed to reactivate employee.' });
  }
};

module.exports = {
  addEmployee,
  listEmployees,
  getEmployee,
  updateEmployee,
  deactivateEmployee,
  reactivateEmployee,
};