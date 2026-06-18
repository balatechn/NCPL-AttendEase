const { pgPool } = require('../config/database');

const SETTING_KEYS = [
  'company_name',
  'company_address',
  'payroll_pf_percent',
  'payroll_pf_wage_ceiling',
  'payroll_pt_amount',
  'payroll_fy_start_month',
];

const Payroll = {
  // ---------- Settings ----------
  async getSettings() {
    const result = await pgPool.query(
      'SELECT key, value FROM app_settings WHERE key = ANY($1)',
      [SETTING_KEYS]
    );
    const settings = {};
    result.rows.forEach((r) => { settings[r.key] = r.value; });
    return settings;
  },

  async updateSettings(values) {
    const entries = Object.entries(values).filter(([k]) => SETTING_KEYS.includes(k));
    for (const [key, value] of entries) {
      await pgPool.query(
        `INSERT INTO app_settings (key, value) VALUES ($1, $2)
         ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
        [key, String(value)]
      );
    }
    return this.getSettings();
  },

  // ---------- Salary structures ----------
  async listSalaryStructures({ search } = {}) {
    const params = [];
    let where = 'e.is_active = true';
    if (search) {
      params.push(`%${search}%`);
      where += ` AND (e.first_name ILIKE $1 OR e.last_name ILIKE $1 OR e.employee_code ILIKE $1)`;
    }
    const result = await pgPool.query(
      `SELECT e.id AS employee_id, e.employee_code, e.first_name, e.last_name,
              e.designation, e.department, e.date_of_joining,
              s.id AS structure_id, s.basic, s.hra, s.fixed_allowance, s.monthly_gross,
              s.pf_applicable, s.pt_applicable, s.effective_from,
              d.bank_account_no, d.uan, d.pan, d.pf_number
       FROM employees e
       LEFT JOIN LATERAL (
         SELECT * FROM salary_structures ss
         WHERE ss.employee_id = e.id AND ss.is_active = true
         ORDER BY ss.effective_from DESC LIMIT 1
       ) s ON true
       LEFT JOIN payroll_employee_details d ON d.employee_id = e.id
       WHERE ${where}
       ORDER BY e.first_name ASC`,
      params
    );
    return result.rows;
  },

  async getStructureHistory(employeeId) {
    const result = await pgPool.query(
      `SELECT * FROM salary_structures WHERE employee_id = $1 ORDER BY effective_from DESC`,
      [employeeId]
    );
    return result.rows;
  },

  async getActiveStructure(employeeId, asOfDate) {
    const result = await pgPool.query(
      `SELECT * FROM salary_structures
       WHERE employee_id = $1 AND is_active = true AND effective_from <= $2
       ORDER BY effective_from DESC LIMIT 1`,
      [employeeId, asOfDate]
    );
    return result.rows[0] || null;
  },

  async upsertSalaryStructure(data, userId) {
    const { employee_id, effective_from, basic, hra, fixed_allowance,
            pf_applicable = true, pt_applicable = true } = data;
    // Deactivate any existing structure with the same effective_from, then insert fresh
    await pgPool.query(
      `UPDATE salary_structures SET is_active = false, updated_at = NOW()
       WHERE employee_id = $1 AND effective_from = $2`,
      [employee_id, effective_from]
    );
    const result = await pgPool.query(
      `INSERT INTO salary_structures
         (employee_id, effective_from, basic, hra, fixed_allowance, pf_applicable, pt_applicable, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [employee_id, effective_from, basic || 0, hra || 0, fixed_allowance || 0,
       pf_applicable, pt_applicable, userId]
    );
    return result.rows[0];
  },

  async upsertPayrollDetails(employeeId, data) {
    const { bank_account_no = null, uan = null, pan = null, pf_number = null } = data;
    const result = await pgPool.query(
      `INSERT INTO payroll_employee_details (employee_id, bank_account_no, uan, pan, pf_number)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (employee_id) DO UPDATE
         SET bank_account_no = $2, uan = $3, pan = $4, pf_number = $5, updated_at = NOW()
       RETURNING *`,
      [employeeId, bank_account_no, uan, pan, pf_number]
    );
    return result.rows[0];
  },

  // ---------- Runs ----------
  async listRuns() {
    const result = await pgPool.query(
      `SELECT r.*,
              cb.first_name AS created_by_first, cb.last_name AS created_by_last,
              fb.first_name AS finalized_by_first, fb.last_name AS finalized_by_last
       FROM payroll_runs r
       LEFT JOIN employees cb ON r.created_by = cb.id
       LEFT JOIN employees fb ON r.finalized_by = fb.id
       ORDER BY r.period_year DESC, r.period_month DESC`
    );
    return result.rows;
  },

  async getRun(id) {
    const result = await pgPool.query('SELECT * FROM payroll_runs WHERE id = $1', [id]);
    return result.rows[0] || null;
  },

  async getRunByPeriod(month, year) {
    const result = await pgPool.query(
      'SELECT * FROM payroll_runs WHERE period_month = $1 AND period_year = $2',
      [month, year]
    );
    return result.rows[0] || null;
  },

  async createRun({ period_month, period_year, pay_date }, userId) {
    const result = await pgPool.query(
      `INSERT INTO payroll_runs (period_month, period_year, pay_date, status, created_by)
       VALUES ($1,$2,$3,'draft',$4) RETURNING *`,
      [period_month, period_year, pay_date || null, userId]
    );
    return result.rows[0];
  },

  async clearPayslips(runId) {
    await pgPool.query('DELETE FROM payslips WHERE run_id = $1', [runId]);
  },

  async insertPayslip(p) {
    const result = await pgPool.query(
      `INSERT INTO payslips
         (run_id, employee_id, paid_days, lop_days, total_days,
          basic, hra, fixed_allowance, gross_earnings,
          epf, professional_tax, income_tax, total_deductions, net_pay)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING *`,
      [p.run_id, p.employee_id, p.paid_days, p.lop_days, p.total_days,
       p.basic, p.hra, p.fixed_allowance, p.gross_earnings,
       p.epf, p.professional_tax, p.income_tax, p.total_deductions, p.net_pay]
    );
    return result.rows[0];
  },

  async getPayslips(runId) {
    const result = await pgPool.query(
      `SELECT ps.*, e.employee_code, e.first_name, e.last_name, e.designation, e.department
       FROM payslips ps
       JOIN employees e ON ps.employee_id = e.id
       WHERE ps.run_id = $1
       ORDER BY e.first_name ASC`,
      [runId]
    );
    return result.rows;
  },

  async getPayslip(id) {
    const result = await pgPool.query(
      `SELECT ps.*, e.employee_code, e.first_name, e.last_name, e.designation,
              e.department, e.date_of_joining, e.email,
              d.bank_account_no, d.uan, d.pan, d.pf_number,
              r.period_month, r.period_year, r.pay_date, r.status AS run_status
       FROM payslips ps
       JOIN employees e ON ps.employee_id = e.id
       LEFT JOIN payroll_employee_details d ON d.employee_id = e.id
       JOIN payroll_runs r ON ps.run_id = r.id
       WHERE ps.id = $1`,
      [id]
    );
    return result.rows[0] || null;
  },

  async updatePayslipFields(id, data) {
    const allowed = ['paid_days', 'lop_days', 'basic', 'hra', 'fixed_allowance',
      'gross_earnings', 'epf', 'professional_tax', 'income_tax', 'total_deductions', 'net_pay'];
    const fields = [];
    const values = [];
    let idx = 1;
    for (const [key, value] of Object.entries(data)) {
      if (allowed.includes(key) && value !== undefined) {
        fields.push(`${key} = $${idx++}`);
        values.push(value);
      }
    }
    if (fields.length === 0) return null;
    fields.push('updated_at = NOW()');
    values.push(id);
    const result = await pgPool.query(
      `UPDATE payslips SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    return result.rows[0] || null;
  },

  async setPayslipBreakdown(id, breakdown) {
    await pgPool.query(
      'UPDATE payslips SET breakdown = $1, updated_at = NOW() WHERE id = $2',
      [JSON.stringify(breakdown), id]
    );
  },

  async updateRunTotals(runId) {
    await pgPool.query(
      `UPDATE payroll_runs r SET
         total_gross = COALESCE(t.gross, 0),
         total_deductions = COALESCE(t.ded, 0),
         total_net = COALESCE(t.net, 0),
         employee_count = COALESCE(t.cnt, 0),
         updated_at = NOW()
       FROM (
         SELECT SUM(gross_earnings) AS gross, SUM(total_deductions) AS ded,
                SUM(net_pay) AS net, COUNT(*) AS cnt
         FROM payslips WHERE run_id = $1
       ) t
       WHERE r.id = $1`,
      [runId]
    );
  },

  async finalizeRun(id, userId) {
    const result = await pgPool.query(
      `UPDATE payroll_runs
       SET status = 'finalized', finalized_by = $2, finalized_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND status = 'draft' RETURNING *`,
      [id, userId]
    );
    return result.rows[0] || null;
  },

  async deleteRun(id) {
    const result = await pgPool.query(
      `DELETE FROM payroll_runs WHERE id = $1 AND status = 'draft' RETURNING id`,
      [id]
    );
    return result.rows[0] || null;
  },

  // ---------- Employee self-service ----------
  async getEmployeePayslips(employeeId) {
    const result = await pgPool.query(
      `SELECT ps.id, ps.gross_earnings, ps.total_deductions, ps.net_pay,
              r.period_month, r.period_year, r.pay_date, r.finalized_at
       FROM payslips ps
       JOIN payroll_runs r ON ps.run_id = r.id
       WHERE ps.employee_id = $1 AND r.status = 'finalized'
       ORDER BY r.period_year DESC, r.period_month DESC`,
      [employeeId]
    );
    return result.rows;
  },

  // ---------- Helpers for draft generation ----------
  async getActiveEmployeesWithStructure(asOfDate) {
    const result = await pgPool.query(
      `SELECT e.id AS employee_id, e.employee_code, e.first_name, e.last_name,
              s.basic, s.hra, s.fixed_allowance, s.pf_applicable, s.pt_applicable
       FROM employees e
       JOIN LATERAL (
         SELECT * FROM salary_structures ss
         WHERE ss.employee_id = e.id AND ss.is_active = true AND ss.effective_from <= $1
         ORDER BY ss.effective_from DESC LIMIT 1
       ) s ON true
       WHERE e.is_active = true
       ORDER BY e.first_name ASC`,
      [asOfDate]
    );
    return result.rows;
  },

  async getAttendanceCounts(employeeId, year, month) {
    const result = await pgPool.query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'absent')    AS absent_days,
         COUNT(*) FILTER (WHERE status = 'half-day')  AS half_days,
         COUNT(*) FILTER (WHERE status = 'incomplete') AS incomplete_days
       FROM attendance
       WHERE employee_id = $1
         AND EXTRACT(YEAR FROM attendance_date) = $2
         AND EXTRACT(MONTH FROM attendance_date) = $3`,
      [employeeId, year, month]
    );
    return result.rows[0];
  },

  // YTD = sum of this employee's finalized payslips in the financial year up to (and including) the given run
  async getYtdTotals(employeeId, fyStartYear, fyStartMonth, periodYear, periodMonth, excludeRunId) {
    const result = await pgPool.query(
      `SELECT
         COALESCE(SUM(ps.basic),0) AS basic,
         COALESCE(SUM(ps.hra),0) AS hra,
         COALESCE(SUM(ps.fixed_allowance),0) AS fixed_allowance,
         COALESCE(SUM(ps.gross_earnings),0) AS gross_earnings,
         COALESCE(SUM(ps.epf),0) AS epf,
         COALESCE(SUM(ps.professional_tax),0) AS professional_tax,
         COALESCE(SUM(ps.income_tax),0) AS income_tax,
         COALESCE(SUM(ps.total_deductions),0) AS total_deductions,
         COALESCE(SUM(ps.net_pay),0) AS net_pay
       FROM payslips ps
       JOIN payroll_runs r ON ps.run_id = r.id
       WHERE ps.employee_id = $1
         AND r.status = 'finalized'
         AND r.id <> $6
         AND (r.period_year * 12 + r.period_month) >= ($2 * 12 + $3)
         AND (r.period_year * 12 + r.period_month) <= ($4 * 12 + $5)`,
      [employeeId, fyStartYear, fyStartMonth, periodYear, periodMonth, excludeRunId || -1]
    );
    return result.rows[0];
  },
};

module.exports = Payroll;
