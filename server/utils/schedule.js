const Round = require("../models/Round");
const Transaction = require("../models/Transaction");
const Group = require("../models/Group");
const User = require("../models/User");
const { notify } = require("./notify");

/**
 * Snaps a date forward to the group's configured due day, if one is set.
 * Weekly: snaps to the next occurrence of weeklyDueDay (0=Sun..6=Sat).
 * Monthly: snaps to monthlyDueDay (1-28), or the actual last day of the
 * month if monthlyDueDay === "last". If neither is configured, the date
 * is returned unchanged (backward-compatible with existing groups).
 */
function snapToConfiguredDay(date, group) {
  const d = new Date(date);

  if (group.frequency === "weekly" && group.weeklyDueDay !== null && group.weeklyDueDay !== undefined) {
    const currentDay = d.getDay();
    let diff = group.weeklyDueDay - currentDay;
    if (diff < 0) diff += 7;
    d.setDate(d.getDate() + diff);
    return d;
  }

  if (group.frequency === "monthly" && group.monthlyDueDay) {
    const year = d.getFullYear();
    const month = d.getMonth();
    let target =
      group.monthlyDueDay === "last" ? new Date(year, month + 1, 0) : new Date(year, month, group.monthlyDueDay);
    if (target < d) {
      target = group.monthlyDueDay === "last" ? new Date(year, month + 2, 0) : new Date(year, month + 1, group.monthlyDueDay);
    }
    return target;
  }

  return d;
}

function addInterval(date, group) {
  const d = new Date(date);
  if (group.frequency === "weekly") d.setDate(d.getDate() + 7);
  else d.setMonth(d.getMonth() + 1);
  return snapToConfiguredDay(d, group);
}

/**
 * Builds the Round documents once the organiser finalises the payout order.
 * This deliberately does NOT auto-generate the order itself (Objective 2 of
 * the proposal) — it just turns an organiser-approved order into a schedule
 * of due dates + expected recipients, and creates one "contribution" ledger
 * entry per active member per round.
 *
 * Supports being called again for a recurring rotation (see
 * groupController.startNewRotation): round numbers continue from the
 * highest existing one for this group rather than restarting at 1, and an
 * optional options.startDate lets the new cycle's first due date be based
 * on "today" rather than the group's original startDate.
 */
async function generateRounds(group, options = {}) {
  const orderedMembers = group.members
    .filter((m) => m.status === "active" && m.order !== null)
    .sort((a, b) => a.order - b.order);

  if (orderedMembers.length === 0) {
    throw new Error("No members have been assigned a payout order yet");
  }

  const existingMax = await Round.findOne({ group: group._id }).sort({ roundNumber: -1 });
  const startRoundNumber = existingMax ? existingMax.roundNumber + 1 : 1;

  let dueDate = snapToConfiguredDay(options.startDate || group.startDate || new Date(), group);
  const roundDocs = [];

  for (let i = 0; i < orderedMembers.length; i++) {
    const round = await Round.create({
      group: group._id,
      roundNumber: startRoundNumber + i,
      dueDate,
      recipient: orderedMembers[i].user,
    });

    // One pending contribution transaction per active member for this round.
    const txns = orderedMembers.map((m) => ({
      group: group._id,
      round: round._id,
      member: m.user,
      type: "contribution",
      amount: group.contributionAmount,
      status: "pending",
    }));
    await Transaction.insertMany(txns);

    roundDocs.push(round);
    dueDate = addInterval(dueDate, group);
  }

  group.orderFinalised = true;
  group.status = "active";
  await group.save();

  return roundDocs;
}

/**
 * Scans a round's contribution transactions and flags anyone still unpaid
 * past the grace period as overdue, incrementing their permanent default
 * count. Call this from a route (organiser-triggered) or a scheduled job —
 * see README for wiring this to node-cron.
 *
 * Deposit forfeiture (Option A — single-use safety net, matches Batool et
 * al.'s B-ROSCA collateral model cited in Chapter 2): a member's deposit is
 * ONLY forfeited the first time they default on a round that comes AFTER
 * the round where they themselves already collected their payout. An
 * ordinary late payment before a member's own turn does NOT touch the
 * deposit — that's just the normal overdue flag + default count.
 *
 * Default-threshold warning: this NEVER auto-freezes anyone. Once a
 * member's total default count crosses the group's defaultThreshold, the
 * ORGANISER gets a one-time warning notification so they can decide
 * whether to freeze that member manually.
 */
async function flagOverdueMembers(round) {
  const graceMs = round.gracePeriodDays * 24 * 60 * 60 * 1000;
  const cutoff = new Date(round.dueDate.getTime() + graceMs);
  if (Date.now() < cutoff.getTime()) {
    return { flagged: [], message: "Still within grace period" };
  }

  const unpaid = await Transaction.find({
    round: round._id,
    type: "contribution",
    status: "pending",
  });

  const group = await Group.findById(round.group);
  const flagged = [];
  const forfeited = [];
  let groupNeedsSave = false;

  for (const txn of unpaid) {
    txn.status = "overdue";
    await txn.save();
    const updatedUser = await User.findByIdAndUpdate(txn.member, { $inc: { defaultCount: 1 } }, { new: true });
    flagged.push(txn.member);

    if (group) {
      await notify(
        txn.member,
        group._id,
        "overdue",
        `Your contribution for Round ${round.roundNumber} in "${group.name}" is overdue. Please pay as soon as possible to avoid affecting your trust score.`
      );

      const memberDoc = group.members.find((m) => m.user && m.user.equals(txn.member));

      // Default-threshold warning to the organiser (not the member) — a
      // flag for human review, never an automatic freeze.
      if (
        memberDoc &&
        !memberDoc.defaultWarningFlagged &&
        updatedUser &&
        updatedUser.defaultCount >= (group.defaultThreshold || 3)
      ) {
        memberDoc.defaultWarningFlagged = true;
        groupNeedsSave = true;
        await notify(
          group.organiser,
          group._id,
          "default_warning",
          `Heads up: a member in "${group.name}" has now defaulted ${updatedUser.defaultCount} time(s), crossing your group's threshold of ${group.defaultThreshold}. Consider reviewing whether to freeze them.`
        );
      }

      // Has this member already collected their own payout in an earlier round?
      const theirOwnRound = await Round.findOne({ group: round.group, recipient: txn.member });
      const alreadyCollected =
        theirOwnRound && theirOwnRound.payoutConfirmed && theirOwnRound.roundNumber < round.roundNumber;

      if (alreadyCollected && memberDoc && group.depositEnabled && memberDoc.depositPaid && !memberDoc.depositForfeited) {
        await Transaction.create({
          group: group._id,
          round: round._id,
          member: txn.member,
          type: "deposit_forfeit",
          amount: group.depositAmount,
          status: "success",
          paidAt: new Date(),
        });
        memberDoc.depositForfeited = true;
        groupNeedsSave = true;
        forfeited.push(txn.member);

        await notify(
          txn.member,
          group._id,
          "deposit_forfeited",
          `Your ₦${(memberDoc.depositAmount || group.depositAmount).toLocaleString()} deposit for "${group.name}" has been forfeited due to a missed contribution after you already collected your payout.`
        );
      }
    }
  }

  if (group && groupNeedsSave) await group.save();

  return {
    flagged,
    forfeited,
    message: `${flagged.length} member(s) flagged overdue` + (forfeited.length ? `, ${forfeited.length} deposit(s) forfeited` : ""),
  };
}

/**
 * Sends a "due soon" reminder for any pending contribution whose round is
 * due within the next 24 hours, once per contribution (a `reminderSent`
 * flag on the transaction stops it firing repeatedly on every cron run).
 */
async function sendDueSoonReminders() {
  const soonCutoff = new Date(Date.now() + 24 * 60 * 60 * 1000);

  const upcomingRounds = await Round.find({ status: "open", dueDate: { $lte: soonCutoff, $gte: new Date() } });
  let remindersSent = 0;

  for (const round of upcomingRounds) {
    const group = await Group.findById(round.group);
    if (!group) continue;

    const pending = await Transaction.find({
      round: round._id,
      type: "contribution",
      status: "pending",
      reminderSent: { $ne: true },
    });

    for (const txn of pending) {
      await notify(
        txn.member,
        group._id,
        "due_soon",
        `Reminder: your ₦${txn.amount.toLocaleString()} contribution for "${group.name}" (Round ${round.roundNumber}) is due ${round.dueDate.toDateString()}.`
      );
      txn.reminderSent = true;
      await txn.save();
      remindersSent++;
    }
  }

  return { remindersSent };
}

/**
 * Runs flagOverdueMembers across every currently open round in the system,
 * and sends due-soon reminders. This is what the cron job
 * (server/cron/overdueChecker.js) calls on a schedule, so defaults get
 * flagged and reminders get sent automatically instead of depending on an
 * organiser remembering to click "Check overdue".
 */
async function checkAllOpenRounds() {
  const openRounds = await Round.find({ status: "open" });
  const results = [];
  for (const round of openRounds) {
    const result = await flagOverdueMembers(round);
    if (result.flagged.length > 0) {
      results.push({ round: round._id, group: round.group, ...result });
    }
  }
  const reminderResult = await sendDueSoonReminders();
  return {
    roundsChecked: openRounds.length,
    roundsWithNewFlags: results.length,
    remindersSent: reminderResult.remindersSent,
    details: results,
  };
}

module.exports = {
  generateRounds,
  flagOverdueMembers,
  checkAllOpenRounds,
  sendDueSoonReminders,
  addInterval,
  snapToConfiguredDay,
};
