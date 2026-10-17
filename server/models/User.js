const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    // Either email OR phone is required (enforced in pre-validate below),
    // not both — so users without a smartphone/email (e.g. market traders)
    // can still register using just a phone number.
    email: { type: String, unique: true, sparse: true, lowercase: true, trim: true },
    phone: { type: String, unique: true, sparse: true, trim: true },
    password: { type: String, required: true, minlength: 6 },
    // Reputation: incremented whenever this user is flagged as a defaulter
    // in ANY group. Visible to organisers approving them into a new group.
    defaultCount: { type: Number, default: 0 },
    // Password reset support. The token itself is hashed at rest (never
    // stored in plain text), same principle as the password field.
    resetPasswordTokenHash: { type: String },
    resetPasswordExpires: { type: Date },
    // OTP verification at registration. Same "hash at rest, mock by
    // default" pattern as password reset — see utils/otp.js.
    isVerified: { type: Boolean, default: false },
    otpHash: { type: String },
    otpExpires: { type: Date },
  },
  { timestamps: true }
);

userSchema.pre("validate", function (next) {
  if (!this.email && !this.phone) {
    return next(new Error("Provide either an email address or a phone number"));
  }
  next();
});

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

// Trust score: starts at 100, loses 15 points per past default, floored at 0.
// Computed from data already tracked (defaultCount) — no new tracking needed.
// Mirrors the "automated creditworthiness scoring" concept from Sharma &
// Chandrakar's TruChit paper (cited in Chapter 2), in a lightweight form.
userSchema.virtual("trustScore").get(function () {
  return Math.max(0, 100 - this.defaultCount * 15);
});
userSchema.set("toJSON", { virtuals: true });
userSchema.set("toObject", { virtuals: true });

userSchema.methods.toSafeObject = function () {
  return {
    id: this._id,
    name: this.name,
    email: this.email,
    phone: this.phone,
    defaultCount: this.defaultCount,
    trustScore: this.trustScore,
    isVerified: this.isVerified,
  };
};

module.exports = mongoose.model("User", userSchema);
