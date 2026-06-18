const { pgPool } = require('../config/database');

const Regularization = {
  async create(data) {
    const result = await pgPool.query(
      `INSERT INTO regularization (employee_id, attendance_date, requested_punch_in, requested_punch_out, reason, regularization_type, status)
       VALUES ($1,$2,$3,$4,$5,$6,'pending') RETURNING *`,
      [data.employee_id, data.attendance_date, data.requested_punch_in, data.requested_punch_out, data.reason, data.regularization_type || 'miss_punch']
    );
    return result.rows[0];
  },

  async findById(id) {
    const result = await pgPool.query(
      `SELECT r.*, e.first_name, e.last_name, e.employee_code
       FROM regularization r JOIN employees e ON r.employee_id = e.id
       WHERE r.id = $1`,
      [id]
    );
    return result.rows[0] || null;
  },

  async findByEmployee(employeeId) {
    const result = await pgPool.query(
      'SELECT * FROM regularization WHERE employee_id = $1 ORDER BY created_at DESC',
      [employeeId]
    );
    return result.rows;
  },

  async findPending({ department, managerId, managerRole } = {}) {
    let query = `SELECT r.*, e.first_name, e.last_name, e.employee_code, e.department
       FROM regularization r JOIN employees e ON r.employee_id = e.id
       WHERE r.status = 'pending'`;
    const params = [];
    if (managerRole === 'manager' && managerId) {
      params.push(managerId);
      query += ` AND e.reporting_manager_id = $${params.length}`;
    }
    if (department) {
      params.push(department);
      query += ` AND e.department = $${params.length}`;
    }
    query += ' ORDER BY r.created_at ASC';
    const result = await pgPool.query(query, params);
    return result.rows;
  },

  async updateStatus(id, status, approvedBy, remarks) {
    const result = await pgPool.query(
      `UPDATE regularization SET status = $1, approved_by = $2, remarks = $3, updated_at = NOW()
       WHERE id = $4 RETURNING *`,
      [status, approvedBy, remarks, id]
    );
    return result.rows[0] || null;
  },
};

module.exports = Regularization;
