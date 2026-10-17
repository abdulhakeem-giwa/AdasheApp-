const mongoose = require("mongoose");

// A MOCK notification log — simulates what an SMS/WhatsApp message would
// have said, without actually sending one (same pattern as MOCK_PAYMENTS
// for Paystack). Fulfils the "real-time notifications" objective from the
// proposal, which was promised but never actually built until now.
const notificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    group: { type: mongoose.Schema.Types.ObjectId, ref: "Group" },
    type: {
      type: String,
      enum: [
        "due_soon", "overdue", "approved", "deposit_refunded", "deposit_forfeited",
        "payout_confirmed", "default_warning", "new_rotation", "otp",
      ],
      required: true,
    },
    // "whatsapp"/"sms" if the user has a phone on file (mock — nothing is
    // actually sent), otherwise falls back to in-app only.
    channel: { type: String, enum: ["whatsapp", "sms", "in_app"], default: "in_app" },
    message: { type: String, required: true },
    read: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Notification", notificationSchema);
