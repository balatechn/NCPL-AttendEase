const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const ctrl = require('../controllers/regularizationController');

router.post('/apply', authenticate, ctrl.apply);
router.get('/my', authenticate, ctrl.getMyRequests);

router.get('/employee/:employeeId', authenticate, authorize('admin', 'hr', 'manager'), ctrl.getEmployeeRequests);
router.get('/pending', authenticate, authorize('admin', 'hr', 'manager'), ctrl.getPending);
router.patch('/:id/approve', authenticate, authorize('admin', 'hr', 'manager'), ctrl.approve);
router.patch('/:id/reject', authenticate, authorize('admin', 'hr', 'manager'), ctrl.reject);

module.exports = router;
