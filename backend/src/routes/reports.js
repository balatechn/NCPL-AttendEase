const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const ctrl = require('../controllers/reportController');

router.get('/attendance', authenticate, authorize('admin', 'hr', 'manager'), ctrl.attendanceReport);
router.get('/leaves', authenticate, authorize('admin', 'hr', 'manager'), ctrl.leaveReport);
router.get('/summary', authenticate, authorize('admin', 'hr', 'manager'), ctrl.summaryReport);

module.exports = router;
