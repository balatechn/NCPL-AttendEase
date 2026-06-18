const cron = require('node-cron');
const { pgPool } = require('../config/database');
const logger = require('../utils/logger');

// Run at 11 PM every day — mark absent for employees with no attendance record on past working days
cron.schedule('0 23 * * *', async () => {
  logger.info('[CRON] Absent marking job triggered');
  try {
    const result = await pgPool.query(`
      INSERT INTO attendance (employee_id, attendance_date, status, source, created_at, updated_at)
      SELECT e.id, d.dt, 'absent', 'system', NOW(), NOW()
      FROM employees e
      CROSS JOIN (
        SELECT generate_series(
          CURRENT_DATE - INTERVAL '7 days',
          CURRENT_DATE - INTERVAL '1 day',
          '1 day'::interval
        )::date AS dt
      ) d
      WHERE e.is_active = true
        AND EXTRACT(DOW FROM d.dt) != 0
        AND NOT EXISTS (
          SELECT 1 FROM attendance a
          WHERE a.employee_id = e.id AND a.attendance_date = d.dt
        )
        AND NOT EXISTS (
          SELECT 1 FROM leaves l
          WHERE l.employee_id = e.id AND l.status = 'approved'
            AND d.dt >= l.start_date::date AND d.dt <= l.end_date::date
        )
        AND NOT EXISTS (
          SELECT 1 FROM public_holidays ph
          WHERE ph.holiday_date = d.dt AND ph.is_optional = false
        )
      ON CONFLICT (employee_id, attendance_date) DO NOTHING
    `);
    logger.info(`[CRON] Absent marking: ${result.rowCount} records inserted`);
  } catch (err) {
    logger.error('[CRON] Absent marking failed', err);
  }
});

// Also run once on startup to backfill any missing absent records
(async () => {
  try {
    const result = await pgPool.query(`
      INSERT INTO attendance (employee_id, attendance_date, status, source, created_at, updated_at)
      SELECT e.id, d.dt, 'absent', 'system', NOW(), NOW()
      FROM employees e
      CROSS JOIN (
        SELECT generate_series(
          DATE_TRUNC('month', CURRENT_DATE),
          CURRENT_DATE - INTERVAL '1 day',
          '1 day'::interval
        )::date AS dt
      ) d
      WHERE e.is_active = true
        AND EXTRACT(DOW FROM d.dt) != 0
        AND NOT EXISTS (
          SELECT 1 FROM attendance a
          WHERE a.employee_id = e.id AND a.attendance_date = d.dt
        )
        AND NOT EXISTS (
          SELECT 1 FROM leaves l
          WHERE l.employee_id = e.id AND l.status = 'approved'
            AND d.dt >= l.start_date::date AND d.dt <= l.end_date::date
        )
        AND NOT EXISTS (
          SELECT 1 FROM public_holidays ph
          WHERE ph.holiday_date = d.dt AND ph.is_optional = false
        )
      ON CONFLICT (employee_id, attendance_date) DO NOTHING
    `);
    logger.info(`[STARTUP] Absent backfill: ${result.rowCount} records inserted for current month`);
  } catch (err) {
    logger.error('[STARTUP] Absent backfill failed', err);
  }
})();

logger.info('Absent marking job scheduled: daily at 11 PM + startup backfill');
