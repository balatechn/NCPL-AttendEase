const { pgPool } = require('../config/database');

// HR Dashboard — Daily attendance detail
exports.getDailyAttendance = async (req, res, next) => {
  try {
    const { date, department, shift_id } = req.query;
    const targetDate = date || new Date().toISOString().slice(0, 10);

    let params = [targetDate];
    let idx = 2;
    let filters = '';

    if (department) {
      filters += ` AND e.department = $${idx++}`;
      params.push(department);
    }
    if (shift_id) {
      filters += ` AND e.shift_id = $${idx++}`;
      params.push(parseInt(shift_id, 10));
    }

    // Summary counts
    const summary = await pgPool.query(`
      SELECT
        COUNT(*) FILTER (WHERE e.is_active) as total,
        COUNT(*) FILTER (WHERE a.status IN ('present','half-day','incomplete')) as present,
        COUNT(*) FILTER (WHERE a.status = 'absent') as absent,
        COUNT(*) FILTER (WHERE a.is_late = true) as late,
        COUNT(*) FILTER (WHERE a.status = 'leave') as on_leave,
        COUNT(*) FILTER (WHERE a.punch_in IS NOT NULL AND a.punch_out IS NOT NULL AND a.work_hours < s.full_day_hours) as early_checkout,
        COUNT(*) FILTER (WHERE a.punch_in IS NULL AND a.status IS DISTINCT FROM 'leave' AND a.status IS DISTINCT FROM 'weekend' AND a.status IS DISTINCT FROM 'holiday') as not_punched
      FROM employees e
      LEFT JOIN shifts s ON e.shift_id = s.id
      LEFT JOIN attendance a ON a.employee_id = e.id AND a.attendance_date = $1
      WHERE e.is_active = true${filters}
    `, params);

    // Employee details
    const details = await pgPool.query(`
      SELECT 
        e.id, e.employee_code, e.first_name, e.last_name, e.department, e.designation,
        s.name as shift_name, s.start_time as shift_start, s.end_time as shift_end, s.full_day_hours,
        a.punch_in, a.punch_out, a.status, a.work_hours, a.is_late, a.late_minutes
      FROM employees e
      LEFT JOIN shifts s ON e.shift_id = s.id
      LEFT JOIN attendance a ON a.employee_id = e.id AND a.attendance_date = $1
      WHERE e.is_active = true${filters}
      ORDER BY e.department, e.first_name
    `, params);

    res.json({
      date: targetDate,
      summary: summary.rows[0],
      employees: details.rows,
    });
  } catch (err) {
    next(err);
  }
};

// HR Dashboard — Weekly attendance summary
exports.getWeeklyAttendance = async (req, res, next) => {
  try {
    const { start_date, end_date, department } = req.query;
    if (!start_date || !end_date) {
      return res.status(400).json({ error: 'start_date and end_date required' });
    }

    let params = [start_date, end_date];
    let idx = 3;
    let filters = '';
    if (department) {
      filters += ` AND e.department = $${idx++}`;
      params.push(department);
    }

    // Day-by-day summary
    const daySummary = await pgPool.query(`
      SELECT
        a.attendance_date::text as date,
        COUNT(*) FILTER (WHERE a.status IN ('present','half-day','incomplete')) as present,
        COUNT(*) FILTER (WHERE a.status = 'absent') as absent,
        COUNT(*) FILTER (WHERE a.is_late = true) as late,
        COUNT(*) FILTER (WHERE a.status = 'leave') as on_leave
      FROM attendance a
      JOIN employees e ON a.employee_id = e.id
      WHERE e.is_active = true AND a.attendance_date BETWEEN $1 AND $2${filters}
      GROUP BY a.attendance_date
      ORDER BY a.attendance_date
    `, params);

    // Per-employee weekly summary
    const empSummary = await pgPool.query(`
      SELECT
        e.id, e.employee_code, e.first_name, e.last_name, e.department,
        COUNT(*) FILTER (WHERE a.status IN ('present','half-day','incomplete')) as present_days,
        COUNT(*) FILTER (WHERE a.status = 'absent') as absent_days,
        COUNT(*) FILTER (WHERE a.is_late = true) as late_days,
        COUNT(*) FILTER (WHERE a.status = 'leave') as leave_days,
        COALESCE(ROUND(AVG(a.work_hours)::numeric, 1), 0) as avg_hours
      FROM employees e
      LEFT JOIN attendance a ON a.employee_id = e.id AND a.attendance_date BETWEEN $1 AND $2
      WHERE e.is_active = true${filters}
      GROUP BY e.id, e.employee_code, e.first_name, e.last_name, e.department
      ORDER BY e.department, e.first_name
    `, params);

    // Total active employees for percentage calculation
    const totalEmp = await pgPool.query(
      `SELECT COUNT(*) as count FROM employees WHERE is_active = true${filters}`,
      filters ? [department] : []
    );

    res.json({
      start_date,
      end_date,
      total_employees: parseInt(totalEmp.rows[0].count),
      day_summary: daySummary.rows,
      employee_summary: empSummary.rows,
    });
  } catch (err) {
    next(err);
  }
};

// HR Dashboard — Monthly attendance summary
exports.getMonthlyAttendance = async (req, res, next) => {
  try {
    const { year, month, department } = req.query;
    const y = parseInt(year, 10) || new Date().getFullYear();
    const m = parseInt(month, 10) || (new Date().getMonth() + 1);
    const monthStart = `${y}-${String(m).padStart(2, '0')}-01`;
    const nextMonth = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;

    let params = [monthStart, nextMonth];
    let idx = 3;
    let filters = '';
    if (department) {
      filters += ` AND e.department = $${idx++}`;
      params.push(department);
    }

    // Day-by-day summary for the month
    const daySummary = await pgPool.query(`
      SELECT
        a.attendance_date::text as date,
        COUNT(*) FILTER (WHERE a.status IN ('present','half-day','incomplete')) as present,
        COUNT(*) FILTER (WHERE a.status = 'absent') as absent,
        COUNT(*) FILTER (WHERE a.is_late = true) as late,
        COUNT(*) FILTER (WHERE a.status = 'leave') as on_leave
      FROM attendance a
      JOIN employees e ON a.employee_id = e.id
      WHERE e.is_active = true AND a.attendance_date >= $1 AND a.attendance_date < $2${filters}
      GROUP BY a.attendance_date
      ORDER BY a.attendance_date
    `, params);

    // Per-employee monthly totals
    const empSummary = await pgPool.query(`
      SELECT
        e.id, e.employee_code, e.first_name, e.last_name, e.department,
        COUNT(*) FILTER (WHERE a.status IN ('present','half-day','incomplete')) as present_days,
        COUNT(*) FILTER (WHERE a.status = 'absent') as absent_days,
        COUNT(*) FILTER (WHERE a.is_late = true) as late_days,
        COUNT(*) FILTER (WHERE a.status = 'leave') as leave_days,
        COALESCE(ROUND(SUM(a.work_hours)::numeric, 1), 0) as total_hours,
        COALESCE(ROUND(AVG(a.work_hours)::numeric, 1), 0) as avg_hours
      FROM employees e
      LEFT JOIN attendance a ON a.employee_id = e.id AND a.attendance_date >= $1 AND a.attendance_date < $2
      WHERE e.is_active = true${filters}
      GROUP BY e.id, e.employee_code, e.first_name, e.last_name, e.department
      ORDER BY e.department, e.first_name
    `, params);

    // Department-wise summary
    const deptSummary = await pgPool.query(`
      SELECT
        e.department,
        COUNT(DISTINCT e.id) as total_employees,
        COUNT(*) FILTER (WHERE a.status IN ('present','half-day','incomplete')) as present_count,
        COUNT(*) FILTER (WHERE a.status = 'absent') as absent_count,
        COUNT(*) FILTER (WHERE a.is_late = true) as late_count
      FROM employees e
      LEFT JOIN attendance a ON a.employee_id = e.id AND a.attendance_date >= $1 AND a.attendance_date < $2
      WHERE e.is_active = true${filters}
      GROUP BY e.department
      ORDER BY e.department
    `, params);

    res.json({
      year: y,
      month: m,
      day_summary: daySummary.rows,
      employee_summary: empSummary.rows,
      department_summary: deptSummary.rows,
    });
  } catch (err) {
    next(err);
  }
};
