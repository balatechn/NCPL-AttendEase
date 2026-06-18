-- Migration 002: Add reporting manager hierarchy
-- Enables single-level approval flow: Employee → Reporting Manager
-- HR receives email notification (FYI) on approvals

-- Add reporting_manager_id to employees (self-referencing FK)
ALTER TABLE employees ADD COLUMN IF NOT EXISTS reporting_manager_id INTEGER REFERENCES employees(id);
CREATE INDEX IF NOT EXISTS idx_employees_reporting_manager ON employees(reporting_manager_id);
