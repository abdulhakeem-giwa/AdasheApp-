const Round = require("../models/Round");
const Transaction = require("../models/Transaction");
const Group = require("../models/Group");
const { notify } = require("./notify");

/**
 * Position-based deposit formula (agreed design: "earlier slot = higher
 * deposit"). A member's remaining risk to the group is the number of
 * rounds left AFTER they collect their own payout — that's exactly how
 * many rounds they could theoretically default on having already been paid.
 * Deposit scales linearly from the full base amount (position 1, maximum
 * remaining risk) down to 0 (the last position, zero remaining risk, since
 * there is nothing left to collect after their own round closes).
 *
 *   remainingRisk(position) = totalRounds - position
 *   maxRemainingRisk        = totalRounds - 1   (position 1's exposure)
 *   deposit(position) = baseAmount * remainingRisk(position) / maxRemainingRisk
 */
function computeDepositForPosition(baseAmount, position, totalRounds) {
  if (!baseAmount || totalRounds <= 1) return 0;
  const remainingRisk = totalRounds - position;
  const maxRemainingRisk = totalRounds - 1;
  const raw = (baseAmount * remainingRisk) / maxRemainingRisk;
  return Math.round(raw);
}

/**
 * Checks whether a member fully paid every round's contribution, and if
 * so, refunds their deposit (once, permanently). This is now a per-member
 * SAFETY CHECK, not the trigger itself — the actual trigger is the whole
 * group completing (see refundAllDepositsIfGroupComplete), per the agreed
 * design: refund waits for the organiser to confirm the very last payout,
 * not just for one member finishing their own contributions early.
 */
async function checkAndRefundDeposit(groupId, memberId) {
  const group = await Group.findById(groupId);
  if (!group || !group.depositEnabled) return null;

  const member = group.members.find((m) => m.user && m.user.equals(memberId));
  if (!member || !member.depositPaid || member.depositForfeited || member.depositRefunded) {
    return null; // nothing to refund, or already handled
  }

  const totalRounds = await Round.countDocuments({ group: groupId });
  if (totalRounds === 0) return null;

  const successfulContributions = await Transaction.countDocuments({
    group: groupId,
    member: memberId,
    type: "contribution",
    status: "success",
  });

  if (successfulContributions < totalRounds) return null; // still has rounds left to pay

  const lastRound = await Round.findOne({ group: groupId }).sort({ roundNumber: -1 });
  const refundAmount = member.depositAmount || group.depositAmount;

  await Transaction.create({
    group: groupId,
    round: lastRound._id,
    member: memberId,
    type: "deposit_refund",
    amount: refundAmount,
    status: "success",
    paidAt: new Date(),
  });

  member.depositRefunded = true;
  member.depositPaid = false;
  await group.save();

  await notify(
    memberId,
    groupId,
    "deposit_refunded",
    `Good news — your ₦${refundAmount.toLocaleString()} deposit for "${group.name}" has been refunded now that the group's full cycle is complete.`
  );

  return { refunded: true, amount: refundAmount };
}

/**
 * Called once the ORGANISER confirms the very last round's payout for the
 * whole group (see confirmPayout). Runs the per-member refund check above
 * for every active member — this is the actual refund trigger now, not
 * individual contribution success.
 */
async function refundAllDepositsIfGroupComplete(groupId) {
  const group = await Group.findById(groupId);
  if (!group || !group.depositEnabled) return { refunded: [] };

  const refunded = [];
  for (const member of group.members) {
    if (member.status !== "active" || !member.user) continue;
    const result = await checkAndRefundDeposit(groupId, member.user);
    if (result?.refunded) refunded.push(member.user);
  }
  return { refunded };
}

module.exports = { checkAndRefundDeposit, refundAllDepositsIfGroupComplete, computeDepositForPosition };
