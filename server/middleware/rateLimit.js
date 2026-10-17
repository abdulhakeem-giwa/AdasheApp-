const rateLimit = require("express-rate-limit");

// Small, readable limiters for the endpoints attackers like to hammer.
// They count requests per IP address in memory, which is fine for a single
// server instance such as this project's deployment.
function limiter(windowMinutes, max, message) {
  return rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message },
  });
}

// Password guessing on login, and abuse of the reset flow.
const loginLimiter = limiter(15, 10, "Too many login attempts. Please wait 15 minutes and try again.");
// A 6-digit OTP has only a million possibilities, so guesses must be capped hard.
const otpVerifyLimiter = limiter(15, 8, "Too many code attempts. Please wait 15 minutes and request a new code.");
// Stops someone using resend/forgot to spam a phone number or inbox.
const otpSendLimiter = limiter(15, 5, "Too many requests for a new code. Please wait 15 minutes.");
// Mass account creation.
const registerLimiter = limiter(60, 20, "Too many sign-ups from this network. Please try again later.");

module.exports = { loginLimiter, otpVerifyLimiter, otpSendLimiter, registerLimiter };
