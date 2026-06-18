const API_URL = '/api';

class ApiClient {
  private baseUrl: string;

  constructor() {
    this.baseUrl = API_URL;
  }

  private getToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('accessToken');
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const token = this.getToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...(options.headers as Record<string, string>),
    };

    const res = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers,
    });

    if (res.status === 401) {
      // Auth endpoints (login, refresh) should NOT trigger the auto-logout cascade
      if (endpoint.startsWith('/auth/')) {
        const errData = await res.json().catch(() => ({ error: 'Invalid credentials' }));
        throw new Error(errData.error || 'Invalid credentials');
      }
      // Try refresh
      const refreshed = await this.refreshToken();
      if (refreshed) {
        headers.Authorization = `Bearer ${this.getToken()}`;
        const retryRes = await fetch(`${this.baseUrl}${endpoint}`, { ...options, headers });
        if (!retryRes.ok) throw new Error((await retryRes.json()).error || 'Request failed');
        return retryRes.json();
      }
      // Redirect to login
      if (typeof window !== 'undefined') {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('user');
        window.location.href = '/login';
      }
      throw new Error('Session expired');
    }

    if (!res.ok) {
      const errData = await res.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(errData.error || 'Request failed');
    }

    // Handle blob responses for exports
    const contentType = res.headers.get('content-type');
    if (contentType && (contentType.includes('spreadsheet') || contentType.includes('pdf'))) {
      return res.blob() as unknown as T;
    }

    return res.json();
  }

  private async refreshToken(): Promise<boolean> {
    const refreshToken = localStorage.getItem('refreshToken');
    if (!refreshToken) return false;

    try {
      const res = await fetch(`${this.baseUrl}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) return false;
      const data = await res.json();
      localStorage.setItem('accessToken', data.accessToken);
      return true;
    } catch {
      return false;
    }
  }

  // Auth
  async login(email: string, password: string) {
    return this.request<{ accessToken: string; refreshToken: string; user: any; must_change_password: boolean }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  }

  async getMe() {
    return this.request<any>('/auth/me');
  }

  async changePassword(currentPassword: string, newPassword: string) {
    return this.request<any>('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  }

  async forgotPassword(email: string) {
    return this.request<any>('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  }

  async verifyOtp(email: string, otp: string) {
    return this.request<{ resetToken: string }>('/auth/verify-otp', {
      method: 'POST',
      body: JSON.stringify({ email, otp }),
    });
  }

  async resetPassword(resetToken: string, newPassword: string) {
    return this.request<any>('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ resetToken, newPassword }),
    });
  }

  async sendWelcomeEmails() {
    return this.request<any>('/auth/send-welcome-emails', { method: 'POST' });
  }

  // Attendance
  async getMyAttendance(year: number, month: number) {
    return this.request<any[]>(`/attendance/my?year=${year}&month=${month}`);
  }

  async getPublicHolidays(year?: number) {
    return this.request<any[]>(`/attendance/holidays?year=${year || new Date().getFullYear()}`);
  }

  async getEmployeeAttendance(employeeId: number, year: number, month: number) {
    return this.request<any[]>(`/attendance/employee/${employeeId}?year=${year}&month=${month}`);
  }

  async getEmployeeLeaves(employeeId: number, year?: number) {
    let url = `/leaves/employee/${employeeId}`;
    if (year) url += `?year=${year}`;
    return this.request<any[]>(url);
  }

  async getEmployeeRegularizations(employeeId: number) {
    return this.request<any[]>(`/regularization/employee/${employeeId}`);
  }

  async getEmployeeListForCalendar() {
    return this.request<any[]>('/attendance/employees/list');
  }

  async getMyAttendanceRange(startDate: string, endDate: string) {
    return this.request<any[]>(`/attendance/my/range?startDate=${startDate}&endDate=${endDate}`);
  }

  async getAttendanceSummary(year: number, month: number) {
    return this.request<any>(`/attendance/my/summary?year=${year}&month=${month}`);
  }

  async getDashboard() {
    return this.request<any>('/attendance/my/dashboard');
  }

  async getAllAttendance(date: string, department?: string) {
    let url = `/attendance/all?date=${date}`;
    if (department) url += `&department=${department}`;
    return this.request<any[]>(url);
  }

  async overrideAttendance(id: number, data: any) {
    return this.request<any>(`/attendance/${id}/override`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  // Leaves
  async applyLeave(data: any) {
    return this.request<any>('/leaves/apply', { method: 'POST', body: JSON.stringify(data) });
  }

  async getMyLeaves(year?: number) {
    let url = '/leaves/my';
    if (year) url += `?year=${year}`;
    return this.request<any[]>(url);
  }

  async getLeaveBalance(year?: number) {
    return this.request<any[]>(`/leaves/my/balance${year ? `?year=${year}` : ''}`);
  }

  async getPendingLeaves() {
    return this.request<any[]>('/leaves/pending');
  }

  async approveLeave(id: number, remarks?: string) {
    return this.request<any>(`/leaves/${id}/approve`, {
      method: 'PATCH',
      body: JSON.stringify({ remarks }),
    });
  }

  async rejectLeave(id: number, remarks?: string) {
    return this.request<any>(`/leaves/${id}/reject`, {
      method: 'PATCH',
      body: JSON.stringify({ remarks }),
    });
  }

  async cancelLeave(id: number) {
    return this.request<any>(`/leaves/${id}/cancel`, { method: 'PATCH' });
  }

  // Regularization
  async applyRegularization(data: any) {
    return this.request<any>('/regularization/apply', { method: 'POST', body: JSON.stringify(data) });
  }

  async getMyRegularizations() {
    return this.request<any[]>('/regularization/my');
  }

  // Employee shifts
  async getEmployeeShifts() {
    return this.request<any[]>('/employees/shifts');
  }

  async updateMyShift(shiftId: number) {
    return this.request<any>('/employees/my-shift', { method: 'PUT', body: JSON.stringify({ shift_id: shiftId }) });
  }

  async getPendingRegularizations() {
    return this.request<any[]>('/regularization/pending');
  }

  async approveRegularization(id: number, remarks?: string) {
    return this.request<any>(`/regularization/${id}/approve`, {
      method: 'PATCH',
      body: JSON.stringify({ remarks }),
    });
  }

  async rejectRegularization(id: number, remarks?: string) {
    return this.request<any>(`/regularization/${id}/reject`, {
      method: 'PATCH',
      body: JSON.stringify({ remarks }),
    });
  }

  // Reports
  async getAttendanceReport(startDate: string, endDate: string, format?: string, department?: string) {
    let url = `/reports/attendance?startDate=${startDate}&endDate=${endDate}`;
    if (format) url += `&format=${format}`;
    if (department) url += `&department=${department}`;
    return this.request<any>(url);
  }

  async getLeaveReport(year: number, format?: string) {
    let url = `/reports/leaves?year=${year}`;
    if (format) url += `&format=${format}`;
    return this.request<any>(url);
  }

  async getSummaryReport(year: number, month: number) {
    return this.request<any[]>(`/reports/summary?year=${year}&month=${month}`);
  }

  // Notifications
  async getNotifications(unreadOnly = false) {
    return this.request<any[]>(`/notifications?unreadOnly=${unreadOnly}`);
  }

  async getUnreadCount() {
    return this.request<{ count: number }>('/notifications/unread-count');
  }

  async markNotificationRead(id: number) {
    return this.request<void>(`/notifications/${id}/read`, { method: 'PATCH' });
  }

  async markAllRead() {
    return this.request<void>('/notifications/read-all', { method: 'PATCH' });
  }

  // Admin
  async getAdminDashboard() {
    return this.request<any>('/admin/dashboard');
  }

  async getManagers() {
    return this.request<any[]>('/admin/managers');
  }

  async getEmployees(page = 1, search?: string) {
    let url = `/admin/employees?page=${page}`;
    if (search) url += `&search=${search}`;
    return this.request<{ employees: any[]; total: number }>(`${url}`);
  }

  async createEmployee(data: any) {
    return this.request<any>('/admin/employees', { method: 'POST', body: JSON.stringify(data) });
  }

  async updateEmployee(id: number, data: any) {
    return this.request<any>(`/admin/employees/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  }

  async deactivateEmployee(id: number) {
    return this.request<void>(`/admin/employees/${id}`, { method: 'DELETE' });
  }

  async getShifts() {
    return this.request<any[]>('/admin/shifts');
  }

  async createShift(data: any) {
    return this.request<any>('/admin/shifts', { method: 'POST', body: JSON.stringify(data) });
  }

  async updateShift(id: number, data: any) {
    return this.request<any>(`/admin/shifts/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  }

  async deleteShift(id: number) {
    return this.request<void>(`/admin/shifts/${id}`, { method: 'DELETE' });
  }

  // Biometric
  async triggerSync() {
    return this.request<any>('/biometric/sync', { method: 'POST' });
  }

  async getSyncStatus() {
    return this.request<any>('/biometric/status');
  }

  // Leave Balance Management (Admin)
  async getLeaveBalances(year?: number, search?: string) {
    let url = `/admin/leave-balances?year=${year || new Date().getFullYear()}`;
    if (search) url += `&search=${encodeURIComponent(search)}`;
    return this.request<any[]>(url);
  }

  async setLeaveBalance(data: { employee_id: number; year: number; leave_type: string; total_allowed: number; reason: string }) {
    return this.request<any>('/admin/leave-balance', { method: 'POST', body: JSON.stringify(data) });
  }

  async setBulkLeaveBalance(data: { year: number; leave_type: string; total_allowed: number; reason: string }) {
    return this.request<any>('/admin/leave-balance/bulk', { method: 'POST', body: JSON.stringify(data) });
  }

  async getLeaveBalanceAudit(employeeId: number, year?: number) {
    return this.request<any[]>(`/admin/leave-balance-audit/${employeeId}?year=${year || new Date().getFullYear()}`);
  }

  // Public Holidays (Admin)
  async getHolidays(year?: number) {
    return this.request<any[]>(`/admin/holidays?year=${year || new Date().getFullYear()}`);
  }

  async createHoliday(data: { holiday_date: string; name: string; is_optional?: boolean }) {
    return this.request<any>('/admin/holidays', { method: 'POST', body: JSON.stringify(data) });
  }

  async updateHoliday(id: number, data: { holiday_date: string; name: string; is_optional?: boolean }) {
    return this.request<any>(`/admin/holidays/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  }

  async deleteHoliday(id: number) {
    return this.request<any>(`/admin/holidays/${id}`, { method: 'DELETE' });
  }

  async bulkImportHolidays(holidays: { holiday_date: string; name: string; is_optional?: boolean }[]) {
    return this.request<any>('/admin/holidays/bulk', { method: 'POST', body: JSON.stringify({ holidays }) });
  }

  // Manager Dashboard
  async getManagerDashboard(date?: string) {
    const url = date ? `/manager/dashboard?date=${date}` : '/manager/dashboard';
    return this.request<any>(url);
  }

  async getManagerLiveAttendance(date?: string, department?: string, shiftId?: number) {
    let url = `/manager/live-attendance?date=${date || new Date().toISOString().slice(0, 10)}`;
    if (department) url += `&department=${encodeURIComponent(department)}`;
    if (shiftId) url += `&shift_id=${shiftId}`;
    return this.request<any[]>(url);
  }

  async getDepartments() {
    return this.request<string[]>('/manager/departments');
  }

  // Password & Welcome Email Management
  async getPasswordStatus() {
    return this.request<any[]>('/admin/password-status');
  }

  async resetEmployeePassword(employeeId: number) {
    return this.request<any>(`/admin/reset-employee-password/${employeeId}`, { method: 'POST' });
  }

  async sendWelcomeEmail(employeeIds?: number[]) {
    return this.request<any>('/admin/send-welcome-email', {
      method: 'POST',
      body: JSON.stringify({ employeeIds: employeeIds || [] }),
    });
  }

  // HR Dashboard
  async getHRDaily(date: string, department?: string, shiftId?: number) {
    let url = `/hr/daily?date=${date}`;
    if (department) url += `&department=${encodeURIComponent(department)}`;
    if (shiftId) url += `&shift_id=${shiftId}`;
    return this.request<any>(url);
  }

  async getHRWeekly(startDate: string, endDate: string, department?: string) {
    let url = `/hr/weekly?start_date=${startDate}&end_date=${endDate}`;
    if (department) url += `&department=${encodeURIComponent(department)}`;
    return this.request<any>(url);
  }

  async getHRMonthly(year: number, month: number, department?: string) {
    let url = `/hr/monthly?year=${year}&month=${month}`;
    if (department) url += `&department=${encodeURIComponent(department)}`;
    return this.request<any>(url);
  }

  // ── Payroll ────────────────────────────────────────────────
  async getPayrollSettings() {
    return this.request<any>('/payroll/settings');
  }

  async updatePayrollSettings(data: Record<string, string>) {
    return this.request<any>('/payroll/settings', { method: 'PUT', body: JSON.stringify(data) });
  }

  async getSalaryStructures(q?: string) {
    const url = q ? `/payroll/salary-structures?q=${encodeURIComponent(q)}` : '/payroll/salary-structures';
    return this.request<any>(url);
  }

  async getStructureHistory(employeeId: number) {
    return this.request<any>(`/payroll/salary-structures/${employeeId}`);
  }

  async saveSalaryStructure(data: any) {
    return this.request<any>('/payroll/salary-structures', { method: 'POST', body: JSON.stringify(data) });
  }

  async getPayrollRuns() {
    return this.request<any>('/payroll/runs');
  }

  async getPayrollRun(id: number) {
    return this.request<any>(`/payroll/runs/${id}`);
  }

  async generatePayrollDraft(data: any) {
    return this.request<any>('/payroll/runs/draft', { method: 'POST', body: JSON.stringify(data) });
  }

  async updatePayslip(id: number, data: any) {
    return this.request<any>(`/payroll/payslips/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  }

  async finalizePayrollRun(id: number) {
    return this.request<any>(`/payroll/runs/${id}/finalize`, { method: 'POST' });
  }

  async deletePayrollRun(id: number) {
    return this.request<any>(`/payroll/runs/${id}`, { method: 'DELETE' });
  }

  async getPayslipPdf(id: number): Promise<Blob> {
    const token = localStorage.getItem('token');
    const res = await fetch(`${this.baseUrl}/payroll/payslips/${id}/pdf`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('PDF fetch failed');
    return res.blob();
  }

  async getMyPayslips() {
    return this.request<any>('/payroll/my/payslips');
  }

  async getMyPayslipPdf(id: number): Promise<Blob> {
    const token = localStorage.getItem('token');
    const res = await fetch(`${this.baseUrl}/payroll/my/payslips/${id}/pdf`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('PDF fetch failed');
    return res.blob();
  }
}

export const api = new ApiClient();
