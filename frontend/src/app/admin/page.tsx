'use client';
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { api } from '@/lib/api';
import AppShell from '@/components/layout/AppShell';
import toast from 'react-hot-toast';
import {
  Users, Clock, UserPlus, Settings, RefreshCw, BarChart3, AlertTriangle,
  CheckCircle, XCircle, Edit2, Trash2, Plus, Search, Wallet, History, X,
  Mail, KeyRound, Send, RotateCcw, Shield, CalendarDays
} from 'lucide-react';
import type { AdminDashboardStats, Employee, Shift } from '@/types';

type Tab = 'dashboard' | 'employees' | 'shifts' | 'biometric' | 'leaveBalance' | 'holidays' | 'welcomeEmail';

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>('dashboard');
  const [stats, setStats] = useState<AdminDashboardStats | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [empTotal, setEmpTotal] = useState(0);
  const [empSearch, setEmpSearch] = useState('');
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState<any>(null);

  // Leave balance state
  const [leaveBalances, setLeaveBalances] = useState<any[]>([]);
  const [lbSearch, setLbSearch] = useState('');
  const [lbYear, setLbYear] = useState(new Date().getFullYear());
  const [showLbForm, setShowLbForm] = useState(false);
  const [editingLbEmp, setEditingLbEmp] = useState<any>(null);
  const [lbForm, setLbForm] = useState({ leave_type: 'casual', total_allowed: 0, reason: '' });
  const [showBulkForm, setShowBulkForm] = useState(false);
  const [bulkForm, setBulkForm] = useState({ leave_type: 'casual', total_allowed: 0, reason: '' });
  const [auditData, setAuditData] = useState<any[]>([]);
  const [auditEmp, setAuditEmp] = useState<any>(null);

  // Welcome Email / Password state
  const [passwordStatus, setPasswordStatus] = useState<any[]>([]);
  const [pwSearch, setPwSearch] = useState('');
  const [selectedEmps, setSelectedEmps] = useState<number[]>([]);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [resettingPw, setResettingPw] = useState<number | null>(null);

  // Holiday state
  const [holidays, setHolidays] = useState<any[]>([]);
  const [holYear, setHolYear] = useState(new Date().getFullYear());
  const [showHolForm, setShowHolForm] = useState(false);
  const [editingHol, setEditingHol] = useState<any>(null);
  const [holForm, setHolForm] = useState({ holiday_date: '', name: '', is_optional: false });

  // Employee form
  const [showEmpForm, setShowEmpForm] = useState(false);
  const [editingEmp, setEditingEmp] = useState<Employee | null>(null);
  const [empForm, setEmpForm] = useState({
    employee_code: '', first_name: '', last_name: '', email: '', password: '',
    role: 'employee', department: '', designation: '', shift_id: 1, phone: '',
    reporting_manager_id: '' as string | number,
  });
  const [managers, setManagers] = useState<any[]>([]);

  // Shift form
  const [showShiftForm, setShowShiftForm] = useState(false);
  const [editingShift, setEditingShift] = useState<Shift | null>(null);
  const [shiftForm, setShiftForm] = useState({
    name: '', start_time: '09:00', end_time: '18:00', grace_minutes: 15, half_day_hours: 4, full_day_hours: 8,
  });

  useEffect(() => { loadTab(); }, [tab]);
  useEffect(() => { if (tab === 'holidays') loadTab(); }, [holYear]);

  async function loadTab() {
    setLoading(true);
    try {
      if (tab === 'dashboard') {
        const s = await api.getAdminDashboard();
        setStats(s);
      } else if (tab === 'employees') {
        const [d, mgrs] = await Promise.all([
          api.getEmployees(1, empSearch || undefined),
          api.getManagers(),
        ]);
        setEmployees(d.employees);
        setEmpTotal(d.total);
        setManagers(mgrs);
      } else if (tab === 'shifts') {
        const s = await api.getShifts();
        setShifts(s);
      } else if (tab === 'biometric') {
        const s = await api.getSyncStatus();
        setSyncStatus(s);
      } else if (tab === 'leaveBalance') {
        const data = await api.getLeaveBalances(lbYear, lbSearch || undefined);
        setLeaveBalances(data);
      } else if (tab === 'holidays') {
        const data = await api.getHolidays(holYear);
        setHolidays(data);
      } else if (tab === 'welcomeEmail') {
        const data = await api.getPasswordStatus();
        setPasswordStatus(data);
        setSelectedEmps([]);
      }
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }

  async function searchEmployees() {
    try {
      const d = await api.getEmployees(1, empSearch);
      setEmployees(d.employees);
      setEmpTotal(d.total);
    } catch (err) { console.error(err); }
  }

  async function handleCreateEmployee(e: React.FormEvent) {
    e.preventDefault();
    try {
      if (editingEmp) {
        await api.updateEmployee(editingEmp.id, empForm);
        toast.success('Employee updated');
      } else {
        await api.createEmployee(empForm);
        toast.success('Employee created');
      }
      setShowEmpForm(false);
      setEditingEmp(null);
      loadTab();
    } catch (err: any) { toast.error(err.message); }
  }

  async function handleDeactivate(id: number) {
    if (!confirm('Are you sure you want to DELETE this employee? This will permanently remove all their attendance, leaves, and other data. This action cannot be undone.')) return;
    try {
      await api.deactivateEmployee(id);
      toast.success('Employee deleted');
      loadTab();
    } catch (err: any) { toast.error(err.message); }
  }

  async function handleSaveShift(e: React.FormEvent) {
    e.preventDefault();
    try {
      if (editingShift) {
        await api.updateShift(editingShift.id, shiftForm);
        toast.success('Shift updated');
      } else {
        await api.createShift(shiftForm);
        toast.success('Shift created');
      }
      setShowShiftForm(false);
      setEditingShift(null);
      setShiftForm({ name: '', start_time: '09:00', end_time: '18:00', grace_minutes: 15, half_day_hours: 4, full_day_hours: 8 });
      loadTab();
    } catch (err: any) { toast.error(err.message); }
  }

  async function handleDeleteShift(id: number) {
    if (!confirm('Delete this shift?')) return;
    try {
      await api.deleteShift(id);
      toast.success('Shift deleted');
      loadTab();
    } catch (err: any) { toast.error(err.message); }
  }

  function editShift(shift: Shift) {
    setEditingShift(shift);
    setShiftForm({
      name: shift.name,
      start_time: shift.start_time,
      end_time: shift.end_time,
      grace_minutes: shift.grace_minutes,
      half_day_hours: shift.half_day_hours,
      full_day_hours: shift.full_day_hours,
    });
    setShowShiftForm(true);
  }

  async function handleSync() {
    try {
      toast.loading('Syncing biometric data...');
      const result = await api.triggerSync();
      toast.dismiss();
      toast.success(`Synced ${result.synced} records`);
      loadTab();
    } catch (err: any) {
      toast.dismiss();
      toast.error(err.message);
    }
  }

  // Leave Balance handlers
  async function searchLeaveBalances() {
    try {
      const data = await api.getLeaveBalances(lbYear, lbSearch);
      setLeaveBalances(data);
    } catch (err) { console.error(err); }
  }

  async function handleSetBalance(e: React.FormEvent) {
    e.preventDefault();
    if (!editingLbEmp) return;
    try {
      await api.setLeaveBalance({
        employee_id: editingLbEmp.id,
        year: lbYear,
        leave_type: lbForm.leave_type,
        total_allowed: lbForm.total_allowed,
        reason: lbForm.reason,
      });
      toast.success('Balance updated');
      setShowLbForm(false);
      setEditingLbEmp(null);
      searchLeaveBalances();
    } catch (err: any) { toast.error(err.message); }
  }

  async function handleBulkBalance(e: React.FormEvent) {
    e.preventDefault();
    try {
      const result = await api.setBulkLeaveBalance({
        year: lbYear,
        leave_type: bulkForm.leave_type,
        total_allowed: bulkForm.total_allowed,
        reason: bulkForm.reason,
      });
      toast.success(result.message);
      setShowBulkForm(false);
      searchLeaveBalances();
    } catch (err: any) { toast.error(err.message); }
  }

  async function showAudit(emp: any) {
    try {
      const data = await api.getLeaveBalanceAudit(emp.id, lbYear);
      setAuditData(data);
      setAuditEmp(emp);
    } catch (err: any) { toast.error(err.message); }
  }

  function editLeaveBalance(emp: any, leaveType?: string) {
    setEditingLbEmp(emp);
    const bal = emp.balances?.find((b: any) => b.leave_type === (leaveType || 'casual'));
    setLbForm({
      leave_type: leaveType || 'casual',
      total_allowed: bal ? bal.total_allowed : 0,
      reason: '',
    });
    setShowLbForm(true);
  }

  function editEmployee(emp: Employee) {
    setEditingEmp(emp);
    setEmpForm({
      employee_code: emp.employee_code,
      first_name: emp.first_name,
      last_name: emp.last_name,
      email: emp.email,
      password: '',
      role: emp.role,
      department: emp.department || '',
      designation: emp.designation || '',
      shift_id: emp.shift_id || 1,
      phone: emp.phone || '',
      reporting_manager_id: emp.reporting_manager_id || '',
    });
    setShowEmpForm(true);
  }

  // Welcome Email / Password handlers
  const filteredPwStatus = passwordStatus.filter((e) => {
    if (!pwSearch) return true;
    const s = pwSearch.toLowerCase();
    return (
      e.first_name?.toLowerCase().includes(s) ||
      e.last_name?.toLowerCase().includes(s) ||
      e.email?.toLowerCase().includes(s) ||
      e.employee_code?.toLowerCase().includes(s) ||
      e.department?.toLowerCase().includes(s)
    );
  });

  async function handleResetPassword(empId: number) {
    if (!confirm('Reset this employee\'s password to Welcome@123?')) return;
    setResettingPw(empId);
    try {
      const result = await api.resetEmployeePassword(empId);
      toast.success(result.message);
      const data = await api.getPasswordStatus();
      setPasswordStatus(data);
    } catch (err: any) { toast.error(err.message); }
    finally { setResettingPw(null); }
  }

  async function handleSendWelcomeEmail(empIds?: number[]) {
    const ids = empIds || selectedEmps;
    const count = ids.length || filteredPwStatus.length;
    if (!confirm(`Send welcome email to ${ids.length ? ids.length : 'all ' + count} employee(s)?`)) return;
    setSendingEmail(true);
    try {
      const result = await api.sendWelcomeEmail(ids.length ? ids : undefined);
      toast.success(result.message);
      setSelectedEmps([]);
    } catch (err: any) { toast.error(err.message); }
    finally { setSendingEmail(false); }
  }

  function toggleSelectEmp(id: number) {
    setSelectedEmps((prev) => prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]);
  }

  function toggleSelectAll() {
    if (selectedEmps.length === filteredPwStatus.length) {
      setSelectedEmps([]);
    } else {
      setSelectedEmps(filteredPwStatus.map((e) => e.id));
    }
  }

  // Holiday handlers
  async function loadHolidays() {
    try {
      const data = await api.getHolidays(holYear);
      setHolidays(data);
    } catch (err) { console.error(err); }
  }

  async function handleSaveHoliday(e: React.FormEvent) {
    e.preventDefault();
    try {
      if (editingHol) {
        await api.updateHoliday(editingHol.id, holForm);
        toast.success('Holiday updated');
      } else {
        await api.createHoliday(holForm);
        toast.success('Holiday added');
      }
      setShowHolForm(false);
      setEditingHol(null);
      setHolForm({ holiday_date: '', name: '', is_optional: false });
      loadHolidays();
    } catch (err: any) { toast.error(err.message); }
  }

  async function handleDeleteHoliday(id: number) {
    if (!confirm('Delete this holiday?')) return;
    try {
      await api.deleteHoliday(id);
      toast.success('Holiday deleted');
      loadHolidays();
    } catch (err: any) { toast.error(err.message); }
  }

  function editHoliday(h: any) {
    setEditingHol(h);
    setHolForm({
      holiday_date: h.holiday_date?.substring(0, 10) || '',
      name: h.name,
      is_optional: h.is_optional,
    });
    setShowHolForm(true);
  }

  const tabs = [
    { key: 'dashboard' as Tab, label: 'Dashboard', icon: BarChart3 },
    { key: 'employees' as Tab, label: 'Employees', icon: Users },
    { key: 'shifts' as Tab, label: 'Shifts', icon: Clock },
    { key: 'biometric' as Tab, label: 'Biometric', icon: RefreshCw },
    { key: 'leaveBalance' as Tab, label: 'Leave Balance', icon: Wallet },
    { key: 'holidays' as Tab, label: 'Holidays', icon: CalendarDays },
    { key: 'welcomeEmail' as Tab, label: 'Welcome Email', icon: Mail },
  ];

  return (
    <AppShell>
      <div className="space-y-6">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Admin Panel</h1>

        {/* Tab Navigation */}
        <div className="flex gap-1 p-1 rounded-xl overflow-x-auto" style={{ background: 'var(--bg-tab)' }}>
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition whitespace-nowrap ${
                tab === t.key ? 'shadow-sm' : ''
              }`}
              style={tab === t.key ? { background: 'var(--bg-tab-active)', color: 'var(--text-primary)' } : { color: 'var(--text-muted)' }}
            >
              <t.icon size={16} /> {t.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-48"><div className="w-8 h-8 border-3 border-primary-400 border-t-transparent rounded-full animate-spin" /></div>
        ) : (
          <>
            {/* Dashboard Tab */}
            {tab === 'dashboard' && stats && (
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                {[
                  { label: 'Total Employees', value: stats.total_employees, icon: Users, gradient: '#2563eb' },
                  { label: 'Present Today', value: stats.present_today, icon: CheckCircle, gradient: '#16a34a' },
                  { label: 'Absent Today', value: stats.absent_today, icon: XCircle, gradient: '#dc2626' },
                  { label: 'Late Today', value: stats.late_today, icon: AlertTriangle, gradient: '#d97706' },
                  { label: 'Pending Leaves', value: stats.pending_leaves, icon: Clock, gradient: '#7c3aed' },
                  { label: 'Pending Reg.', value: stats.pending_regularizations, icon: Settings, gradient: '#1a2e4a' },
                ].map((card, i) => (
                  <motion.div
                    key={card.label}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="card"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-xs font-medium uppercase" style={{ color: 'var(--text-muted)' }}>{card.label}</p>
                        <p className="text-3xl font-bold mt-1" style={{ color: 'var(--text-primary)' }}>{card.value}</p>
                      </div>
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center shadow-lg" style={{ background: card.gradient }}>
                        <card.icon size={20} className="text-white" />
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}

            {/* Employees Tab */}
            {tab === 'employees' && (
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="flex flex-1 gap-2">
                    <input
                      type="text"
                      value={empSearch}
                      onChange={(e) => setEmpSearch(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && searchEmployees()}
                      placeholder="Search employees..."
                      className="input-field flex-1"
                    />
                    <button onClick={searchEmployees} className="btn-secondary"><Search size={18} /></button>
                  </div>
                  <button onClick={() => { setEditingEmp(null); setEmpForm({ employee_code: '', first_name: '', last_name: '', email: '', password: '', role: 'employee', department: '', designation: '', shift_id: 1, phone: '', reporting_manager_id: '' }); setShowEmpForm(true); }} className="btn-primary flex items-center gap-2">
                    <UserPlus size={18} /> Add Employee
                  </button>
                </div>

                {showEmpForm && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="card">
                    <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>{editingEmp ? 'Edit' : 'Add'} Employee</h2>
                    <form onSubmit={handleCreateEmployee} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      <input placeholder="Employee Code" value={empForm.employee_code} onChange={(e) => setEmpForm({ ...empForm, employee_code: e.target.value })} className="input-field" required />
                      <input placeholder="First Name" value={empForm.first_name} onChange={(e) => setEmpForm({ ...empForm, first_name: e.target.value })} className="input-field" required />
                      <input placeholder="Last Name" value={empForm.last_name} onChange={(e) => setEmpForm({ ...empForm, last_name: e.target.value })} className="input-field" required />
                      <input type="email" placeholder="Email" value={empForm.email} onChange={(e) => setEmpForm({ ...empForm, email: e.target.value })} className="input-field" required />
                      <input type="password" placeholder={editingEmp ? 'New Password (optional)' : 'Password'} value={empForm.password} onChange={(e) => setEmpForm({ ...empForm, password: e.target.value })} className="input-field" required={!editingEmp} />
                      <select value={empForm.role} onChange={(e) => setEmpForm({ ...empForm, role: e.target.value })} className="input-field">
                        <option value="employee">Employee</option>
                        <option value="manager">Manager</option>
                        <option value="hr">HR</option>
                        <option value="admin">Admin</option>
                      </select>
                      <input placeholder="Department" value={empForm.department} onChange={(e) => setEmpForm({ ...empForm, department: e.target.value })} className="input-field" />
                      <input placeholder="Designation" value={empForm.designation} onChange={(e) => setEmpForm({ ...empForm, designation: e.target.value })} className="input-field" />
                      <input placeholder="Phone" value={empForm.phone} onChange={(e) => setEmpForm({ ...empForm, phone: e.target.value })} className="input-field" />
                      <select value={empForm.reporting_manager_id} onChange={(e) => setEmpForm({ ...empForm, reporting_manager_id: e.target.value ? Number(e.target.value) : '' })} className="input-field">
                        <option value="">No Reporting Manager</option>
                        {managers.filter(m => !editingEmp || m.id !== editingEmp.id).map(m => (
                          <option key={m.id} value={m.id}>{m.first_name} {m.last_name} ({m.role})</option>
                        ))}
                      </select>
                      <div className="sm:col-span-2 lg:col-span-3 flex gap-3">
                        <button type="submit" className="btn-primary">{editingEmp ? 'Update' : 'Create'}</button>
                        <button type="button" onClick={() => { setShowEmpForm(false); setEditingEmp(null); }} className="btn-secondary">Cancel</button>
                      </div>
                    </form>
                  </motion.div>
                )}

                <div className="card overflow-x-auto">
                  <p className="text-sm mb-3" style={{ color: 'var(--text-muted)' }}>Total: {empTotal} employees</p>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/[0.06]">
                        <th className="text-left py-2 px-2 font-medium" style={{ color: 'var(--text-muted)' }}>Code</th>
                        <th className="text-left py-2 px-2 font-medium" style={{ color: 'var(--text-muted)' }}>Name</th>
                        <th className="text-left py-2 px-2 font-medium hidden sm:table-cell" style={{ color: 'var(--text-muted)' }}>Email</th>
                        <th className="text-left py-2 px-2 font-medium" style={{ color: 'var(--text-muted)' }}>Role</th>
                        <th className="text-left py-2 px-2 font-medium hidden md:table-cell" style={{ color: 'var(--text-muted)' }}>Dept</th>
                        <th className="text-left py-2 px-2 font-medium hidden lg:table-cell" style={{ color: 'var(--text-muted)' }}>Manager</th>
                        <th className="text-center py-2 px-2 font-medium" style={{ color: 'var(--text-muted)' }}>Status</th>
                        <th className="text-right py-2 px-2 font-medium" style={{ color: 'var(--text-muted)' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {employees.map((emp) => (
                        <tr key={emp.id} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                          <td className="py-2.5 px-2 font-mono text-xs" style={{ color: 'var(--text-secondary)' }}>{emp.employee_code}</td>
                          <td className="py-2.5 px-2" style={{ color: 'var(--text-primary)' }}>{emp.first_name} {emp.last_name}</td>
                          <td className="py-2.5 px-2 hidden sm:table-cell" style={{ color: 'var(--text-muted)' }}>{emp.email}</td>
                          <td className="py-2.5 px-2 capitalize" style={{ color: 'var(--text-secondary)' }}>{emp.role}</td>
                          <td className="py-2.5 px-2 hidden md:table-cell" style={{ color: 'var(--text-muted)' }}>{emp.department}</td>
                          <td className="py-2.5 px-2 hidden lg:table-cell text-xs" style={{ color: 'var(--text-muted)' }}>{emp.manager_name || '—'}</td>
                          <td className="py-2.5 px-2 text-center">
                            <span className={`px-2 py-0.5 rounded-lg text-xs font-medium ${emp.is_active ? 'bg-green-500/15 text-green-400 border border-green-500/20' : 'bg-red-500/15 text-red-400 border border-red-500/20'}`}>
                              {emp.is_active ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td className="py-2.5 px-2 text-right">
                            <button onClick={() => editEmployee(emp)} className="p-1.5 rounded-lg hover:bg-primary-500/10 text-primary-400"><Edit2 size={14} /></button>
                            <button onClick={() => handleDeactivate(emp.id)} className="p-1.5 rounded-lg hover:bg-red-500/10 text-red-400 ml-1"><Trash2 size={14} /></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Shifts Tab */}
            {tab === 'shifts' && (
              <div className="space-y-4">
                <button onClick={() => { setEditingShift(null); setShiftForm({ name: '', start_time: '09:00', end_time: '18:00', grace_minutes: 15, half_day_hours: 4, full_day_hours: 8 }); setShowShiftForm(true); }} className="btn-primary flex items-center gap-2">
                  <Plus size={18} /> Add Shift
                </button>

                {showShiftForm && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="card">
                    <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>{editingShift ? 'Edit' : 'Create'} Shift</h2>
                    <form onSubmit={handleSaveShift} className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                      <input placeholder="Shift Name" value={shiftForm.name} onChange={(e) => setShiftForm({ ...shiftForm, name: e.target.value })} className="input-field" required />
                      <input type="time" value={shiftForm.start_time} onChange={(e) => setShiftForm({ ...shiftForm, start_time: e.target.value })} className="input-field" />
                      <input type="time" value={shiftForm.end_time} onChange={(e) => setShiftForm({ ...shiftForm, end_time: e.target.value })} className="input-field" />
                      <input type="number" placeholder="Grace (min)" value={shiftForm.grace_minutes} onChange={(e) => setShiftForm({ ...shiftForm, grace_minutes: Number(e.target.value) })} className="input-field" />
                      <input type="number" step="0.5" placeholder="Half Day Hours" value={shiftForm.half_day_hours} onChange={(e) => setShiftForm({ ...shiftForm, half_day_hours: Number(e.target.value) })} className="input-field" />
                      <input type="number" step="0.5" placeholder="Full Day Hours" value={shiftForm.full_day_hours} onChange={(e) => setShiftForm({ ...shiftForm, full_day_hours: Number(e.target.value) })} className="input-field" />
                      <div className="col-span-2 sm:col-span-3 flex gap-3">
                        <button type="submit" className="btn-primary">{editingShift ? 'Update Shift' : 'Create Shift'}</button>
                        <button type="button" onClick={() => { setShowShiftForm(false); setEditingShift(null); }} className="btn-secondary">Cancel</button>
                      </div>
                    </form>
                  </motion.div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {shifts.map((shift) => (
                    <div key={shift.id} className="card">
                      <div className="flex items-start justify-between">
                        <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>{shift.name}</h3>
                        <div className="flex gap-1">
                          <button onClick={() => editShift(shift)} className="p-1.5 rounded-lg hover:bg-primary-500/10 text-primary-400"><Edit2 size={14} /></button>
                          <button onClick={() => handleDeleteShift(shift.id)} className="p-1.5 rounded-lg hover:bg-red-500/10 text-red-400"><Trash2 size={14} /></button>
                        </div>
                      </div>
                      <div className="mt-2 text-sm space-y-1" style={{ color: 'var(--text-secondary)' }}>
                        <p>Time: {shift.start_time} - {shift.end_time}</p>
                        <p>Grace: {shift.grace_minutes} min</p>
                        <p>Half Day: {shift.half_day_hours}h | Full Day: {shift.full_day_hours}h</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Biometric Tab */}
            {tab === 'biometric' && (
              <div className="space-y-4">
                <div className="card">
                  <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Biometric Device Sync</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                    <div className="p-4 rounded-xl" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)' }}>
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Device Serial</p>
                      <p className="font-mono font-medium" style={{ color: 'var(--text-primary)' }}>{syncStatus?.deviceSerial || 'N/A'}</p>
                    </div>
                    <div className="p-4 rounded-xl" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)' }}>
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Last Synced</p>
                      <p className="font-medium" style={{ color: 'var(--text-primary)' }}>{syncStatus?.lastSync ? new Date(syncStatus.lastSync).toLocaleString() : 'Never'}</p>
                    </div>
                  </div>
                  <button onClick={handleSync} className="btn-primary flex items-center gap-2">
                    <RefreshCw size={18} /> Sync Now
                  </button>
                  <p className="text-xs mt-3" style={{ color: 'var(--text-faint)' }}>Auto-sync runs every 5 minutes</p>
                </div>
              </div>
            )}

            {/* Leave Balance Tab */}
            {tab === 'leaveBalance' && (
              <div className="space-y-4">
                {/* Search & Actions */}
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="flex flex-1 gap-2">
                    <input
                      type="text"
                      value={lbSearch}
                      onChange={(e) => setLbSearch(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && searchLeaveBalances()}
                      placeholder="Search by name or code..."
                      className="input-field flex-1"
                    />
                    <select value={lbYear} onChange={(e) => { setLbYear(Number(e.target.value)); }} className="input-field w-28">
                      {[0, 1, 2].map(i => {
                        const y = new Date().getFullYear() - i;
                        return <option key={y} value={y}>{y}</option>;
                      })}
                    </select>
                    <button onClick={searchLeaveBalances} className="btn-secondary"><Search size={18} /></button>
                  </div>
                  <button onClick={() => { setBulkForm({ leave_type: 'casual', total_allowed: 0, reason: '' }); setShowBulkForm(true); }} className="btn-primary flex items-center gap-2 whitespace-nowrap">
                    <Plus size={18} /> Bulk Set Balance
                  </button>
                </div>

                {/* Bulk Form */}
                {showBulkForm && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="card">
                    <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Bulk Set Leave Balance (All Employees)</h2>
                    <form onSubmit={handleBulkBalance} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      <select value={bulkForm.leave_type} onChange={(e) => setBulkForm({ ...bulkForm, leave_type: e.target.value })} className="input-field">
                        <option value="casual">Casual</option>
                        <option value="sick">Sick</option>
                        <option value="earned">Earned</option>
                        <option value="compensatory">Compensatory</option>
                      </select>
                      <input type="number" min="0" placeholder="Total Allowed" value={bulkForm.total_allowed} onChange={(e) => setBulkForm({ ...bulkForm, total_allowed: Number(e.target.value) })} className="input-field" required />
                      <input placeholder="Reason for change" value={bulkForm.reason} onChange={(e) => setBulkForm({ ...bulkForm, reason: e.target.value })} className="input-field" required />
                      <div className="flex gap-2">
                        <button type="submit" className="btn-primary flex-1">Apply to All</button>
                        <button type="button" onClick={() => setShowBulkForm(false)} className="btn-secondary">Cancel</button>
                      </div>
                    </form>
                  </motion.div>
                )}

                {/* Individual Edit Form */}
                {showLbForm && editingLbEmp && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="card">
                    <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
                      Set Balance: {editingLbEmp.first_name} {editingLbEmp.last_name} ({editingLbEmp.employee_code})
                    </h2>
                    <form onSubmit={handleSetBalance} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      <select value={lbForm.leave_type} onChange={(e) => {
                        const bal = editingLbEmp.balances?.find((b: any) => b.leave_type === e.target.value);
                        setLbForm({ ...lbForm, leave_type: e.target.value, total_allowed: bal ? bal.total_allowed : 0 });
                      }} className="input-field">
                        <option value="casual">Casual</option>
                        <option value="sick">Sick</option>
                        <option value="earned">Earned</option>
                        <option value="compensatory">Compensatory</option>
                      </select>
                      <input type="number" min="0" placeholder="Total Allowed" value={lbForm.total_allowed} onChange={(e) => setLbForm({ ...lbForm, total_allowed: Number(e.target.value) })} className="input-field" required />
                      <input placeholder="Reason for change" value={lbForm.reason} onChange={(e) => setLbForm({ ...lbForm, reason: e.target.value })} className="input-field" required />
                      <div className="flex gap-2">
                        <button type="submit" className="btn-primary flex-1">Save</button>
                        <button type="button" onClick={() => { setShowLbForm(false); setEditingLbEmp(null); }} className="btn-secondary">Cancel</button>
                      </div>
                    </form>
                  </motion.div>
                )}

                {/* Audit Modal */}
                {auditEmp && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="card">
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                        <History size={18} className="inline mr-2" />
                        Audit: {auditEmp.first_name} {auditEmp.last_name} ({lbYear})
                      </h2>
                      <button onClick={() => setAuditEmp(null)} className="p-1.5 rounded-lg hover:bg-red-500/10 text-red-400"><X size={18} /></button>
                    </div>
                    {auditData.length === 0 ? (
                      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No audit records found.</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b" style={{ borderColor: 'var(--border-color)' }}>
                              <th className="text-left py-2 px-2 font-medium" style={{ color: 'var(--text-muted)' }}>Date</th>
                              <th className="text-left py-2 px-2 font-medium" style={{ color: 'var(--text-muted)' }}>Type</th>
                              <th className="text-left py-2 px-2 font-medium" style={{ color: 'var(--text-muted)' }}>Old</th>
                              <th className="text-left py-2 px-2 font-medium" style={{ color: 'var(--text-muted)' }}>New</th>
                              <th className="text-left py-2 px-2 font-medium" style={{ color: 'var(--text-muted)' }}>Reason</th>
                              <th className="text-left py-2 px-2 font-medium" style={{ color: 'var(--text-muted)' }}>Changed By</th>
                            </tr>
                          </thead>
                          <tbody>
                            {auditData.map((a: any) => (
                              <tr key={a.id} className="border-b" style={{ borderColor: 'var(--border-color)' }}>
                                <td className="py-2 px-2 text-xs" style={{ color: 'var(--text-secondary)' }}>{new Date(a.created_at).toLocaleString()}</td>
                                <td className="py-2 px-2 capitalize" style={{ color: 'var(--text-primary)' }}>{a.leave_type}</td>
                                <td className="py-2 px-2" style={{ color: 'var(--text-muted)' }}>{a.old_total}</td>
                                <td className="py-2 px-2 font-medium" style={{ color: 'var(--text-primary)' }}>{a.new_total}</td>
                                <td className="py-2 px-2" style={{ color: 'var(--text-secondary)' }}>{a.change_reason}</td>
                                <td className="py-2 px-2" style={{ color: 'var(--text-muted)' }}>{a.changed_by_first} {a.changed_by_last}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </motion.div>
                )}

                {/* Balance Table */}
                <div className="card overflow-x-auto">
                  <p className="text-sm mb-3" style={{ color: 'var(--text-muted)' }}>
                    {leaveBalances.length} employees — Year: {lbYear}
                    <span className="ml-3 text-xs">Policy: Casual 12/yr (1/month), Sick 12/yr (1/month), Earned 1 per 20 days worked</span>
                  </p>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b" style={{ borderColor: 'var(--border-color)' }}>
                        <th className="text-left py-2 px-2 font-medium" style={{ color: 'var(--text-muted)' }}>Code</th>
                        <th className="text-left py-2 px-2 font-medium" style={{ color: 'var(--text-muted)' }}>Name</th>
                        <th className="text-left py-2 px-2 font-medium hidden md:table-cell" style={{ color: 'var(--text-muted)' }}>Dept</th>
                        <th className="text-center py-2 px-1 font-medium" style={{ color: 'var(--text-muted)' }}>Casual</th>
                        <th className="text-center py-2 px-1 font-medium" style={{ color: 'var(--text-muted)' }}>Sick</th>
                        <th className="text-center py-2 px-1 font-medium" style={{ color: 'var(--text-muted)' }}>Earned</th>
                        <th className="text-center py-2 px-1 font-medium" style={{ color: 'var(--text-muted)' }}>Comp</th>
                        <th className="text-right py-2 px-2 font-medium" style={{ color: 'var(--text-muted)' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {leaveBalances.map((emp: any) => {
                        const getBal = (type: string) => {
                          const b = emp.balances?.find((x: any) => x.leave_type === type);
                          return b ? { total: b.total_allowed, used: b.used, rem: b.remaining } : { total: 0, used: 0, rem: 0 };
                        };
                        const casual = getBal('casual');
                        const sick = getBal('sick');
                        const earned = getBal('earned');
                        const comp = getBal('compensatory');
                        return (
                          <tr key={emp.id} className="border-b hover:bg-white/[0.02]" style={{ borderColor: 'var(--border-color)' }}>
                            <td className="py-2.5 px-2 font-mono text-xs" style={{ color: 'var(--text-secondary)' }}>{emp.employee_code}</td>
                            <td className="py-2.5 px-2" style={{ color: 'var(--text-primary)' }}>{emp.first_name} {emp.last_name}</td>
                            <td className="py-2.5 px-2 hidden md:table-cell" style={{ color: 'var(--text-muted)' }}>{emp.department}</td>
                            <td className="py-2.5 px-1 text-center">
                              <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{casual.rem}/{casual.total}</span>
                            </td>
                            <td className="py-2.5 px-1 text-center">
                              <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{sick.rem}/{sick.total}</span>
                            </td>
                            <td className="py-2.5 px-1 text-center">
                              <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{earned.rem}/{earned.total}</span>
                            </td>
                            <td className="py-2.5 px-1 text-center">
                              <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{comp.rem}/{comp.total}</span>
                            </td>
                            <td className="py-2.5 px-2 text-right">
                              <button onClick={() => editLeaveBalance(emp)} className="p-1.5 rounded-lg hover:bg-primary-500/10 text-primary-400" title="Edit balance"><Edit2 size={14} /></button>
                              <button onClick={() => showAudit(emp)} className="p-1.5 rounded-lg hover:bg-amber-500/10 text-amber-400 ml-1" title="View audit"><History size={14} /></button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Holidays Tab */}
            {tab === 'holidays' && (
              <div className="space-y-4">
                <div className="card">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                        <CalendarDays size={20} /> Public Holidays
                      </h2>
                      <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Manage company holidays — employees won't be marked absent on these dates</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <select value={holYear} onChange={(e) => { setHolYear(Number(e.target.value)); }}
                        className="px-3 py-1.5 rounded-lg text-xs" style={{ background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-color)' }}>
                        {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
                      </select>
                      <button onClick={() => loadHolidays()} className="px-3 py-1.5 rounded-lg text-xs font-medium" style={{ background: 'var(--bg-surface)', color: 'var(--text-secondary)', border: '1px solid var(--border-color)' }}>
                        <RefreshCw size={13} />
                      </button>
                      <button onClick={() => { setEditingHol(null); setHolForm({ holiday_date: '', name: '', is_optional: false }); setShowHolForm(true); }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white" style={{ background: 'var(--bg-accent)' }}>
                        <Plus size={13} /> Add Holiday
                      </button>
                    </div>
                  </div>
                </div>

                {/* Holiday Form Modal */}
                {showHolForm && (
                  <div className="card" style={{ border: '1px solid var(--border-active)' }}>
                    <form onSubmit={handleSaveHoliday} className="space-y-3">
                      <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{editingHol ? 'Edit Holiday' : 'Add New Holiday'}</h3>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Date *</label>
                          <input type="date" required value={holForm.holiday_date}
                            onChange={(e) => setHolForm({ ...holForm, holiday_date: e.target.value })}
                            className="w-full px-3 py-1.5 rounded-lg text-xs" style={{ background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-color)' }} />
                        </div>
                        <div>
                          <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Holiday Name *</label>
                          <input type="text" required value={holForm.name} placeholder="e.g. Republic Day"
                            onChange={(e) => setHolForm({ ...holForm, name: e.target.value })}
                            className="w-full px-3 py-1.5 rounded-lg text-xs" style={{ background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-color)' }} />
                        </div>
                        <div className="flex items-end gap-3">
                          <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
                            <input type="checkbox" checked={holForm.is_optional}
                              onChange={(e) => setHolForm({ ...holForm, is_optional: e.target.checked })}
                              className="rounded" />
                            Optional Holiday
                          </label>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button type="submit" className="px-4 py-1.5 rounded-lg text-xs font-medium text-white" style={{ background: 'var(--bg-accent)' }}>
                          {editingHol ? 'Update' : 'Add'}
                        </button>
                        <button type="button" onClick={() => { setShowHolForm(false); setEditingHol(null); }}
                          className="px-4 py-1.5 rounded-lg text-xs font-medium" style={{ background: 'var(--bg-surface)', color: 'var(--text-secondary)', border: '1px solid var(--border-color)' }}>
                          Cancel
                        </button>
                      </div>
                    </form>
                  </div>
                )}

                {/* Holidays Table */}
                <div className="card">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                          <th className="text-left py-2 px-3 font-medium" style={{ color: 'var(--text-muted)' }}>#</th>
                          <th className="text-left py-2 px-3 font-medium" style={{ color: 'var(--text-muted)' }}>Date</th>
                          <th className="text-left py-2 px-3 font-medium" style={{ color: 'var(--text-muted)' }}>Day</th>
                          <th className="text-left py-2 px-3 font-medium" style={{ color: 'var(--text-muted)' }}>Holiday Name</th>
                          <th className="text-left py-2 px-3 font-medium" style={{ color: 'var(--text-muted)' }}>Type</th>
                          <th className="text-right py-2 px-3 font-medium" style={{ color: 'var(--text-muted)' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {holidays.map((h, i) => {
                          const d = new Date(h.holiday_date + 'T00:00:00');
                          const dayName = d.toLocaleDateString('en-IN', { weekday: 'short' });
                          const dateStr = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
                          const isPast = d < new Date(new Date().toDateString());
                          return (
                            <tr key={h.id} style={{ borderBottom: '1px solid var(--border-color)', opacity: isPast ? 0.5 : 1 }}>
                              <td className="py-2 px-3" style={{ color: 'var(--text-muted)' }}>{i + 1}</td>
                              <td className="py-2 px-3 font-medium" style={{ color: 'var(--text-primary)' }}>{dateStr}</td>
                              <td className="py-2 px-3" style={{ color: 'var(--text-secondary)' }}>{dayName}</td>
                              <td className="py-2 px-3 font-medium" style={{ color: 'var(--text-primary)' }}>{h.name}</td>
                              <td className="py-2 px-3">
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${h.is_optional ? 'bg-yellow-500/20 text-yellow-400' : 'bg-purple-500/20 text-purple-400'}`}>
                                  {h.is_optional ? 'Optional' : 'Mandatory'}
                                </span>
                              </td>
                              <td className="py-2 px-3 text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <button onClick={() => editHoliday(h)} className="p-1 rounded hover:opacity-80" style={{ color: 'var(--text-accent)' }}>
                                    <Edit2 size={13} />
                                  </button>
                                  <button onClick={() => handleDeleteHoliday(h.id)} className="p-1 rounded hover:opacity-80 text-red-400">
                                    <Trash2 size={13} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {holidays.length === 0 && (
                      <p className="text-center py-8 text-sm" style={{ color: 'var(--text-muted)' }}>No holidays for {holYear}</p>
                    )}
                  </div>
                  <p className="text-xs mt-3" style={{ color: 'var(--text-muted)' }}>
                    {holidays.length} holiday{holidays.length !== 1 ? 's' : ''} in {holYear} · Mandatory holidays skip absent marking
                  </p>
                </div>
              </div>
            )}

            {/* Welcome Email Tab */}
            {tab === 'welcomeEmail' && (
              <div className="space-y-4">
                {/* Header */}
                <div className="card">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                        <Mail size={20} className="text-blue-500" /> Welcome Email & Password Management
                      </h2>
                      <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                        Send welcome emails, reset passwords, and monitor password change status
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleSendWelcomeEmail(selectedEmps.length ? selectedEmps : undefined)}
                        disabled={sendingEmail}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-white text-sm font-medium transition"
                        style={{ background: '#2563eb' }}
                      >
                        {sendingEmail ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Send size={15} />}
                        {selectedEmps.length ? `Send to ${selectedEmps.length} Selected` : 'Send to All'}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Stats Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { label: 'Total Employees', value: passwordStatus.length, color: '#2563eb', icon: Users },
                    { label: 'Default Password', value: passwordStatus.filter((e) => e.must_change_password).length, color: '#dc2626', icon: AlertTriangle },
                    { label: 'Password Changed', value: passwordStatus.filter((e) => !e.must_change_password).length, color: '#16a34a', icon: Shield },
                    { label: 'No Valid Email', value: passwordStatus.filter((e) => !e.email || e.email.endsWith('.auto@ncpl.com')).length, color: '#d97706', icon: XCircle },
                  ].map((s) => (
                    <div key={s.label} className="card flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: `${s.color}18` }}>
                        <s.icon size={18} style={{ color: s.color }} />
                      </div>
                      <div>
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{s.label}</p>
                        <p className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{s.value}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Search */}
                <div className="card">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="relative flex-1">
                      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        type="text" value={pwSearch} onChange={(e) => setPwSearch(e.target.value)}
                        placeholder="Search by name, email, code, department..."
                        className="w-full pl-9 pr-4 py-2.5 rounded-lg text-sm outline-none transition-all"
                        style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                      />
                    </div>
                    <button onClick={loadTab} className="btn-secondary"><RefreshCw size={16} /></button>
                  </div>

                  {/* Table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--border)' }}>
                          <th className="py-2 px-2 text-left">
                            <input type="checkbox" checked={selectedEmps.length === filteredPwStatus.length && filteredPwStatus.length > 0} onChange={toggleSelectAll} className="rounded" />
                          </th>
                          <th className="py-2 px-2 text-left text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Code</th>
                          <th className="py-2 px-2 text-left text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Name</th>
                          <th className="py-2 px-2 text-left text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Email</th>
                          <th className="py-2 px-2 text-left text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Department</th>
                          <th className="py-2 px-2 text-center text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Password Status</th>
                          <th className="py-2 px-2 text-right text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredPwStatus.map((emp) => {
                          const noEmail = !emp.email || emp.email.endsWith('.auto@ncpl.com');
                          return (
                            <tr key={emp.id} className="hover:bg-black/5 dark:hover:bg-white/5 transition" style={{ borderBottom: '1px solid var(--border)' }}>
                              <td className="py-2.5 px-2">
                                <input type="checkbox" checked={selectedEmps.includes(emp.id)} onChange={() => toggleSelectEmp(emp.id)} disabled={noEmail} className="rounded" />
                              </td>
                              <td className="py-2.5 px-2 text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>{emp.employee_code}</td>
                              <td className="py-2.5 px-2 font-medium" style={{ color: 'var(--text-primary)' }}>
                                {emp.first_name} {emp.last_name}
                              </td>
                              <td className="py-2.5 px-2 text-xs" style={{ color: noEmail ? 'var(--text-muted)' : 'var(--text-secondary)' }}>
                                {noEmail ? <span className="italic">No valid email</span> : emp.email}
                              </td>
                              <td className="py-2.5 px-2 text-xs" style={{ color: 'var(--text-secondary)' }}>{emp.department || '-'}</td>
                              <td className="py-2.5 px-2 text-center">
                                {emp.must_change_password ? (
                                  <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                                    <KeyRound size={11} /> Default
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                                    <CheckCircle size={11} /> Changed
                                  </span>
                                )}
                              </td>
                              <td className="py-2.5 px-2 text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <button
                                    onClick={() => handleSendWelcomeEmail([emp.id])}
                                    disabled={noEmail || sendingEmail}
                                    className="p-1.5 rounded-lg hover:bg-blue-500/10 text-blue-500 disabled:opacity-30"
                                    title="Send welcome email"
                                  >
                                    <Send size={14} />
                                  </button>
                                  <button
                                    onClick={() => handleResetPassword(emp.id)}
                                    disabled={resettingPw === emp.id}
                                    className="p-1.5 rounded-lg hover:bg-amber-500/10 text-amber-500 disabled:opacity-30"
                                    title="Reset password to Welcome@123"
                                  >
                                    {resettingPw === emp.id ? <div className="w-3.5 h-3.5 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" /> : <RotateCcw size={14} />}
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {filteredPwStatus.length === 0 && (
                      <p className="text-center py-8 text-sm" style={{ color: 'var(--text-muted)' }}>No employees found</p>
                    )}
                  </div>
                  <p className="text-xs mt-3" style={{ color: 'var(--text-muted)' }}>
                    Showing {filteredPwStatus.length} of {passwordStatus.length} employees
                  </p>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
