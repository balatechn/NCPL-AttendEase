const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const ctrl = require('../controllers/managerController');

router.use(authenticate, authorize('admin', 'hr', 'manager'));

router.get('/dashboard', ctrl.getDashboardStats);
router.get('/live-attendance', ctrl.getLiveAttendance);
router.get('/departments', ctrl.getDepartments);

module.exports = router;
