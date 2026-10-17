const User = require("../models/User");
const Notification = require("../models/Notification");

/**
 * Logs a MOCK notification — no real SMS/WhatsApp is sent. If the user has
 * a phone number on file, the channel is recorded as "whatsapp" (the most
 * common channel Adashe organisers already use); otherwise it's "in_app"
 * only. This mirrors how MOCK_PAYMENTS works for Paystack: fully testable,
 * clearly labeled as mock, no external cost or API key required.
 */
async function notify(userId, groupId, type, message) {
  try {
    const user = await User.findById(userId);
    const channel = user?.phone ? "whatsapp" : "in_app";
    await Notification.create({ user: userId, group: groupId, type, channel, message });
  } catch (err) {
    // Notifications are best-effort — a failure here should never break
    // the underlying action (approval, payment, etc.) that triggered it.
    console.error("Failed to create notification:", err.message);
  }
}

module.exports = { notify };
