export interface User {
  id: number;
  employee_code: string;
  first_name: string;
  last_name: string;
  email: string;
  role: 'admin' | 'hr' | 'manager' | 'employee';
  department: string;
  designation: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
}

export interface Attendance {
  id: number;
  employee_id: number;
  attendance_date: string;
  punch_in: string | null;
  punch_out: string | null;
  status: 'present' | 'absent' | 'half-day' | 'leave' | 'holiday' | 'weekend' | 'incomplete';
  work_hours: number | null;
  is_late: boolean;
  late_minutes: number;
  source: string;
  employee_code?: string;
  first_name?: string;
  last_name?: string;
  department?: string;
}

export interface AttendanceSummary {
  present_days: number;
  absent_days: number;
  half_days: number;
  leave_days: number;
  holidays: number;
  weekends: number;
  late_days: number;
  avg_work_hours: number;
  total_work_hours: number;
}

export interface DashboardStats {
  today_status: string | null;
  today_punch_in: string | null;
  today_punch_out: string | null;
  today_work_hours: number | null;
  month_present: number;
  month_absent: number;
  month_late: number;
  shift_id: number | null;
  shift_name: string | null;
  shift_start: string | null;
  shift_end: string | null;
  shift_full_day_hours: number | null;
}

export interface Leave {
  id: number;
  employee_id: number;
  leave_type: string;
  start_date: string;
  end_date: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  approved_by: number | null;
  remarks: string | null;
  created_at: string;
  first_name?: string;
  last_name?: string;
  employee_code?: string;
  department?: string;
}

export interface LeaveBalance {
  leave_type: string;
  total_allowed: number;
  used: number;
  remaining: number;
}

export interface RegularizationRequest {
  id: number;
  employee_id: number;
  attendance_date: string;
  requested_punch_in: string | null;
  requested_punch_out: string | null;
  reason: string;
  regularization_type: 'miss_punch' | 'client_visit' | 'work_from_home';
  status: 'pending' | 'approved' | 'rejected';
  remarks: string | null;
  created_at: string;
  first_name?: string;
  last_name?: string;
  employee_code?: string;
}

export interface Notification {
  id: number;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  is_read: boolean;
  created_at: string;
}

export interface Shift {
  id: number;
  name: string;
  start_time: string;
  end_time: string;
  grace_minutes: number;
  half_day_hours: number;
  full_day_hours: number;
}

export interface AdminDashboardStats {
  total_employees: number;
  present_today: number;
  absent_today: number;
  late_today: number;
  pending_leaves: number;
  pending_regularizations: number;
}

export interface Employee {
  id: number;
  employee_code: string;
  first_name: string;
  last_name: string;
  email: string;
  role: string;
  department: string;
  designation: string;
  shift_id: number;
  phone: string;
  is_active: boolean;
  created_at: string;
  reporting_manager_id?: number | null;
  manager_name?: string;
}
