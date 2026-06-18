const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const biometricService = require('../services/biometricService');

router.use(authenticate, authorize('admin'));

// Manually trigger attendance sync
router.post('/sync', async (req, res, next) => {
  try {
    const result = await biometricService.syncBiometricLogs();
    res.json({ message: 'Attendance sync completed', ...result });
  } catch (err) {
    next(err);
  }
});

// Manually trigger employee sync from eSSL
router.post('/sync-employees', async (req, res, next) => {
  try {
    const result = await biometricService.syncEmployees();
    res.json({ message: 'Employee sync completed', ...result });
  } catch (err) {
    next(err);
  }
});

// Manually trigger full sync (employees + attendance)
router.post('/sync-all', async (req, res, next) => {
  try {
    const empResult = await biometricService.syncEmployees();
    const attResult = await biometricService.syncBiometricLogs();
    res.json({
      message: 'Full sync completed',
      employees: empResult,
      attendance: attResult,
    });
  } catch (err) {
    next(err);
  }
});

// Get sync status
router.get('/status', async (req, res, next) => {
  try {
    const status = await biometricService.getSyncStatus();
    res.json(status);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
