const Notification = require('../models/Notification');

exports.getMyNotifications = async (req, res, next) => {
  try {
    const { unreadOnly } = req.query;
    const notifications = await Notification.findByEmployee(req.user.id, {
      unreadOnly: unreadOnly === 'true',
    });
    res.json(notifications);
  } catch (err) {
    next(err);
  }
};

exports.getUnreadCount = async (req, res, next) => {
  try {
    const count = await Notification.getUnreadCount(req.user.id);
    res.json({ count });
  } catch (err) {
    next(err);
  }
};

exports.markRead = async (req, res, next) => {
  try {
    const { id } = req.params;
    await Notification.markRead(id, req.user.id);
    res.json({ message: 'Marked as read.' });
  } catch (err) {
    next(err);
  }
};

exports.markAllRead = async (req, res, next) => {
  try {
    await Notification.markAllRead(req.user.id);
    res.json({ message: 'All notifications marked as read.' });
  } catch (err) {
    next(err);
  }
};
