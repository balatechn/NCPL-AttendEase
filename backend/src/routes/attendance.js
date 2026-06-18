const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const ctrl = require('../controllers/attendanceController');
const Holiday = require('../models/Holiday');

router.get('/my', authenticate, ctrl.getMyAttendance);
router.get('/my/range', authenticate, ctrl.getMyAttendanceRange);
router.get('/my/summary', authenticate, ctrl.getMySummary);
router.get('/my/dashboard', authenticate, ctrl.getDashboard);

// Public holidays — any authenticated user
router.get('/holidays', authenticate, async (req, res, next) => {
  try {
    const year = req.query.year || new Date().getFullYear();
    const holidays = await Holiday.findAll(year);
    res.json(holidays);
  } catch (err) { next(err); }
});

// Admin/Manager routes
router.get('/employees/list', authenticate, authorize('admin', 'hr', 'manager'), ctrl.getEmployeeList);
router.get('/all', authenticate, authorize('admin', 'hr'), ctrl.getAllByDate);
router.get('/employee/:employeeId', authenticate, authorize('admin', 'hr', 'manager'), ctrl.getEmployeeAttendance);
router.patch('/:id/override', authenticate, authorize('admin', 'hr'), ctrl.overrideAttendance);

module.exports = router;
