const crypto = require("crypto");
const nodemailer = require("nodemailer");
const { MOCK_EMAIL } = require("./email");

const OTP_EXPIRY_MINUTES = 10;

let transporter = null;
if (!MOCK_EMAIL && process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

function generateOtpCode() {
  // 6-digit numeric code, e.g. "042917"
  return String(crypto.randomInt(0, 1000000)).padStart(6, "0");
}

function hashOtp(code) {
  return crypto.createHash("sha256").update(code).digest("hex");
}

/**
 * Generates a fresh OTP, stores its hash + expiry on the user document
 * (caller is responsible for calling user.save()), and delivers it.
 * In mock mode (default), the code is returned directly in the API
 * response and logged to the server console — no real email/SMS is sent,
 * same honest pattern used throughout this project (MOCK_PAYMENTS,
 * MOCK_EMAIL). Real delivery only requires real SMTP creds; there's no
 * separate SMS provider integrated yet, so phone-only accounts also see
 * their OTP via the mock path until one is added (see README).
 */
async function issueOtp(user) {
  const code = generateOtpCode();
  user.otpHash = hashOtp(code);
  user.otpExpires = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

  if (MOCK_EMAIL || !transporter || !user.email) {
    console.log(`[mock otp] Verification code for ${user.email || user.phone}: ${code}`);
    return { mocked: true, code };
  }

  await transporter.sendMail({
    from: `"Adashe" <${process.env.SMTP_USER}>`,
    to: user.email,
    subject: "Verify your Adashe account",
    text: `Your verification code is ${code}. It expires in ${OTP_EXPIRY_MINUTES} minutes.`,
  });
  return { mocked: false };
}

function verifyOtp(user, code) {
  if (!user.otpHash || !user.otpExpires) return { valid: false, message: "No verification code was requested" };
  if (user.otpExpires.getTime() < Date.now()) return { valid: false, message: "This code has expired. Request a new one." };
  if (hashOtp(code) !== user.otpHash) return { valid: false, message: "Incorrect verification code" };
  return { valid: true };
}

module.exports = { issueOtp, verifyOtp, OTP_EXPIRY_MINUTES };
