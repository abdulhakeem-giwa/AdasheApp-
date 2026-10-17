const mongoose = require("mongoose");

// One Round = one rotation cycle: one due date, one recipient, one payout.
const roundSchema = new mongoose.Schema(
  {
    group: { type: mongoose.Schema.Types.ObjectId, ref: "Group", required: true },
    roundNumber: { type: Number, required: true },
    dueDate: { type: Date, required: true },
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    status: { type: String, enum: ["open", "closed"], default: "open" },
    payoutConfirmed: { type: Boolean, default: false },
    payoutConfirmedAt: { type: Date },

    // Grace period (days) after dueDate before a missed contribution is flagged overdue.
    gracePeriodDays: { type: Number, default: 2 },
  },
  { timestamps: true }
);

roundSchema.index({ group: 1, roundNumber: 1 }, { unique: true });

module.exports = mongoose.model("Round", roundSchema);
