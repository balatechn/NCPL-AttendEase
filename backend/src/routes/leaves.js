const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const ctrl = require('../controllers/leaveController');

router.post('/apply', authenticate, ctrl.apply);
router.get('/my', authenticate, ctrl.getMyLeaves);
router.get('/my/balance', authenticate, ctrl.getMyBalance);

// Admin/HR routes
router.get('/employee/:employeeId', authenticate, authorize('admin', 'hr', 'manager'), ctrl.getEmployeeLeaves);
router.get('/pending', authenticate, authorize('admin', 'hr', 'manager'), ctrl.getPending);
router.patch('/:id/approve', authenticate, authorize('admin', 'hr', 'manager'), ctrl.approve);
router.patch('/:id/reject', authenticate, authorize('admin', 'hr', 'manager'), ctrl.reject);
router.patch('/:id/cancel', authenticate, ctrl.cancel);

module.exports = router;
