// ─── PUBLIC HOLIDAY CONTROLLER ────────────────────────
// Manages public holidays per company
// Public holidays are automatically excluded from leave day
// calculations when an employee submits a leave request
//
// South African public holidays are built in and can be
// seeded automatically. Companies can also add custom
// holidays (e.g. company founding day, regional holidays)

const { v4: uuidv4 } = require('uuid');
const { query }      = require('../config/db');

// ─── SA PUBLIC HOLIDAYS ───────────────────────────────
// Static list of South African public holidays
// Dates use MM-DD format so we can apply them to any year
const SA_PUBLIC_HOLIDAYS = [
  { name: "New Year's Day",              month: 1,  day: 1  },
  { name: 'Human Rights Day',            month: 3,  day: 21 },
  { name: 'Good Friday',                 month: 4,  day: 18 }, // Approximate - changes yearly
  { name: 'Family Day',                  month: 4,  day: 21 }, // Approximate - changes yearly
  { name: 'Freedom Day',                 month: 4,  day: 27 },
  { name: "Workers' Day",                month: 5,  day: 1  },
  { name: 'Youth Day',                   month: 6,  day: 16 },
  { name: "National Women's Day",        month: 8,  day: 9  },
  { name: 'Heritage Day',                month: 9,  day: 24 },
  { name: 'Day of Reconciliation',       month: 12, day: 16 },
  { name: 'Christmas Day',               month: 12, day: 25 },
  { name: 'Day of Goodwill',             month: 12, day: 26 },
];

// ─── SEED SA PUBLIC HOLIDAYS ──────────────────────────
// POST /api/public-holidays/seed
// Automatically creates all SA public holidays for a given year
// Safe to run multiple times — skips any that already exist
// Only hr_admin and super_admin can seed holidays
const seedSAHolidays = async (req, res) => {
  try {
    // Default to current year if not specified
    const year = parseInt(req.body.year) || new Date().getFullYear();

    let inserted = 0;
    let skipped  = 0;

    for (const holiday of SA_PUBLIC_HOLIDAYS) {
      // Build the full date for this year
      // padStart ensures month/day are always 2 digits e.g. "04" not "4"
      const dateString = `${year}-${String(holiday.month).padStart(2, '0')}-${String(holiday.day).padStart(2, '0')}`;

      // Check if this holiday already exists for this company and date
      // The UNIQUE constraint on (company_id, holiday_date) prevents duplicates
      const existing = await query(
        `SELECT id FROM public_holidays
         WHERE company_id   = $1
           AND holiday_date = $2`,
        [req.user.company_id, dateString]
      );

      if (existing.rows.length > 0) {
        // Already exists — skip it
        skipped++;
        continue;
      }

      // Insert the holiday
      await query(
        `INSERT INTO public_holidays
           (id, company_id, name, holiday_date, country_code, created_at)
         VALUES ($1, $2, $3, $4, 'ZA', NOW())`,
        [uuidv4(), req.user.company_id, holiday.name, dateString]
      );

      inserted++;
    }

    return res.status(201).json({
      message:  `SA public holidays seeded for ${year}.`,
      year,
      inserted,
      skipped,
      total:    SA_PUBLIC_HOLIDAYS.length,
    });

  } catch (err) {
    console.error('Seed holidays error:', err.message);
    return res.status(500).json({ error: 'Failed to seed public holidays.' });
  }
};

// ─── ADD CUSTOM HOLIDAY ───────────────────────────────
// POST /api/public-holidays
// Adds a single custom holiday for the company
// e.g. a regional holiday or company-specific day off
const addHoliday = async (req, res) => {
  const { name, holiday_date, country_code } = req.body;

  // ── Validation ────────────────────────────────────
  if (!name || !holiday_date) {
    return res.status(400).json({
      error: 'name and holiday_date are required.'
    });
  }

  // Validate date format — must be a valid date string
  const dateObj = new Date(holiday_date);
  if (isNaN(dateObj.getTime())) {
    return res.status(400).json({
      error: 'holiday_date must be a valid date e.g. 2026-03-21'
    });
  }

  try {
    // ── Check for Duplicate ───────────────────────
    const existing = await query(
      `SELECT id FROM public_holidays
       WHERE company_id   = $1
         AND holiday_date = $2`,
      [req.user.company_id, holiday_date]
    );

    if (existing.rows.length > 0) {
      return res.status(409).json({
        error: 'A public holiday already exists on this date.'
      });
    }

    // ── Insert the Holiday ────────────────────────
    const id     = uuidv4();
    const result = await query(
      `INSERT INTO public_holidays
         (id, company_id, name, holiday_date, country_code, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       RETURNING *`,
      [
        id,
        req.user.company_id,
        name,
        holiday_date,
        country_code || 'ZA', // Default to South Africa
      ]
    );

    return res.status(201).json({
      message: 'Public holiday added successfully.',
      holiday: result.rows[0],
    });

  } catch (err) {
    console.error('Add holiday error:', err.message);
    return res.status(500).json({ error: 'Failed to add public holiday.' });
  }
};

// ─── LIST ALL HOLIDAYS ────────────────────────────────
// GET /api/public-holidays
// Returns all public holidays for the company
// Optional filter: ?year=2026
const listHolidays = async (req, res) => {
  try {
    const year = req.query.year ? parseInt(req.query.year) : null;

    let sql    = `
      SELECT
        id,
        name,
        holiday_date,
        country_code,
        created_at
      FROM public_holidays
      WHERE company_id = $1
    `;
    const params = [req.user.company_id];

    // Filter by year if provided
    if (year) {
      sql += ` AND EXTRACT(YEAR FROM holiday_date) = $2`;
      params.push(year);
    }

    // Sort by date ascending so holidays appear in calendar order
    sql += ' ORDER BY holiday_date ASC';

    const result = await query(sql, params);

    return res.json({
      count:    result.rows.length,
      holidays: result.rows,
    });

  } catch (err) {
    console.error('List holidays error:', err.message);
    return res.status(500).json({ error: 'Failed to retrieve public holidays.' });
  }
};

// ─── DELETE HOLIDAY ───────────────────────────────────
// DELETE /api/public-holidays/:id
// Removes a public holiday from the company's calendar
// Only hr_admin and super_admin can delete holidays
const deleteHoliday = async (req, res) => {
  try {
    const { id } = req.params;

    // ── Verify Holiday Belongs to Same Company ────
    const existing = await query(
      `SELECT id, name FROM public_holidays
       WHERE id = $1 AND company_id = $2`,
      [id, req.user.company_id]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Public holiday not found.' });
    }

    await query(
      `DELETE FROM public_holidays
       WHERE id = $1 AND company_id = $2`,
      [id, req.user.company_id]
    );

    return res.json({
      message: `"${existing.rows[0].name}" has been removed from your public holidays.`
    });

  } catch (err) {
    console.error('Delete holiday error:', err.message);
    return res.status(500).json({ error: 'Failed to delete public holiday.' });
  }
};

module.exports = {
  seedSAHolidays,
  addHoliday,
  listHolidays,
  deleteHoliday,
};