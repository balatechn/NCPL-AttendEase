const cron = require('node-cron');
const { pgPool } = require('../config/database');
const { sendEmail } = require('../services/emailService');
const logger = require('../utils/logger');

const APP_URL = process.env.APP_URL || 'http://49.206.25.183:3000';

const RECIPIENTS = [
  'salman@nationalgroupindia.com',
  'bala@nationalgroupindia.com',
];

async function buildAttendanceReport() {
  const today = new Date().toISOString().slice(0, 10);

  const summary = await pgPool.query(`
    SELECT
      COUNT(DISTINCT e.id) FILTER (WHERE e.is_active) as total,
      COUNT(*) FILTER (WHERE a.status IN ('present','half-day','incomplete')) as present,
      COUNT(*) FILTER (WHERE a.status = 'absent') as absent,
      COUNT(*) FILTER (WHERE a.is_late = true) as late,
      COUNT(*) FILTER (WHERE a.status = 'leave') as on_leave,
      COUNT(*) FILTER (WHERE a.punch_in IS NULL AND a.status IS DISTINCT FROM 'leave' AND a.status IS DISTINCT FROM 'weekend' AND a.status IS DISTINCT FROM 'holiday') as not_punched
    FROM employees e
    LEFT JOIN attendance a ON a.employee_id = e.id AND a.attendance_date = $1
    WHERE e.is_active = true
  `, [today]);

  const details = await pgPool.query(`
    SELECT 
      e.employee_code, e.first_name, e.last_name, e.department,
      s.name as shift_name, s.start_time as shift_start, s.end_time as shift_end,
      a.punch_in, a.punch_out, a.status, a.work_hours, a.is_late, a.late_minutes
    FROM employees e
    LEFT JOIN shifts s ON e.shift_id = s.id
    LEFT JOIN attendance a ON a.employee_id = e.id AND a.attendance_date = $1
    WHERE e.is_active = true
    ORDER BY e.department, e.first_name
  `, [today]);

  const s = summary.rows[0];
  const total = parseInt(s.total) || 1;
  const present = parseInt(s.present) || 0;
  const pct = Math.round((present / total) * 100);

  // Group by department
  const deptMap = {};
  for (const emp of details.rows) {
    const dept = emp.department || 'Unassigned';
    if (!deptMap[dept]) deptMap[dept] = [];
    deptMap[dept].push(emp);
  }

  // Determine time context
  const now = new Date();
  const hours = now.getHours();
  const timeLabel = hours < 14 ? 'Mid-Day' : 'End of Day';

  // Build HTML
  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;background:#f4f4f7;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:750px;margin:20px auto;">
    <tr>
      <td style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:24px 32px;border-radius:12px 12px 0 0;">
        <h1 style="color:#fff;margin:0;font-size:20px;">NCPL AttendEase — ${timeLabel} Report</h1>
        <p style="color:rgba(255,255,255,0.8);margin:6px 0 0;font-size:13px;">${today} (${new Date(today + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })})</p>
      </td>
    </tr>
    <tr>
      <td style="background:#fff;padding:24px 32px;border:1px solid #e5e7eb;border-top:none;">
        <!-- Summary Cards -->
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
          <tr>
            <td style="padding:8px;text-align:center;width:16.6%;">
              <div style="background:#f0f0ff;border-radius:8px;padding:12px 8px;">
                <div style="font-size:24px;font-weight:700;color:#6366f1;">${s.total}</div>
                <div style="font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;margin-top:4px;">Total</div>
              </div>
            </td>
            <td style="padding:8px;text-align:center;width:16.6%;">
              <div style="background:#f0fdf4;border-radius:8px;padding:12px 8px;">
                <div style="font-size:24px;font-weight:700;color:#22c55e;">${s.present}</div>
                <div style="font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;margin-top:4px;">Present</div>
              </div>
            </td>
            <td style="padding:8px;text-align:center;width:16.6%;">
              <div style="background:#fef2f2;border-radius:8px;padding:12px 8px;">
                <div style="font-size:24px;font-weight:700;color:#ef4444;">${s.absent}</div>
                <div style="font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;margin-top:4px;">Absent</div>
              </div>
            </td>
            <td style="padding:8px;text-align:center;width:16.6%;">
              <div style="background:#fffbeb;border-radius:8px;padding:12px 8px;">
                <div style="font-size:24px;font-weight:700;color:#f59e0b;">${s.late}</div>
                <div style="font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;margin-top:4px;">Late</div>
              </div>
            </td>
            <td style="padding:8px;text-align:center;width:16.6%;">
              <div style="background:#f5f3ff;border-radius:8px;padding:12px 8px;">
                <div style="font-size:24px;font-weight:700;color:#8b5cf6;">${s.on_leave}</div>
                <div style="font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;margin-top:4px;">Leave</div>
              </div>
            </td>
            <td style="padding:8px;text-align:center;width:16.6%;">
              <div style="background:#f1f5f9;border-radius:8px;padding:12px 8px;">
                <div style="font-size:24px;font-weight:700;color:#64748b;">${s.not_punched}</div>
                <div style="font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;margin-top:4px;">No Punch</div>
              </div>
            </td>
          </tr>
        </table>

        <!-- Attendance % bar -->
        <div style="margin-bottom:24px;">
          <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
            <span style="font-size:12px;color:#6b7280;">Attendance Rate</span>
            <span style="font-size:12px;font-weight:700;color:${pct >= 80 ? '#22c55e' : pct >= 60 ? '#f59e0b' : '#ef4444'};">${pct}%</span>
          </div>
          <div style="background:#e5e7eb;border-radius:6px;height:8px;overflow:hidden;">
            <div style="background:${pct >= 80 ? '#22c55e' : pct >= 60 ? '#f59e0b' : '#ef4444'};height:100%;width:${pct}%;border-radius:6px;"></div>
          </div>
        </div>

        <!-- Department-wise Detail -->
        ${Object.entries(deptMap).map(([dept, emps]) => `
        <div style="margin-bottom:20px;">
          <h3 style="font-size:14px;color:#1e293b;margin:0 0 8px;padding-bottom:6px;border-bottom:2px solid #6366f1;">${dept} (${emps.length})</h3>
          <table width="100%" cellpadding="0" cellspacing="0" style="font-size:12px;border-collapse:collapse;">
            <tr style="background:#f8fafc;">
              <th style="padding:6px 8px;text-align:left;color:#6b7280;font-weight:600;">Employee</th>
              <th style="padding:6px 8px;text-align:left;color:#6b7280;font-weight:600;">Shift</th>
              <th style="padding:6px 8px;text-align:center;color:#6b7280;font-weight:600;">Punch In</th>
              <th style="padding:6px 8px;text-align:center;color:#6b7280;font-weight:600;">Punch Out</th>
              <th style="padding:6px 8px;text-align:center;color:#6b7280;font-weight:600;">Hours</th>
              <th style="padding:6px 8px;text-align:center;color:#6b7280;font-weight:600;">Status</th>
            </tr>
            ${emps.map((e, i) => {
              const bg = i % 2 === 0 ? '#fff' : '#f9fafb';
              const statusColor = e.is_late ? '#f59e0b' : e.status === 'present' ? '#22c55e' : e.status === 'absent' ? '#ef4444' : e.status === 'leave' ? '#8b5cf6' : '#6b7280';
              const statusLabel = e.is_late ? `Late (+${e.late_minutes}m)` : (e.status || 'No Record');
              return `
            <tr style="background:${bg};">
              <td style="padding:5px 8px;border-bottom:1px solid #f1f5f9;"><strong>${e.first_name} ${e.last_name}</strong><br/><span style="color:#94a3b8;">${e.employee_code}</span></td>
              <td style="padding:5px 8px;border-bottom:1px solid #f1f5f9;color:#64748b;">${e.shift_name || 'N/A'}<br/><span style="color:#94a3b8;font-size:10px;">${e.shift_start ? e.shift_start.substring(0, 5) : ''} - ${e.shift_end ? e.shift_end.substring(0, 5) : ''}</span></td>
              <td style="padding:5px 8px;border-bottom:1px solid #f1f5f9;text-align:center;color:${e.punch_in ? '#22c55e' : '#94a3b8'};font-family:monospace;">${e.punch_in || '---'}</td>
              <td style="padding:5px 8px;border-bottom:1px solid #f1f5f9;text-align:center;color:${e.punch_out ? '#ef4444' : '#94a3b8'};font-family:monospace;">${e.punch_out || '---'}</td>
              <td style="padding:5px 8px;border-bottom:1px solid #f1f5f9;text-align:center;font-weight:600;color:#1e293b;">${e.work_hours != null ? Number(e.work_hours).toFixed(1) : '---'}</td>
              <td style="padding:5px 8px;border-bottom:1px solid #f1f5f9;text-align:center;"><span style="display:inline-block;padding:2px 8px;border-radius:4px;background:${statusColor}15;color:${statusColor};font-weight:600;font-size:11px;text-transform:capitalize;">${statusLabel}</span></td>
            </tr>`;
            }).join('')}
          </table>
        </div>`).join('')}

      </td>
    </tr>
    <tr>
      <td style="padding:16px 32px;background:#fff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
        <div style="text-align:center;margin-bottom:12px;">
          <a href="${APP_URL}/login" style="display:inline-block;padding:12px 28px;background:linear-gradient(135deg,#3b82f6,#1d4ed8);color:#fff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;">Open AttendEase Dashboard</a>
        </div>
        <p style="color:#94a3b8;font-size:11px;margin:0;text-align:center;">
          Generated at ${now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} IST &bull; NCPL AttendEase &bull; &copy; ${now.getFullYear()} National Group India
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { html, subject: `AttendEase ${timeLabel} Report — ${today} | ${pct}% Attendance`, text: `Attendance Report for ${today}: ${s.present}/${s.total} present (${pct}%)` };
}

async function sendDailyReport() {
  try {
    logger.info('Generating daily attendance email report...');
    const { html, subject, text } = await buildAttendanceReport();

    for (const to of RECIPIENTS) {
      await sendEmail({ to, subject, html, text });
    }
    logger.info(`Daily attendance report sent to ${RECIPIENTS.length} recipients`);
  } catch (err) {
    logger.error('Failed to send daily attendance report:', err.message);
  }
}

// 11:30 AM daily
cron.schedule('30 11 * * *', sendDailyReport, { timezone: 'Asia/Kolkata' });

// 10:00 PM daily
cron.schedule('0 22 * * *', sendDailyReport, { timezone: 'Asia/Kolkata' });

logger.info('Attendance email job scheduled: 11:30 AM and 10:00 PM IST daily');

module.exports = { sendDailyReport };
