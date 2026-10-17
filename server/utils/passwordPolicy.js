// Strong password: 8+ chars, at least one uppercase, one lowercase, one
// number, and one symbol. Enforced here (server) as the source of truth —
// the frontend check is just for UX, since client-side validation alone
// can always be bypassed.
const STRONG_PASSWORD_REGEX =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

function validatePasswordStrength(password) {
  if (!password || typeof password !== "string") {
    return { valid: false, message: "Password is required" };
  }
  if (!STRONG_PASSWORD_REGEX.test(password)) {
    return {
      valid: false,
      message:
        "Password must be at least 8 characters and include an uppercase letter, a lowercase letter, a number, and a symbol",
    };
  }
  return { valid: true };
}

module.exports = { validatePasswordStrength, STRONG_PASSWORD_REGEX };
