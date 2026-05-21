// ─── EMAIL SERVICE ────────────────────────────────────
// The central service for sending all system emails
// Each function handles one notification type and
// builds the email then sends it via Nodemailer
//
// All functions are fire-and-forget — they never throw
// errors that would break the main API response.
// If email fails, the API still responds successfully
// and logs the error for debugging.

const { transporter }     = require('../config/email');
const {
  requestSubmitted,
  requestApproved,
  requestRejected,
  requestCancelled,
  passwordResetRequest,
  passwordResetSuccess,
} = require('./emailTemplates');

// The URL shown in email buttons
// Uses the APP_URL env var (http://localhost:3000 in dev)
const APP_URL = process.env.APP_URL || 'http://localhost:5173';

// ─── SEND HELPER ──────────────────────────────────────
// Internal helper that handles the actual sending
// Wraps nodemailer in try/catch so email errors never
// crash the main request
const sendEmail = async ({ to, subject, html }) => {
  try {
    const info = await transporter.sendMail({
      from: `"${process.env.EMAIL_FROM_NAME || 'LeaveSync'}" <${process.env.EMAIL_FROM}>`,
      to,
      subject,
      html,
    });
    console.log(`📧 Email sent to ${to}: ${subject}`);
    return { success: true, messageId: info.messageId };
  } catch (err) {
    // Log but don't throw — email failure should never
    // break the leave request API response
    console.error(`❌ Email failed to ${to}:`, err.message);
    return { success: false, error: err.message };
  }
};

// ─── NOTIFY MANAGER: REQUEST SUBMITTED ────────────────
// Called when an employee submits a leave request
// Sends an email to their manager asking for approval
const notifyManagerRequestSubmitted = async ({
  managerEmail,
  managerName,
  employeeName,
  leaveType,
  startDate,
  endDate,
  daysRequested,
  reason,
}) => {
  // Don't send if no manager email provided
  if (!managerEmail) return;

  const { subject, html } = requestSubmitted({
    managerName,
    employeeName,
    leaveType,
    startDate,
    endDate,
    daysRequested,
    reason,
    appUrl: APP_URL,
  });

  return sendEmail({ to: managerEmail, subject, html });
};

// ─── NOTIFY EMPLOYEE: REQUEST APPROVED ────────────────
// Called when a manager approves a leave request
// Sends a confirmation email to the employee
const notifyEmployeeRequestApproved = async ({
  employeeEmail,
  employeeName,
  managerName,
  leaveType,
  startDate,
  endDate,
  daysRequested,
}) => {
  if (!employeeEmail) return;

  const { subject, html } = requestApproved({
    employeeName,
    managerName,
    leaveType,
    startDate,
    endDate,
    daysRequested,
    appUrl: APP_URL,
  });

  return sendEmail({ to: employeeEmail, subject, html });
};

// ─── NOTIFY EMPLOYEE: REQUEST REJECTED ────────────────
// Called when a manager rejects a leave request
// Sends an email to the employee with the reason
const notifyEmployeeRequestRejected = async ({
  employeeEmail,
  employeeName,
  managerName,
  leaveType,
  startDate,
  endDate,
  daysRequested,
  rejectionReason,
}) => {
  if (!employeeEmail) return;

  const { subject, html } = requestRejected({
    employeeName,
    managerName,
    leaveType,
    startDate,
    endDate,
    daysRequested,
    rejectionReason,
    appUrl: APP_URL,
  });

  return sendEmail({ to: employeeEmail, subject, html });
};

// ─── NOTIFY MANAGER: REQUEST CANCELLED ────────────────
// Called when an employee cancels a pending request
// Sends an info email to the manager
const notifyManagerRequestCancelled = async ({
  managerEmail,
  managerName,
  employeeName,
  leaveType,
  startDate,
  endDate,
  daysRequested,
}) => {
  if (!managerEmail) return;

  const { subject, html } = requestCancelled({
    managerName,
    employeeName,
    leaveType,
    startDate,
    endDate,
    daysRequested,
    appUrl: APP_URL,
  });

  return sendEmail({ to: managerEmail, subject, html });
};


// ─── SEND PASSWORD RESET EMAIL ────────────────────────
// Called when a user requests a password reset
// Sends an email with a secure time-limited reset link
const sendPasswordResetEmail = async ({
  userEmail,   // Email address to send to
  firstName,   // User's first name for personalisation
  resetToken,  // The raw token (not the hash)
}) => {
  if (!userEmail) return;

  // Build the full reset URL that appears in the email
  // The frontend reset page reads the token from the URL
  const resetUrl =
    `${APP_URL}/reset-password?token=${resetToken}`;

  const { subject, html } = passwordResetRequest({
    firstName,
    resetUrl,
    expiryMins: 60, // Token expires in 60 minutes
  });

  return sendEmail({ to: userEmail, subject, html });
};

// ─── SEND PASSWORD RESET SUCCESS EMAIL ────────────────
// Called after a user successfully resets their password
// Confirms the change and warns if it was not them
const sendPasswordResetSuccess = async ({
  userEmail,  // Email address to send to
  firstName,  // User's first name
}) => {
  if (!userEmail) return;

  const { subject, html } = passwordResetSuccess({
    firstName,
    appUrl: APP_URL,
  });

  return sendEmail({ to: userEmail, subject, html });
};


module.exports = {
  notifyManagerRequestSubmitted,
  notifyEmployeeRequestApproved,
  notifyEmployeeRequestRejected,
  notifyManagerRequestCancelled,
  sendPasswordResetEmail,
  sendPasswordResetSuccess,
};