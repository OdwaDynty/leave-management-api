// ─── BILLING CONTROLLER ───────────────────────────────
// Handles all PayFast subscription payment logic
//
// PLAN TIERS:
//   free         R0/month    max 5 employees
//   starter      R199/month  max 25 employees
//   professional R499/month  max 100 employees
//   enterprise   R999/month  unlimited employees
//
// PAYFAST FLOW:
//   1. Frontend calls /initiate to get payment fields
//   2. Frontend submits hidden form to PayFast
//   3. User pays on PayFast
//   4. PayFast calls /webhook with payment result
//   5. We verify and update the subscription

const crypto  = require('crypto');
const { query } = require('../config/db');
const { v4: uuidv4 } = require('uuid');

// ─── PLAN DEFINITIONS ─────────────────────────────────
// Single source of truth for all plan details
// Update prices here and they update everywhere
const PLANS = {
  free: {
    name:          'Free',
    // Price in cents — R0.00
    price_cents:   0,
    // Maximum employees allowed on this plan
    max_employees: 5,
    description:   'Up to 5 employees',
    // Features shown on pricing page
    features: [
      'Up to 5 employees',
      'Leave requests and approvals',
      'Basic reports',
      'Email notifications',
      'Public holidays',
    ],
  },
  starter: {
    name:          'Starter',
    // R199.00 = 19900 cents
    // We store in cents to avoid floating point issues
    price_cents:   19900,
    max_employees: 25,
    description:   'Up to 25 employees',
    features: [
      'Up to 25 employees',
      'Everything in Free',
      'Multi-level approvals',
      'Audit trail',
      'Leave policies per role',
      'Role change requests',
    ],
  },
  professional: {
    name:          'Professional',
    // R499.00 = 49900 cents
    price_cents:   49900,
    max_employees: 100,
    description:   'Up to 100 employees',
    features: [
      'Up to 100 employees',
      'Everything in Starter',
      'Advanced analytics',
      'Absenteeism reports',
      'Priority email support',
      'Custom leave types',
    ],
  },
  enterprise: {
    name:          'Enterprise',
    // R999.00 = 99900 cents
    price_cents:   99900,
    // 999999 = effectively unlimited
    max_employees: 999999,
    description:   'Unlimited employees',
    features: [
      'Unlimited employees',
      'Everything in Professional',
      'Dedicated account manager',
      'Custom domain setup',
      'SLA guarantee',
      'Full API access',
    ],
  },
};

// ─── GENERATE PAYFAST SIGNATURE ───────────────────────
// Generates MD5 signature exactly as PayFast expects
//
// IMPORTANT NOTES:
//   1. Parameters must be sorted alphabetically
//   2. Empty values must be excluded
//   3. Values encoded with urlencode not rawurlencode
//   4. Passphrase appended AFTER all other params
//   5. The signature itself is NOT included in signing
const generateSignature = (data, passphrase = null) => {
  // Step 1: Remove empty, null, undefined values
  // and remove signature if it exists
  const cleanData = {};
  Object.keys(data).forEach(key => {
    if (
      key !== 'signature' &&
      data[key] !== null &&
      data[key] !== undefined &&
      data[key] !== ''
    ) {
      cleanData[key] = data[key];
    }
  });

  // Step 2: Sort keys alphabetically
  const sortedKeys = Object.keys(cleanData).sort();

  // Step 3: Build the parameter string
  // PayFast uses PHP urlencode which encodes spaces as +
  const paramString = sortedKeys
    .map(key => {
      const value = String(cleanData[key]);
      // PHP urlencode equivalent in JavaScript
      const encoded = encodeURIComponent(value)
        .replace(/%20/g, '+')   // spaces become +
        .replace(/!/g, '%21')
        .replace(/'/g, '%27')
        .replace(/\(/g, '%28')
        .replace(/\)/g, '%29')
        .replace(/\*/g, '%2A');
      return `${key}=${encoded}`;
    })
    .join('&');

  // Step 4: Append passphrase if provided
  // The passphrase is appended as a raw string
  // NOT encoded like the other parameters
  const stringToHash = passphrase
    ? `${paramString}&passphrase=${encodeURIComponent(passphrase).replace(/%20/g, '+')}`
    : paramString;

  // Step 5: MD5 hash the final string
  return crypto
    .createHash('md5')
    .update(stringToHash)
    .digest('hex');
};



// ─── GET PLANS ────────────────────────────────────────
// GET /api/billing/plans
// Public endpoint — no auth required
// Returns all plan details for the pricing page
// Also returns the company's current plan if logged in
const getPlans = async (req, res) => {
  try {
    let currentPlan = 'free';

    // If user is authenticated check their current plan
    if (req.user) {
      const sub = await query(
        `SELECT plan FROM subscriptions
         WHERE company_id = $1`,
        [req.user.company_id]
      );
      if (sub.rows.length > 0) {
        currentPlan = sub.rows[0].plan;
      }
    }

    return res.json({
      plans:        PLANS,
      current_plan: currentPlan,
    });
  } catch (err) {
    console.error('Get plans error:', err.message);
    return res.status(500).json({
      error: 'Failed to retrieve plans.'
    });
  }
};

// ─── GET SUBSCRIPTION ─────────────────────────────────
// GET /api/billing/subscription
// Returns the company's current subscription details
// Creates a free subscription if none exists yet
const getSubscription = async (req, res) => {
  try {
    let result = await query(
      `SELECT * FROM subscriptions
       WHERE company_id = $1`,
      [req.user.company_id]
    );

    // Auto-create a free subscription if none exists
    // This happens for companies registered before
    // billing was added to the system
    if (result.rows.length === 0) {
      const newId = uuidv4();
      await query(
        `INSERT INTO subscriptions (
           id, company_id, plan, status,
           max_employees, price_cents,
           created_at, updated_at
         )
         VALUES (
           $1, $2, 'free', 'active',
           5, 0, NOW(), NOW()
         )`,
        [newId, req.user.company_id]
      );

      result = await query(
        `SELECT * FROM subscriptions
         WHERE company_id = $1`,
        [req.user.company_id]
      );
    }

    const subscription = result.rows[0];

    // Count active employees for the usage display
    const empCount = await query(
      `SELECT COUNT(*) AS total
       FROM users
       WHERE company_id = $1
         AND is_active = true`,
      [req.user.company_id]
    );

    return res.json({
      subscription,
      employee_count: parseInt(empCount.rows[0].total),
      plan_details:   PLANS[subscription.plan] || PLANS.free,
    });

  } catch (err) {
    console.error('Get subscription error:', err.message);
    return res.status(500).json({
      error: 'Failed to retrieve subscription.'
    });
  }
};

// ─── INITIATE PAYMENT ─────────────────────────────────
// POST /api/billing/initiate
// Called when user clicks "Upgrade to [Plan]"
// Builds all the PayFast form fields and returns them
// The frontend uses these to redirect to PayFast
const initiatePayment = async (req, res) => {
  const { plan } = req.body;

  // Validate the requested plan exists and is not free
  if (!PLANS[plan] || plan === 'free') {
    return res.status(400).json({
      error: 'Invalid plan selected.'
    });
  }

  try {
    const selectedPlan = PLANS[plan];

    // Check current plan to prevent duplicate upgrades
    const currentSub = await query(
      `SELECT plan FROM subscriptions
       WHERE company_id = $1`,
      [req.user.company_id]
    );

    if (currentSub.rows.length > 0 &&
        currentSub.rows[0].plan === plan) {
      return res.status(400).json({
        error: `You are already on the ${plan} plan.`
      });
    }

    // Get company name for the payment description
    const companyResult = await query(
      `SELECT name FROM companies WHERE id = $1`,
      [req.user.company_id]
    );
    const companyName =
      companyResult.rows[0]?.name || 'LeaveSync Company';

    // Convert price from cents to Rand with 2 decimals
    // e.g. 19900 cents = "199.00"
    const amountRand =
      (selectedPlan.price_cents / 100).toFixed(2);

    // Generate a unique ID to track this payment
    // We store this and match it in the webhook
    const paymentId = uuidv4();

    // Store the pending payment ID in the database
    // so we can match it when PayFast calls the webhook
    const existingSub = await query(
      `SELECT id FROM subscriptions
       WHERE company_id = $1`,
      [req.user.company_id]
    );

    if (existingSub.rows.length > 0) {
      // Update existing subscription record
      await query(
        `UPDATE subscriptions
         SET payfast_payment_id = $1,
             updated_at         = NOW()
         WHERE company_id = $2`,
        [paymentId, req.user.company_id]
      );
    } else {
      // Create a new subscription record
      await query(
        `INSERT INTO subscriptions (
           id, company_id, plan, status,
           max_employees, price_cents,
           payfast_payment_id,
           created_at, updated_at
         )
         VALUES ($1,$2,'free','active',5,0,$3,NOW(),NOW())`,
        [uuidv4(), req.user.company_id, paymentId]
      );
    }

    // ── Build PayFast Payment Fields ──────────────
    // These are the exact fields PayFast requires
    // See: https://developers.payfast.co.za/docs
    const paymentData = {
      // Your PayFast credentials
      merchant_id:  process.env.PAYFAST_MERCHANT_ID,
      merchant_key: process.env.PAYFAST_MERCHANT_KEY,

      // Where to redirect after payment
      // return_url: shown after successful payment
      return_url:
        `${process.env.APP_URL}/dashboard/billing` +
        `?payment=success&plan=${plan}`,

      // cancel_url: shown if user cancels on PayFast
      cancel_url:
        `${process.env.APP_URL}/dashboard/billing` +
        `?payment=cancelled`,

      // notify_url: PayFast sends ITN here
      // Must be a public URL — not localhost
      // This is your Render API URL
      notify_url:
        `${process.env.RAILWAY_URL}/api/billing/webhook`,

      // Buyer information — pre-fills PayFast form
      email_address: req.user.email,
      name_first:    req.user.first_name,
      name_last:     req.user.last_name,

      // Payment amount and description
      // m_payment_id: your internal reference
      m_payment_id:  paymentId,
      amount:        amountRand,
      item_name:
        `LeaveSync ${selectedPlan.name} - ${companyName}`,
      item_description:
        `Monthly: ${selectedPlan.description}`,

      // Custom fields passed back in the webhook
      // We use these to identify the company and plan
      // when PayFast notifies us of payment completion
      custom_str1: req.user.company_id, // company ID
      custom_str2: plan,                // plan name
      custom_str3: req.user.id,         // user ID
    };

    // Only use passphrase if it is set in environment
    // If PayFast account has no passphrase set this to null
    const signature = generateSignature(
    paymentData,
    process.env.PAYFAST_PASSPHRASE || null
    );

    // Return everything the frontend needs
    return res.json({
      // The PayFast payment page URL
      payfast_url:  process.env.PAYFAST_URL,
      // All form fields including the signature
      payment_data: { ...paymentData, signature },
      amount:       amountRand,
      plan:         selectedPlan,
    });

  } catch (err) {
    console.error('Initiate payment error:', err.message);
    return res.status(500).json({
      error: 'Failed to initiate payment.'
    });
  }
};

// ─── PAYFAST WEBHOOK (ITN) ────────────────────────────
// POST /api/billing/webhook
// PayFast calls this after every payment event
// This is the ONLY place where the database gets updated
// The return_url success page does NOT update the database
// Only this webhook does
const handleWebhook = async (req, res) => {
  // Always respond 200 immediately
  // PayFast requires a response within 10 seconds
  // If we wait too long PayFast marks it as failed
  // and stops retrying
  res.status(200).send('OK');

  // Now process the webhook asynchronously
  // The response was already sent above
  try {
    const pfData = req.body;

    // ── Log Everything ────────────────────────────
    console.log('');
    console.log('═══════════════════════════════════');
    console.log('  PayFast ITN Webhook Received');
    console.log('═══════════════════════════════════');
    console.log('  Status:    ', pfData.payment_status);
    console.log('  Company:   ', pfData.custom_str1);
    console.log('  Plan:      ', pfData.custom_str2);
    console.log('  Amount:    ', pfData.amount_gross);
    console.log('  Payment ID:', pfData.pf_payment_id);
    console.log('  Token:     ', pfData.token);
    console.log('═══════════════════════════════════');

   // Trim whitespace and newlines from all values
  // PowerShell and some HTTP clients add trailing newlines
  // PostgreSQL rejects UUIDs with whitespace
    const companyId = pfData.custom_str1?.toString().trim();
    const plan      = pfData.custom_str2?.toString().trim();
    const status    = pfData.payment_status?.toString().trim();

    // ── Validate Required Fields ──────────────────
    if (!companyId || !plan || !status) {
      console.error('PayFast webhook: Missing required fields');
      console.error('Body received:', JSON.stringify(pfData));
      return;
    }

    // ── Skip Signature Verification in Sandbox ────
    // PAYFAST_SKIP_SIG=true bypasses this for testing
    // Remove this bypass before going to production
    const skipSig = process.env.PAYFAST_SKIP_SIG === 'true';

    if (!skipSig) {
      const { signature, ...dataWithoutSig } = pfData;
      const calculatedSig = generateSignature(
        dataWithoutSig,
        process.env.PAYFAST_PASSPHRASE || null
      );

      if (signature !== calculatedSig) {
        console.error('PayFast webhook: Signature mismatch');
        console.error('Expected:', calculatedSig);
        console.error('Received:', signature);
        return;
      }
      console.log('✅ Signature verified');
    } else {
      console.log('⚠️  Signature check skipped (sandbox mode)');
    }

    // ── Process Payment Complete ───────────────────
    if (status === 'COMPLETE') {
      const selectedPlan = PLANS[plan];

      if (!selectedPlan) {
        console.error(`PayFast webhook: Unknown plan "${plan}"`);
        return;
      }

      console.log(`Processing upgrade to ${plan}...`);

      // Calculate billing period dates
      const now       = new Date();
      const periodEnd = new Date(now);
      periodEnd.setMonth(periodEnd.getMonth() + 1);

      // ── Update Subscriptions Table ─────────────
      // ON CONFLICT handles both new and existing records
      // This is the critical update that was failing
      await query(
        `INSERT INTO subscriptions (
           id,
           company_id,
           plan,
           status,
           max_employees,
           price_cents,
           payfast_token,
           payfast_payment_id,
           current_period_start,
           current_period_end,
           created_at,
           updated_at
         )
         VALUES (
           $1, $2, $3, 'active',
           $4, $5, $6, $7,
           $8, $9,
           NOW(), NOW()
         )
         ON CONFLICT (company_id)
         DO UPDATE SET
           plan                 = EXCLUDED.plan,
           status               = 'active',
           max_employees        = EXCLUDED.max_employees,
           price_cents          = EXCLUDED.price_cents,
           payfast_token        = EXCLUDED.payfast_token,
           payfast_payment_id   = EXCLUDED.payfast_payment_id,
           current_period_start = EXCLUDED.current_period_start,
           current_period_end   = EXCLUDED.current_period_end,
           cancelled_at         = NULL,
           updated_at           = NOW()`,
        [
          uuidv4(),
          companyId,
          plan,
          selectedPlan.max_employees,
          selectedPlan.price_cents,
          pfData.token           || null,
          pfData.pf_payment_id   || null,
          now.toISOString(),
          periodEnd.toISOString(),
        ]
      );

      console.log('✅ subscriptions table updated');

      // ── Update Companies Table ──────────────────
      // This is what the rest of the app reads
      // for plan checks and limits
      await query(
        `UPDATE companies
         SET plan       = $1,
             updated_at = NOW()
         WHERE id = $2`,
        [plan, companyId]
      );

      console.log('✅ companies table updated');
      console.log(`🎉 ${companyId} upgraded to ${plan}`);

    // ── Process Cancellation ───────────────────────
    } else if (status === 'CANCELLED') {
      await query(
        `UPDATE subscriptions
         SET plan          = 'free',
             status        = 'cancelled',
             max_employees = 5,
             price_cents   = 0,
             cancelled_at  = NOW(),
             updated_at    = NOW()
         WHERE company_id = $1`,
        [companyId]
      );

      await query(
        `UPDATE companies
         SET plan       = 'free',
             updated_at = NOW()
         WHERE id = $1`,
        [companyId]
      );

      console.log(`ℹ️  ${companyId} downgraded to free`);

    } else {
      // Other statuses: FAILED, PENDING etc.
      console.log(`ℹ️  PayFast status: ${status} — no action taken`);
    }

  } catch (err) {
    // Log but do not crash — response already sent
    console.error('PayFast webhook processing error:');
    console.error(err.message);
    console.error(err.stack);
  }
};



// ─── CANCEL SUBSCRIPTION ──────────────────────────────
// POST /api/billing/cancel
// Called when user clicks "Cancel Plan"
// Immediately reverts to free plan
const cancelSubscription = async (req, res) => {
  try {
    await query(
      `UPDATE subscriptions
       SET plan          = 'free',
           status        = 'cancelled',
           max_employees = 5,
           price_cents   = 0,
           payfast_token = null,
           cancelled_at  = NOW(),
           updated_at    = NOW()
       WHERE company_id = $1`,
      [req.user.company_id]
    );

    await query(
      `UPDATE companies
       SET plan = 'free', updated_at = NOW()
       WHERE id = $1`,
      [req.user.company_id]
    );

    return res.json({
      message:
        'Subscription cancelled. '
        + 'You are now on the free plan.',
    });

  } catch (err) {
    console.error('Cancel subscription error:',
      err.message
    );
    return res.status(500).json({
      error: 'Failed to cancel subscription.'
    });
  }
};

// Export PLANS so routes and other files can use it
module.exports = {
  getPlans,
  getSubscription,
  initiatePayment,
  handleWebhook,
  cancelSubscription,
  PLANS,
};