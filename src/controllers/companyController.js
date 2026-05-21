// ─── COMPANY CONTROLLER ───────────────────────────────
// Handles company settings management
// Only super_admin can update company settings
//
// Available settings:
//   - Company name
//   - Subdomain
//   - Plan (free/starter/professional/enterprise)
//   - Contact email and phone
//   - Address
//   - Logo URL

const { query } = require('../config/db');
const { logAction, ACTIONS } = require('../utils/auditLogger');

// ─── GET COMPANY SETTINGS ─────────────────────────────
// GET /api/company/settings
// Returns the current company's full settings
// All authenticated users can view company settings
const getCompanySettings = async (req, res) => {
  try {
    const result = await query(
      `SELECT
         id,
         name,
         subdomain,
         plan,
         status,
         logo_url,
         contact_email,
         contact_phone,
         address,
         created_at,
         updated_at
       FROM companies
       WHERE id = $1`,
      [req.user.company_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Company not found.'
      });
    }

    // Count total active employees
    const empCount = await query(
      `SELECT COUNT(*) AS total
       FROM users
       WHERE company_id = $1 AND is_active = true`,
      [req.user.company_id]
    );

    return res.json({
      company: result.rows[0],
      stats: {
        // Include stats so settings page
        // can show useful company info
        total_employees: parseInt(empCount.rows[0].total),
      },
    });

  } catch (err) {
    console.error('Get company settings error:', err.message);
    return res.status(500).json({
      error: 'Failed to retrieve company settings.'
    });
  }
};

// ─── UPDATE COMPANY SETTINGS ──────────────────────────
// PUT /api/company/settings
// Updates the company's settings
// Only super_admin can update company settings
const updateCompanySettings = async (req, res) => {
  const {
    name,           // Company display name
    contact_email,  // Contact email address
    contact_phone,  // Contact phone number
    address,        // Physical address
    logo_url,       // URL to company logo image
  } = req.body;

  // At least one field must be provided
  if (!name && !contact_email &&
      !contact_phone && !address && !logo_url) {
    return res.status(400).json({
      error: 'At least one field must be provided.'
    });
  }

  try {
    // ── Fetch Current Settings ────────────────────
    // Used for audit log to record what changed
    const current = await query(
      `SELECT name, contact_email, contact_phone,
              address, logo_url
       FROM companies WHERE id = $1`,
      [req.user.company_id]
    );

    if (current.rows.length === 0) {
      return res.status(404).json({
        error: 'Company not found.'
      });
    }

    const old = current.rows[0];

    // ── Build Dynamic Update Query ────────────────
    // Only update fields that were sent in the request
    const updates = [];
    const params  = [];
    let   idx     = 1;

    if (name !== undefined) {
      updates.push(`name = $${idx++}`);
      params.push(name);
    }
    if (contact_email !== undefined) {
      updates.push(`contact_email = $${idx++}`);
      params.push(contact_email);
    }
    if (contact_phone !== undefined) {
      updates.push(`contact_phone = $${idx++}`);
      params.push(contact_phone);
    }
    if (address !== undefined) {
      updates.push(`address = $${idx++}`);
      params.push(address);
    }
    if (logo_url !== undefined) {
      updates.push(`logo_url = $${idx++}`);
      params.push(logo_url);
    }

    // Always update the timestamp
    updates.push(`updated_at = NOW()`);

    // Add company_id for WHERE clause
    params.push(req.user.company_id);

    const result = await query(
      `UPDATE companies
       SET ${updates.join(', ')}
       WHERE id = $${idx}
       RETURNING
         id, name, subdomain, plan, status,
         logo_url, contact_email, contact_phone,
         address, updated_at`,
      params
    );

    // ── Write Audit Log ───────────────────────────
    // Record which fields were changed
    const changedFields = [];
    if (name          && name          !== old.name)
      changedFields.push(`name: "${old.name}" → "${name}"`);
    if (contact_email && contact_email !== old.contact_email)
      changedFields.push('contact email');
    if (contact_phone && contact_phone !== old.contact_phone)
      changedFields.push('contact phone');
    if (address       && address       !== old.address)
      changedFields.push('address');
    if (logo_url      && logo_url      !== old.logo_url)
      changedFields.push('logo');

    logAction({
      companyId:       req.user.company_id,
      performedBy:     req.user.id,
      performedByName:`${req.user.first_name} ${req.user.last_name}`,
      actionType:      'COMPANY_SETTINGS_UPDATED',
      description:
        `Company settings updated: `
        + (changedFields.length > 0
          ? changedFields.join(', ')
          : 'minor update'),
      ipAddress:       req.ip,
    });

    return res.json({
      message:  'Company settings updated successfully.',
      company:  result.rows[0],
    });

  } catch (err) {
    console.error('Update company settings error:', err.message);
    return res.status(500).json({
      error: 'Failed to update company settings.'
    });
  }
};

module.exports = {
  getCompanySettings,
  updateCompanySettings,
};