const cron = require('node-cron');
const biometricService = require('../services/biometricService');
const logger = require('../utils/logger');

const intervalMinutes = parseInt(process.env.BIOMETRIC_SYNC_INTERVAL_MINUTES, 10) || 5;

// Schedule combined sync every N minutes: employees first, then attendance
cron.schedule(`*/${intervalMinutes} * * * *`, async () => {
  logger.info(`[CRON] Sync cycle triggered (every ${intervalMinutes} min)`);

  // Step 1: Sync employees from eSSL → PG
  try {
    const empResult = await biometricService.syncEmployees();
    logger.info('[CRON] Employee sync result', empResult);
  } catch (err) {
    logger.error('[CRON] Employee sync failed', err);
  }

  // Step 2: Sync attendance logs from eSSL → PG
  try {
    const attResult = await biometricService.syncBiometricLogs();
    logger.info('[CRON] Attendance sync result', attResult);
  } catch (err) {
    logger.error('[CRON] Attendance sync failed', err);
  }
});

logger.info(`Biometric sync job scheduled: every ${intervalMinutes} minutes (employees + attendance)`);
