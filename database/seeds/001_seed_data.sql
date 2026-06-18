-- NCPL AttendEase - Seed Data
-- Default shifts, admin user, and initial settings

-- Default Shifts
INSERT INTO shifts (name, start_time, end_time, grace_minutes, half_day_hours, full_day_hours) VALUES
('General', '09:00:00', '18:00:00', 15, 4.00, 8.00),
('Morning', '06:00:00', '14:00:00', 10, 4.00, 7.00),
('Evening', '14:00:00', '22:00:00', 10, 4.00, 7.00),
('Night', '22:00:00', '06:00:00', 10, 4.00, 7.00)
ON CONFLICT DO NOTHING;

-- Default Admin User (password: Admin@123)
-- bcrypt hash for 'Admin@123' with 12 rounds
INSERT INTO employees (employee_code, first_name, last_name, email, password_hash, role, department, designation, shift_id)
VALUES ('ADMIN001', 'System', 'Administrator', 'admin@ncpl.com', '$2a$12$LJ3m4ys2Y5ulqaHe6MvkzuQ.2yHKyTw3G9f3T0y1x3kNqI.R1PaO2', 'admin', 'IT', 'System Administrator', 1)
ON CONFLICT (email) DO NOTHING;

-- Default App Settings
INSERT INTO app_settings (key, value) VALUES
('biometric_sync_interval', '5'),
('late_threshold_minutes', '15'),
('half_day_hours', '4'),
('full_day_hours', '8'),
('app_name', 'NCPL AttendEase')
ON CONFLICT (key) DO NOTHING;

-- Leave balance for admin (current year)
INSERT INTO leave_balance (employee_id, year, leave_type, total_allowed, used)
SELECT id, EXTRACT(YEAR FROM NOW())::int, lt, allowed, 0
FROM employees, 
     (VALUES ('casual', 12), ('sick', 12), ('earned', 15), ('compensatory', 0)) AS t(lt, allowed)
WHERE email = 'admin@ncpl.com'
ON CONFLICT DO NOTHING;
