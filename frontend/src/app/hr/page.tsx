'use client';
import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import AppShell from '@/components/layout/AppShell';
import {
  Users, UserCheck, UserX, Clock, AlertTriangle, CalendarDays,
  TrendingUp, RefreshCw, Search, BarChart3, ChevronLeft, ChevronRight,
  Calendar, ArrowRight
} from 'lucide-react';
import {
  format, subDays, addDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth,
  eachDayOfInterval, isToday as isDateToday, isSameMonth, getDay
} from 'date-fns';
import type { Shift } from '@/types';

type Tab = 'daily' | 'weekly' | 'monthly' | 'gantt';

interface DailySummary {
  total: number; present: number; absent: number; late: number;
  on_leave: number; early_checkout: number; not_punched: number;
}

interface DailyEmployee {
  id: number; employee_code: string; first_name: string; last_name: string;
  department: string; designation: string; shift_name: string;
  shift_start: string; shift_end: string; full_day_hours: number;
  punch_in: string | null; punch_out: string | null; status: string | null;
  work_hours: number | null; is_late: boolean; late_minutes: number;
}

interface WeekDaySummary {
  date: string; present: number; absent: number; late: number; on_leave: number;
}

interface WeekEmployee {
  id: number; employee_code: string; first_name: string; last_name: string;
  department: string; present_days: number; absent_days: number;
  late_days: number; leave_days: number; avg_hours: number;
}

interface MonthEmployee {
  id: number; employee_code: string; first_name: string; last_name: string;
  department: string; present_days: number; absent_days: number;
  late_days: number; leave_days: number; total_hours: number; avg_hours: number;
}

interface DeptSummary {
  department: string; total_employees: number;
  present_count: number; absent_count: number; late_count: number;
}

export default function HRDashboard() {
  const { user, isAdmin } = useAuth();
  const [tab, setTab] = useState<Tab>('daily');
  const [loading, setLoading] = useState(false);

  // Filters
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [departments, setDepartments] = useState<string[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [filterDept, setFilterDept] = useState('');
  const [filterShift, setFilterShift] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Daily data
  const [dailySummary, setDailySummary] = useState<DailySummary | null>(null);
  const [dailyEmployees, setDailyEmployees] = useState<DailyEmployee[]>([]);

  // Weekly data
  const [weekDays, setWeekDays] = useState<WeekDaySummary[]>([]);
  const [weekEmployees, setWeekEmployees] = useState<WeekEmployee[]>([]);
  const [weekTotal, setWeekTotal] = useState(0);

  // Monthly data
  const [monthDays, setMonthDays] = useState<WeekDaySummary[]>([]);
  const [monthEmployees, setMonthEmployees] = useState<MonthEmployee[]>([]);
  const [deptSummary, setDeptSummary] = useState<DeptSummary[]>([]);

  // Gantt data
  const [ganttData, setGanttData] = useState<DailyEmployee[]>([]);

  // Load departments & shifts on mount
  useEffect(() => {
    Promise.all([api.getDepartments(), api.getEmployeeShifts()]).then(([d, s]) => {
      setDepartments(d);
      setShifts(s);
    }).catch(() => {});
  }, []);

  // Load daily data
  const loadDaily = useCallback(async () => {
    setLoading(true);
    try {
      const date = format(selectedDate, 'yyyy-MM-dd');
      const data = await api.getHRDaily(date, filterDept || undefined, filterShift ? parseInt(filterShift) : undefined);
      setDailySummary(data.summary);
      setDailyEmployees(data.employees);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [selectedDate, filterDept, filterShift]);

  // Load weekly data
  const loadWeekly = useCallback(async () => {
    setLoading(true);
    try {
      const ws = startOfWeek(selectedDate, { weekStartsOn: 1 });
      const we = endOfWeek(selectedDate, { weekStartsOn: 1 });
      const data = await api.getHRWeekly(
        format(ws, 'yyyy-MM-dd'), format(we, 'yyyy-MM-dd'), filterDept || undefined
      );
      setWeekDays(data.day_summary);
      setWeekEmployees(data.employee_summary);
      setWeekTotal(data.total_employees);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [selectedDate, filterDept]);

  // Load monthly data
  const loadMonthly = useCallback(async () => {
    setLoading(true);
    try {
      const y = selectedDate.getFullYear();
      const m = selectedDate.getMonth() + 1;
      const data = await api.getHRMonthly(y, m, filterDept || undefined);
      setMonthDays(data.day_summary);
      setMonthEmployees(data.employee_summary);
      setDeptSummary(data.department_summary);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [selectedDate, filterDept]);

  // Load gantt data
  const loadGantt = useCallback(async () => {
    setLoading(true);
    try {
      const date = format(selectedDate, 'yyyy-MM-dd');
      const data = await api.getManagerLiveAttendance(date, filterDept || undefined, filterShift ? parseInt(filterShift) : undefined);
      setGanttData(data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [selectedDate, filterDept, filterShift]);

  useEffect(() => {
    if (tab === 'daily') loadDaily();
    else if (tab === 'weekly') loadWeekly();
    else if (tab === 'monthly') loadMonthly();
    else if (tab === 'gantt') loadGantt();
  }, [tab, loadDaily, loadWeekly, loadMonthly, loadGantt]);

  // Gantt helpers
  const GANTT_START = 6;
  const GANTT_END = 24;
  const GANTT_HOURS = GANTT_END - GANTT_START;
  const timeToPercent = (timeStr: string) => {
    const [h, m] = timeStr.split(':').map(Number);
    return Math.max(0, Math.min(100, ((h + m / 60 - GANTT_START) / GANTT_HOURS) * 100));
  };
  const nowPercent = (() => {
    const now = new Date();
    return Math.max(0, Math.min(100, ((now.getHours() + now.getMinutes() / 60 - GANTT_START) / GANTT_HOURS) * 100));
  })();

  // Filter employees by search
  const filterBySearch = <T extends { first_name: string; last_name: string; employee_code: string }>(list: T[]) => {
    if (!searchQuery) return list;
    const q = searchQuery.toLowerCase();
    return list.filter(e => `${e.first_name} ${e.last_name}`.toLowerCase().includes(q) || e.employee_code.toLowerCase().includes(q));
  };

  if (!isAdmin) {
    return (
      <AppShell>
        <div className="flex items-center justify-center h-64">
          <p style={{ color: 'var(--text-muted)' }}>Access denied. Admin/HR role required.</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>HR Dashboard</h1>
            <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>Detailed attendance analytics &amp; reporting</p>
          </div>
          <div className="flex rounded-xl overflow-hidden" style={{ border: '1px solid var(--border-color)' }}>
            {([
              { key: 'daily' as Tab, label: 'Daily', icon: Calendar },
              { key: 'weekly' as Tab, label: 'Weekly', icon: CalendarDays },
              { key: 'monthly' as Tab, label: 'Monthly', icon: TrendingUp },
              { key: 'gantt' as Tab, label: 'Timeline', icon: BarChart3 },
            ]).map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-all ${
                  tab === t.key ? 'bg-primary-400 text-white' : ''
                }`}
                style={tab !== t.key ? { color: 'var(--text-secondary)', background: 'var(--bg-surface)' } : undefined}
              >
                <t.icon size={15} />
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Date Navigator */}
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={() => setSelectedDate(prev => tab === 'monthly' ? new Date(prev.getFullYear(), prev.getMonth() - 1, 1) : subDays(prev, tab === 'weekly' ? 7 : 1))}
            className="p-2 rounded-xl transition-all hover:bg-primary-400/10"
            style={{ color: 'var(--text-secondary)', border: '1px solid var(--border-color)' }}>
            <ChevronLeft size={18} />
          </button>
          <div className="flex items-center gap-2">
            <input
              type={tab === 'monthly' ? 'month' : 'date'}
              value={tab === 'monthly' ? format(selectedDate, 'yyyy-MM') : format(selectedDate, 'yyyy-MM-dd')}
              onChange={(e) => setSelectedDate(new Date(e.target.value + (tab === 'monthly' ? '-01' : '') + 'T00:00:00'))}
              className="px-3 py-1.5 rounded-lg text-sm font-medium"
              style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
            />
            <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              {tab === 'monthly'
                ? format(selectedDate, 'MMMM yyyy')
                : tab === 'weekly'
                  ? `${format(startOfWeek(selectedDate, { weekStartsOn: 1 }), 'MMM d')} — ${format(endOfWeek(selectedDate, { weekStartsOn: 1 }), 'MMM d, yyyy')}`
                  : format(selectedDate, 'EEEE, MMMM d, yyyy')}
            </span>
            {isDateToday(selectedDate) && tab === 'daily' && (
              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-primary-400 text-white">TODAY</span>
            )}
          </div>
          <button onClick={() => setSelectedDate(prev => tab === 'monthly' ? new Date(prev.getFullYear(), prev.getMonth() + 1, 1) : addDays(prev, tab === 'weekly' ? 7 : 1))}
            className="p-2 rounded-xl transition-all hover:bg-primary-400/10"
            style={{ color: 'var(--text-secondary)', border: '1px solid var(--border-color)' }}>
            <ChevronRight size={18} />
          </button>
          {!isDateToday(selectedDate) && (
            <button onClick={() => setSelectedDate(new Date())}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={{ color: 'var(--text-secondary)', background: 'var(--bg-surface)', border: '1px solid var(--border-color)' }}>
              Today
            </button>
          )}

          {/* Dept + Shift filters */}
          <div className="ml-auto flex items-center gap-2">
            <select value={filterDept} onChange={(e) => setFilterDept(e.target.value)}
              className="px-3 py-1.5 rounded-lg text-xs"
              style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}>
              <option value="">All Departments</option>
              {departments.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            {(tab === 'daily' || tab === 'gantt') && (
              <select value={filterShift} onChange={(e) => setFilterShift(e.target.value)}
                className="px-3 py-1.5 rounded-lg text-xs"
                style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}>
                <option value="">All Shifts</option>
                {shifts.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            )}
          </div>
        </div>

        <AnimatePresence mode="wait">
          {/* ======= DAILY TAB ======= */}
          {tab === 'daily' && (
            <motion.div key="daily" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
              {loading ? <Loader /> : dailySummary && (
                <>
                  {/* Summary Cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
                    {[
                      { label: 'Total', value: dailySummary.total, color: '#6366f1', bg: 'rgba(99,102,241,0.12)' },
                      { label: 'Present', value: dailySummary.present, color: '#22c55e', bg: 'rgba(34,197,94,0.12)' },
                      { label: 'Absent', value: dailySummary.absent, color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
                      { label: 'Late', value: dailySummary.late, color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
                      { label: 'On Leave', value: dailySummary.on_leave, color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)' },
                      { label: 'Early Out', value: dailySummary.early_checkout, color: '#ec4899', bg: 'rgba(236,72,153,0.12)' },
                      { label: 'No Punch', value: dailySummary.not_punched, color: '#64748b', bg: 'rgba(100,116,139,0.12)' },
                    ].map((c, i) => (
                      <motion.div key={c.label} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
                        className="card !p-4 text-center">
                        <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{c.label}</p>
                        <p className="text-2xl font-bold mt-1" style={{ color: c.color }}>{c.value}</p>
                      </motion.div>
                    ))}
                  </div>

                  {/* Attendance % bar */}
                  {dailySummary.total > 0 && (() => {
                    const pct = Math.round((parseInt(String(dailySummary.present)) / parseInt(String(dailySummary.total))) * 100);
                    return (
                      <div className="card !p-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Attendance Rate</span>
                          <span className="text-lg font-bold" style={{ color: pct >= 80 ? '#22c55e' : pct >= 60 ? '#f59e0b' : '#ef4444' }}>{pct}%</span>
                        </div>
                        <div className="h-2 rounded-full" style={{ background: 'var(--bg-surface)' }}>
                          <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: pct >= 80 ? '#22c55e' : pct >= 60 ? '#f59e0b' : '#ef4444' }} />
                        </div>
                      </div>
                    );
                  })()}

                  {/* Search */}
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
                    <input type="text" placeholder="Search employee..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 rounded-lg text-sm"
                      style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }} />
                  </div>

                  {/* Employee table */}
                  <div className="card !p-0 overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr style={{ background: 'var(--bg-surface)' }}>
                            {['Employee', 'Department', 'Shift', 'Punch In', 'Punch Out', 'Hours', 'Status'].map(h => (
                              <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {filterBySearch(dailyEmployees).length === 0 ? (
                            <tr><td colSpan={7} className="text-center py-12" style={{ color: 'var(--text-muted)' }}>No records</td></tr>
                          ) : filterBySearch(dailyEmployees).map((emp, i) => {
                            const sc = emp.is_late ? '#f59e0b' : emp.status === 'present' ? '#22c55e' : emp.status === 'absent' ? '#ef4444' : !emp.punch_in ? '#6b7280' : '#6366f1';
                            return (
                              <motion.tr key={emp.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.015 }}
                                style={{ borderBottom: '1px solid var(--border-color)' }}>
                                <td className="px-4 py-3">
                                  <p className="font-medium" style={{ color: 'var(--text-primary)' }}>{emp.first_name} {emp.last_name}</p>
                                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{emp.employee_code}</p>
                                </td>
                                <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>{emp.department}</td>
                                <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-secondary)' }}>
                                  {emp.shift_name || 'N/A'}
                                  {emp.shift_start && <span className="block text-[10px]" style={{ color: 'var(--text-muted)' }}>{emp.shift_start?.substring(0, 5)} - {emp.shift_end?.substring(0, 5)}</span>}
                                </td>
                                <td className="px-4 py-3">
                                  <span className="font-mono text-sm" style={{ color: emp.punch_in ? '#22c55e' : 'var(--text-muted)' }}>{emp.punch_in || '---'}</span>
                                  {emp.is_late && <span className="ml-1 px-1.5 py-0.5 text-[10px] font-bold rounded bg-amber-500/15 text-amber-400">+{emp.late_minutes}m</span>}
                                </td>
                                <td className="px-4 py-3"><span className="font-mono text-sm" style={{ color: emp.punch_out ? '#ef4444' : 'var(--text-muted)' }}>{emp.punch_out || '---'}</span></td>
                                <td className="px-4 py-3">{emp.work_hours != null ? <span className="font-mono font-medium" style={{ color: 'var(--text-primary)' }}>{Number(emp.work_hours).toFixed(1)}h</span> : <span style={{ color: 'var(--text-muted)' }}>---</span>}</td>
                                <td className="px-4 py-3">
                                  <span className="px-2 py-1 rounded-md text-xs font-medium capitalize" style={{ background: `${sc}18`, color: sc, border: `1px solid ${sc}30` }}>
                                    {emp.is_late ? 'Late' : emp.status || 'No Record'}
                                  </span>
                                </td>
                              </motion.tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </motion.div>
          )}

          {/* ======= WEEKLY TAB ======= */}
          {tab === 'weekly' && (
            <motion.div key="weekly" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
              {loading ? <Loader /> : (
                <>
                  {/* Day-by-day chart */}
                  <div className="card !p-5">
                    <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Day-by-Day Overview</h3>
                    <div className="grid grid-cols-7 gap-2">
                      {(() => {
                        const ws = startOfWeek(selectedDate, { weekStartsOn: 1 });
                        return Array.from({ length: 7 }, (_, i) => {
                          const d = addDays(ws, i);
                          const ds = format(d, 'yyyy-MM-dd');
                          const dayData = weekDays.find(w => w.date === ds);
                          const present = parseInt(String(dayData?.present || 0));
                          const total = weekTotal || 1;
                          const pct = Math.round((present / total) * 100);
                          const isToday = isDateToday(d);
                          return (
                            <div key={i} className={`text-center p-3 rounded-xl transition-all ${isToday ? 'ring-2 ring-primary-400' : ''}`}
                              style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)' }}>
                              <p className="text-[10px] font-semibold uppercase" style={{ color: 'var(--text-muted)' }}>{format(d, 'EEE')}</p>
                              <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>{format(d, 'MMM d')}</p>
                              <div className="mt-2 mx-auto w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold"
                                style={{ background: dayData ? (pct >= 80 ? 'rgba(34,197,94,0.15)' : pct >= 60 ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)') : 'var(--bg-card)', color: dayData ? (pct >= 80 ? '#22c55e' : pct >= 60 ? '#f59e0b' : '#ef4444') : 'var(--text-muted)' }}>
                                {dayData ? `${pct}%` : '—'}
                              </div>
                              {dayData && (
                                <div className="mt-2 space-y-0.5 text-[10px]">
                                  <p style={{ color: '#22c55e' }}>P: {dayData.present}</p>
                                  <p style={{ color: '#ef4444' }}>A: {dayData.absent}</p>
                                  <p style={{ color: '#f59e0b' }}>L: {dayData.late}</p>
                                </div>
                              )}
                            </div>
                          );
                        });
                      })()}
                    </div>
                  </div>

                  {/* Search */}
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
                    <input type="text" placeholder="Search employee..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 rounded-lg text-sm"
                      style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }} />
                  </div>

                  {/* Employee weekly summary table */}
                  <div className="card !p-0 overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr style={{ background: 'var(--bg-surface)' }}>
                            {['Employee', 'Department', 'Present', 'Absent', 'Late', 'Leave', 'Avg Hours'].map(h => (
                              <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {filterBySearch(weekEmployees).length === 0 ? (
                            <tr><td colSpan={7} className="text-center py-12" style={{ color: 'var(--text-muted)' }}>No records</td></tr>
                          ) : filterBySearch(weekEmployees).map((emp, i) => (
                            <motion.tr key={emp.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.015 }}
                              style={{ borderBottom: '1px solid var(--border-color)' }}>
                              <td className="px-4 py-3">
                                <p className="font-medium" style={{ color: 'var(--text-primary)' }}>{emp.first_name} {emp.last_name}</p>
                                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{emp.employee_code}</p>
                              </td>
                              <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>{emp.department}</td>
                              <td className="px-4 py-3"><span className="font-bold" style={{ color: '#22c55e' }}>{emp.present_days}</span></td>
                              <td className="px-4 py-3"><span className="font-bold" style={{ color: '#ef4444' }}>{emp.absent_days}</span></td>
                              <td className="px-4 py-3"><span className="font-bold" style={{ color: '#f59e0b' }}>{emp.late_days}</span></td>
                              <td className="px-4 py-3"><span className="font-bold" style={{ color: '#8b5cf6' }}>{emp.leave_days}</span></td>
                              <td className="px-4 py-3"><span className="font-mono font-medium" style={{ color: 'var(--text-primary)' }}>{Number(emp.avg_hours).toFixed(1)}h</span></td>
                            </motion.tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </motion.div>
          )}

          {/* ======= MONTHLY TAB ======= */}
          {tab === 'monthly' && (
            <motion.div key="monthly" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
              {loading ? <Loader /> : (
                <>
                  {/* Department Summary Cards */}
                  {deptSummary.length > 0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                      {deptSummary.map((d, i) => {
                        const totalDays = parseInt(String(d.present_count)) + parseInt(String(d.absent_count));
                        const pct = totalDays > 0 ? Math.round((parseInt(String(d.present_count)) / totalDays) * 100) : 0;
                        return (
                          <motion.div key={d.department} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                            className="card !p-4">
                            <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>{d.department || 'Unassigned'}</p>
                            <div className="flex items-end justify-between">
                              <span className="text-2xl font-bold" style={{ color: pct >= 80 ? '#22c55e' : pct >= 60 ? '#f59e0b' : '#ef4444' }}>{pct}%</span>
                              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{d.total_employees} emp</span>
                            </div>
                            <div className="mt-2 h-1.5 rounded-full" style={{ background: 'var(--bg-surface)' }}>
                              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: pct >= 80 ? '#22c55e' : pct >= 60 ? '#f59e0b' : '#ef4444' }} />
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  )}

                  {/* Monthly Calendar Heatmap */}
                  <div className="card !p-5">
                    <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Daily Attendance Heatmap</h3>
                    <div className="grid grid-cols-7 gap-1.5 text-center">
                      {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
                        <div key={d} className="text-[10px] font-semibold uppercase py-1" style={{ color: 'var(--text-muted)' }}>{d}</div>
                      ))}
                      {(() => {
                        const ms = startOfMonth(selectedDate);
                        const me = endOfMonth(selectedDate);
                        const days = eachDayOfInterval({ start: ms, end: me });
                        const startDay = (getDay(ms) + 6) % 7; // Monday = 0
                        const cells = [];
                        for (let i = 0; i < startDay; i++) cells.push(<div key={`pad-${i}`} />);
                        const totalEmps = monthEmployees.length || 1;
                        for (const d of days) {
                          const ds = format(d, 'yyyy-MM-dd');
                          const dayData = monthDays.find(md => md.date === ds);
                          const present = parseInt(String(dayData?.present || 0));
                          const pct = Math.round((present / totalEmps) * 100);
                          const isSun = getDay(d) === 0;
                          const isT = isDateToday(d);
                          cells.push(
                            <div key={ds}
                              className={`rounded-lg py-2 text-xs transition-all ${isT ? 'ring-2 ring-primary-400' : ''}`}
                              style={{
                                background: isSun ? 'var(--bg-surface)' : dayData ? (pct >= 80 ? 'rgba(34,197,94,0.15)' : pct >= 60 ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)') : 'var(--bg-surface)',
                                color: isSun ? 'var(--text-muted)' : dayData ? (pct >= 80 ? '#22c55e' : pct >= 60 ? '#f59e0b' : '#ef4444') : 'var(--text-muted)',
                              }}
                              title={dayData ? `${ds}: ${dayData.present}P / ${dayData.absent}A / ${dayData.late}L` : ds}>
                              <div className="font-semibold">{format(d, 'd')}</div>
                              {dayData && !isSun && <div className="text-[9px] font-bold mt-0.5">{pct}%</div>}
                            </div>
                          );
                        }
                        return cells;
                      })()}
                    </div>
                  </div>

                  {/* Search */}
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
                    <input type="text" placeholder="Search employee..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 rounded-lg text-sm"
                      style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }} />
                  </div>

                  {/* Employee monthly summary table */}
                  <div className="card !p-0 overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr style={{ background: 'var(--bg-surface)' }}>
                            {['Employee', 'Department', 'Present', 'Absent', 'Late', 'Leave', 'Total Hrs', 'Avg Hrs'].map(h => (
                              <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {filterBySearch(monthEmployees).length === 0 ? (
                            <tr><td colSpan={8} className="text-center py-12" style={{ color: 'var(--text-muted)' }}>No records</td></tr>
                          ) : filterBySearch(monthEmployees).map((emp, i) => (
                            <motion.tr key={emp.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.015 }}
                              style={{ borderBottom: '1px solid var(--border-color)' }}>
                              <td className="px-4 py-3">
                                <p className="font-medium" style={{ color: 'var(--text-primary)' }}>{emp.first_name} {emp.last_name}</p>
                                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{emp.employee_code}</p>
                              </td>
                              <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>{emp.department}</td>
                              <td className="px-4 py-3"><span className="font-bold" style={{ color: '#22c55e' }}>{emp.present_days}</span></td>
                              <td className="px-4 py-3"><span className="font-bold" style={{ color: '#ef4444' }}>{emp.absent_days}</span></td>
                              <td className="px-4 py-3"><span className="font-bold" style={{ color: '#f59e0b' }}>{emp.late_days}</span></td>
                              <td className="px-4 py-3"><span className="font-bold" style={{ color: '#8b5cf6' }}>{emp.leave_days}</span></td>
                              <td className="px-4 py-3"><span className="font-mono font-medium" style={{ color: 'var(--text-primary)' }}>{Number(emp.total_hours).toFixed(1)}h</span></td>
                              <td className="px-4 py-3"><span className="font-mono" style={{ color: 'var(--text-secondary)' }}>{Number(emp.avg_hours).toFixed(1)}h</span></td>
                            </motion.tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </motion.div>
          )}

          {/* ======= GANTT / TIMELINE TAB ======= */}
          {tab === 'gantt' && (
            <motion.div key="gantt" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
              {/* Legend */}
              <div className="flex flex-wrap items-center gap-4 text-xs" style={{ color: 'var(--text-muted)' }}>
                <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm" style={{ background: 'rgba(99,102,241,0.25)', border: '1px solid rgba(99,102,241,0.5)' }} /><span>Scheduled Shift</span></div>
                <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-green-500" /><span>Actual Work</span></div>
                <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-amber-500" /><span>Late Arrival</span></div>
                <div className="flex items-center gap-1.5"><div className="w-0.5 h-3 bg-red-500" /><span>Current Time</span></div>
              </div>

              {/* Search */}
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
                <input type="text" placeholder="Search employee..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 rounded-lg text-sm"
                  style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }} />
              </div>

              {loading ? <Loader /> : (
                <div className="card !p-0 overflow-hidden">
                  <div className="overflow-x-auto">
                    <div style={{ minWidth: '800px' }}>
                      {/* Time Header */}
                      <div className="flex" style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <div className="w-44 min-w-[176px] px-4 py-2.5" style={{ background: 'var(--bg-surface)' }}>
                          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Employee</span>
                          <span className="block text-[10px] font-medium mt-0.5" style={{ color: 'var(--text-primary)' }}>{format(selectedDate, 'dd MMM yyyy')}</span>
                        </div>
                        <div className="flex-1 relative" style={{ background: 'var(--bg-surface)' }}>
                          <div className="flex h-full">
                            {Array.from({ length: GANTT_HOURS }, (_, i) => {
                              const h = GANTT_START + i;
                              const label = h === 0 ? '12A' : h < 12 ? `${h}A` : h === 12 ? '12P' : `${h - 12}P`;
                              return (
                                <div key={h} className="flex-1 text-center py-2.5 text-[10px] font-medium"
                                  style={{ color: 'var(--text-muted)', borderLeft: '1px solid var(--border-color)' }}>{label}</div>
                              );
                            })}
                          </div>
                        </div>
                      </div>

                      {/* Employee Rows */}
                      {filterBySearch(ganttData).length === 0 ? (
                        <div className="text-center py-12" style={{ color: 'var(--text-muted)' }}>No records found</div>
                      ) : filterBySearch(ganttData).map((emp, i) => {
                        const shiftLeft = emp.shift_start ? timeToPercent(emp.shift_start) : 0;
                        const shiftRight = emp.shift_end ? timeToPercent(emp.shift_end) : 0;
                        const shiftWidth = shiftRight > shiftLeft ? shiftRight - shiftLeft : 0;
                        const punchInPct = emp.punch_in ? timeToPercent(emp.punch_in) : null;
                        const punchOutPct = emp.punch_out ? timeToPercent(emp.punch_out) : (emp.punch_in ? nowPercent : null);
                        const workLeft = punchInPct ?? 0;
                        const workWidth = punchOutPct != null ? Math.max(0, punchOutPct - workLeft) : 0;

                        return (
                          <motion.div key={emp.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.015 }}
                            className="flex items-center group hover:bg-white/[0.02] transition-colors"
                            style={{ borderBottom: '1px solid var(--border-color)', height: '48px' }}>
                            <div className="w-44 min-w-[176px] px-4 flex-shrink-0">
                              <p className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>{emp.first_name} {emp.last_name}</p>
                              <p className="text-[10px] truncate" style={{ color: 'var(--text-muted)' }}>{emp.shift_name || 'N/A'} · {emp.employee_code}</p>
                            </div>
                            <div className="flex-1 relative h-full">
                              {Array.from({ length: GANTT_HOURS }, (_, idx) => (
                                <div key={idx} className="absolute top-0 h-full" style={{ left: `${(idx / GANTT_HOURS) * 100}%`, width: '1px', background: 'var(--border-color)', opacity: 0.4 }} />
                              ))}
                              {shiftWidth > 0 && (
                                <div className="absolute top-2 rounded-md" style={{ left: `${shiftLeft}%`, width: `${shiftWidth}%`, height: '28px', background: 'rgba(99,102,241,0.12)', border: '1px dashed rgba(99,102,241,0.35)' }}
                                  title={`Shift: ${emp.shift_start?.substring(0, 5)} - ${emp.shift_end?.substring(0, 5)}`} />
                              )}
                              {punchInPct != null && workWidth > 0 && (
                                <div className="absolute top-2.5 rounded-md" style={{ left: `${workLeft}%`, width: `${workWidth}%`, height: '24px', background: emp.is_late ? 'linear-gradient(90deg, rgba(245,158,11,0.7) 0%, rgba(34,197,94,0.7) 15%)' : 'rgba(34,197,94,0.65)', borderRadius: '4px' }}
                                  title={`${emp.punch_in?.substring(0, 5) || ''} - ${emp.punch_out?.substring(0, 5) || 'Working...'}`}>
                                  <span className="absolute left-1 top-1/2 -translate-y-1/2 text-[9px] font-mono font-bold text-white whitespace-nowrap drop-shadow-sm">{emp.punch_in?.substring(0, 5)}</span>
                                  {emp.punch_out && workWidth > 8 && <span className="absolute right-1 top-1/2 -translate-y-1/2 text-[9px] font-mono font-bold text-white whitespace-nowrap drop-shadow-sm">{emp.punch_out?.substring(0, 5)}</span>}
                                  {!emp.punch_out && <span className="absolute right-1 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-white animate-pulse" />}
                                </div>
                              )}
                              {!emp.punch_in && <div className="absolute top-3 left-1/2 -translate-x-1/2 text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>Not Punched</div>}
                              {isDateToday(selectedDate) && (
                                <div className="absolute top-0 h-full" style={{ left: `${nowPercent}%`, width: '2px', background: '#ef4444', zIndex: 10 }}>
                                  <div className="absolute -top-0.5 -left-1 w-2 h-2 rounded-full bg-red-500" />
                                </div>
                              )}
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </AppShell>
  );
}

function Loader() {
  return (
    <div className="flex items-center justify-center h-48">
      <div className="w-8 h-8 border-3 border-primary-400 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
