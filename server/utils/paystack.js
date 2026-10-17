const crypto = require("crypto");

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;
// When true, contributions are marked successful immediately, without calling
// the real Paystack API. Useful for local testing/demos without live keys.
const MOCK_PAYMENTS = process.env.MOCK_PAYMENTS === "true";

/**
 * Paystack requires an email to initialize a transaction. Phone-only users
 * (no email on file — e.g. market traders registering without a smartphone
 * email) don't have one, so we generate a stable placeholder that's never
 * shown to them and never used for anything except satisfying Paystack's
 * API requirement.
 */
function emailForPaystack(user) {
  if (user.email) return user.email;
  const idPart = (user.phone || user._id.toString()).replace(/\D/g, "");
  return `phone.${idPart}@no-email.adashe.local`;
}

/**
 * Initializes a Paystack transaction. Amount is in Naira; Paystack expects kobo.
 * Returns { authorization_url, reference } that the frontend redirects the
 * member to, so they can complete payment on Paystack's hosted checkout.
 */
async function initializeTransaction({ email, amount, metadata, callbackUrl }) {
  if (MOCK_PAYMENTS) {
    const reference = "MOCK-" + crypto.randomBytes(8).toString("hex");
    return { authorization_url: null, reference, mocked: true };
  }

  if (!PAYSTACK_SECRET) {
    throw new Error("PAYSTACK_SECRET_KEY is not set. Set MOCK_PAYMENTS=true to test without it.");
  }

  const res = await fetch("https://api.paystack.co/transaction/initialize", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${PAYSTACK_SECRET}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      amount: Math.round(amount * 100), // Naira -> kobo
      metadata,
      // After paying, Paystack sends the member back to the app instead of
      // leaving them on Paystack's own page.
      ...(callbackUrl ? { callback_url: callbackUrl } : {}),
    }),
  });

  const data = await res.json();
  if (!data.status) {
    throw new Error(data.message || "Failed to initialize Paystack transaction");
  }
  return {
    authorization_url: data.data.authorization_url,
    reference: data.data.reference,
    mocked: false,
  };
}

/**
 * Verifies that a webhook request genuinely came from Paystack.
 * Paystack signs the raw request body with your secret key (HMAC SHA512)
 * and sends it in the x-paystack-signature header. Always verify this
 * before trusting a webhook payload.
 */
function verifyWebhookSignature(rawBody, signatureHeader) {
  if (MOCK_PAYMENTS) return true; // skip verification in local mock mode
  if (!PAYSTACK_SECRET || !signatureHeader) return false;
  const hash = crypto.createHmac("sha512", PAYSTACK_SECRET).update(rawBody).digest("hex");
  return hash === signatureHeader;
}

module.exports = { initializeTransaction, verifyWebhookSignature, emailForPaystack, MOCK_PAYMENTS };
