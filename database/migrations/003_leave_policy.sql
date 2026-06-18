-- ============================================
-- LEAVE BALANCE AUDIT TABLE
-- Tracks every change to leave_balance (who, when, what)
-- ============================================
CREATE TABLE IF NOT EXISTS leave_balance_audit (
    id              SERIAL PRIMARY KEY,
    employee_id     INTEGER NOT NULL REFERENCES employees(id),
    year            INTEGER NOT NULL,
    leave_type      VARCHAR(20) NOT NULL,
    old_total       INTEGER,
    new_total       INTEGER,
    old_used        INTEGER,
    new_used        INTEGER,
    change_reason   TEXT NOT NULL,
    changed_by      INTEGER REFERENCES employees(id),
    created_at      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_lba_employee ON leave_balance_audit(employee_id, year);

-- ============================================
-- RESET ALL EXISTING LEAVE BALANCES TO 0
-- Admin will add opening balances manually
-- ============================================
UPDATE leave_balance SET total_allowed = 0, used = 0, updated_at = NOW();

-- ============================================
-- ADD leaves.is_lwp column for Leave Without Pay tracking
-- ============================================
ALTER TABLE leaves ADD COLUMN IF NOT EXISTS is_lwp BOOLEAN DEFAULT false;
