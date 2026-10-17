const crypto = require("crypto");
const User = require("../models/User");
const Group = require("../models/Group");
const generateToken = require("../utils/generateToken");
const { validatePasswordStrength } = require("../utils/passwordPolicy");
const { sendResetEmail } = require("../utils/email");
const { issueOtp, verifyOtp: checkOtp } = require("../utils/otp");
const { notify } = require("../utils/notify");

// Checks every group for a NAMED-INVITE placeholder matching this user's
// email/phone, and activates it immediately — this is what makes named
// invites work for someone who registers AFTER being invited.
async function activateMatchingInvites(user) {
  const orConditions = [];
  if (user.email) orConditions.push({ "members.invitedEmail": user.email });
  if (user.phone) orConditions.push({ "members.invitedPhone": user.phone });
  if (orConditions.length === 0) return;

  const groups = await Group.find({ $or: orConditions, "members.status": "invited" });
  for (const group of groups) {
    const placeholder = group.members.find(
      (m) =>
        m.status === "invited" &&
        !m.user &&
        ((m.invitedEmail && user.email && m.invitedEmail === user.email.toLowerCase()) ||
          (m.invitedPhone && user.phone && m.invitedPhone === user.phone))
    );
    if (placeholder) {
      placeholder.user = user._id;
      placeholder.status = "active";
      await group.save();
      await notify(user._id, group._id, "approved", `You've been added to "${group.name}" \u2014 you were personally invited by the organiser.`);
    }
  }
}

async function register(req, res) {
  try {
    const { name, email, phone, password } = req.body;

    if (!name || !password) {
      return res.status(400).json({ message: "name and password are required" });
    }
    if (!email && !phone) {
      return res.status(400).json({ message: "Provide either an email address or a phone number" });
    }

    const strength = validatePasswordStrength(password);
    if (!strength.valid) {
      return res.status(400).json({ message: strength.message });
    }

    const orConditions = [];
    if (email) orConditions.push({ email: email.toLowerCase() });
    if (phone) orConditions.push({ phone });
    const exists = await User.findOne({ $or: orConditions });
    if (exists) return res.status(409).json({ message: "An account with this email or phone number already exists" });

    const user = await User.create({ name, email: email || undefined, phone: phone || undefined, password });
    await activateMatchingInvites(user);

    // Registration no longer logs the user in immediately — they must
    // verify a one-time code first (see verifyOtp below).
    const otpResult = await issueOtp(user);
    await user.save();

    const response = {
      message: "Account created. Enter the verification code to activate it.",
      requiresVerification: true,
      userId: user._id,
    };
    if (otpResult.mocked) {
      // No real inbox/SMS to check in mock mode — return the code directly
      // so it's actually testable, clearly labeled as mock.
      response.mocked = true;
      response.otpCode = otpResult.code;
    }
    return res.status(201).json(response);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
}

// Login accepts EITHER an email or a phone number in the same "identifier" field.
async function login(req, res) {
  try {
    const { identifier, password } = req.body;
    if (!identifier || !password) {
      return res.status(400).json({ message: "identifier and password are required" });
    }

    const clean = identifier.trim();
    const user = await User.findOne({
      $or: [{ email: clean.toLowerCase() }, { phone: clean }],
    });

    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    if (!user.isVerified) {
      const otpResult = await issueOtp(user);
      await user.save();
      const response = {
        message: "This account hasn't been verified yet. A new verification code has been generated.",
        requiresVerification: true,
        userId: user._id,
      };
      if (otpResult.mocked) {
        response.mocked = true;
        response.otpCode = otpResult.code;
      }
      return res.status(403).json(response);
    }

    return res.json({
      user: user.toSafeObject(),
      token: generateToken(user._id),
    });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
}

async function me(req, res) {
  return res.json({ user: req.user.toSafeObject() });
}

// POST /api/auth/verify-otp  { userId, code }
async function verifyOtpCode(req, res) {
  try {
    const { userId, code } = req.body;
    if (!userId || !code) return res.status(400).json({ message: "userId and code are required" });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "Account not found" });
    if (user.isVerified) {
      return res.json({ message: "Already verified.", user: user.toSafeObject(), token: generateToken(user._id) });
    }

    const result = checkOtp(user, code.trim());
    if (!result.valid) return res.status(400).json({ message: result.message });

    user.isVerified = true;
    user.otpHash = undefined;
    user.otpExpires = undefined;
    await user.save();

    return res.json({
      message: "Account verified successfully.",
      user: user.toSafeObject(),
      token: generateToken(user._id),
    });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
}

// POST /api/auth/resend-otp  { userId }
async function resendOtp(req, res) {
  try {
    const { userId } = req.body;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "Account not found" });
    if (user.isVerified) return res.status(400).json({ message: "This account is already verified." });

    const otpResult = await issueOtp(user);
    await user.save();

    const response = { message: "A new verification code has been generated." };
    if (otpResult.mocked) {
      response.mocked = true;
      response.otpCode = otpResult.code;
    }
    return res.json(response);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
}

// POST /api/auth/forgot-password  { identifier }
async function forgotPassword(req, res) {
  try {
    const { identifier } = req.body;
    if (!identifier) return res.status(400).json({ message: "identifier is required" });

    const clean = identifier.trim();
    const user = await User.findOne({ $or: [{ email: clean.toLowerCase() }, { phone: clean }] });

    // Always respond the same way whether or not the account exists —
    // avoids leaking which emails/phones are registered.
    const genericResponse = { message: "If an account exists, password reset instructions have been generated." };

    if (!user) return res.json(genericResponse);
    if (!user.email) {
      // No email on file (phone-only account) — nothing to email a link to.
      // In a fuller build this would send an SMS OTP instead; for now the
      // user should contact support, since SMS-based reset is out of
      // scope (same reasoning as the mock notification system).
      return res.status(400).json({
        message: "This account has no email on file. Phone-based password reset isn't implemented yet — please contact support.",
      });
    }

    const rawToken = crypto.randomBytes(32).toString("hex");
    user.resetPasswordTokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    user.resetPasswordExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await user.save();

    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
    const resetLink = `${frontendUrl}/reset-password?id=${user._id}&token=${rawToken}`;

    const emailResult = await sendResetEmail(user.email, resetLink);

    if (emailResult.mocked) {
      // No real inbox to check in mock mode — return the link directly so
      // it's actually testable, clearly labeled as mock.
      return res.json({
        message: "MOCK MODE: no real email was sent. Use the link below directly.",
        mocked: true,
        resetLink: emailResult.resetLink,
      });
    }

    return res.json(genericResponse);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
}

// POST /api/auth/reset-password  { id, token, newPassword }
async function resetPassword(req, res) {
  try {
    const { id, token, newPassword } = req.body;
    if (!id || !token || !newPassword) {
      return res.status(400).json({ message: "id, token, and newPassword are required" });
    }

    const strength = validatePasswordStrength(newPassword);
    if (!strength.valid) return res.status(400).json({ message: strength.message });

    const user = await User.findById(id);
    if (!user || !user.resetPasswordTokenHash || !user.resetPasswordExpires) {
      return res.status(400).json({ message: "Invalid or expired reset link" });
    }
    if (user.resetPasswordExpires.getTime() < Date.now()) {
      return res.status(400).json({ message: "This reset link has expired. Please request a new one." });
    }

    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    if (tokenHash !== user.resetPasswordTokenHash) {
      return res.status(400).json({ message: "Invalid or expired reset link" });
    }

    user.password = newPassword; // re-hashed by the pre-save hook
    user.resetPasswordTokenHash = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    return res.json({ message: "Password reset successfully. You can now log in with your new password." });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
}

module.exports = { register, login, me, forgotPassword, resetPassword, verifyOtpCode, resendOtp };
