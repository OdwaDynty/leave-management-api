// ─── PLAN LIMITS MIDDLEWARE ───────────────────────────
// Enforces employee limits based on subscription plan
// Called before the addEmployee controller
//
// If the company is at their limit:
//   → Returns 403 with an upgrade message
//   → The addEmployee controller never runs
//
// If under the limit:
//   → Calls next() to allow the request through

const { query } = require('../config/db');

const checkEmployeeLimit = async (req, res, next) => {
  try {
    // Get the company's subscription plan limits
    const subResult = await query(
      `SELECT max_employees, plan
       FROM subscriptions
       WHERE company_id = $1`,
      [req.user.company_id]
    );

    // Default to free plan limits if no subscription
    // exists yet (5 employees maximum)
    const maxEmployees =
      subResult.rows.length > 0
        ? subResult.rows[0].max_employees
        : 5;

    const currentPlan =
      subResult.rows.length > 0
        ? subResult.rows[0].plan
        : 'free';

    // Count current active employees
    const countResult = await query(
      `SELECT COUNT(*) AS total
       FROM users
       WHERE company_id = $1
         AND is_active  = true`,
      [req.user.company_id]
    );

    const currentCount =
      parseInt(countResult.rows[0].total);

    // Check if adding one more would exceed the limit
    if (currentCount >= maxEmployees) {
      return res.status(403).json({
        error:
          `Your ${currentPlan} plan allows a maximum ` +
          `of ${maxEmployees} employees. ` +
          `You currently have ${currentCount}. ` +
          `Please upgrade your plan to add more.`,
        upgrade_required: true,
        current_plan:     currentPlan,
        max_employees:    maxEmployees,
        current_count:    currentCount,
      });
    }

    // Under the limit — allow the request to proceed
    next();

  } catch (err) {
    // If the check itself fails allow through
    // We never want billing to block core features
    console.error('Plan limit check error:', err.message);
    next();
  }
};

module.exports = { checkEmployeeLimit };