const cron = require('node-cron');
const { pgPool } = require('../config/database');
const Notification = require('../models/Notification');
const logger = require('../utils/logger');

/**
 * Punch-Out Reminder Job
 * Runs every 30 minutes from 6 PM to 11 PM (covers all shift end times).
 * Finds employees who:
 *   1. Have punched IN today
 *   2. Have NOT punched OUT
 *   3. Their shift end_time has passed
 *   4. Haven't already been reminded today
 */

// Track reminders sent today to avoid spamming (reset at midnight)
let sentToday = new Set();

// Reset the set at midnight
cron.schedule('0 0 * * *', () => {
  sentToday = new Set();
  logger.info('[CRON] Punch-out reminder tracking reset for new day');
});

// Run every 30 minutes from 6 PM to 11 PM (Mon-Sat)
cron.schedule('*/30 18-23 * * 1-6', async () => {
  logger.info('[CRON] Punch-out reminder check triggered');

  try {
    const today = new Date().toISOString().slice(0, 10);
    const nowTime = new Date().toLocaleTimeString('en-GB', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });

    // Find employees who punched in but not out, and whose shift has ended
    const result = await pgPool.query(`
      SELECT 
        e.id AS employee_id,
        e.first_name,
        e.last_name,
        e.employee_code,
        e.email,
        a.punch_in,
        s.name AS shift_name,
        s.end_time AS shift_end
      FROM attendance a
      JOIN employees e ON a.employee_id = e.id
      LEFT JOIN shifts s ON e.shift_id = s.id
      WHERE a.attendance_date = $1
        AND a.punch_in IS NOT NULL
        AND a.punch_out IS NULL
        AND e.is_active = true
        AND s.end_time IS NOT NULL
        AND s.end_time <= $2::time
    `, [today, nowTime]);

    let sent = 0;
    for (const row of result.rows) {
      const key = `${row.employee_id}_${today}`;
      if (sentToday.has(key)) continue;

      await Notification.create({
        employee_id: row.employee_id,
        title: 'Punch-Out Reminder',
        message: `Hi ${row.first_name}, you punched in at ${row.punch_in} but haven't punched out yet. Your ${row.shift_name} shift ended at ${row.shift_end}. Please remember to punch out before leaving.`,
        type: 'warning',
        reference_type: 'attendance',
      });

      sentToday.add(key);
      sent++;
      logger.info(`[CRON] Punch-out reminder sent to ${row.first_name} ${row.last_name} (${row.employee_code})`);
    }

    logger.info(`[CRON] Punch-out reminders sent: ${sent}, already reminded: ${result.rows.length - sent}`);
  } catch (err) {
    logger.error('[CRON] Punch-out reminder job failed', err);
  }
});

logger.info('Punch-out reminder job scheduled: every 30 min (6 PM - 11 PM, Mon-Sat)');
