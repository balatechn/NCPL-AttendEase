const Employee = require('../models/Employee');
const Shift = require('../models/Shift');
const Attendance = require('../models/Attendance');
const Holiday = require('../models/Holiday');
const { pgPool } = require('../config/database');
const bcrypt = require('bcryptjs');
const { sendEmail } = require('../services/emailService');
const logger = require('../utils/logger');

// Employee Management
exports.getEmployees = async (req, res, next) => {
  try {
    const { page, limit, department, search } = req.query;
    const result = await Employee.findAll({
      page: parseInt(page, 10) || 1,
      limit: parseInt(limit, 10) || 50,
      department,
      search,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.getManagers = async (req, res, next) => {
  try {
    const managers = await Employee.getManagers();
    res.json(managers);
  } catch (err) {
    next(err);
  }
};

exports.createEmployee = async (req, res, next) => {
  try {
    const employee = await Employee.create(req.body);
    // Initialize leave balance for current year (all zero - admin sets opening balance)
    const year = new Date().getFullYear();
    await pgPool.query(
      `INSERT INTO leave_balance (employee_id, year, leave_type, total_allowed, used)
       VALUES ($1,$2,'casual',0,0), ($1,$2,'sick',0,0), ($1,$2,'earned',0,0), ($1,$2,'compensatory',0,0)
       ON CONFLICT DO NOTHING`,
      [employee.id, year]
    );
    res.status(201).json(employee);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Employee with this email or code already exists.' });
    }
    next(err);
  }
};

exports.updateEmployee = async (req, res, next) => {
  try {
    const { id } = req.params;
    const updated = await Employee.update(id, req.body);
    if (!updated) return res.status(404).json({ error: 'Employee not found.' });
    res.json(updated);
  } catch (err) {
    next(err);
  }
};

exports.deactivateEmployee = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await Employee.hardDelete(id);
    if (!result) return res.status(404).json({ error: 'Employee not found.' });
    res.json({ message: 'Employee deleted.' });
  } catch (err) {
    next(err);
  }
};

// Shift Management
exports.getShifts = async (req, res, next) => {
  try {
    const shifts = await Shift.findAll();
    res.json(shifts);
  } catch (err) {
    next(err);
  }
};

exports.createShift = async (req, res, next) => {
  try {
    const shift = await Shift.create(req.body);
    res.status(201).json(shift);
  } catch (err) {
    next(err);
  }
};

exports.updateShift = async (req, res, next) => {
  try {
    const { id } = req.params;
    const shift = await Shift.update(id, req.body);
    if (!shift) return res.status(404).json({ error: 'Shift not found.' });
    res.json(shift);
  } catch (err) {
    next(err);
  }
};

exports.deleteShift = async (req, res, next) => {
  try {
    const { id } = req.params;
    await Shift.delete(id);
    res.json({ message: 'Shift deleted.' });
  } catch (err) {
    next(err);
  }
};

// Attendance Override
exports.overrideAttendance = async (req, res, next) => {
  try {
    const { id } = req.params;
    const updated = await Attendance.override(id, req.body, req.user.id);
    if (!updated) return res.status(404).json({ error: 'Record not found.' });
    res.json(updated);
  } catch (err) {
    next(err);
  }
};

// Dashboard Stats for Admin
exports.getDashboardStats = async (req, res, next) => {
  try {
    const now = new Date(); const today = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0');
    const result = await pgPool.query(`
      SELECT
        (SELECT COUNT(*) FROM employees WHERE is_active = true) as total_employees,
        (SELECT COUNT(*) FROM attendance WHERE attendance_date = $1 AND status = 'present') as present_today,
        (SELECT COUNT(*) FROM attendance WHERE attendance_date = $1 AND status = 'absent') as absent_today,
        (SELECT COUNT(*) FROM attendance WHERE attendance_date = $1 AND is_late = true) as late_today,
        (SELECT COUNT(*) FROM leaves WHERE status = 'pending') as pending_leaves,
        (SELECT COUNT(*) FROM regularization WHERE status = 'pending') as pending_regularizations
    `, [today]);
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
};

// =============================================
// LEAVE BALANCE MANAGEMENT
// =============================================

// Get all employees' leave balances for a year
exports.getLeaveBalances = async (req, res, next) => {
  try {
    const year = parseInt(req.query.year, 10) || new Date().getFullYear();
    const search = req.query.search || '';
    let query = `
      SELECT e.id, e.employee_code, e.first_name, e.last_name, e.department,
        COALESCE(json_agg(
          json_build_object('leave_type', lb.leave_type, 'total_allowed', lb.total_allowed, 'used', lb.used, 'remaining', lb.total_allowed - lb.used)
        ) FILTER (WHERE lb.id IS NOT NULL), '[]') as balances
      FROM employees e
      LEFT JOIN leave_balance lb ON e.id = lb.employee_id AND lb.year = $1
      WHERE e.is_active = true`;
    const params = [year];
    let idx = 2;
    if (search) {
      query += ` AND (e.first_name ILIKE $${idx} OR e.last_name ILIKE $${idx} OR e.employee_code ILIKE $${idx})`;
      params.push(`%${search}%`);
      idx++;
    }
    query += ` GROUP BY e.id ORDER BY e.first_name, e.last_name`;
    const result = await pgPool.query(query, params);
    res.json(result.rows);
  } catch (err) { next(err); }
};

// Set/update leave balance for a specific employee
exports.setLeaveBalance = async (req, res, next) => {
  try {
    const { employee_id, year, leave_type, total_allowed, reason } = req.body;
    if (!employee_id || !year || !leave_type || total_allowed === undefined || !reason) {
      return res.status(400).json({ error: 'employee_id, year, leave_type, total_allowed, and reason are required.' });
    }
    const totalInt = parseInt(total_allowed, 10);
    if (isNaN(totalInt) || totalInt < 0) {
      return res.status(400).json({ error: 'total_allowed must be a non-negative number.' });
    }

    // Get current balance
    const current = await pgPool.query(
      `SELECT total_allowed, used FROM leave_balance WHERE employee_id = $1 AND year = $2 AND leave_type = $3`,
      [employee_id, year, leave_type]
    );
    const oldTotal = current.rows.length > 0 ? current.rows[0].total_allowed : 0;
    const oldUsed = current.rows.length > 0 ? current.rows[0].used : 0;

    // Upsert balance
    await pgPool.query(
      `INSERT INTO leave_balance (employee_id, year, leave_type, total_allowed, used, updated_at)
       VALUES ($1, $2, $3, $4, 0, NOW())
       ON CONFLICT (employee_id, year, leave_type)
       DO UPDATE SET total_allowed = $4, updated_at = NOW()`,
      [employee_id, year, leave_type, totalInt]
    );

    // Audit log
    await pgPool.query(
      `INSERT INTO leave_balance_audit (employee_id, year, leave_type, old_total, new_total, old_used, new_used, change_reason, changed_by)
       VALUES ($1, $2, $3, $4, $5, $6, $6, $7, $8)`,
      [employee_id, year, leave_type, oldTotal, totalInt, oldUsed, reason, req.user.id]
    );

    res.json({ message: 'Leave balance updated.', employee_id, year, leave_type, total_allowed: totalInt });
  } catch (err) { next(err); }
};

// Bulk set opening balances for all employees
exports.setBulkLeaveBalance = async (req, res, next) => {
  try {
    const { year, leave_type, total_allowed, reason } = req.body;
    if (!year || !leave_type || total_allowed === undefined || !reason) {
      return res.status(400).json({ error: 'year, leave_type, total_allowed, and reason are required.' });
    }
    const totalInt = parseInt(total_allowed, 10);
    const employees = await pgPool.query(`SELECT id FROM employees WHERE is_active = true`);
    let count = 0;
    for (const emp of employees.rows) {
      const current = await pgPool.query(
        `SELECT total_allowed, used FROM leave_balance WHERE employee_id = $1 AND year = $2 AND leave_type = $3`,
        [emp.id, year, leave_type]
      );
      const oldTotal = current.rows.length > 0 ? current.rows[0].total_allowed : 0;
      const oldUsed = current.rows.length > 0 ? current.rows[0].used : 0;

      await pgPool.query(
        `INSERT INTO leave_balance (employee_id, year, leave_type, total_allowed, used, updated_at)
         VALUES ($1, $2, $3, $4, 0, NOW())
         ON CONFLICT (employee_id, year, leave_type)
         DO UPDATE SET total_allowed = $4, updated_at = NOW()`,
        [emp.id, year, leave_type, totalInt]
      );
      await pgPool.query(
        `INSERT INTO leave_balance_audit (employee_id, year, leave_type, old_total, new_total, old_used, new_used, change_reason, changed_by)
         VALUES ($1, $2, $3, $4, $5, $6, $6, $7, $8)`,
        [emp.id, year, leave_type, oldTotal, totalInt, oldUsed, reason, req.user.id]
      );
      count++;
    }
    res.json({ message: `Updated ${count} employees.` });
  } catch (err) { next(err); }
};

// Get audit trail for a specific employee
exports.getLeaveBalanceAudit = async (req, res, next) => {
  try {
    const { employeeId } = req.params;
    const year = parseInt(req.query.year, 10) || new Date().getFullYear();
    const result = await pgPool.query(
      `SELECT a.*, 
        ce.first_name as changed_by_first, ce.last_name as changed_by_last
       FROM leave_balance_audit a
       LEFT JOIN employees ce ON a.changed_by = ce.id
       WHERE a.employee_id = $1 AND a.year = $2
       ORDER BY a.created_at DESC`,
      [employeeId, year]
    );
    res.json(result.rows);
  } catch (err) { next(err); }
};

// Password & Welcome Email Management
exports.getPasswordStatus = async (req, res, next) => {
  try {
    const result = await pgPool.query(
      `SELECT e.id, e.employee_code, e.first_name, e.last_name, e.email, e.department,
        e.must_change_password, e.is_active, e.role,
        (SELECT MAX(attendance_date) FROM attendance WHERE employee_id = e.id) as last_attendance
       FROM employees e
       WHERE e.is_active = true AND e.role != 'admin'
       ORDER BY e.first_name, e.last_name`
    );
    res.json(result.rows);
  } catch (err) { next(err); }
};

exports.resetEmployeePassword = async (req, res, next) => {
  try {
    const { employeeId } = req.params;
    const emp = await pgPool.query('SELECT id, email, first_name, last_name FROM employees WHERE id = $1 AND is_active = true', [employeeId]);
    if (!emp.rows[0]) return res.status(404).json({ error: 'Employee not found.' });

    const hash = await bcrypt.hash('Welcome@123', 12);
    await pgPool.query(
      'UPDATE employees SET password_hash = $1, must_change_password = true, updated_at = NOW() WHERE id = $2',
      [hash, employeeId]
    );

    logger.info(`Admin reset password for employee ${employeeId} (${emp.rows[0].email})`);
    res.json({ message: `Password reset to default for ${emp.rows[0].first_name} ${emp.rows[0].last_name}.` });
  } catch (err) { next(err); }
};

exports.sendWelcomeEmail = async (req, res, next) => {
  try {
    const { employeeIds } = req.body; // array of ids, or empty for all
    const APP_URL = process.env.APP_URL || 'http://49.206.25.183:3000';

    let query, params;
    if (employeeIds && employeeIds.length > 0) {
      query = `SELECT id, email, first_name, last_name FROM employees WHERE id = ANY($1) AND is_active = true AND email IS NOT NULL AND email NOT LIKE '%.auto@ncpl.com'`;
      params = [employeeIds];
    } else {
      query = `SELECT id, email, first_name, last_name FROM employees WHERE is_active = true AND role != 'admin' AND email IS NOT NULL AND email NOT LIKE '%.auto@ncpl.com'`;
      params = [];
    }

    const { rows: employees } = await pgPool.query(query, params);
    let sent = 0, failed = 0;

    for (const emp of employees) {
      try {
        await sendEmail({
          to: emp.email,
          subject: 'NCPL AttendEase - Your Login Credentials',
          html: '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background-color:#f8fafc;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0">' +
            '<div style="background-color:#1d4ed8;padding:30px;text-align:center">' +
              '<h1 style="color:#ffffff;margin:0;font-size:24px">Welcome to NCPL AttendEase</h1>' +
            '</div>' +
            '<div style="padding:30px">' +
              '<p style="font-size:16px;color:#334155">Hello <strong>' + emp.first_name + ' ' + emp.last_name + '</strong>,</p>' +
              '<p style="color:#475569">Your attendance management account has been created. Here are your login credentials:</p>' +
              '<div style="background-color:#ffffff;border:1px solid #e2e8f0;border-radius:8px;padding:20px;margin:20px 0">' +
                '<p style="margin:8px 0;color:#334155"><strong>Login Email:</strong> ' + emp.email + '</p>' +
                '<p style="margin:8px 0;color:#334155"><strong>Default Password:</strong> Welcome@123</p>' +
              '</div>' +
              '<div style="background-color:#fef3c7;border:1px solid #f59e0b;border-radius:8px;padding:15px;margin:20px 0">' +
                '<p style="margin:0;color:#92400e;font-weight:bold">Important: You will be asked to change your password on first login.</p>' +
              '</div>' +
              '<div style="text-align:center;margin:25px 0">' +
                '<table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto"><tr><td align="center" bgcolor="#1d4ed8" style="border-radius:8px"><a href="' + APP_URL + '/login" target="_blank" style="display:inline-block;padding:14px 32px;color:#ffffff;text-decoration:none;font-weight:bold;font-size:16px">Open AttendEase</a></td></tr></table>' +
              '</div>' +
              '<p style="text-align:center;color:#475569;font-size:13px">Or open: <a href="' + APP_URL + '/login" style="color:#1d4ed8">' + APP_URL + '/login</a></p>' +
              '<p style="color:#64748b;font-size:13px">If you have any issues logging in, please contact HR.</p>' +
            '</div>' +
            '<div style="background-color:#f1f5f9;padding:15px;text-align:center">' +
              '<p style="margin:0;color:#94a3b8;font-size:12px">NCPL AttendEase - Biometric Attendance System</p>' +
            '</div>' +
          '</div>',
          text: 'Welcome to NCPL AttendEase!\nHello ' + emp.first_name + ' ' + emp.last_name + ',\nEmail: ' + emp.email + '\nDefault Password: Welcome@123\nLogin: ' + APP_URL + '/login'
        });
        sent++;
      } catch (err) {
        failed++;
        logger.error(`Welcome email failed for ${emp.email}: ${err.message}`);
      }
    }

    logger.info(`Welcome emails: sent=${sent}, failed=${failed}`);
    res.json({ message: `Welcome emails sent: ${sent}, failed: ${failed}`, sent, failed });
  } catch (err) { next(err); }
};

// Public Holiday Management
exports.getHolidays = async (req, res, next) => {
  try {
    const year = req.query.year || new Date().getFullYear();
    const holidays = await Holiday.findAll(year);
    res.json(holidays);
  } catch (err) { next(err); }
};

exports.createHoliday = async (req, res, next) => {
  try {
    const { holiday_date, name, is_optional } = req.body;
    if (!holiday_date || !name) {
      return res.status(400).json({ error: 'Date and name are required.' });
    }
    const holiday = await Holiday.create({ holiday_date, name, is_optional });
    res.json(holiday);
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'A holiday already exists on this date.' });
    next(err);
  }
};

exports.updateHoliday = async (req, res, next) => {
  try {
    const { holiday_date, name, is_optional } = req.body;
    const holiday = await Holiday.update(req.params.id, { holiday_date, name, is_optional });
    if (!holiday) return res.status(404).json({ error: 'Holiday not found.' });
    res.json(holiday);
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'A holiday already exists on this date.' });
    next(err);
  }
};

exports.deleteHoliday = async (req, res, next) => {
  try {
    const deleted = await Holiday.delete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Holiday not found.' });
    res.json({ message: 'Holiday deleted.' });
  } catch (err) { next(err); }
};

exports.bulkImportHolidays = async (req, res, next) => {
  try {
    const { holidays } = req.body;
    if (!Array.isArray(holidays) || holidays.length === 0) {
      return res.status(400).json({ error: 'Holidays array is required.' });
    }
    const inserted = await Holiday.bulkCreate(holidays);
    res.json({ message: `${inserted} holidays imported/updated.`, count: inserted });
  } catch (err) { next(err); }
};
