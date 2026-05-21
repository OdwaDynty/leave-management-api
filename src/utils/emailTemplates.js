// ─── EMAIL TEMPLATES ──────────────────────────────────
// HTML email templates for every notification type
// Each template returns a { subject, html } object
// that gets passed to Nodemailer
//
// The design uses inline CSS because many email clients
// (especially Outlook) strip external stylesheets
// We keep it clean and professional with the LeaveSync
// brand colours

// ─── BRAND COLOURS ────────────────────────────────────
const INDIGO  = '#4F46E5';
const GREEN   = '#10B981';
const RED     = '#EF4444';
const AMBER   = '#F59E0B';
const GRAY_50 = '#F9FAFB';
const GRAY_700= '#374151';
const GRAY_400= '#9CA3AF';
const WHITE   = '#FFFFFF';

// ─── BASE LAYOUT ──────────────────────────────────────
// Wraps every email in a consistent layout with
// the LeaveSync header and footer
const baseTemplate = (content, accentColor = INDIGO) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>LeaveSync</title>
</head>
<body style="
  margin: 0;
  padding: 0;
  background-color: #F3F4F6;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI',
               Helvetica, Arial, sans-serif;
">
  <table width="100%" cellpadding="0" cellspacing="0"
    style="background-color: #F3F4F6; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0"
          style="max-width: 600px; width: 100%;">

          <!-- ── Header ── -->
          <tr>
            <td style="
              background: linear-gradient(135deg, ${INDIGO} 0%, #7C3AED 100%);
              border-radius: 12px 12px 0 0;
              padding: 28px 32px;
              text-align: center;
            ">
              <div style="
                display: inline-block;
                background: rgba(255,255,255,0.2);
                border-radius: 8px;
                padding: 8px 16px;
                margin-bottom: 8px;
              ">
                <span style="
                  color: white;
                  font-size: 18px;
                  font-weight: 700;
                  letter-spacing: 0.5px;
                ">LeaveSync</span>
              </div>
              <p style="
                color: rgba(255,255,255,0.8);
                margin: 0;
                font-size: 13px;
              ">Leave Management System</p>
            </td>
          </tr>

          <!-- ── Body ── -->
          <tr>
            <td style="
              background: ${WHITE};
              padding: 32px;
              border-left: 1px solid #E5E7EB;
              border-right: 1px solid #E5E7EB;
            ">
              ${content}
            </td>
          </tr>

          <!-- ── Footer ── -->
          <tr>
            <td style="
              background: ${GRAY_50};
              border: 1px solid #E5E7EB;
              border-top: none;
              border-radius: 0 0 12px 12px;
              padding: 20px 32px;
              text-align: center;
            ">
              <p style="
                color: ${GRAY_400};
                font-size: 12px;
                margin: 0 0 4px;
              ">
                This is an automated message from LeaveSync.
                Please do not reply to this email.
              </p>
              <p style="
                color: ${GRAY_400};
                font-size: 12px;
                margin: 0;
              ">
                &copy; ${new Date().getFullYear()} LeaveSync.
                All rights reserved.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

// ─── STATUS PILL ──────────────────────────────────────
// A coloured pill badge showing the request status
const statusPill = (status) => {
  const config = {
    pending:   { bg: '#FEF3C7', color: '#92400E', label: 'Pending'   },
    approved:  { bg: '#D1FAE5', color: '#065F46', label: 'Approved'  },
    rejected:  { bg: '#FEE2E2', color: '#991B1B', label: 'Rejected'  },
    cancelled: { bg: '#F3F4F6', color: '#374151', label: 'Cancelled' },
  }[status] || { bg: '#F3F4F6', color: '#374151', label: status };

  return `
    <span style="
      background: ${config.bg};
      color: ${config.color};
      padding: 4px 12px;
      border-radius: 9999px;
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    ">${config.label}</span>
  `;
};

// ─── DETAIL ROW ───────────────────────────────────────
// A label + value row used in the leave details table
const detailRow = (label, value) => `
  <tr>
    <td style="
      padding: 10px 16px;
      border-bottom: 1px solid #F3F4F6;
      font-size: 13px;
      color: ${GRAY_400};
      font-weight: 500;
      width: 40%;
    ">${label}</td>
    <td style="
      padding: 10px 16px;
      border-bottom: 1px solid #F3F4F6;
      font-size: 13px;
      color: ${GRAY_700};
      font-weight: 600;
    ">${value}</td>
  </tr>
`;

// ─── FORMAT DATE ──────────────────────────────────────
// Formats a date string for email display
// e.g. "2026-06-01" → "Monday, 1 June 2026"
const formatDate = (dateStr) => {
  return new Date(dateStr).toLocaleDateString('en-ZA', {
    weekday: 'long',
    day:     'numeric',
    month:   'long',
    year:    'numeric',
  });
};

// ═══════════════════════════════════════════════════════
// TEMPLATE 1: REQUEST SUBMITTED
// Sent TO the manager when an employee submits a request
// ═══════════════════════════════════════════════════════
const requestSubmitted = ({
  managerName,
  employeeName,
  leaveType,
  startDate,
  endDate,
  daysRequested,
  reason,
  appUrl,
}) => {
  const subject =
    `📋 Leave Request — ${employeeName} (${daysRequested} day${daysRequested > 1 ? 's' : ''})`;

  const html = baseTemplate(`
    <!-- Greeting -->
    <h2 style="
      color: #111827;
      font-size: 20px;
      font-weight: 700;
      margin: 0 0 8px;
    ">New Leave Request</h2>
    <p style="
      color: ${GRAY_700};
      font-size: 15px;
      margin: 0 0 24px;
      line-height: 1.5;
    ">
      Hi ${managerName}, <strong>${employeeName}</strong> has
      submitted a leave request that requires your approval.
    </p>

    <!-- Details Card -->
    <table width="100%" cellpadding="0" cellspacing="0" style="
      border: 1px solid #E5E7EB;
      border-radius: 8px;
      overflow: hidden;
      margin-bottom: 24px;
    ">
      ${detailRow('Employee',    employeeName)}
      ${detailRow('Leave Type',  leaveType)}
      ${detailRow('From',        formatDate(startDate))}
      ${detailRow('To',          formatDate(endDate))}
      ${detailRow('Days',        `<strong>${daysRequested} working day${daysRequested > 1 ? 's' : ''}</strong>`)}
      ${detailRow('Status',      statusPill('pending'))}
      ${reason
        ? detailRow('Reason', reason)
        : ''}
    </table>

    <!-- CTA Button -->
    <div style="text-align: center; margin-bottom: 8px;">
      <a href="${appUrl}/dashboard/approvals"
        style="
          display: inline-block;
          background: ${INDIGO};
          color: white;
          text-decoration: none;
          padding: 14px 32px;
          border-radius: 8px;
          font-size: 15px;
          font-weight: 600;
          letter-spacing: 0.3px;
        ">
        Review Request →
      </a>
    </div>
    <p style="
      text-align: center;
      color: ${GRAY_400};
      font-size: 12px;
      margin: 8px 0 0;
    ">
      Log in to approve or reject this request
    </p>
  `);

  return { subject, html };
};

// ═══════════════════════════════════════════════════════
// TEMPLATE 2: REQUEST APPROVED
// Sent TO the employee when their request is approved
// ═══════════════════════════════════════════════════════
const requestApproved = ({
  employeeName,
  managerName,
  leaveType,
  startDate,
  endDate,
  daysRequested,
  appUrl,
}) => {
  const subject =
    `✅ Leave Approved — ${leaveType} (${daysRequested} day${daysRequested > 1 ? 's' : ''})`;

  const html = baseTemplate(`
    <!-- Success Icon -->
    <div style="text-align: center; margin-bottom: 20px;">
      <div style="
        display: inline-block;
        background: #D1FAE5;
        border-radius: 50%;
        width: 64px;
        height: 64px;
        line-height: 64px;
        font-size: 28px;
        text-align: center;
      ">✅</div>
    </div>

    <!-- Heading -->
    <h2 style="
      color: #111827;
      font-size: 20px;
      font-weight: 700;
      margin: 0 0 8px;
      text-align: center;
    ">Your Leave Has Been Approved!</h2>
    <p style="
      color: ${GRAY_700};
      font-size: 15px;
      margin: 0 0 24px;
      line-height: 1.5;
      text-align: center;
    ">
      Hi ${employeeName}, great news — your leave request has
      been approved by <strong>${managerName}</strong>.
    </p>

    <!-- Details Card -->
    <table width="100%" cellpadding="0" cellspacing="0" style="
      border: 1px solid #E5E7EB;
      border-radius: 8px;
      overflow: hidden;
      margin-bottom: 24px;
    ">
      ${detailRow('Leave Type',   leaveType)}
      ${detailRow('From',         formatDate(startDate))}
      ${detailRow('To',           formatDate(endDate))}
      ${detailRow('Days',         `<strong>${daysRequested} working day${daysRequested > 1 ? 's' : ''}</strong>`)}
      ${detailRow('Status',       statusPill('approved'))}
      ${detailRow('Approved by',  managerName)}
    </table>

    <!-- Enjoy message -->
    <div style="
      background: #D1FAE5;
      border-radius: 8px;
      padding: 16px;
      text-align: center;
      margin-bottom: 8px;
    ">
      <p style="
        color: #065F46;
        font-size: 14px;
        font-weight: 600;
        margin: 0;
      ">
        🌴 Enjoy your time off!
      </p>
    </div>

    <!-- CTA -->
    <div style="text-align: center; margin-top: 20px;">
      <a href="${appUrl}/dashboard/my-leave"
        style="
          display: inline-block;
          background: ${GREEN};
          color: white;
          text-decoration: none;
          padding: 12px 28px;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 600;
        ">
        View My Leave →
      </a>
    </div>
  `, GREEN);

  return { subject, html };
};

// ═══════════════════════════════════════════════════════
// TEMPLATE 3: REQUEST REJECTED
// Sent TO the employee when their request is rejected
// ═══════════════════════════════════════════════════════
const requestRejected = ({
  employeeName,
  managerName,
  leaveType,
  startDate,
  endDate,
  daysRequested,
  rejectionReason,
  appUrl,
}) => {
  const subject =
    `❌ Leave Request Declined — ${leaveType}`;

  const html = baseTemplate(`
    <!-- Icon -->
    <div style="text-align: center; margin-bottom: 20px;">
      <div style="
        display: inline-block;
        background: #FEE2E2;
        border-radius: 50%;
        width: 64px;
        height: 64px;
        line-height: 64px;
        font-size: 28px;
        text-align: center;
      ">❌</div>
    </div>

    <!-- Heading -->
    <h2 style="
      color: #111827;
      font-size: 20px;
      font-weight: 700;
      margin: 0 0 8px;
      text-align: center;
    ">Leave Request Declined</h2>
    <p style="
      color: ${GRAY_700};
      font-size: 15px;
      margin: 0 0 24px;
      line-height: 1.5;
      text-align: center;
    ">
      Hi ${employeeName}, unfortunately your leave request
      has been declined by <strong>${managerName}</strong>.
    </p>

    <!-- Details Card -->
    <table width="100%" cellpadding="0" cellspacing="0" style="
      border: 1px solid #E5E7EB;
      border-radius: 8px;
      overflow: hidden;
      margin-bottom: 24px;
    ">
      ${detailRow('Leave Type',  leaveType)}
      ${detailRow('From',        formatDate(startDate))}
      ${detailRow('To',          formatDate(endDate))}
      ${detailRow('Days',        `${daysRequested} working day${daysRequested > 1 ? 's' : ''}`)}
      ${detailRow('Status',      statusPill('rejected'))}
      ${detailRow('Declined by', managerName)}
    </table>

    <!-- Rejection Reason -->
    <div style="
      background: #FEF2F2;
      border: 1px solid #FECACA;
      border-left: 4px solid ${RED};
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 24px;
    ">
      <p style="
        color: #991B1B;
        font-size: 13px;
        font-weight: 700;
        margin: 0 0 6px;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      ">Reason for Declining</p>
      <p style="
        color: ${GRAY_700};
        font-size: 14px;
        margin: 0;
        line-height: 1.5;
      ">${rejectionReason}</p>
    </div>

    <!-- Encouragement -->
    <p style="
      color: ${GRAY_700};
      font-size: 14px;
      line-height: 1.6;
      margin: 0 0 20px;
    ">
      You are welcome to submit a new request for different dates.
      If you have questions, please speak to your manager directly.
    </p>

    <!-- CTA -->
    <div style="text-align: center;">
      <a href="${appUrl}/dashboard/my-leave"
        style="
          display: inline-block;
          background: ${INDIGO};
          color: white;
          text-decoration: none;
          padding: 12px 28px;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 600;
        ">
        Submit New Request →
      </a>
    </div>
  `, RED);

  return { subject, html };
};

// ═══════════════════════════════════════════════════════
// TEMPLATE 4: REQUEST CANCELLED
// Sent TO the manager when an employee cancels a request
// ═══════════════════════════════════════════════════════
const requestCancelled = ({
  managerName,
  employeeName,
  leaveType,
  startDate,
  endDate,
  daysRequested,
  appUrl,
}) => {
  const subject =
    `🚫 Leave Cancelled — ${employeeName}`;

  const html = baseTemplate(`
    <h2 style="
      color: #111827;
      font-size: 20px;
      font-weight: 700;
      margin: 0 0 8px;
    ">Leave Request Cancelled</h2>
    <p style="
      color: ${GRAY_700};
      font-size: 15px;
      margin: 0 0 24px;
      line-height: 1.5;
    ">
      Hi ${managerName}, <strong>${employeeName}</strong> has
      cancelled their pending leave request.
      No action is required from you.
    </p>

    <!-- Details Card -->
    <table width="100%" cellpadding="0" cellspacing="0" style="
      border: 1px solid #E5E7EB;
      border-radius: 8px;
      overflow: hidden;
      margin-bottom: 24px;
    ">
      ${detailRow('Employee',   employeeName)}
      ${detailRow('Leave Type', leaveType)}
      ${detailRow('From',       formatDate(startDate))}
      ${detailRow('To',         formatDate(endDate))}
      ${detailRow('Days',       `${daysRequested} working day${daysRequested > 1 ? 's' : ''}`)}
      ${detailRow('Status',     statusPill('cancelled'))}
    </table>

    <p style="
      color: ${GRAY_400};
      font-size: 13px;
      text-align: center;
    ">
      This request has been removed from your pending approvals.
    </p>
  `, AMBER);

  return { subject, html };
};



// ═══════════════════════════════════════════════════════
// TEMPLATE 5 — PASSWORD RESET REQUEST
// Sent TO the user when they request a password reset
// Contains a secure link that expires in 1 hour
// ═══════════════════════════════════════════════════════
const passwordResetRequest = ({
  firstName,   // User's first name for personalisation
  resetUrl,    // The full reset URL including the token
  expiryMins,  // How many minutes until the link expires
}) => ({
  subject: 'Reset Your LeaveSync Password',

  html: baseTemplate(`
    <!-- Icon -->
    <div style="text-align:center; margin-bottom:20px;">
      <div style="
        display:inline-block; background:#EEF2FF;
        border-radius:50%; width:64px; height:64px;
        line-height:64px; font-size:28px;
      ">🔐</div>
    </div>

    <!-- Heading -->
    <h2 style="
      color:#111827; font-size:20px;
      font-weight:700; margin:0 0 8px;
      text-align:center;
    ">Reset Your Password</h2>

    <p style="
      color:${GRAY_700}; font-size:15px;
      margin:0 0 24px; line-height:1.5;
      text-align:center;
    ">
      Hi <strong>${firstName}</strong>, we received a
      request to reset your LeaveSync password.
      Click the button below to choose a new password.
    </p>

    <!-- Reset Button -->
    <div style="text-align:center; margin-bottom:24px;">
      <a href="${resetUrl}" style="
        display:inline-block; background:${INDIGO};
        color:white; text-decoration:none;
        padding:14px 32px; border-radius:8px;
        font-size:15px; font-weight:600;
      ">Reset My Password</a>
    </div>

    <!-- Expiry Warning -->
    <div style="
      background:#FEF3C7;
      border:1px solid #FCD34D;
      border-radius:8px; padding:16px;
      margin-bottom:24px;
    ">
      <p style="
        color:#92400E; font-size:13px;
        margin:0; text-align:center;
      ">
        ⏰ This link expires in
        <strong>${expiryMins} minutes</strong>.
        After that you will need to request a new one.
      </p>
    </div>

    <!-- Security Note -->
    <p style="
      color:${GRAY_400}; font-size:13px;
      text-align:center; margin:0;
    ">
      If you did not request a password reset
      please ignore this email. Your password
      will not be changed.
    </p>
  `),
});

// ═══════════════════════════════════════════════════════
// TEMPLATE 6 — PASSWORD RESET SUCCESS
// Sent TO the user after they successfully reset password
// Confirms the change and warns if it was not them
// ═══════════════════════════════════════════════════════
const passwordResetSuccess = ({
  firstName,  // User's first name
  appUrl,     // URL to the login page
}) => ({
  subject: 'Your LeaveSync Password Has Been Changed',

  html: baseTemplate(`
    <!-- Icon -->
    <div style="text-align:center; margin-bottom:20px;">
      <div style="
        display:inline-block; background:#D1FAE5;
        border-radius:50%; width:64px; height:64px;
        line-height:64px; font-size:28px;
      ">✅</div>
    </div>

    <!-- Heading -->
    <h2 style="
      color:#111827; font-size:20px;
      font-weight:700; margin:0 0 8px;
      text-align:center;
    ">Password Changed Successfully</h2>

    <p style="
      color:${GRAY_700}; font-size:15px;
      margin:0 0 24px; line-height:1.5;
      text-align:center;
    ">
      Hi <strong>${firstName}</strong>, your LeaveSync
      password has been successfully changed.
      You can now log in with your new password.
    </p>

    <!-- Login Button -->
    <div style="text-align:center; margin-bottom:24px;">
      <a href="${appUrl}/login" style="
        display:inline-block; background:${GREEN};
        color:white; text-decoration:none;
        padding:12px 28px; border-radius:8px;
        font-size:14px; font-weight:600;
      ">Log In Now</a>
    </div>

    <!-- Security Warning -->
    <div style="
      background:#FEE2E2;
      border:1px solid #FECACA;
      border-left:4px solid #EF4444;
      border-radius:8px; padding:16px;
    ">
      <p style="
        color:#991B1B; font-size:13px; margin:0;
      ">
        🔒 If you did not make this change please
        contact your HR admin immediately as your
        account may have been compromised.
      </p>
    </div>
  `, GREEN),
});



module.exports = {
  requestSubmitted,
  requestApproved,
  requestRejected,
  requestCancelled,
  passwordResetRequest,
  passwordResetSuccess,
};