'use client';
import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import AppShell from '@/components/layout/AppShell';
import {
  Users, UserCheck, UserX, Clock, AlertTriangle, CalendarDays,
  TrendingUp, LogOut, Bell, RefreshCw, Search, Filter, Eye, ChevronDown, BarChart3,
  ChevronLeft, ChevronRight
} from 'lucide-react';
import { format, subDays, addDays, startOfWeek, endOfWeek, isToday as isDateToday } from 'date-fns';
import type { Shift } from '@/types';

type Tab = 'overview' | 'live' | 'gantt';
type TimeFilter = 'today' | 'yesterday' | 'this_week' | 'this_month' | 'custom';

interface ManagerStats {
  total_employees: number;
  present_today: number;
  absent_today: number;
  late_today: number;
  on_leave: number;
  early_checkout: number;
  pending_leaves: number;
  pending_regularizations: number;
  attendance_percent_today: number;
  attendance_percent_month: number;
}

interface LiveEmployee {
  id: number;
  employee_code: string;
  first_name: string;
  last_name: string;
  department: string;
  designation: string;
  shift_name: string;
  shift_start: string;
  shift_end: string;
  full_day_hours: number;
  punch_in: string | null;
  punch_out: string | null;
  status: string | null;
  work_hours: number | null;
  is_late: boolean;
  late_minutes: number;
}

export default function ManagerDashboard() {
  const { user, isManager } = useAuth();
  const [tab, setTab] = useState<Tab>('overview');
  const [stats, setStats] = useState<ManagerStats | null>(null);
  const [liveData, setLiveData] = useState<LiveEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [liveLoading, setLiveLoading] = useState(false);

  // Filters
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('today');
  const [customDate, setCustomDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [departments, setDepartments] = useState<string[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [filterDept, setFilterDept] = useState('');
  const [filterShift, setFilterShift] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [liveView, setLiveView] = useState<'all' | 'punched' | 'not_punched' | 'late'>('all');
  const [ganttDate, setGanttDate] = useState(new Date());

  const getDateForFilter = useCallback((filter: TimeFilter) => {
    const now = new Date();
    switch (filter) {
      case 'today': return format(now, 'yyyy-MM-dd');
      case 'yesterday': return format(subDays(now, 1), 'yyyy-MM-dd');
      case 'this_week': return format(now, 'yyyy-MM-dd');
      case 'this_month': return format(now, 'yyyy-MM-dd');
      case 'custom': return customDate;
    }
  }, [customDate]);

  // Load overview stats
  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const date = getDateForFilter(timeFilter);
        const [s, depts, sh] = await Promise.all([
          api.getManagerDashboard(date),
          api.getDepartments(),
          api.getEmployeeShifts(),
        ]);
        setStats(s);
        setDepartments(depts);
        setShifts(sh);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [timeFilter, customDate, getDateForFilter]);

  // Load live attendance
  const loadLive = useCallback(async () => {
    setLiveLoading(true);
    try {
      const date = tab === 'gantt' ? format(ganttDate, 'yyyy-MM-dd') : getDateForFilter(timeFilter);
      const data = await api.getManagerLiveAttendance(
        date,
        filterDept || undefined,
        filterShift ? parseInt(filterShift, 10) : undefined
      );
      setLiveData(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLiveLoading(false);
    }
  }, [tab, ganttDate, timeFilter, customDate, filterDept, filterShift, getDateForFilter]);

  useEffect(() => {
    if (tab === 'live' || tab === 'gantt') loadLive();
  }, [tab, loadLive]);

  // Auto-refresh live data every 60s
  useEffect(() => {
    if (tab !== 'live' && tab !== 'gantt') return;
    const interval = setInterval(loadLive, 60000);
    return () => clearInterval(interval);
  }, [tab, loadLive]);

  // Gantt chart helpers
  const GANTT_START = 6; // 6 AM
  const GANTT_END = 24; // 12 AM (midnight)
  const GANTT_HOURS = GANTT_END - GANTT_START;

  const timeToPercent = (timeStr: string) => {
    const [h, m] = timeStr.split(':').map(Number);
    const hours = h + m / 60;
    return Math.max(0, Math.min(100, ((hours - GANTT_START) / GANTT_HOURS) * 100));
  };

  const nowPercent = (() => {
    const now = new Date();
    const hours = now.getHours() + now.getMinutes() / 60;
    return Math.max(0, Math.min(100, ((hours - GANTT_START) / GANTT_HOURS) * 100));
  })();

  // Filter live data by search and view
  const filteredLive = liveData.filter((emp) => {
    const q = searchQuery.toLowerCase();
    const nameMatch = !q || `${emp.first_name} ${emp.last_name}`.toLowerCase().includes(q) ||
      emp.employee_code.toLowerCase().includes(q);
    if (!nameMatch) return false;

    switch (liveView) {
      case 'punched': return !!emp.punch_in;
      case 'not_punched': return !emp.punch_in;
      case 'late': return emp.is_late;
      default: return true;
    }
  });

  if (!isManager) {
    return (
      <AppShell>
        <div className="flex items-center justify-center h-64">
          <p style={{ color: 'var(--text-muted)' }}>Access denied. Manager role required.</p>
        </div>
      </AppShell>
    );
  }

  const statCards = stats ? [
    { label: 'Total Team', value: stats.total_employees, icon: Users, color: '#6366f1', bg: 'rgba(99,102,241,0.12)' },
    { label: 'Present', value: stats.present_today, icon: UserCheck, color: '#22c55e', bg: 'rgba(34,197,94,0.12)' },
    { label: 'Absent', value: stats.absent_today, icon: UserX, color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
    { label: 'Late Arrivals', value: stats.late_today, icon: AlertTriangle, color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
    { label: 'On Leave', value: stats.on_leave, icon: CalendarDays, color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)' },
    { label: 'Early Checkout', value: stats.early_checkout, icon: LogOut, color: '#ec4899', bg: 'rgba(236,72,153,0.12)' },
  ] : [];

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Manager Dashboard</h1>
            <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>Team attendance overview &amp; monitoring</p>
          </div>

          {/* Tabs */}
          <div className="flex rounded-xl overflow-hidden" style={{ border: '1px solid var(--border-color)' }}>
            {([
              { key: 'overview' as Tab, label: 'Overview', icon: TrendingUp },
              { key: 'live' as Tab, label: 'Live Monitor', icon: Eye },
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

        {/* Time Filters (not shown on gantt tab) */}
        {tab !== 'gantt' && (
        <div className="flex flex-wrap items-center gap-2">
          {([
            { key: 'today' as TimeFilter, label: 'Today' },
            { key: 'yesterday' as TimeFilter, label: 'Yesterday' },
            { key: 'this_week' as TimeFilter, label: 'This Week' },
            { key: 'this_month' as TimeFilter, label: 'This Month' },
            { key: 'custom' as TimeFilter, label: 'Custom' },
          ]).map((f) => (
            <button
              key={f.key}
              onClick={() => setTimeFilter(f.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                timeFilter === f.key ? 'bg-primary-400 text-white' : ''
              }`}
              style={timeFilter !== f.key ? { color: 'var(--text-secondary)', background: 'var(--bg-surface)', border: '1px solid var(--border-color)' } : undefined}
            >
              {f.label}
            </button>
          ))}
          {timeFilter === 'custom' && (
            <input
              type="date"
              value={customDate}
              onChange={(e) => setCustomDate(e.target.value)}
              className="px-3 py-1.5 rounded-lg text-xs"
              style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
            />
          )}
        </div>
        )}

        {/* Date Navigator for Gantt tab */}
        {tab === 'gantt' && (
          <div className="flex items-center gap-3">
            <button
              onClick={() => setGanttDate(prev => subDays(prev, 1))}
              className="p-2 rounded-xl transition-all hover:bg-primary-400/10"
              style={{ color: 'var(--text-secondary)', border: '1px solid var(--border-color)' }}
            >
              <ChevronLeft size={18} />
            </button>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={format(ganttDate, 'yyyy-MM-dd')}
                onChange={(e) => setGanttDate(new Date(e.target.value + 'T00:00:00'))}
                className="px-3 py-1.5 rounded-lg text-sm font-medium"
                style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
              />
              <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                {format(ganttDate, 'EEEE, MMMM d, yyyy')}
              </span>
              {isDateToday(ganttDate) && (
                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-primary-400 text-white">TODAY</span>
              )}
            </div>
            <button
              onClick={() => setGanttDate(prev => addDays(prev, 1))}
              className="p-2 rounded-xl transition-all hover:bg-primary-400/10"
              style={{ color: 'var(--text-secondary)', border: '1px solid var(--border-color)' }}
            >
              <ChevronRight size={18} />
            </button>
            {!isDateToday(ganttDate) && (
              <button
                onClick={() => setGanttDate(new Date())}
                className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                style={{ color: 'var(--text-secondary)', background: 'var(--bg-surface)', border: '1px solid var(--border-color)' }}
              >
                Today
              </button>
            )}
          </div>
        )}

        {/* ======= OVERVIEW TAB ======= */}
        <AnimatePresence mode="wait">
          {tab === 'overview' && (
            <motion.div
              key="overview"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="space-y-6"
            >
              {loading ? (
                <div className="flex items-center justify-center h-48">
                  <div className="w-8 h-8 border-3 border-primary-400 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : stats && (
                <>
                  {/* Stat Cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                    {statCards.map((card, i) => (
                      <motion.div
                        key={card.label}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.05 }}
                        className="card !p-4"
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{card.label}</p>
                            <p className="text-2xl font-bold mt-1" style={{ color: card.color }}>{card.value}</p>
                          </div>
                          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: card.bg }}>
                            <card.icon size={18} style={{ color: card.color }} />
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>

                  {/* Attendance % + Pending */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {/* Today % */}
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3 }}
                      className="card !p-5"
                    >
                      <p className="text-xs font-medium uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>
                        Attendance % (Today)
                      </p>
                      <div className="flex items-end gap-3">
                        <span className="text-4xl font-bold" style={{ color: stats.attendance_percent_today >= 80 ? '#22c55e' : stats.attendance_percent_today >= 60 ? '#f59e0b' : '#ef4444' }}>
                          {stats.attendance_percent_today}%
                        </span>
                        <TrendingUp size={20} style={{ color: 'var(--text-muted)' }} />
                      </div>
                      <div className="mt-3 w-full h-2 rounded-full" style={{ background: 'var(--bg-surface)' }}>
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${stats.attendance_percent_today}%`,
                            background: stats.attendance_percent_today >= 80 ? '#22c55e' : stats.attendance_percent_today >= 60 ? '#f59e0b' : '#ef4444',
                          }}
                        />
                      </div>
                    </motion.div>

                    {/* Month % */}
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.35 }}
                      className="card !p-5"
                    >
                      <p className="text-xs font-medium uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>
                        Attendance % (Month)
                      </p>
                      <div className="flex items-end gap-3">
                        <span className="text-4xl font-bold" style={{ color: stats.attendance_percent_month >= 80 ? '#22c55e' : stats.attendance_percent_month >= 60 ? '#f59e0b' : '#ef4444' }}>
                          {stats.attendance_percent_month}%
                        </span>
                        <CalendarDays size={20} style={{ color: 'var(--text-muted)' }} />
                      </div>
                      <div className="mt-3 w-full h-2 rounded-full" style={{ background: 'var(--bg-surface)' }}>
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${stats.attendance_percent_month}%`,
                            background: stats.attendance_percent_month >= 80 ? '#22c55e' : stats.attendance_percent_month >= 60 ? '#f59e0b' : '#ef4444',
                          }}
                        />
                      </div>
                    </motion.div>

                    {/* Pending Approvals */}
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.4 }}
                      className="card !p-5"
                    >
                      <p className="text-xs font-medium uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>
                        Pending Approvals
                      </p>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Leave Requests</span>
                          <span className="px-2.5 py-1 rounded-lg text-sm font-bold" style={{
                            background: stats.pending_leaves > 0 ? 'rgba(245,158,11,0.15)' : 'rgba(34,197,94,0.12)',
                            color: stats.pending_leaves > 0 ? '#f59e0b' : '#22c55e',
                          }}>
                            {stats.pending_leaves}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Regularizations</span>
                          <span className="px-2.5 py-1 rounded-lg text-sm font-bold" style={{
                            background: stats.pending_regularizations > 0 ? 'rgba(245,158,11,0.15)' : 'rgba(34,197,94,0.12)',
                            color: stats.pending_regularizations > 0 ? '#f59e0b' : '#22c55e',
                          }}>
                            {stats.pending_regularizations}
                          </span>
                        </div>
                      </div>
                    </motion.div>
                  </div>
                </>
              )}
            </motion.div>
          )}

          {/* ======= LIVE MONITOR TAB ======= */}
          {tab === 'live' && (
            <motion.div
              key="live"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="space-y-4"
            >
              {/* Filters Bar */}
              <div className="card !p-3">
                <div className="flex flex-wrap items-center gap-3">
                  {/* Search */}
                  <div className="relative flex-1 min-w-[180px]">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
                    <input
                      type="text"
                      placeholder="Search employee..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 rounded-lg text-sm"
                      style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                    />
                  </div>

                  {/* Department filter */}
                  <select
                    value={filterDept}
                    onChange={(e) => setFilterDept(e.target.value)}
                    className="px-3 py-2 rounded-lg text-sm"
                    style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                  >
                    <option value="">All Departments</option>
                    {departments.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>

                  {/* Shift filter */}
                  <select
                    value={filterShift}
                    onChange={(e) => setFilterShift(e.target.value)}
                    className="px-3 py-2 rounded-lg text-sm"
                    style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                  >
                    <option value="">All Shifts</option>
                    {shifts.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>

                  {/* Refresh */}
                  <button
                    onClick={loadLive}
                    disabled={liveLoading}
                    className="p-2 rounded-lg transition-all hover:bg-primary-400/10"
                    style={{ color: 'var(--text-secondary)', border: '1px solid var(--border-color)' }}
                  >
                    <RefreshCw size={16} className={liveLoading ? 'animate-spin' : ''} />
                  </button>
                </div>

                {/* Quick view tabs */}
                <div className="flex gap-2 mt-3">
                  {([
                    { key: 'all' as const, label: `All (${liveData.length})` },
                    { key: 'punched' as const, label: `Punched In (${liveData.filter(e => e.punch_in).length})` },
                    { key: 'not_punched' as const, label: `Yet to Punch (${liveData.filter(e => !e.punch_in).length})` },
                    { key: 'late' as const, label: `Late (${liveData.filter(e => e.is_late).length})` },
                  ]).map((v) => (
                    <button
                      key={v.key}
                      onClick={() => setLiveView(v.key)}
                      className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                        liveView === v.key ? 'bg-primary-400 text-white' : ''
                      }`}
                      style={liveView !== v.key ? { color: 'var(--text-muted)', background: 'var(--bg-surface)' } : undefined}
                    >
                      {v.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Live Table */}
              {liveLoading ? (
                <div className="flex items-center justify-center h-48">
                  <div className="w-8 h-8 border-3 border-primary-400 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : (
                <div className="card !p-0 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr style={{ background: 'var(--bg-surface)' }}>
                          {['Employee', 'Department', 'Shift', 'Punch In', 'Punch Out', 'Work Hours', 'Status'].map((h) => (
                            <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filteredLive.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="text-center py-12" style={{ color: 'var(--text-muted)' }}>
                              No records found
                            </td>
                          </tr>
                        ) : filteredLive.map((emp, i) => {
                          const statusColor = emp.is_late ? '#f59e0b' :
                            emp.status === 'present' ? '#22c55e' :
                            emp.status === 'absent' ? '#ef4444' :
                            !emp.punch_in ? '#6b7280' : '#6366f1';

                          // Calculate live work hours
                          let displayHours = emp.work_hours;
                          if (emp.punch_in && !emp.punch_out) {
                            const parts = emp.punch_in.split(':').map(Number);
                            const now = new Date();
                            const pIn = new Date(now.getFullYear(), now.getMonth(), now.getDate(), parts[0], parts[1], parts[2] || 0);
                            displayHours = Math.max(0, (now.getTime() - pIn.getTime()) / (1000 * 60 * 60));
                          }

                          return (
                            <motion.tr
                              key={emp.id}
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              transition={{ delay: i * 0.02 }}
                              className="transition-colors"
                              style={{ borderBottom: '1px solid var(--border-color)' }}
                            >
                              <td className="px-4 py-3">
                                <div>
                                  <p className="font-medium" style={{ color: 'var(--text-primary)' }}>{emp.first_name} {emp.last_name}</p>
                                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{emp.employee_code}</p>
                                </div>
                              </td>
                              <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>{emp.department}</td>
                              <td className="px-4 py-3">
                                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                                  {emp.shift_name || 'N/A'}
                                  {emp.shift_start && <span className="block text-[10px]" style={{ color: 'var(--text-muted)' }}>{emp.shift_start?.substring(0, 5)} - {emp.shift_end?.substring(0, 5)}</span>}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                <span className={`font-mono text-sm ${emp.punch_in ? '' : 'italic'}`} style={{ color: emp.punch_in ? '#22c55e' : 'var(--text-muted)' }}>
                                  {emp.punch_in || '---'}
                                </span>
                                {emp.is_late && (
                                  <span className="ml-1.5 px-1.5 py-0.5 text-[10px] font-bold rounded bg-amber-500/15 text-amber-400">
                                    +{emp.late_minutes}m
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                <span className="font-mono text-sm" style={{ color: emp.punch_out ? '#ef4444' : 'var(--text-muted)' }}>
                                  {emp.punch_out || '---'}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                {displayHours != null ? (
                                  <span className="font-mono font-medium" style={{ color: 'var(--text-primary)' }}>
                                    {Number(displayHours).toFixed(1)}h
                                  </span>
                                ) : (
                                  <span style={{ color: 'var(--text-muted)' }}>---</span>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                <span
                                  className="px-2 py-1 rounded-md text-xs font-medium capitalize"
                                  style={{
                                    background: `${statusColor}18`,
                                    color: statusColor,
                                    border: `1px solid ${statusColor}30`,
                                  }}
                                >
                                  {emp.is_late ? 'Late' : emp.status || (emp.punch_in ? 'Working' : 'Not Punched')}
                                </span>
                              </td>
                            </motion.tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* ======= GANTT CHART TAB ======= */}
          {tab === 'gantt' && (
            <motion.div
              key="gantt"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="space-y-4"
            >
              {/* Filters */}
              <div className="card !p-3">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="relative flex-1 min-w-[180px]">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
                    <input
                      type="text"
                      placeholder="Search employee..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 rounded-lg text-sm"
                      style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                    />
                  </div>
                  <select value={filterDept} onChange={(e) => setFilterDept(e.target.value)} className="px-3 py-2 rounded-lg text-sm" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}>
                    <option value="">All Departments</option>
                    {departments.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                  <select value={filterShift} onChange={(e) => setFilterShift(e.target.value)} className="px-3 py-2 rounded-lg text-sm" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}>
                    <option value="">All Shifts</option>
                    {shifts.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  <button onClick={loadLive} disabled={liveLoading} className="p-2 rounded-lg transition-all hover:bg-primary-400/10" style={{ color: 'var(--text-secondary)', border: '1px solid var(--border-color)' }}>
                    <RefreshCw size={16} className={liveLoading ? 'animate-spin' : ''} />
                  </button>
                </div>
              </div>

              {/* Legend */}
              <div className="flex flex-wrap items-center gap-4 text-xs" style={{ color: 'var(--text-muted)' }}>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-sm" style={{ background: 'rgba(99,102,241,0.25)', border: '1px solid rgba(99,102,241,0.5)' }} />
                  <span>Scheduled Shift</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-sm bg-green-500" />
                  <span>Actual Work</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-sm bg-amber-500" />
                  <span>Late Arrival</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-0.5 h-3 bg-red-500" />
                  <span>Current Time</span>
                </div>
              </div>

              {/* Gantt Chart */}
              {liveLoading ? (
                <div className="flex items-center justify-center h-48">
                  <div className="w-8 h-8 border-3 border-primary-400 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : (
                <div className="card !p-0 overflow-hidden">
                  <div className="overflow-x-auto">
                    <div style={{ minWidth: '800px' }}>
                      {/* Time Header */}
                      <div className="flex" style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <div className="w-44 min-w-[176px] px-4 py-2.5" style={{ background: 'var(--bg-surface)' }}>
                          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Employee</span>
                          <span className="block text-[10px] font-medium mt-0.5" style={{ color: 'var(--text-primary)' }}>{format(ganttDate, 'dd MMM yyyy')}</span>
                        </div>
                        <div className="flex-1 relative" style={{ background: 'var(--bg-surface)' }}>
                          <div className="flex h-full">
                            {Array.from({ length: GANTT_HOURS }, (_, i) => {
                              const h = GANTT_START + i;
                              const label = h === 0 ? '12A' : h < 12 ? `${h}A` : h === 12 ? '12P' : `${h - 12}P`;
                              return (
                                <div
                                  key={h}
                                  className="flex-1 text-center py-2.5 text-[10px] font-medium"
                                  style={{ color: 'var(--text-muted)', borderLeft: '1px solid var(--border-color)' }}
                                >
                                  {label}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>

                      {/* Employee Rows */}
                      {filteredLive.length === 0 ? (
                        <div className="text-center py-12" style={{ color: 'var(--text-muted)' }}>No records found</div>
                      ) : filteredLive.map((emp, i) => {
                        const shiftLeft = emp.shift_start ? timeToPercent(emp.shift_start) : 0;
                        const shiftRight = emp.shift_end ? timeToPercent(emp.shift_end) : 0;
                        const shiftWidth = shiftRight > shiftLeft ? shiftRight - shiftLeft : 0;

                        const punchInPct = emp.punch_in ? timeToPercent(emp.punch_in) : null;
                        const punchOutPct = emp.punch_out ? timeToPercent(emp.punch_out) : (emp.punch_in ? nowPercent : null);
                        const workLeft = punchInPct ?? 0;
                        const workWidth = punchOutPct != null ? Math.max(0, punchOutPct - workLeft) : 0;

                        return (
                          <motion.div
                            key={emp.id}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.015 }}
                            className="flex items-center group hover:bg-white/[0.02] transition-colors"
                            style={{ borderBottom: '1px solid var(--border-color)', height: '48px' }}
                          >
                            {/* Name */}
                            <div className="w-44 min-w-[176px] px-4 flex-shrink-0">
                              <p className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                                {emp.first_name} {emp.last_name}
                              </p>
                              <p className="text-[10px] truncate" style={{ color: 'var(--text-muted)' }}>
                                {emp.shift_name || 'N/A'} · {emp.employee_code}
                              </p>
                            </div>

                            {/* Timeline Bar */}
                            <div className="flex-1 relative h-full">
                              {/* Vertical grid lines */}
                              {Array.from({ length: GANTT_HOURS }, (_, idx) => (
                                <div
                                  key={idx}
                                  className="absolute top-0 h-full"
                                  style={{ left: `${(idx / GANTT_HOURS) * 100}%`, width: '1px', background: 'var(--border-color)', opacity: 0.4 }}
                                />
                              ))}

                              {/* Shift block (background) */}
                              {shiftWidth > 0 && (
                                <div
                                  className="absolute top-2 rounded-md"
                                  style={{
                                    left: `${shiftLeft}%`,
                                    width: `${shiftWidth}%`,
                                    height: '28px',
                                    background: 'rgba(99,102,241,0.12)',
                                    border: '1px dashed rgba(99,102,241,0.35)',
                                  }}
                                  title={`Shift: ${emp.shift_start?.substring(0, 5)} - ${emp.shift_end?.substring(0, 5)}`}
                                />
                              )}

                              {/* Actual work block */}
                              {punchInPct != null && workWidth > 0 && (
                                <div
                                  className="absolute top-2.5 rounded-md"
                                  style={{
                                    left: `${workLeft}%`,
                                    width: `${workWidth}%`,
                                    height: '24px',
                                    background: emp.is_late
                                      ? 'linear-gradient(90deg, rgba(245,158,11,0.7) 0%, rgba(34,197,94,0.7) 15%)'
                                      : 'rgba(34,197,94,0.65)',
                                    borderRadius: '4px',
                                  }}
                                  title={`${emp.punch_in?.substring(0, 5) || ''} - ${emp.punch_out?.substring(0, 5) || 'Working...'}`}
                                >
                                  {/* Punch in time label */}
                                  <span className="absolute left-1 top-1/2 -translate-y-1/2 text-[9px] font-mono font-bold text-white whitespace-nowrap drop-shadow-sm">
                                    {emp.punch_in?.substring(0, 5)}
                                  </span>
                                  {/* Punch out time label */}
                                  {emp.punch_out && workWidth > 8 && (
                                    <span className="absolute right-1 top-1/2 -translate-y-1/2 text-[9px] font-mono font-bold text-white whitespace-nowrap drop-shadow-sm">
                                      {emp.punch_out?.substring(0, 5)}
                                    </span>
                                  )}
                                  {/* Pulsing dot for still working */}
                                  {!emp.punch_out && (
                                    <span className="absolute right-1 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-white animate-pulse" />
                                  )}
                                </div>
                              )}

                              {/* Not punched indicator */}
                              {!emp.punch_in && (
                                <div className="absolute top-3 left-1/2 -translate-x-1/2 text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>
                                  Not Punched
                                </div>
                              )}

                              {/* Current time marker */}
                              {isDateToday(ganttDate) && (
                                <div
                                  className="absolute top-0 h-full"
                                  style={{ left: `${nowPercent}%`, width: '2px', background: '#ef4444', zIndex: 10 }}
                                >
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
