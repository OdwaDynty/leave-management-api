// ─── EMAIL CONFIGURATION ──────────────────────────────
// Sets up the Nodemailer transporter used to send all
// emails from the system. We use Gmail as the mail
// provider — works well for small to medium volumes.
//
// For production at scale consider switching to:
// - SendGrid (sendgrid.com) — 100 free emails/day
// - Mailgun  (mailgun.com)  — 1000 free emails/month
// - Brevo    (brevo.com)    — 300 free emails/day

const nodemailer = require('nodemailer');

// ─── CREATE TRANSPORTER ───────────────────────────────
// The transporter is the connection to the mail server
// We create it once and reuse it for every email
const transporter = nodemailer.createTransport({
  service: 'gmail', // Use Gmail's SMTP server

  auth: {
    user: process.env.EMAIL_FROM,       // Your Gmail address
    pass: process.env.EMAIL_PASSWORD,   // Your App Password
  },
});

// ─── VERIFY CONNECTION ────────────────────────────────
// On server start, confirm the email connection works
// Logs a success or error message to the console
const verifyEmailConnection = async () => {
  try {
    await transporter.verify();
    console.log('✅ Email service connected');
  } catch (err) {
    // Don't crash the server if email fails
    // Just warn — the API still works without email
    console.warn('⚠️  Email service not connected:', err.message);
    console.warn('    Check EMAIL_FROM and EMAIL_PASSWORD in .env');
  }
};

module.exports = { transporter, verifyEmailConnection };