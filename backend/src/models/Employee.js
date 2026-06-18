const { pgPool } = require('../config/database');
const bcrypt = require('bcryptjs');

const Employee = {
  async findByEmail(email) {
    const result = await pgPool.query(
      'SELECT * FROM employees WHERE email = $1 AND is_active = true',
      [email]
    );
    return result.rows[0] || null;
  },

  async findByEmployeeCode(code) {
    const result = await pgPool.query(
      'SELECT * FROM employees WHERE employee_code = $1',
      [code]
    );
    return result.rows[0] || null;
  },

  async findById(id) {
    const result = await pgPool.query(
      'SELECT id, employee_code, first_name, last_name, email, role, department, designation, shift_id, phone, reporting_manager_id, is_active, created_at FROM employees WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  },

  async findAll({ page = 1, limit = 50, department, search }) {
    let query = `SELECT e.id, e.employee_code, e.first_name, e.last_name, e.email, e.role, e.department, e.designation, e.shift_id, e.phone, e.reporting_manager_id, e.is_active, e.created_at,
      CASE WHEN m.id IS NOT NULL THEN m.first_name || ' ' || m.last_name ELSE NULL END AS manager_name
      FROM employees e LEFT JOIN employees m ON e.reporting_manager_id = m.id WHERE 1=1`;
    const params = [];
    let paramIndex = 1;

    if (department) {
      query += ` AND e.department = $${paramIndex++}`;
      params.push(department);
    }
    if (search) {
      query += ` AND (e.first_name ILIKE $${paramIndex} OR e.last_name ILIKE $${paramIndex} OR e.employee_code ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    const countResult = await pgPool.query(
      query.replace(/SELECT .+ FROM employees e/, 'SELECT COUNT(*) FROM employees e'),
      params
    );
    const total = parseInt(countResult.rows[0].count, 10);

    query += ` ORDER BY e.first_name ASC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(limit, (page - 1) * limit);

    const result = await pgPool.query(query, params);
    return { employees: result.rows, total, page, limit };
  },

  async create(data) {
    const hashedPassword = await bcrypt.hash(data.password, 12);
    const result = await pgPool.query(
      `INSERT INTO employees (employee_code, first_name, last_name, email, password_hash, role, department, designation, shift_id, phone, reporting_manager_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id, employee_code, first_name, last_name, email, role, department`,
      [data.employee_code, data.first_name, data.last_name, data.email, hashedPassword, data.role || 'employee', data.department, data.designation, data.shift_id, data.phone, data.reporting_manager_id || null]
    );
    return result.rows[0];
  },

  async update(id, data) {
    const fields = [];
    const values = [];
    let idx = 1;

    // Convert empty reporting_manager_id to null
    if ('reporting_manager_id' in data && (data.reporting_manager_id === '' || data.reporting_manager_id === null)) {
      data.reporting_manager_id = null;
    }

    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined && key !== 'id' && key !== 'password') {
        fields.push(`${key} = $${idx++}`);
        values.push(value);
      }
    }

    if (data.password) {
      fields.push(`password_hash = $${idx++}`);
      values.push(await bcrypt.hash(data.password, 12));
    }

    if (fields.length === 0) return null;

    fields.push(`updated_at = NOW()`);
    values.push(id);

    const result = await pgPool.query(
      `UPDATE employees SET ${fields.join(', ')} WHERE id = $${idx} RETURNING id, employee_code, first_name, last_name, email, role, department, designation`,
      values
    );
    return result.rows[0] || null;
  },

  async deactivate(id) {
    const result = await pgPool.query(
      'UPDATE employees SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING id',
      [id]
    );
    return result.rows[0] || null;
  },

  async hardDelete(id) {
    // Delete related records first, then the employee
    await pgPool.query('DELETE FROM attendance WHERE employee_id = $1', [id]);
    await pgPool.query('DELETE FROM leaves WHERE employee_id = $1', [id]);
    await pgPool.query('DELETE FROM leave_balances WHERE employee_id = $1', [id]);
    await pgPool.query('DELETE FROM regularization WHERE employee_id = $1', [id]);
    await pgPool.query('DELETE FROM notifications WHERE employee_id = $1', [id]);
    // Clear reporting_manager references
    await pgPool.query('UPDATE employees SET reporting_manager_id = NULL WHERE reporting_manager_id = $1', [id]);
    const result = await pgPool.query('DELETE FROM employees WHERE id = $1 RETURNING id', [id]);
    return result.rows[0] || null;
  },

  async validatePassword(employee, password) {
    return bcrypt.compare(password, employee.password_hash);
  },

  async getManagers() {
    const result = await pgPool.query(
      "SELECT id, employee_code, first_name, last_name, role, department FROM employees WHERE role IN ('admin', 'hr', 'manager') AND is_active = true ORDER BY first_name"
    );
    return result.rows;
  },

  async getReportees(managerId) {
    const result = await pgPool.query(
      'SELECT id FROM employees WHERE reporting_manager_id = $1 AND is_active = true',
      [managerId]
    );
    return result.rows.map(r => r.id);
  },

  async getHrAdmins() {
    const result = await pgPool.query(
      "SELECT id, email, first_name, last_name FROM employees WHERE role IN ('admin', 'hr') AND is_active = true"
    );
    return result.rows;
  },
};

module.exports = Employee;
