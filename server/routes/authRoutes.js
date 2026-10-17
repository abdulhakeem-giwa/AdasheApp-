const express = require("express");
const { register, login, me, forgotPassword, resetPassword, verifyOtpCode, resendOtp } = require("../controllers/authController");
const { protect } = require("../middleware/auth");
const { loginLimiter, otpVerifyLimiter, otpSendLimiter, registerLimiter } = require("../middleware/rateLimit");

const router = express.Router();

router.post("/register", registerLimiter, register);
router.post("/login", loginLimiter, login);
router.get("/me", protect, me);
router.post("/forgot-password", otpSendLimiter, forgotPassword);
router.post("/reset-password", loginLimiter, resetPassword);
router.post("/verify-otp", otpVerifyLimiter, verifyOtpCode);
router.post("/resend-otp", otpSendLimiter, resendOtp);

module.exports = router;
