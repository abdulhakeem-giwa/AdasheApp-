const mongoose = require("mongoose");

// The digital ledger. Every contribution, payout, deposit, refund, and
// forfeiture is one row here — this is what replaces the treasurer's notebook.
const transactionSchema = new mongoose.Schema(
  {
    group: { type: mongoose.Schema.Types.ObjectId, ref: "Group", required: true },
    round: { type: mongoose.Schema.Types.ObjectId, ref: "Round", required: true },
    member: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    type: {
      type: String,
      enum: ["contribution", "payout", "deposit", "deposit_refund", "deposit_forfeit"],
      required: true,
    },
    amount: { type: Number, required: true },
    status: {
      type: String,
      enum: ["pending", "success", "failed", "overdue"],
      default: "pending",
    },

    paystackReference: { type: String },
    paidAt: { type: Date },
    // Prevents the "due soon" reminder cron from notifying the same
    // pending contribution more than once.
    reminderSent: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Transaction", transactionSchema);
