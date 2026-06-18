const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const ctrl = require('../controllers/hrController');

router.use(authenticate, authorize('admin', 'hr'));

router.get('/daily', ctrl.getDailyAttendance);
router.get('/weekly', ctrl.getWeeklyAttendance);
router.get('/monthly', ctrl.getMonthlyAttendance);

module.exports = router;
