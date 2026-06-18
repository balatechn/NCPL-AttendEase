const { pgPool } = require('../config/database');

const Shift = {
  async findAll() {
    const result = await pgPool.query('SELECT * FROM shifts ORDER BY name ASC');
    return result.rows;
  },

  async findById(id) {
    const result = await pgPool.query('SELECT * FROM shifts WHERE id = $1', [id]);
    return result.rows[0] || null;
  },

  async create(data) {
    const result = await pgPool.query(
      `INSERT INTO shifts (name, start_time, end_time, grace_minutes, half_day_hours, full_day_hours)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [data.name, data.start_time, data.end_time, data.grace_minutes || 15, data.half_day_hours || 4, data.full_day_hours || 8]
    );
    return result.rows[0];
  },

  async update(id, data) {
    const result = await pgPool.query(
      `UPDATE shifts SET name=$1, start_time=$2, end_time=$3, grace_minutes=$4, half_day_hours=$5, full_day_hours=$6, updated_at=NOW()
       WHERE id=$7 RETURNING *`,
      [data.name, data.start_time, data.end_time, data.grace_minutes, data.half_day_hours, data.full_day_hours, id]
    );
    return result.rows[0] || null;
  },

  async delete(id) {
    await pgPool.query('DELETE FROM shifts WHERE id = $1', [id]);
  },
};

module.exports = Shift;
