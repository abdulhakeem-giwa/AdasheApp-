const nodemailer = require("nodemailer");

// If real SMTP credentials aren't configured, default to mock mode: the
// reset link is returned directly in the API response instead of emailed,
// clearly labeled as mock — same honest pattern as MOCK_PAYMENTS for
// Paystack. No cost, no signup required to test the full flow.
const MOCK_EMAIL = process.env.MOCK_EMAIL !== "false"; // mock by default unless explicitly disabled
const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;

let transporter = null;
if (!MOCK_EMAIL && SMTP_HOST && SMTP_USER && SMTP_PASS) {
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
}

/**
 * Sends (or mocks) a password reset email.
 * Returns { mocked: true, resetLink } in mock mode so the caller can decide
 * what to show the user (there's no real inbox to check in mock mode).
 * Returns { mocked: false } after a real send.
 */
async function sendResetEmail(toEmail, resetLink) {
  if (MOCK_EMAIL || !transporter) {
    console.log(`[mock email] Password reset link for ${toEmail}: ${resetLink}`);
    return { mocked: true, resetLink };
  }

  await transporter.sendMail({
    from: `"Adashe" <${SMTP_USER}>`,
    to: toEmail,
    subject: "Reset your Adashe password",
    text: `Click this link to reset your password: ${resetLink}\n\nThis link expires in 1 hour.`,
  });
  return { mocked: false };
}

module.exports = { sendResetEmail, MOCK_EMAIL };
