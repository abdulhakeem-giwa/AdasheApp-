const Group = require("../models/Group");

// Loads the group by :id / :groupId param onto req.group.
async function loadGroup(req, res, next) {
  try {
    const groupId = req.params.groupId || req.params.id;
    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ message: "Group not found" });
    req.group = group;
    next();
  } catch (err) {
    return res.status(400).json({ message: "Invalid group id" });
  }
}

// Must be called after loadGroup. Restricts the route to the group's organiser.
function requireOrganiser(req, res, next) {
  if (!req.group.organiser.equals(req.user._id)) {
    return res.status(403).json({ message: "Only the group organiser can do this" });
  }
  next();
}

// Must be called after loadGroup. Restricts the route to an active member (or the organiser).
function requireActiveMember(req, res, next) {
  const isOrganiser = req.group.organiser.equals(req.user._id);
  const member = req.group.members.find((m) => m.user && m.user.equals(req.user._id));
  if (!isOrganiser && (!member || member.status !== "active")) {
    return res.status(403).json({ message: "You are not an active member of this group" });
  }
  next();
}

module.exports = { loadGroup, requireOrganiser, requireActiveMember };
