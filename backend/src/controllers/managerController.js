const { pgPool } = require('../config/database');

// Manager Dashboard Stats — scoped to reportees (or all for admin/hr)
exports.getDashboardStats = async (req, res, next) => {
  try {
    const managerId = req.user.id;
    const userRole = req.user.role;
    const isAdminOrHR = userRole === 'admin' || userRole === 'hr';
    const { date } = req.query;
    const targetDate = date || new Date().toISOString().slice(0, 10);

    const reporteesCTE = isAdminOrHR
      ? `SELECT id FROM employees WHERE is_active = true`
      : `SELECT id FROM employees WHERE reporting_manager_id = $1 AND is_active = true`;
    const empFilter = isAdminOrHR
      ? `e.is_active = true`
      : `e.reporting_manager_id = $1 AND e.is_active = true`;
    const params = isAdminOrHR ? [targetDate] : [managerId, targetDate];
    const dateParam = isAdminOrHR ? '$1' : '$2';

    const result = await pgPool.query(`
      WITH reportees AS (
        ${reporteesCTE}
      )
      SELECT
        (SELECT COUNT(*) FROM reportees) as total_employees,
        (SELECT COUNT(*) FROM attendance a JOIN reportees r ON a.employee_id = r.id WHERE a.attendance_date = ${dateParam} AND a.status IN ('present', 'half-day', 'incomplete')) as present_today,
        (SELECT COUNT(*) FROM attendance a JOIN reportees r ON a.employee_id = r.id WHERE a.attendance_date = ${dateParam} AND a.status = 'absent') as absent_today,
        (SELECT COUNT(*) FROM attendance a JOIN reportees r ON a.employee_id = r.id WHERE a.attendance_date = ${dateParam} AND a.is_late = true) as late_today,
        (SELECT COUNT(*) FROM attendance a JOIN reportees r ON a.employee_id = r.id WHERE a.attendance_date = ${dateParam} AND a.status = 'leave') as on_leave,
        (SELECT COUNT(*) FROM leaves l JOIN reportees r ON l.employee_id = r.id WHERE l.status = 'pending') as pending_leaves,
        (SELECT COUNT(*) FROM regularization rg JOIN reportees r ON rg.employee_id = r.id WHERE rg.status = 'pending') as pending_regularizations
    `, params);

    // Early checkout count - separate query for clarity
    const earlyCheckout = await pgPool.query(`
      SELECT COUNT(*) as count FROM attendance a
      JOIN employees e ON a.employee_id = e.id
      JOIN shifts s ON e.shift_id = s.id
      WHERE ${empFilter}
        AND a.attendance_date = ${dateParam}
        AND a.punch_out IS NOT NULL
        AND a.work_hours < s.full_day_hours
    `, params);

    // Attendance percentage for the date
    const totalReportees = await pgPool.query(
      `SELECT COUNT(*) as count FROM employees WHERE ${isAdminOrHR ? 'is_active = true' : 'reporting_manager_id = $1 AND is_active = true'}`,
      isAdminOrHR ? [] : [managerId]
    );
    const presentCount = await pgPool.query(
      `SELECT COUNT(*) as count FROM attendance a 
       JOIN employees e ON a.employee_id = e.id
       WHERE ${empFilter}
         AND a.attendance_date = ${dateParam}
         AND a.status IN ('present', 'half-day', 'incomplete')`,
      params
    );

    // Monthly attendance %
    const now = new Date(targetDate);
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const monthParams = isAdminOrHR ? [monthStart, targetDate] : [managerId, monthStart, targetDate];
    const monthDateStart = isAdminOrHR ? '$1' : '$2';
    const monthDateEnd = isAdminOrHR ? '$2' : '$3';
    const monthlyAtt = await pgPool.query(`
      SELECT
        COUNT(DISTINCT a.attendance_date) FILTER (WHERE a.status IN ('present', 'half-day', 'incomplete')) as total_present_days,
        COUNT(DISTINCT a.attendance_date) as total_working_days
      FROM attendance a
      JOIN employees e ON a.employee_id = e.id
      WHERE ${empFilter.replace(dateParam, monthDateStart)}
        AND a.attendance_date >= ${monthDateStart} AND a.attendance_date <= ${monthDateEnd}
        AND a.status NOT IN ('weekend', 'holiday')
    `, monthParams);

    const total = parseInt(totalReportees.rows[0].count) || 1;
    const present = parseInt(presentCount.rows[0].count) || 0;
    const stats = result.rows[0];

    res.json({
      ...stats,
      early_checkout: parseInt(earlyCheckout.rows[0].count) || 0,
      attendance_percent_today: total > 0 ? Math.round((present / total) * 100) : 0,
      attendance_percent_month: monthlyAtt.rows[0].total_working_days > 0
        ? Math.round((parseInt(monthlyAtt.rows[0].total_present_days) / parseInt(monthlyAtt.rows[0].total_working_days)) * 100)
        : 0,
    });
  } catch (err) {
    next(err);
  }
};

// Live attendance for reportees (or all for admin/hr)
exports.getLiveAttendance = async (req, res, next) => {
  try {
    const managerId = req.user.id;
    const userRole = req.user.role;
    const isAdminOrHR = userRole === 'admin' || userRole === 'hr';
    const { date, department, shift_id } = req.query;
    const targetDate = date || new Date().toISOString().slice(0, 10);

    let params, idx;
    let query = `
      SELECT 
        e.id, e.employee_code, e.first_name, e.last_name, e.department, e.designation,
        s.name as shift_name, s.start_time as shift_start, s.end_time as shift_end, s.full_day_hours,
        a.punch_in, a.punch_out, a.status, a.work_hours, a.is_late, a.late_minutes
      FROM employees e
      LEFT JOIN shifts s ON e.shift_id = s.id
      LEFT JOIN attendance a ON a.employee_id = e.id AND a.attendance_date = ${isAdminOrHR ? '$1' : '$2'}
      WHERE ${isAdminOrHR ? 'e.is_active = true' : 'e.reporting_manager_id = $1 AND e.is_active = true'}`;
    
    if (isAdminOrHR) {
      params = [targetDate];
      idx = 2;
    } else {
      params = [managerId, targetDate];
      idx = 3;
    }

    if (department) {
      query += ` AND e.department = $${idx++}`;
      params.push(department);
    }
    if (shift_id) {
      query += ` AND e.shift_id = $${idx++}`;
      params.push(parseInt(shift_id, 10));
    }

    query += ` ORDER BY a.is_late DESC NULLS LAST, a.punch_in ASC NULLS LAST, e.first_name ASC`;

    const result = await pgPool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
};

// Get department list for filters
exports.getDepartments = async (req, res, next) => {
  try {
    const result = await pgPool.query(
      `SELECT DISTINCT department FROM employees WHERE is_active = true AND department IS NOT NULL ORDER BY department`
    );
    res.json(result.rows.map(r => r.department));
  } catch (err) {
    next(err);
  }
};
