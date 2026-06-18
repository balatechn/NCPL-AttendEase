-- NCPL AttendEase - PostgreSQL Database Schema
-- Run this migration to set up the complete database

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- EMPLOYEES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS employees (
    id              SERIAL PRIMARY KEY,
    employee_code   VARCHAR(20) UNIQUE NOT NULL,
    first_name      VARCHAR(100) NOT NULL,
    last_name       VARCHAR(100) NOT NULL,
    email           VARCHAR(255) UNIQUE NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,
    role            VARCHAR(20) NOT NULL DEFAULT 'employee' CHECK (role IN ('admin', 'hr', 'manager', 'employee')),
    department      VARCHAR(100),
    designation     VARCHAR(100),
    shift_id        INTEGER,
    phone           VARCHAR(20),
    is_active       BOOLEAN DEFAULT true,
    created_at      TIMESTAMP DEFAULT NOW(),
    updated_at      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_employees_code ON employees(employee_code);
CREATE INDEX idx_employees_email ON employees(email);
CREATE INDEX idx_employees_department ON employees(department);

-- ============================================
-- SHIFTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS shifts (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(50) NOT NULL,
    start_time      TIME NOT NULL DEFAULT '09:00:00',
    end_time        TIME NOT NULL DEFAULT '18:00:00',
    grace_minutes   INTEGER DEFAULT 15,
    half_day_hours  DECIMAL(4,2) DEFAULT 4.00,
    full_day_hours  DECIMAL(4,2) DEFAULT 8.00,
    created_at      TIMESTAMP DEFAULT NOW(),
    updated_at      TIMESTAMP DEFAULT NOW()
);

ALTER TABLE employees ADD CONSTRAINT fk_employees_shift FOREIGN KEY (shift_id) REFERENCES shifts(id);

-- ============================================
-- ATTENDANCE TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS attendance (
    id              SERIAL PRIMARY KEY,
    employee_id     INTEGER NOT NULL REFERENCES employees(id),
    attendance_date DATE NOT NULL,
    punch_in        TIME,
    punch_out       TIME,
    status          VARCHAR(20) NOT NULL DEFAULT 'absent' CHECK (status IN ('present', 'absent', 'half-day', 'leave', 'holiday', 'weekend', 'incomplete')),
    work_hours      DECIMAL(5,2),
    is_late         BOOLEAN DEFAULT false,
    late_minutes    INTEGER DEFAULT 0,
    source          VARCHAR(20) DEFAULT 'biometric' CHECK (source IN ('biometric', 'manual', 'regularization', 'system')),
    device_serial   VARCHAR(50),
    override_by     INTEGER REFERENCES employees(id),
    override_reason TEXT,
    created_at      TIMESTAMP DEFAULT NOW(),
    updated_at      TIMESTAMP DEFAULT NOW(),
    UNIQUE(employee_id, attendance_date)
);

CREATE INDEX idx_attendance_employee_date ON attendance(employee_id, attendance_date);
CREATE INDEX idx_attendance_date ON attendance(attendance_date);
CREATE INDEX idx_attendance_status ON attendance(status);

-- ============================================
-- LEAVES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS leaves (
    id              SERIAL PRIMARY KEY,
    employee_id     INTEGER NOT NULL REFERENCES employees(id),
    leave_type      VARCHAR(20) NOT NULL CHECK (leave_type IN ('casual', 'sick', 'earned', 'compensatory', 'maternity', 'paternity', 'unpaid')),
    start_date      DATE NOT NULL,
    end_date        DATE NOT NULL,
    reason          TEXT NOT NULL,
    status          VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
    approved_by     INTEGER REFERENCES employees(id),
    remarks         TEXT,
    created_at      TIMESTAMP DEFAULT NOW(),
    updated_at      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_leaves_employee ON leaves(employee_id);
CREATE INDEX idx_leaves_status ON leaves(status);
CREATE INDEX idx_leaves_dates ON leaves(start_date, end_date);

-- ============================================
-- LEAVE BALANCE TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS leave_balance (
    id              SERIAL PRIMARY KEY,
    employee_id     INTEGER NOT NULL REFERENCES employees(id),
    year            INTEGER NOT NULL,
    leave_type      VARCHAR(20) NOT NULL,
    total_allowed   INTEGER NOT NULL DEFAULT 0,
    used            INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMP DEFAULT NOW(),
    updated_at      TIMESTAMP DEFAULT NOW(),
    UNIQUE(employee_id, year, leave_type)
);

-- ============================================
-- REGULARIZATION TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS regularization (
    id                  SERIAL PRIMARY KEY,
    employee_id         INTEGER NOT NULL REFERENCES employees(id),
    attendance_date     DATE NOT NULL,
    requested_punch_in  TIME,
    requested_punch_out TIME,
    reason              TEXT NOT NULL,
    status              VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    approved_by         INTEGER REFERENCES employees(id),
    remarks             TEXT,
    created_at          TIMESTAMP DEFAULT NOW(),
    updated_at          TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_regularization_employee ON regularization(employee_id);
CREATE INDEX idx_regularization_status ON regularization(status);

-- ============================================
-- NOTIFICATIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS notifications (
    id              SERIAL PRIMARY KEY,
    employee_id     INTEGER NOT NULL REFERENCES employees(id),
    title           VARCHAR(255) NOT NULL,
    message         TEXT NOT NULL,
    type            VARCHAR(20) DEFAULT 'info' CHECK (type IN ('info', 'success', 'warning', 'error')),
    is_read         BOOLEAN DEFAULT false,
    reference_id    INTEGER,
    reference_type  VARCHAR(30),
    created_at      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_notifications_employee ON notifications(employee_id);
CREATE INDEX idx_notifications_unread ON notifications(employee_id, is_read) WHERE is_read = false;

-- ============================================
-- BIOMETRIC SYNC LOG TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS biometric_sync_log (
    id              SERIAL PRIMARY KEY,
    synced_at       TIMESTAMP DEFAULT NOW(),
    records_fetched INTEGER DEFAULT 0,
    records_synced  INTEGER DEFAULT 0,
    errors          INTEGER DEFAULT 0,
    status          VARCHAR(20) DEFAULT 'success',
    details         JSONB
);

-- ============================================
-- APP SETTINGS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS app_settings (
    key             VARCHAR(100) PRIMARY KEY,
    value           TEXT,
    updated_at      TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- BUG REPORTS TABLE (QA/Bug Tracking)
-- ============================================
CREATE TABLE IF NOT EXISTS bug_reports (
    id              SERIAL PRIMARY KEY,
    title           VARCHAR(255) NOT NULL,
    module          VARCHAR(50) NOT NULL,
    steps           TEXT NOT NULL,
    expected        TEXT NOT NULL,
    actual          TEXT NOT NULL,
    severity        VARCHAR(20) NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low')),
    status          VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open', 'in-progress', 'resolved', 'closed', 'wont-fix')),
    reported_by     INTEGER REFERENCES employees(id),
    assigned_to     INTEGER REFERENCES employees(id),
    screenshot_url  TEXT,
    logs            TEXT,
    created_at      TIMESTAMP DEFAULT NOW(),
    updated_at      TIMESTAMP DEFAULT NOW()
);
