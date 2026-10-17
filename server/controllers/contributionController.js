const Round = require("../models/Round");
const Transaction = require("../models/Transaction");
const Group = require("../models/Group");
const crypto = require("crypto");
const PDFDocument = require("pdfkit");
const { initializeTransaction, emailForPaystack } = require("../utils/paystack");
const { flagOverdueMembers } = require("../utils/schedule");
const { refundAllDepositsIfGroupComplete } = require("../utils/deposit");
const { notify } = require("../utils/notify");

// GET /api/groups/:id/ledger  — the shared, tamper-resistant record.
async function getLedger(req, res) {
  const rounds = await Round.find({ group: req.group._id }).sort({ roundNumber: 1 }).populate(
    "recipient",
    "name email"
  );
  const transactions = await Transaction.find({ group: req.group._id })
    .sort({ createdAt: -1 })
    .populate("member", "name email");

  // Per-round pot figures: what has ACTUALLY been collected (successful
  // contributions only) versus what the full round should bring in.
  const activeCount = req.group.members.filter((m) => m.status === "active").length;
  const expectedAmount = req.group.contributionAmount * activeCount;
  const roundsWithPot = rounds.map((r) => {
    const collectedAmount = transactions
      .filter((t) => String(t.round) === String(r._id) && t.type === "contribution" && t.status === "success")
      .reduce((sum, t) => sum + t.amount, 0);
    return { ...r.toObject(), collectedAmount, expectedAmount };
  });

  return res.json({ rounds: roundsWithPot, transactions });
}

// POST /api/rounds/:roundId/contribute
// Starts a Paystack transaction for the logged-in member's contribution
// for this round. Frontend redirects the member to `authorization_url`
// (unless MOCK_PAYMENTS=true, in which case it's confirmed immediately).
async function contribute(req, res) {
  try {
    const round = await Round.findById(req.params.roundId).populate("group");
    if (!round) return res.status(404).json({ message: "Round not found" });

    if (round.group.status === "paused") {
      return res.status(403).json({ message: "This group is currently frozen by the organiser" });
    }
    // Rounds are paid one at a time: only the earliest open round accepts
    // contributions, so the pot always belongs to the round being collected.
    const currentRound = await Round.findOne({ group: round.group._id, status: "open" }).sort({ roundNumber: 1 });
    if (!currentRound || String(currentRound._id) !== String(round._id)) {
      return res.status(409).json({
        message: round.status === "closed" ? "This round has already been paid out" : "This round is not open yet. Contributions open once the previous round has been paid out.",
      });
    }

    const member = round.group.members.find((m) => m.user && m.user.equals(req.user._id));
    if (member?.frozen) {
      return res.status(403).json({ message: "Your membership is currently frozen — contact the organiser" });
    }

    // Security/commitment deposit gate: if the group requires one and this
    // member's position carries a non-zero deposit, they must pay it
    // BEFORE participating in the main contribution cycle.
    if (round.group.depositEnabled && member && member.depositAmount > 0 && !member.depositPaid) {
      return res.status(403).json({
        message: `You must pay your security deposit (₦${member.depositAmount.toLocaleString()}) before you can contribute. Use the deposit prompt on the group page.`,
      });
    }

    const txn = await Transaction.findOne({
      round: round._id,
      member: req.user._id,
      type: "contribution",
    });
    if (!txn) return res.status(404).json({ message: "No contribution record found for you on this round" });
    if (txn.status === "success") return res.status(409).json({ message: "Already paid for this round" });

    const { authorization_url, reference, mocked } = await initializeTransaction({
      email: emailForPaystack(req.user),
      amount: txn.amount,
      metadata: { groupId: String(round.group._id), roundId: String(round._id), memberId: String(req.user._id) },
      callbackUrl: `${process.env.FRONTEND_URL || "http://localhost:5173"}/groups/${round.group._id}`,
    });

    txn.paystackReference = reference;
    if (mocked) {
      txn.status = "success";
      txn.paidAt = new Date();
    }
    await txn.save();

    // Note: deposit refund is NOT triggered here anymore. Per the agreed
    // design, refund waits for the WHOLE GROUP to complete (the organiser
    // confirming the very last payout) — see confirmPayout below — not for
    // an individual member finishing their own contributions early.

    return res.json({
      message: mocked ? "Payment mocked and marked as paid (MOCK_PAYMENTS=true)" : "Redirect member to authorization_url to complete payment",
      authorization_url,
      reference,
      transaction: txn,
    });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
}

// POST /api/groups/:id/deposit — pay the optional refundable deposit.
async function payDeposit(req, res) {
  try {
    const group = req.group;
    if (!group.depositEnabled) return res.status(400).json({ message: "This group does not require a deposit" });

    const member = group.members.find((m) => m.user && m.user.equals(req.user._id));
    if (!member) return res.status(403).json({ message: "You are not a member of this group" });
    if (member.depositPaid) return res.status(409).json({ message: "Deposit already paid" });

    // Deposit amount is position-based and only known once the organiser
    // has finalised the payout order (see setPayoutOrder / computeDepositForPosition).
    if (!group.orderFinalised) {
      return res.status(400).json({
        message: "The payout order hasn't been finalised yet, so your deposit amount isn't determined. Ask the organiser to finalise the order first.",
      });
    }

    const depositAmount = member.depositAmount;
    if (!depositAmount || depositAmount <= 0) {
      return res.status(200).json({ message: "Your position in the rotation requires no deposit (you collect last, so there is no remaining risk to cover)." });
    }

    const firstRound = await Round.findOne({ group: group._id }).sort({ roundNumber: 1 });
    if (!firstRound) return res.status(400).json({ message: "Schedule has not been generated yet" });

    const { authorization_url, reference, mocked } = await initializeTransaction({
      email: emailForPaystack(req.user),
      amount: depositAmount,
      metadata: { groupId: String(group._id), memberId: String(req.user._id), purpose: "deposit" },
      callbackUrl: `${process.env.FRONTEND_URL || "http://localhost:5173"}/groups/${group._id}`,
    });

    const txn = await Transaction.create({
      group: group._id,
      round: firstRound._id,
      member: req.user._id,
      type: "deposit",
      amount: depositAmount,
      status: mocked ? "success" : "pending",
      paystackReference: reference,
      paidAt: mocked ? new Date() : undefined,
    });

    if (mocked) {
      member.depositPaid = true;
      await group.save();
    }

    return res.json({ authorization_url, reference, transaction: txn });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
}

// PATCH /api/rounds/:roundId/confirm-payout  (organiser only)
// Organiser-confirmed payout, per the proposal's scope (no automated disbursement).
async function confirmPayout(req, res) {
  try {
    const round = await Round.findById(req.params.roundId);
    if (!round) return res.status(404).json({ message: "Round not found" });
    if (String(round.group) !== String(req.group._id)) {
      return res.status(400).json({ message: "Round does not belong to this group" });
    }

    if (round.status === "closed" || round.payoutConfirmed) {
      return res.status(409).json({ message: "This round has already been paid out" });
    }
    const earliestOpen = await Round.findOne({ group: req.group._id, status: "open" }).sort({ roundNumber: 1 });
    if (earliestOpen && String(earliestOpen._id) !== String(round._id)) {
      return res.status(409).json({ message: `Round ${earliestOpen.roundNumber} must be paid out first.` });
    }

    // The payout is whatever was actually collected for this round.
    const paidTxns = await Transaction.find({ round: round._id, type: "contribution", status: "success" });
    const collected = paidTxns.reduce((sum, t) => sum + t.amount, 0);
    const expected = req.group.contributionAmount * req.group.members.filter((m) => m.status === "active").length;
    if (collected < expected && !(req.body && req.body.allowPartial)) {
      return res.status(409).json({
        message: `Only ₦${collected.toLocaleString()} of ₦${expected.toLocaleString()} has been collected for this round.`,
        collected,
        expected,
        partialPossible: true,
      });
    }
    if (collected <= 0) {
      return res.status(400).json({ message: "Nothing has been collected for this round yet, so there is nothing to pay out." });
    }

    const recipientMember = req.group.members.find((m) => m.user && m.user.equals(round.recipient));
    if (recipientMember?.frozen) {
      return res.status(403).json({
        message: "This round's recipient is currently frozen. Unfreeze them or resolve the issue before confirming payout.",
      });
    }

    round.payoutConfirmed = true;
    round.payoutConfirmedAt = new Date();
    round.status = "closed";
    await round.save();

    const payoutAmount = collected;

    await Transaction.create({
      group: round.group,
      round: round._id,
      member: round.recipient,
      type: "payout",
      amount: payoutAmount,
      status: "success",
      paidAt: new Date(),
    });

    await notify(
      round.recipient,
      req.group._id,
      "payout_confirmed",
      `Your payout of ₦${payoutAmount.toLocaleString()} for "${req.group.name}" (Round ${round.roundNumber}) has been confirmed by the organiser.`
    );

    // Was this the LAST round for the group? If so, the whole cycle is now
    // complete — this is the trigger point for deposit refunds, per the
    // agreed design (whole-group, not per-member-early-completion).
    const totalRounds = await Round.countDocuments({ group: req.group._id });
    const closedRounds = await Round.countDocuments({ group: req.group._id, status: "closed" });

    let groupCompleted = false;
    let refundResult = { refunded: [] };
    if (closedRounds >= totalRounds) {
      req.group.status = "completed";
      await req.group.save();
      groupCompleted = true;
      refundResult = await refundAllDepositsIfGroupComplete(req.group._id);
    }

    return res.json({
      message: "Payout confirmed and logged to the ledger" + (groupCompleted ? " — this was the final round; group marked completed and eligible deposits refunded." : ""),
      round,
      groupCompleted,
      depositsRefunded: refundResult.refunded.length,
    });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
}

// POST /api/rounds/:roundId/check-overdue  (organiser only)
// Flags anyone past the grace period as overdue. In production, wire this
// to a scheduled job (see README) instead of calling it manually.
async function checkOverdue(req, res) {
  try {
    const round = await Round.findById(req.params.roundId);
    if (!round) return res.status(404).json({ message: "Round not found" });
    const result = await flagOverdueMembers(round);
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
}

// GET /api/groups/:id/ledger/pdf
// Downloadable ledger statement. NOTE: this is a well-formed, tamper-evident
// STATEMENT — not a claim of formal legal admissibility, which depends on
// far more than a PDF (see README). The SHA-256 hash lets anyone verify
// later that the exported content hasn't been altered since generation.
async function downloadLedgerPdf(req, res) {
  try {
    const group = req.group;
    const rounds = await Round.find({ group: group._id }).sort({ roundNumber: 1 }).populate("recipient", "name email");
    const transactions = await Transaction.find({ group: group._id })
      .sort({ createdAt: 1 })
      .populate("member", "name email");

    const contentForHash = JSON.stringify(
      transactions.map((t) => ({ id: t._id, member: t.member._id, type: t.type, amount: t.amount, status: t.status, createdAt: t.createdAt }))
    );
    const integrityHash = crypto.createHash("sha256").update(contentForHash).digest("hex");
    const generatedAt = new Date();
    const reference = `ADASHE-${group._id.toString().slice(-6).toUpperCase()}-${generatedAt.getTime().toString().slice(-6)}`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="ledger-${group.name.replace(/\s+/g, "_")}.pdf"`);

    const doc = new PDFDocument({ margin: 50, size: "A4" });
    doc.pipe(res);

    // Header
    doc.fontSize(18).font("Helvetica-Bold").text("ADASHE DIGITAL CONTRIBUTION SYSTEM", { align: "center" });
    doc.fontSize(11).font("Helvetica").fillColor("#555").text("Ledger Statement", { align: "center" });
    doc.moveDown(1.2);
    doc.fillColor("#000");

    // Meta block
    doc.fontSize(10).font("Helvetica-Bold").text("Group: ", { continued: true }).font("Helvetica").text(group.name);
    doc.font("Helvetica-Bold").text("Reference: ", { continued: true }).font("Helvetica").text(reference);
    doc.font("Helvetica-Bold").text("Generated: ", { continued: true }).font("Helvetica").text(generatedAt.toString());
    doc.font("Helvetica-Bold").text("Contribution amount: ", { continued: true }).font("Helvetica").text(`NGN ${group.contributionAmount.toLocaleString()} (${group.frequency})`);
    doc.moveDown(1);

    // Table header
    const startX = 50;
    let y = doc.y;
    const colWidths = [90, 100, 90, 70, 70, 85];
    const headers = ["Date", "Member", "Type", "Amount", "Status", "Round"];

    function drawRow(cells, opts = {}) {
      let x = startX;
      cells.forEach((cell, i) => {
        doc.font(opts.bold ? "Helvetica-Bold" : "Helvetica").fontSize(9).text(String(cell), x, y, { width: colWidths[i], ellipsis: true });
        x += colWidths[i];
      });
      y += 18;
      if (y > 740) {
        doc.addPage();
        y = 50;
      }
    }

    drawRow(headers, { bold: true });
    doc.moveTo(startX, y).lineTo(startX + colWidths.reduce((a, b) => a + b, 0), y).strokeColor("#ccc").stroke();
    y += 4;

    transactions.forEach((t) => {
      const round = rounds.find((r) => String(r._id) === String(t.round));
      drawRow([
        new Date(t.createdAt).toLocaleDateString(),
        t.member?.name || "Unknown",
        t.type.replace("_", " "),
        `NGN ${t.amount.toLocaleString()}`,
        t.status,
        round ? `#${round.roundNumber}` : "-",
      ]);
    });

    // Footer with integrity hash
    doc.moveDown(2);
    doc.fontSize(8).fillColor("#777").font("Helvetica").text(
      `Integrity hash (SHA-256) of the transaction records above at time of generation:\n${integrityHash}`,
      startX,
      Math.min(y + 20, 760),
      { width: 495 }
    );
    doc.moveDown(0.5);
    doc.text(
      "This document is a system-generated statement of account intended for record-keeping and dispute-resolution purposes. It is not, by itself, a certified legal instrument.",
      { width: 495 }
    );

    doc.end();
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
}

module.exports = { getLedger, contribute, payDeposit, confirmPayout, checkOverdue, downloadLedgerPdf };
