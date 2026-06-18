const { pgPool } = require('../config/database');
const { sendNotificationEmail } = require('../services/emailService');

const Notification = {
  async create(data) {
    const result = await pgPool.query(
      `INSERT INTO notifications (employee_id, title, message, type, reference_id, reference_type)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [data.employee_id, data.title, data.message, data.type || 'info', data.reference_id, data.reference_type]
    );

    // Send email notification asynchronously (never block main flow)
    pgPool.query(
      'SELECT email, first_name, last_name FROM employees WHERE id = $1',
      [data.employee_id]
    ).then((empResult) => {
      const emp = empResult.rows[0];
      if (emp) {
        sendNotificationEmail({
          employeeEmail: emp.email,
          employeeName: `${emp.first_name} ${emp.last_name}`,
          title: data.title,
          message: data.message,
          type: data.type || 'info',
        });
      }
    }).catch(() => {});

    return result.rows[0];
  },

  async findByEmployee(employeeId, { unreadOnly = false, limit = 20 } = {}) {
    let query = 'SELECT * FROM notifications WHERE employee_id = $1';
    if (unreadOnly) query += ' AND is_read = false';
    query += ' ORDER BY created_at DESC LIMIT $2';
    const result = await pgPool.query(query, [employeeId, limit]);
    return result.rows;
  },

  async markRead(id, employeeId) {
    await pgPool.query(
      'UPDATE notifications SET is_read = true WHERE id = $1 AND employee_id = $2',
      [id, employeeId]
    );
  },

  async markAllRead(employeeId) {
    await pgPool.query(
      'UPDATE notifications SET is_read = true WHERE employee_id = $1 AND is_read = false',
      [employeeId]
    );
  },

  async getUnreadCount(employeeId) {
    const result = await pgPool.query(
      'SELECT COUNT(*) FROM notifications WHERE employee_id = $1 AND is_read = false',
      [employeeId]
    );
    return parseInt(result.rows[0].count, 10);
  },
};

module.exports = Notification;
