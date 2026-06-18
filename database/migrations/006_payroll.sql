-- Migration 006: Payroll module
-- Adds salary structures, monthly payroll runs (draft → finalize), and payslips.
-- Earnings model (fixed 3 components): Basic, HRA, Fixed Allowance.
-- Deductions: EPF (statutory), Professional Tax (statutory), Income Tax (HR-entered).

-- ============================================
-- 1. Date of joining (needed on the payslip + LOP proration)
-- ============================================
ALTER TABLE employees ADD COLUMN IF NOT EXISTS date_of_joining DATE;

-- ============================================
-- 2. Static payroll details per employee (bank / UAN / PAN / PF no.)
-- ============================================
CREATE TABLE IF NOT EXISTS payroll_employee_details (
    employee_id     INTEGER PRIMARY KEY REFERENCES employees(id) ON DELETE CASCADE,
    bank_account_no VARCHAR(30),
    uan             VARCHAR(20),
    pan             VARCHAR(10),
    pf_number       VARCHAR(30),
    created_at      TIMESTAMP DEFAULT NOW(),
    updated_at      TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- 3. Effective-dated salary structure (fixed 3-component model)
-- ============================================
CREATE TABLE IF NOT EXISTS salary_structures (
    id              SERIAL PRIMARY KEY,
    employee_id     INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    effective_from  DATE NOT NULL,
    basic           NUMERIC(12,2) NOT NULL DEFAULT 0,
    hra             NUMERIC(12,2) NOT NULL DEFAULT 0,
    fixed_allowance NUMERIC(12,2) NOT NULL DEFAULT 0,
    monthly_gross   NUMERIC(12,2) GENERATED ALWAYS AS (basic + hra + fixed_allowance) STORED,
    pf_applicable   BOOLEAN NOT NULL DEFAULT true,
    pt_applicable   BOOLEAN NOT NULL DEFAULT true,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_by      INTEGER REFERENCES employees(id),
    created_at      TIMESTAMP DEFAULT NOW(),
    updated_at      TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_salary_structures_emp ON salary_structures(employee_id, effective_from DESC);

-- ============================================
-- 4. Monthly payroll run (one per month/year) — draft or finalized
-- ============================================
CREATE TABLE IF NOT EXISTS payroll_runs (
    id               SERIAL PRIMARY KEY,
    period_month     INTEGER NOT NULL CHECK (period_month BETWEEN 1 AND 12),
    period_year      INTEGER NOT NULL,
    pay_date         DATE,
    status           VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'finalized')),
    total_gross      NUMERIC(14,2) DEFAULT 0,
    total_deductions NUMERIC(14,2) DEFAULT 0,
    total_net        NUMERIC(14,2) DEFAULT 0,
    employee_count   INTEGER DEFAULT 0,
    created_by       INTEGER REFERENCES employees(id),
    finalized_by     INTEGER REFERENCES employees(id),
    finalized_at     TIMESTAMP,
    created_at       TIMESTAMP DEFAULT NOW(),
    updated_at       TIMESTAMP DEFAULT NOW(),
    UNIQUE(period_month, period_year)
);
CREATE INDEX IF NOT EXISTS idx_payroll_runs_period ON payroll_runs(period_year, period_month);

-- ============================================
-- 5. Per-employee payslip within a run
-- ============================================
CREATE TABLE IF NOT EXISTS payslips (
    id               SERIAL PRIMARY KEY,
    run_id           INTEGER NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
    employee_id      INTEGER NOT NULL REFERENCES employees(id),
    paid_days        NUMERIC(5,2) NOT NULL DEFAULT 0,
    lop_days         NUMERIC(5,2) NOT NULL DEFAULT 0,
    total_days       INTEGER NOT NULL DEFAULT 0,
    -- Earnings (prorated for LOP)
    basic            NUMERIC(12,2) NOT NULL DEFAULT 0,
    hra              NUMERIC(12,2) NOT NULL DEFAULT 0,
    fixed_allowance  NUMERIC(12,2) NOT NULL DEFAULT 0,
    gross_earnings   NUMERIC(12,2) NOT NULL DEFAULT 0,
    -- Deductions
    epf              NUMERIC(12,2) NOT NULL DEFAULT 0,
    professional_tax NUMERIC(12,2) NOT NULL DEFAULT 0,
    income_tax       NUMERIC(12,2) NOT NULL DEFAULT 0,
    total_deductions NUMERIC(12,2) NOT NULL DEFAULT 0,
    net_pay          NUMERIC(12,2) NOT NULL DEFAULT 0,
    -- Frozen YTD totals + full line snapshot (set at finalize time)
    breakdown        JSONB,
    created_at       TIMESTAMP DEFAULT NOW(),
    updated_at       TIMESTAMP DEFAULT NOW(),
    UNIQUE(run_id, employee_id)
);
CREATE INDEX IF NOT EXISTS idx_payslips_run ON payslips(run_id);
CREATE INDEX IF NOT EXISTS idx_payslips_employee ON payslips(employee_id);

-- ============================================
-- 6. Default company + statutory payroll settings (idempotent)
-- ============================================
INSERT INTO app_settings (key, value) VALUES
    ('company_name', 'NATIONAL CONSULTING PRIVATE LIMITED'),
    ('company_address', '4th Floor, 909 Lavelle, Sampangi Rama Nagar Shanthala Nagar, Lavelle Road Bengaluru Karnataka 560001 India'),
    ('payroll_pf_percent', '12'),
    ('payroll_pf_wage_ceiling', '15000'),
    ('payroll_pt_amount', '200'),
    ('payroll_fy_start_month', '4')
ON CONFLICT (key) DO NOTHING;
