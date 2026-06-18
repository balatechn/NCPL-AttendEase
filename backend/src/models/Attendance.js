const { pgPool } = require('../config/database');

const Attendance = {
  async findByEmployeeAndDate(employeeId, date) {
    const result = await pgPool.query(
      'SELECT * FROM attendance WHERE employee_id = $1 AND attendance_date = $2',
      [employeeId, date]
    );
    return result.rows[0] || null;
  },

  async findByEmployeeAndMonth(employeeId, year, month) {
    const result = await pgPool.query(
      `SELECT * FROM attendance 
       WHERE employee_id = $1 
       AND EXTRACT(YEAR FROM attendance_date) = $2 
       AND EXTRACT(MONTH FROM attendance_date) = $3
       ORDER BY attendance_date ASC`,
      [employeeId, year, month]
    );
    return result.rows;
  },

  async findByDateRange(employeeId, startDate, endDate) {
    const result = await pgPool.query(
      `SELECT a.*, e.first_name, e.last_name, e.employee_code, e.department
       FROM attendance a
       JOIN employees e ON a.employee_id = e.id
       WHERE a.employee_id = $1 AND a.attendance_date BETWEEN $2 AND $3
       ORDER BY a.attendance_date ASC`,
      [employeeId, startDate, endDate]
    );
    return result.rows;
  },

  async findAllByDate(date, { department, page = 1, limit = 50 }) {
    let query = `
      SELECT a.*, e.first_name, e.last_name, e.employee_code, e.department
      FROM attendance a
      JOIN employees e ON a.employee_id = e.id
      WHERE a.attendance_date = $1`;
    const params = [date];
    let idx = 2;

    if (department) {
      query += ` AND e.department = $${idx++}`;
      params.push(department);
    }

    query += ` ORDER BY e.first_name ASC LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(limit, (page - 1) * limit);

    const result = await pgPool.query(query, params);
    return result.rows;
  },

  async upsert(data) {
    const result = await pgPool.query(
      `INSERT INTO attendance (employee_id, attendance_date, punch_in, punch_out, status, work_hours, is_late, late_minutes, source, device_serial)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (employee_id, attendance_date) 
       DO UPDATE SET 
         punch_in = COALESCE(EXCLUDED.punch_in, attendance.punch_in),
         punch_out = COALESCE(EXCLUDED.punch_out, attendance.punch_out),
         status = EXCLUDED.status,
         work_hours = EXCLUDED.work_hours,
         is_late = EXCLUDED.is_late,
         late_minutes = EXCLUDED.late_minutes,
         source = EXCLUDED.source,
         updated_at = NOW()
       RETURNING *`,
      [data.employee_id, data.attendance_date, data.punch_in, data.punch_out, data.status, data.work_hours, data.is_late, data.late_minutes, data.source || 'biometric', data.device_serial]
    );
    return result.rows[0];
  },

  async override(id, data, adminId) {
    const result = await pgPool.query(
      `UPDATE attendance 
       SET punch_in = COALESCE($1, punch_in),
           punch_out = COALESCE($2, punch_out),
           status = COALESCE($3, status),
           work_hours = COALESCE($4, work_hours),
           is_late = COALESCE($5, is_late),
           override_by = $6,
           override_reason = $7,
           updated_at = NOW()
       WHERE id = $8 RETURNING *`,
      [data.punch_in, data.punch_out, data.status, data.work_hours, data.is_late, adminId, data.reason, id]
    );
    return result.rows[0] || null;
  },

  async getSummary(employeeId, year, month) {
    const result = await pgPool.query(
      `SELECT 
         COUNT(*) FILTER (WHERE status = 'present') as present_days,
         COUNT(*) FILTER (WHERE status = 'absent') as absent_days,
         COUNT(*) FILTER (WHERE status = 'half-day') as half_days,
         COUNT(*) FILTER (WHERE status = 'leave') as leave_days,
         COUNT(*) FILTER (WHERE status = 'holiday') as holidays,
         COUNT(*) FILTER (WHERE status = 'weekend') as weekends,
         COUNT(*) FILTER (WHERE is_late = true) as late_days,
         COALESCE(AVG(work_hours), 0) as avg_work_hours,
         COALESCE(SUM(work_hours), 0) as total_work_hours
       FROM attendance
       WHERE employee_id = $1 
       AND EXTRACT(YEAR FROM attendance_date) = $2
       AND EXTRACT(MONTH FROM attendance_date) = $3`,
      [employeeId, year, month]
    );
    return result.rows[0];
  },

  async getDashboardStats(employeeId) {
    const now = new Date(); const today = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0');
    const result = await pgPool.query(
      `SELECT 
        (SELECT status FROM attendance WHERE employee_id = $1 AND attendance_date = $2) as today_status,
        (SELECT punch_in FROM attendance WHERE employee_id = $1 AND attendance_date = $2) as today_punch_in,
        (SELECT punch_out FROM attendance WHERE employee_id = $1 AND attendance_date = $2) as today_punch_out,
        (SELECT work_hours FROM attendance WHERE employee_id = $1 AND attendance_date = $2) as today_work_hours,
        (SELECT COUNT(*) FROM attendance WHERE employee_id = $1 AND EXTRACT(YEAR FROM attendance_date) = EXTRACT(YEAR FROM CURRENT_DATE) AND EXTRACT(MONTH FROM attendance_date) = EXTRACT(MONTH FROM CURRENT_DATE) AND status = 'present') as month_present,
        (SELECT COUNT(*) FROM attendance WHERE employee_id = $1 AND EXTRACT(YEAR FROM attendance_date) = EXTRACT(YEAR FROM CURRENT_DATE) AND EXTRACT(MONTH FROM attendance_date) = EXTRACT(MONTH FROM CURRENT_DATE) AND status = 'absent') as month_absent,
        (SELECT COUNT(*) FROM attendance WHERE employee_id = $1 AND EXTRACT(YEAR FROM attendance_date) = EXTRACT(YEAR FROM CURRENT_DATE) AND EXTRACT(MONTH FROM attendance_date) = EXTRACT(MONTH FROM CURRENT_DATE) AND is_late = true) as month_late,
        (SELECT s.id FROM employees e JOIN shifts s ON s.id = e.shift_id WHERE e.id = $1) as shift_id,
        (SELECT s.name FROM employees e JOIN shifts s ON s.id = e.shift_id WHERE e.id = $1) as shift_name,
        (SELECT s.start_time FROM employees e JOIN shifts s ON s.id = e.shift_id WHERE e.id = $1) as shift_start,
        (SELECT s.end_time FROM employees e JOIN shifts s ON s.id = e.shift_id WHERE e.id = $1) as shift_end,
        (SELECT s.full_day_hours FROM employees e JOIN shifts s ON s.id = e.shift_id WHERE e.id = $1) as shift_full_day_hours`,
      [employeeId, today]
    );
    return result.rows[0];
  },
};

module.exports = Attendance;
