-- AttendEase Database Schema
-- Run against the 'attendease' database

-- Shifts (must exist before employees for FK)
CREATE TABLE IF NOT EXISTS shifts (
  id               SERIAL PRIMARY KEY,
  name             VARCHAR(100) NOT NULL,
  start_time       TIME NOT NULL,
  end_time         TIME NOT NULL,
  grace_minutes    INTEGER DEFAULT 15,
  half_day_hours   NUMERIC(4,2) DEFAULT 4,
  full_day_hours   NUMERIC(4,2) DEFAULT 8,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Employees
CREATE TABLE IF NOT EXISTS employees (
  id                    SERIAL PRIMARY KEY,
  employee_code         VARCHAR(50) UNIQUE NOT NULL,
  first_name            VARCHAR(100) NOT NULL,
  last_name             VARCHAR(100) NOT NULL,
  email                 VARCHAR(255) UNIQUE NOT NULL,
  password_hash         VARCHAR(255),
  role                  VARCHAR(50) DEFAULT 'employee',
  department            VARCHAR(100),
  designation           VARCHAR(100),
  shift_id              INTEGER REFERENCES shifts(id),
  phone                 VARCHAR(20),
  reporting_manager_id  INTEGER REFERENCES employees(id),
  date_of_joining       DATE,
  is_active             BOOLEAN DEFAULT true,
  must_change_password  BOOLEAN DEFAULT false,
  azure_oid             VARCHAR(100),
  biometric_id          VARCHAR(100),
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- Attendance
CREATE TABLE IF NOT EXISTS attendance (
  id               SERIAL PRIMARY KEY,
  employee_id      INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  attendance_date  DATE NOT NULL,
  punch_in         TIME,
  punch_out        TIME,
  status           VARCHAR(50) DEFAULT 'present',
  work_hours       NUMERIC(5,2),
  is_late          BOOLEAN DEFAULT false,
  late_minutes     INTEGER DEFAULT 0,
  source           VARCHAR(50) DEFAULT 'manual',
  device_serial    VARCHAR(100),
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(employee_id, attendance_date)
);

-- Leaves
CREATE TABLE IF NOT EXISTS leaves (
  id               SERIAL PRIMARY KEY,
  employee_id      INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  leave_type       VARCHAR(50) NOT NULL,
  start_date       DATE NOT NULL,
  end_date         DATE NOT NULL,
  reason           TEXT,
  status           VARCHAR(50) DEFAULT 'pending',
  is_lwp           BOOLEAN DEFAULT false,
  approved_by      INTEGER REFERENCES employees(id),
  approved_at      TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Leave Balances
CREATE TABLE IF NOT EXISTS leave_balance (
  id            SERIAL PRIMARY KEY,
  employee_id   INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  year          INTEGER NOT NULL,
  leave_type    VARCHAR(50) NOT NULL,
  total_allowed NUMERIC(6,2) DEFAULT 0,
  used          NUMERIC(6,2) DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(employee_id, year, leave_type)
);

-- Regularization
CREATE TABLE IF NOT EXISTS regularization (
  id                   SERIAL PRIMARY KEY,
  employee_id          INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  attendance_date      DATE NOT NULL,
  requested_punch_in   TIME,
  requested_punch_out  TIME,
  reason               TEXT NOT NULL,
  regularization_type  VARCHAR(50) DEFAULT 'miss_punch',
  status               VARCHAR(50) DEFAULT 'pending',
  approved_by          INTEGER REFERENCES employees(id),
  approved_at          TIMESTAMPTZ,
  rejection_reason     TEXT,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

-- Notifications
CREATE TABLE IF NOT EXISTS notifications (
  id              SERIAL PRIMARY KEY,
  employee_id     INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  title           VARCHAR(255) NOT NULL,
  message         TEXT NOT NULL,
  type            VARCHAR(50) DEFAULT 'info',
  reference_id    INTEGER,
  reference_type  VARCHAR(50),
  is_read         BOOLEAN DEFAULT false,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Public Holidays
CREATE TABLE IF NOT EXISTS public_holidays (
  id            SERIAL PRIMARY KEY,
  holiday_date  DATE UNIQUE NOT NULL,
  name          VARCHAR(255) NOT NULL,
  is_optional   BOOLEAN DEFAULT false,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- App Settings (key-value store)
CREATE TABLE IF NOT EXISTS app_settings (
  id          SERIAL PRIMARY KEY,
  key         VARCHAR(100) UNIQUE NOT NULL,
  value       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Salary Structures
CREATE TABLE IF NOT EXISTS salary_structures (
  id               SERIAL PRIMARY KEY,
  employee_id      INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  effective_from   DATE NOT NULL,
  basic            NUMERIC(12,2) DEFAULT 0,
  hra              NUMERIC(12,2) DEFAULT 0,
  fixed_allowance  NUMERIC(12,2) DEFAULT 0,
  monthly_gross    NUMERIC(12,2) GENERATED ALWAYS AS (basic + hra + fixed_allowance) STORED,
  pf_applicable    BOOLEAN DEFAULT true,
  pt_applicable    BOOLEAN DEFAULT true,
  is_active        BOOLEAN DEFAULT true,
  created_by       INTEGER REFERENCES employees(id),
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Payroll Employee Details
CREATE TABLE IF NOT EXISTS payroll_employee_details (
  id               SERIAL PRIMARY KEY,
  employee_id      INTEGER UNIQUE NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  bank_account_no  VARCHAR(100),
  bank_name        VARCHAR(100),
  ifsc_code        VARCHAR(20),
  uan              VARCHAR(50),
  pan              VARCHAR(20),
  pf_number        VARCHAR(50),
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Payroll Runs
CREATE TABLE IF NOT EXISTS payroll_runs (
  id             SERIAL PRIMARY KEY,
  period_month   INTEGER NOT NULL,
  period_year    INTEGER NOT NULL,
  pay_date       DATE,
  status         VARCHAR(50) DEFAULT 'draft',
  created_by     INTEGER REFERENCES employees(id),
  finalized_by   INTEGER REFERENCES employees(id),
  finalized_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(period_month, period_year)
);

-- Payslips
CREATE TABLE IF NOT EXISTS payslips (
  id                 SERIAL PRIMARY KEY,
  run_id             INTEGER NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
  employee_id        INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  paid_days          NUMERIC(5,2) DEFAULT 0,
  lop_days           NUMERIC(5,2) DEFAULT 0,
  total_days         INTEGER DEFAULT 0,
  basic              NUMERIC(12,2) DEFAULT 0,
  hra                NUMERIC(12,2) DEFAULT 0,
  fixed_allowance    NUMERIC(12,2) DEFAULT 0,
  gross_earnings     NUMERIC(12,2) DEFAULT 0,
  epf                NUMERIC(12,2) DEFAULT 0,
  professional_tax   NUMERIC(12,2) DEFAULT 0,
  income_tax         NUMERIC(12,2) DEFAULT 0,
  total_deductions   NUMERIC(12,2) DEFAULT 0,
  net_pay            NUMERIC(12,2) DEFAULT 0,
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(run_id, employee_id)
);

-- Default shift seed
INSERT INTO shifts (name, start_time, end_time, grace_minutes, half_day_hours, full_day_hours)
VALUES ('General', '09:00:00', '18:00:00', 15, 4.0, 8.0)
ON CONFLICT DO NOTHING;

-- Default app settings seed
INSERT INTO app_settings (key, value) VALUES
  ('company_name', 'National Consulting Private Ltd.'),
  ('company_address', 'India'),
  ('payroll_pf_percent', '12'),
  ('payroll_pf_wage_ceiling', '15000'),
  ('payroll_pt_amount', '200'),
  ('payroll_fy_start_month', '4')
ON CONFLICT (key) DO NOTHING;
