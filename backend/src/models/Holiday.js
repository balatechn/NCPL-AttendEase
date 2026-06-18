const { pgPool } = require('../config/database');

class Holiday {
  static async findAll(year) {
    const y = year || new Date().getFullYear();
    const { rows } = await pgPool.query(
      `SELECT id, TO_CHAR(holiday_date, 'YYYY-MM-DD') as holiday_date, name, is_optional, created_at, updated_at
       FROM public_holidays
       WHERE EXTRACT(YEAR FROM holiday_date) = $1
       ORDER BY holiday_date ASC`,
      [y]
    );
    return rows;
  }

  static async findByDate(date) {
    const { rows } = await pgPool.query(
      'SELECT * FROM public_holidays WHERE holiday_date = $1',
      [date]
    );
    return rows[0] || null;
  }

  static async create({ holiday_date, name, is_optional }) {
    const { rows } = await pgPool.query(
      `INSERT INTO public_holidays (holiday_date, name, is_optional, created_at, updated_at)
       VALUES ($1, $2, $3, NOW(), NOW()) RETURNING *`,
      [holiday_date, name, is_optional || false]
    );
    return rows[0];
  }

  static async update(id, { holiday_date, name, is_optional }) {
    const { rows } = await pgPool.query(
      `UPDATE public_holidays
       SET holiday_date = $1, name = $2, is_optional = $3, updated_at = NOW()
       WHERE id = $4 RETURNING *`,
      [holiday_date, name, is_optional || false, id]
    );
    return rows[0];
  }

  static async delete(id) {
    const { rowCount } = await pgPool.query(
      'DELETE FROM public_holidays WHERE id = $1',
      [id]
    );
    return rowCount > 0;
  }

  static async bulkCreate(holidays) {
    const client = await pgPool.connect();
    try {
      await client.query('BEGIN');
      let inserted = 0;
      for (const h of holidays) {
        const result = await client.query(
          `INSERT INTO public_holidays (holiday_date, name, is_optional, created_at, updated_at)
           VALUES ($1, $2, $3, NOW(), NOW())
           ON CONFLICT (holiday_date) DO UPDATE SET name = $2, is_optional = $3, updated_at = NOW()`,
          [h.holiday_date, h.name, h.is_optional || false]
        );
        inserted += result.rowCount;
      }
      await client.query('COMMIT');
      return inserted;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}

module.exports = Holiday;
