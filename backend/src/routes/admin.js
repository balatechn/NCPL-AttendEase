const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const ctrl = require('../controllers/adminController');

router.use(authenticate, authorize('admin', 'hr'));

// Dashboard
router.get('/dashboard', ctrl.getDashboardStats);

// Employee CRUD
router.get('/employees', ctrl.getEmployees);
router.get('/managers', ctrl.getManagers);
router.post('/employees', ctrl.createEmployee);
router.put('/employees/:id', ctrl.updateEmployee);
router.delete('/employees/:id', ctrl.deactivateEmployee);

// Shifts
router.get('/shifts', ctrl.getShifts);
router.post('/shifts', ctrl.createShift);
router.put('/shifts/:id', ctrl.updateShift);
router.delete('/shifts/:id', ctrl.deleteShift);

// Attendance Override
router.patch('/attendance/:id/override', ctrl.overrideAttendance);

// Leave Balance Management
router.get('/leave-balances', ctrl.getLeaveBalances);
router.post('/leave-balance', ctrl.setLeaveBalance);
router.post('/leave-balance/bulk', ctrl.setBulkLeaveBalance);
router.get('/leave-balance-audit/:employeeId', ctrl.getLeaveBalanceAudit);

// Password & Welcome Email Management
router.get('/password-status', ctrl.getPasswordStatus);
router.post('/reset-employee-password/:employeeId', ctrl.resetEmployeePassword);
router.post('/send-welcome-email', ctrl.sendWelcomeEmail);

// Public Holidays
router.get('/holidays', ctrl.getHolidays);
router.post('/holidays', ctrl.createHoliday);
router.put('/holidays/:id', ctrl.updateHoliday);
router.delete('/holidays/:id', ctrl.deleteHoliday);
router.post('/holidays/bulk', ctrl.bulkImportHolidays);

module.exports = router;
