const { pgPool } = require('../config/database');

const Leave = {
  async create(data) {
    const result = await pgPool.query(
      `INSERT INTO leaves (employee_id, leave_type, start_date, end_date, reason, status, is_lwp)
       VALUES ($1,$2,$3,$4,$5,'pending',$6) RETURNING *`,
      [data.employee_id, data.leave_type, data.start_date, data.end_date, data.reason, data.is_lwp || false]
    );
    return result.rows[0];
  },

  async findById(id) {
    const result = await pgPool.query(
      `SELECT l.*, e.first_name, e.last_name, e.employee_code, e.department
       FROM leaves l JOIN employees e ON l.employee_id = e.id
       WHERE l.id = $1`,
      [id]
    );
    return result.rows[0] || null;
  },

  async findByEmployee(employeeId, { year, status } = {}) {
    let query = `SELECT * FROM leaves WHERE employee_id = $1`;
    const params = [employeeId];
    let idx = 2;

    if (year) {
      query += ` AND EXTRACT(YEAR FROM start_date) = $${idx++}`;
      params.push(year);
    }
    if (status) {
      query += ` AND status = $${idx++}`;
      params.push(status);
    }

    query += ' ORDER BY created_at DESC';
    const result = await pgPool.query(query, params);
    return result.rows;
  },

  async findPending({ department, managerId, managerRole } = {}) {
    let query = `
      SELECT l.*, e.first_name, e.last_name, e.employee_code, e.department, e.reporting_manager_id
      FROM leaves l JOIN employees e ON l.employee_id = e.id
      WHERE l.status = 'pending'`;
    const params = [];
    let idx = 1;

    // Manager role sees only their direct reportees' pending requests
    if (managerId && managerRole === 'manager') {
      query += ` AND e.reporting_manager_id = $${idx++}`;
      params.push(managerId);
    }
    // HR/Admin: see requests where no reporting manager is assigned, OR the employee's manager is themselves
    // Essentially they see all pending (fallback approver)

    if (department) {
      query += ` AND e.department = $${idx++}`;
      params.push(department);
    }

    query += ' ORDER BY l.created_at ASC';
    const result = await pgPool.query(query, params);
    return result.rows;
  },

  async updateStatus(id, status, approvedBy, remarks) {
    const result = await pgPool.query(
      `UPDATE leaves SET status = $1, approved_by = $2, remarks = $3, updated_at = NOW()
       WHERE id = $4 RETURNING *`,
      [status, approvedBy, remarks, id]
    );
    return result.rows[0] || null;
  },

  async getBalance(employeeId, year) {
    const result = await pgPool.query(
      `SELECT 
         lb.leave_type, lb.total_allowed, lb.used, lb.total_allowed - lb.used as remaining
       FROM leave_balance lb
       WHERE lb.employee_id = $1 AND lb.year = $2`,
      [employeeId, year]
    );
    return result.rows;
  },

  async deductBalance(employeeId, leaveType, days, year) {
    await pgPool.query(
      `UPDATE leave_balance SET used = used + $1, updated_at = NOW()
       WHERE employee_id = $2 AND leave_type = $3 AND year = $4`,
      [days, employeeId, leaveType, year]
    );
  },

  async restoreBalance(employeeId, leaveType, days, year) {
    await pgPool.query(
      `UPDATE leave_balance SET used = GREATEST(used - $1, 0), updated_at = NOW()
       WHERE employee_id = $2 AND leave_type = $3 AND year = $4`,
      [days, employeeId, leaveType, year]
    );
  },
};

module.exports = Leave;
