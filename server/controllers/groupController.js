const Group = require("../models/Group");
const User = require("../models/User");
const { generateRounds } = require("../utils/schedule");
const { computeDepositForPosition } = require("../utils/deposit");
const { notify } = require("../utils/notify");

// POST /api/groups
async function createGroup(req, res) {
  try {
    const {
      name,
      contributionAmount,
      frequency,
      weeklyDueDay,
      monthlyDueDay,
      depositEnabled,
      depositAmount,
      depositMethod,
      targetMemberCount,
      defaultThreshold,
      startDate,
    } = req.body;

    if (!name || !contributionAmount || !frequency) {
      return res.status(400).json({ message: "name, contributionAmount, and frequency are required" });
    }

    const group = await Group.create({
      name,
      organiser: req.user._id,
      contributionAmount,
      frequency,
      weeklyDueDay: frequency === "weekly" && weeklyDueDay !== undefined && weeklyDueDay !== "" ? Number(weeklyDueDay) : null,
      monthlyDueDay: frequency === "monthly" && monthlyDueDay ? monthlyDueDay : null, // number 1-28 or "last"
      depositEnabled: !!depositEnabled,
      depositAmount: depositEnabled ? depositAmount || contributionAmount : 0,
      depositMethod: depositMethod === "equal" ? "equal" : "formula",
      targetMemberCount: targetMemberCount || null,
      defaultThreshold: defaultThreshold || 3,
      startDate: startDate ? new Date(startDate) : new Date(),
      // The organiser is automatically an active member (position not yet set).
      members: [{ user: req.user._id, status: "active" }],
    });

    return res.status(201).json({ group });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
}

// GET /api/groups  (groups the logged-in user organises or belongs to)
async function myGroups(req, res) {
  const groups = await Group.find({
    $or: [{ organiser: req.user._id }, { "members.user": req.user._id }],
  }).sort({ createdAt: -1 });
  return res.json({ groups });
}

// GET /api/groups/:id
async function getGroup(req, res) {
  const group = await req.group.populate("members.user", "name email phone defaultCount");
  return res.json({ group });
}

// POST /api/groups/join  { joinCode, preferredSlot }
async function joinGroup(req, res) {
  try {
    const { joinCode, preferredSlot } = req.body;
    const group = await Group.findOne({ joinCode: (joinCode || "").toUpperCase() });
    if (!group) return res.status(404).json({ message: "Invalid join code" });

    // Block joining once the cycle has already started — a late join would
    // have no assigned round or payout order and end up in a broken state.
    if (group.orderFinalised) {
      return res.status(409).json({
        message: "This group's contribution cycle has already started. New members can't join until the current cycle completes.",
      });
    }

    if (
      group.targetMemberCount &&
      group.members.filter((m) => m.status === "active").length >= group.targetMemberCount
    ) {
      return res.status(409).json({ message: "This group has already reached its target number of members." });
    }

    const already = group.members.find((m) => m.user && m.user.equals(req.user._id));
    if (already) {
      if (group.organiser.equals(req.user._id)) {
        return res.status(409).json({ message: "You created this group, so you're already its organiser and an active member automatically." });
      }
      return res.status(409).json({ message: "You have already requested to join this group" });
    }

    // If the organiser had already sent a NAMED invite to this exact email
    // or phone, skip the pending-approval step entirely — the organiser
    // already explicitly vetted this contact.
    const invitePlaceholder = group.members.find(
      (m) =>
        m.status === "invited" &&
        !m.user &&
        ((m.invitedEmail && req.user.email && m.invitedEmail === req.user.email.toLowerCase()) ||
          (m.invitedPhone && req.user.phone && m.invitedPhone === req.user.phone))
    );

    if (invitePlaceholder) {
      invitePlaceholder.user = req.user._id;
      invitePlaceholder.status = "active";
      await group.save();
      await notify(req.user._id, group._id, "approved", `You've been added to "${group.name}" \u2014 you were personally invited by the organiser.`);
      return res.status(201).json({ message: "You were personally invited to this group \u2014 you're in immediately.", group });
    }

    group.members.push({
      user: req.user._id,
      status: "pending",
      memberRequestedSlot: preferredSlot || null,
    });
    await group.save();

    return res.status(201).json({ message: "Join request sent. Awaiting organiser approval.", group });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
}

// POST /api/groups/:id/invite  { email, phone }  (organiser only)
// Named invite: an explicit alternative/addition to the open join code.
// If the invited contact already has an account, they're added straight
// to "active" (organiser already vetted them by name). Otherwise a
// placeholder "invited" entry waits until someone registers or joins
// matching that exact email/phone.
async function inviteByContact(req, res) {
  try {
    const { email, phone } = req.body;
    if (!email && !phone) {
      return res.status(400).json({ message: "Provide an email or phone number to invite" });
    }
    if (req.group.orderFinalised) {
      return res.status(409).json({ message: "This group's cycle has already started \u2014 new invites can't be added until it completes." });
    }

    const normalisedEmail = email ? email.toLowerCase().trim() : null;
    const normalisedPhone = phone ? phone.trim() : null;

    const alreadyInvited = req.group.members.find(
      (m) =>
        (normalisedEmail && m.invitedEmail === normalisedEmail) ||
        (normalisedPhone && m.invitedPhone === normalisedPhone)
    );
    if (alreadyInvited) {
      return res.status(409).json({ message: "This contact has already been invited to this group" });
    }

    const existingUser = await User.findOne({
      $or: [normalisedEmail ? { email: normalisedEmail } : null, normalisedPhone ? { phone: normalisedPhone } : null].filter(Boolean),
    });

    if (existingUser) {
      const already = req.group.members.find((m) => m.user && m.user.equals(existingUser._id));
      if (already) return res.status(409).json({ message: "This person is already a member of this group" });

      req.group.members.push({
        user: existingUser._id,
        status: "active",
        invitedEmail: normalisedEmail,
        invitedPhone: normalisedPhone,
      });
      await req.group.save();
      await notify(existingUser._id, req.group._id, "approved", `You've been personally added to "${req.group.name}" by the organiser.`);
      return res.status(201).json({ message: "Existing user found and added directly as an active member.", group: req.group });
    }

    req.group.members.push({
      status: "invited",
      invitedEmail: normalisedEmail,
      invitedPhone: normalisedPhone,
    });
    await req.group.save();
    return res.status(201).json({
      message: "Invite recorded. This person will be added automatically once they register with this email/phone.",
      group: req.group,
    });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
}

// PATCH /api/groups/:id/members/:memberId  { action: "approve" | "decline" }  (organiser only)
async function reviewMember(req, res) {
  try {
    const { action } = req.body;
    const { memberId } = req.params;
    const member = req.group.members.find((m) => m.user && m.user.equals(memberId));
    if (!member) return res.status(404).json({ message: "Member not found in this group" });

    if (action === "approve") member.status = "active";
    else if (action === "decline") member.status = "declined";
    else return res.status(400).json({ message: "action must be 'approve' or 'decline'" });

    await req.group.save();

    if (action === "approve") {
      await notify(memberId, req.group._id, "approved", `You've been approved to join "${req.group.name}" on Adashe.`);
    }

    return res.json({ message: `Member ${action}d`, group: req.group });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
}

// PUT /api/groups/:id/order  { order: [userId, ...], forceStart?: boolean }  (organiser only)
// Finalises the payout order, computes each member's position-based
// deposit (if enabled), and generates the round schedule. Blocked if a
// targetMemberCount was set and hasn't been reached yet, unless the
// organiser explicitly overrides with forceStart.
async function setPayoutOrder(req, res) {
  try {
    const { order, forceStart } = req.body;
    if (!Array.isArray(order) || order.length === 0) {
      return res.status(400).json({ message: "order must be a non-empty array of user ids" });
    }

    const activeCount = req.group.members.filter((m) => m.status === "active").length;
    if (req.group.targetMemberCount && activeCount < req.group.targetMemberCount && !forceStart) {
      return res.status(409).json({
        message: `This group's target is ${req.group.targetMemberCount} members, but only ${activeCount} have joined so far.`,
        requiresConfirmation: true,
        activeCount,
        targetMemberCount: req.group.targetMemberCount,
      });
    }

    const totalRounds = order.length;
    order.forEach((userId, idx) => {
      const member = req.group.members.find((m) => m.user && m.user.equals(userId));
      if (!member) return;
      member.order = idx + 1;
      if (req.group.depositEnabled) {
        member.depositAmount =
          req.group.depositMethod === "equal"
            ? req.group.depositAmount
            : computeDepositForPosition(req.group.depositAmount, idx + 1, totalRounds);
      }
    });

    await req.group.save();
    const rounds = await generateRounds(req.group);

    return res.json({ message: "Payout order finalised and schedule generated", rounds });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
}

// PATCH /api/groups/:id/freeze  { action: "freeze" | "unfreeze" }  (organiser only)
// Whole-group freeze: pauses the group entirely (e.g. a serious dispute).
async function freezeGroup(req, res) {
  try {
    const { action } = req.body;
    if (action === "freeze") req.group.status = "paused";
    else if (action === "unfreeze") req.group.status = "active";
    else return res.status(400).json({ message: "action must be 'freeze' or 'unfreeze'" });

    await req.group.save();
    return res.json({ message: `Group ${action}d`, group: req.group });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
}

// PATCH /api/groups/:id/members/:memberId/freeze  { action: "freeze" | "unfreeze" }  (organiser only)
// Individual freeze: this member can't contribute, and if it's their turn to
// collect, payout confirmation for that round is blocked until unfrozen.
async function freezeMember(req, res) {
  try {
    const { action } = req.body;
    const { memberId } = req.params;
    const member = req.group.members.find((m) => m.user && m.user.equals(memberId));
    if (!member) return res.status(404).json({ message: "Member not found in this group" });

    if (action === "freeze") member.frozen = true;
    else if (action === "unfreeze") member.frozen = false;
    else return res.status(400).json({ message: "action must be 'freeze' or 'unfreeze'" });

    await req.group.save();
    return res.json({ message: `Member ${action}d`, group: req.group });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
}

// PATCH /api/groups/:id/my-preference  { slot: number }  (active member only)
async function submitPreference(req, res) {
  try {
    const { slot } = req.body;
    const member = req.group.members.find((m) => m.user && m.user.equals(req.user._id));
    if (!member) return res.status(403).json({ message: "You are not a member of this group" });
    if (req.group.orderFinalised) {
      return res.status(400).json({ message: "Payout order has already been finalised for this group" });
    }

    member.memberRequestedSlot = slot || null;
    await req.group.save();
    return res.json({ message: "Preference submitted", group: req.group });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
}

// GET /api/groups/:id/suggest-order  (organiser only)
// Always preference-aware now: members who submitted a requested slot are
// prioritised by that slot number; everyone else falls back to join order.
// (There's no upfront "mode" choice anymore — see Create Group changes.)
async function suggestOrder(req, res) {
  const active = req.group.members.filter((m) => m.status === "active");

  const withPref = active.filter((m) => m.memberRequestedSlot != null)
    .sort((a, b) => a.memberRequestedSlot - b.memberRequestedSlot);
  const withoutPref = active.filter((m) => m.memberRequestedSlot == null)
    .sort((a, b) => new Date(a.joinedAt) - new Date(b.joinedAt));
  const sorted = [...withPref, ...withoutPref];

  return res.json({ suggestedOrder: sorted.map((m) => m.user) });
}

// POST /api/groups/:id/start-new-rotation  (organiser only)
// Simple recurring-rotation support: reuses the SAME active members and the
// SAME payout order as the previous cycle (no editing of rules yet — that's
// scoped as a future enhancement). Only usable once the group has fully
// completed its current cycle.
async function startNewRotation(req, res) {
  try {
    const group = req.group;
    if (group.status !== "completed") {
      return res.status(400).json({ message: "Only a group whose current cycle has fully completed can start a new rotation." });
    }

    const active = group.members.filter((m) => m.status === "active");
    const totalRounds = active.length;
    if (totalRounds === 0) {
      return res.status(400).json({ message: "This group has no active members to start a new rotation with." });
    }

    for (const member of active) {
      member.depositPaid = false;
      member.depositForfeited = false;
      member.depositRefunded = false;
      member.defaultWarningFlagged = false;
      if (group.depositEnabled && member.order) {
        member.depositAmount =
          group.depositMethod === "equal"
            ? group.depositAmount
            : computeDepositForPosition(group.depositAmount, member.order, totalRounds);
      }
    }
    await group.save();

    const rounds = await generateRounds(group, { startDate: new Date() });

    for (const member of active) {
      if (member.user) {
        await notify(member.user, group._id, "new_rotation", `A new contribution cycle has started for "${group.name}", reusing the same members and payout order.`);
      }
    }

    return res.json({ message: "New rotation started, reusing the same members and payout order.", rounds });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
}

module.exports = {
  createGroup,
  myGroups,
  getGroup,
  joinGroup,
  inviteByContact,
  reviewMember,
  setPayoutOrder,
  freezeGroup,
  freezeMember,
  submitPreference,
  suggestOrder,
  startNewRotation,
};
