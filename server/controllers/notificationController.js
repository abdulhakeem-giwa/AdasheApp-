const Notification = require("../models/Notification");

// GET /api/notifications
async function getMyNotifications(req, res) {
  const notifications = await Notification.find({ user: req.user._id })
    .sort({ createdAt: -1 })
    .limit(100)
    .populate("group", "name");
  const unreadCount = await Notification.countDocuments({ user: req.user._id, read: false });
  return res.json({ notifications, unreadCount });
}

// PATCH /api/notifications/:id/read
async function markAsRead(req, res) {
  const notification = await Notification.findOne({ _id: req.params.id, user: req.user._id });
  if (!notification) return res.status(404).json({ message: "Notification not found" });
  notification.read = true;
  await notification.save();
  return res.json({ notification });
}

// PATCH /api/notifications/read-all
async function markAllAsRead(req, res) {
  await Notification.updateMany({ user: req.user._id, read: false }, { read: true });
  return res.json({ message: "All notifications marked as read" });
}

module.exports = { getMyNotifications, markAsRead, markAllAsRead };
