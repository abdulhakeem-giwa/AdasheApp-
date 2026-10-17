const mongoose = require("mongoose");
const crypto = require("crypto");

const memberSchema = new mongoose.Schema(
  {
    // Optional until a named-invite placeholder is matched to a real account.
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    // "invited"  = named invite sent, no matching account yet (placeholder)
    // "pending"  = joined via open code/link, awaiting organiser approval
    // "active"   = confirmed member
    // "declined" = organiser rejected the join request
    status: {
      type: String,
      enum: ["invited", "pending", "active", "declined"],
      default: "pending",
    },
    // For named invites sent before the person has an account yet.
    invitedEmail: { type: String, lowercase: true, trim: true },
    invitedPhone: { type: String, trim: true },

    // Payout position, set by the organiser (or informed by memberRequestedSlot).
    // Null until the organiser finalises the rotation order.
    order: { type: Number, default: null },
    memberRequestedSlot: { type: Number, default: null },

    depositPaid: { type: Boolean, default: false },
    // Computed once the payout order is finalised (see utils/deposit.js):
    // scales from the group's base depositAmount (first position, highest
    // remaining risk) down to 0 (last position, no remaining risk).
    depositAmount: { type: Number, default: 0 },
    // Set once, permanently, the first time this member defaults AFTER
    // already collecting their payout (Option A: single-use safety net).
    depositForfeited: { type: Boolean, default: false },
    // Set once the WHOLE GROUP has completed its cycle (every payout
    // confirmed) and this member had fully paid — refund is gated at the
    // group level, not per-member completion (see confirmPayout).
    depositRefunded: { type: Boolean, default: false },
    // Set once the organiser has been warned this member crossed the
    // group's defaultThreshold, so the warning doesn't repeat every time.
    defaultWarningFlagged: { type: Boolean, default: false },
    // Individual freeze: blocks this member from contributing and blocks
    // payout confirmation if it's their turn to collect — group keeps running.
    frozen: { type: Boolean, default: false },
    joinedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const groupSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    organiser: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    contributionAmount: { type: Number, required: true, min: 1 },
    frequency: { type: String, enum: ["weekly", "monthly"], required: true },
    // Weekly: 0 (Sunday) - 6 (Saturday). Monthly: 1-28, or "last" for the
    // last day of the month. Used to compute each round's exact due date
    // instead of an arbitrary interval from whenever the group was created.
    weeklyDueDay: { type: Number, min: 0, max: 6, default: null },
    monthlyDueDay: { type: mongoose.Schema.Types.Mixed, default: null }, // Number 1-28 or the string "last"

    // Kept for backward compatibility with existing groups; no longer set
    // from the Create Group form. Payout order is now always organiser-
    // controlled, informed by member preferences when present, with no
    // upfront mode choice required.
    payoutOrderMethod: { type: String, enum: ["organiser", "preference"], default: "preference" },

    // Optional security/commitment deposit toggle (off by default),
    // discussed for the "collect and run" risk. See utils/deposit.js for
    // the position-based formula.
    depositEnabled: { type: Boolean, default: false },
    depositAmount: { type: Number, default: 0 },
    // "formula" = position-based, scales from full amount (first
    // collector, highest remaining risk) down to 0 (last collector).
    // "equal" = every active member pays the same depositAmount,
    // regardless of payout position — simpler, organiser's choice.
    depositMethod: { type: String, enum: ["formula", "equal"], default: "formula" },

    // Optional. If set, "Finalise order" is blocked until this many active
    // members exist, unless the organiser explicitly overrides (forceStart).
    targetMemberCount: { type: Number, default: null },

    // How many defaults a member can rack up before the ORGANISER is
    // warned. This never auto-freezes anyone — it's a flag for the
    // organiser to review and decide, per the agreed design.
    defaultThreshold: { type: Number, default: 3 },

    joinCode: { type: String, unique: true },
    members: [memberSchema],

    startDate: { type: Date },
    orderFinalised: { type: Boolean, default: false },

    status: { type: String, enum: ["setup", "active", "paused", "completed"], default: "setup" },
  },
  { timestamps: true }
);

groupSchema.pre("validate", function (next) {
  if (!this.joinCode) {
    this.joinCode = "ADASHE-" + crypto.randomBytes(3).toString("hex").toUpperCase();
  }
  next();
});

module.exports = mongoose.model("Group", groupSchema);
