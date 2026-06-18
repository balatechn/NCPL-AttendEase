const cron = require('node-cron');
const { pgPool } = require('../config/database');
const logger = require('../utils/logger');

// Run on 1st of every month at 1:00 AM
cron.schedule('0 1 1 * *', async () => {
  logger.info('[CRON] Monthly leave accrual triggered');
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1; // 1-12

  try {
    // Get all active employees
    const employees = await pgPool.query(`SELECT id FROM employees WHERE is_active = true`);

    let casualCount = 0;
    let sickCount = 0;
    let earnedCount = 0;

    for (const emp of employees.rows) {
      // --- Casual leave: +1 per month, cap at 12/year ---
      const casualBal = await pgPool.query(
        `SELECT total_allowed FROM leave_balance WHERE employee_id = $1 AND year = $2 AND leave_type = 'casual'`,
        [emp.id, year]
      );
      const currentCasual = casualBal.rows.length > 0 ? parseInt(casualBal.rows[0].total_allowed, 10) : 0;
      if (currentCasual < 12) {
        await pgPool.query(
          `INSERT INTO leave_balance (employee_id, year, leave_type, total_allowed, used)
           VALUES ($1, $2, 'casual', 1, 0)
           ON CONFLICT (employee_id, year, leave_type)
           DO UPDATE SET total_allowed = LEAST(leave_balance.total_allowed + 1, 12), updated_at = NOW()`,
          [emp.id, year]
        );
        casualCount++;
      }

      // --- Sick leave: +1 per month, cap at 12/year ---
      const sickBal = await pgPool.query(
        `SELECT total_allowed FROM leave_balance WHERE employee_id = $1 AND year = $2 AND leave_type = 'sick'`,
        [emp.id, year]
      );
      const currentSick = sickBal.rows.length > 0 ? parseInt(sickBal.rows[0].total_allowed, 10) : 0;
      if (currentSick < 12) {
        await pgPool.query(
          `INSERT INTO leave_balance (employee_id, year, leave_type, total_allowed, used)
           VALUES ($1, $2, 'sick', 1, 0)
           ON CONFLICT (employee_id, year, leave_type)
           DO UPDATE SET total_allowed = LEAST(leave_balance.total_allowed + 1, 12), updated_at = NOW()`,
          [emp.id, year]
        );
        sickCount++;
      }

      // --- Earned leave: 1 per 20 days worked (cumulative) ---
      // Count total present days this year so far
      const presentResult = await pgPool.query(
        `SELECT COUNT(*) as present_days FROM attendance
         WHERE employee_id = $1
         AND EXTRACT(YEAR FROM attendance_date) = $2
         AND status IN ('present', 'half-day')`,
        [emp.id, year]
      );
      const presentDays = parseInt(presentResult.rows[0].present_days, 10);
      const earnedEntitlement = Math.floor(presentDays / 20);

      const earnedBal = await pgPool.query(
        `SELECT total_allowed FROM leave_balance WHERE employee_id = $1 AND year = $2 AND leave_type = 'earned'`,
        [emp.id, year]
      );
      const currentEarned = earnedBal.rows.length > 0 ? parseInt(earnedBal.rows[0].total_allowed, 10) : 0;

      if (earnedEntitlement > currentEarned) {
        await pgPool.query(
          `INSERT INTO leave_balance (employee_id, year, leave_type, total_allowed, used)
           VALUES ($1, $2, 'earned', $3, 0)
           ON CONFLICT (employee_id, year, leave_type)
           DO UPDATE SET total_allowed = $3, updated_at = NOW()`,
          [emp.id, year, earnedEntitlement]
        );
        earnedCount++;
      }
    }

    logger.info(`[CRON] Leave accrual complete: casual=${casualCount}, sick=${sickCount}, earned=${earnedCount}`);
  } catch (err) {
    logger.error('[CRON] Leave accrual failed', err);
  }
});

logger.info('Leave accrual job scheduled: 1st of every month at 1:00 AM');
