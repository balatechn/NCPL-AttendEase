'use client';
import { useEffect, useState, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import AppShell from '@/components/layout/AppShell';
import {
  Clock, ChevronDown,
  ChevronLeft, ChevronRight, Search, Users, X, Wifi,
} from 'lucide-react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths, isToday } from 'date-fns';
import type { DashboardStats, Shift, Attendance, Leave, RegularizationRequest } from '@/types';

const STATUS_COLORS: Record<string, string> = {
  present: 'bg-green-500/80 text-white border-green-400/30',
  absent: 'bg-red-400/60 text-white border-red-400/30',
  'half-day': 'bg-cyan-500/60 text-white border-cyan-400/30',
  leave: 'bg-blue-500/60 text-white border-blue-400/30',
  holiday: 'bg-yellow-500/70 text-white border-yellow-400/40',
  weekend: 'bg-slate-500/10 text-slate-400 border-slate-500/10',
  incomplete: 'bg-orange-500/60 text-white border-orange-400/30',
};

const LEAVE_STATUS_DOT: Record<string, string> = {
  pending: 'bg-yellow-400', approved: 'bg-blue-400', rejected: 'bg-red-400',
};
const REG_STATUS_DOT: Record<string, string> = {
  pending: 'bg-yellow-400', approved: 'bg-teal-400', rejected: 'bg-red-400',
};

export default function AttendanceDashboard() {
  const { user, isManager } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [shiftDropdownOpen, setShiftDropdownOpen] = useState(false);
  const [changingShift, setChangingShift] = useState(false);
  const [tick, setTick] = useState(0);
  const [secondTick, setSecondTick] = useState(0);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [records, setRecords] = useState<Attendance[]>([]);
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [regularizations, setRegularizations] = useState<RegularizationRequest[]>([]);
  const [publicHolidays, setPublicHolidays] = useState<Record<string, string>>({});
  const [calLoading, setCalLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<Attendance | null>(null);
  const [selectedDayLeaves, setSelectedDayLeaves] = useState<Leave[]>([]);
  const [selectedDayRegs, setSelectedDayRegs] = useState<RegularizationRequest[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [popupPos, setPopupPos] = useState<{ x: number; y: number } | null>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const [employees, setEmployees] = useState<any[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | null>(null);
  const [empSearch, setEmpSearch] = useState('');
  const [showEmpDropdown, setShowEmpDropdown] = useState(false);
  const canViewOthers = isManager;
  const [onlineEmployees, setOnlineEmployees] = useState<any[]>([]);
  const [showOnlineDropdown, setShowOnlineDropdown] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const sec = setInterval(() => setSecondTick(t => t + 1), 1000);
    return () => clearInterval(sec);
  }, []);

  useEffect(() => {
    async function load() {
      try {
        const now = new Date();
        const [s, sh] = await Promise.all([
          api.getDashboard(),
          api.getEmployeeShifts(),
        ]);
        setStats(s); setShifts(sh);
      } catch (err) { console.error(err); }
      finally { setLoading(false); }
    }
    load();
  }, [tick]);

  useEffect(() => {
    if (!canViewOthers) return;
    api.getEmployeeListForCalendar().then(setEmployees).catch(console.error);
  }, [canViewOthers]);

  useEffect(() => {
    if (!canViewOthers) return;
    api.getManagerLiveAttendance().then(data => {
      setOnlineEmployees((data || []).filter((e: any) => e.punch_in));
    }).catch(console.error);
  }, [canViewOthers, tick]);

  useEffect(() => {
    async function loadCal() {
      setCalLoading(true);
      try {
        const year = currentMonth.getFullYear();
        const month = currentMonth.getMonth() + 1;
        const empId = selectedEmployeeId;
        const [att, lv, reg] = await Promise.all([
          empId ? api.getEmployeeAttendance(empId, year, month) : api.getMyAttendance(year, month),
          empId ? api.getEmployeeLeaves(empId, year) : api.getMyLeaves(year),
          empId ? api.getEmployeeRegularizations(empId) : api.getMyRegularizations(),
        ]);
        setRecords(att); setLeaves(lv); setRegularizations(reg);
        // Fetch public holidays for calendar
        try {
          const hols = await api.getPublicHolidays(year);
          const holMap: Record<string, string> = {};
          hols.forEach((h: any) => { holMap[h.holiday_date?.substring(0, 10)] = h.name; });
          setPublicHolidays(holMap);
        } catch {}
      } catch (err) { console.error(err); }
      finally { setCalLoading(false); }
    }
    loadCal();
  }, [currentMonth, selectedEmployeeId]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) closeDetail();
    }
    if (selectedDate) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [selectedDate]);

  const selectedEmployee = useMemo(() => {
    if (!selectedEmployeeId) return null;
    return employees.find(e => e.id === selectedEmployeeId) || null;
  }, [selectedEmployeeId, employees]);

  const filteredEmployees = useMemo(() => {
    if (!empSearch.trim()) return employees;
    const q = empSearch.toLowerCase();
    return employees.filter(e =>
      (e.first_name + ' ' + e.last_name).toLowerCase().includes(q) ||
      (e.employee_code || '').toLowerCase().includes(q) ||
      (e.department || '').toLowerCase().includes(q)
    );
  }, [employees, empSearch]);

  const handleShiftChange = async (shiftId: number) => {
    setChangingShift(true); setShiftDropdownOpen(false);
    try {
      await api.updateMyShift(shiftId);
      const s = await api.getDashboard(); setStats(s);
    } catch (err) { console.error(err); }
    finally { setChangingShift(false); }
  };

  const getBalanceHours = () => {
    if (!stats?.today_punch_in || !stats?.shift_start || !stats?.shift_end) return null;
    const sParts = stats.shift_start.split(':').map(Number);
    const eParts = stats.shift_end.split(':').map(Number);
    let shiftHours = (eParts[0] + (eParts[1] || 0) / 60) - (sParts[0] + (sParts[1] || 0) / 60);
    if (shiftHours <= 0) shiftHours += 24;
    const punchParts = stats.today_punch_in.split(':').map(Number);
    const now = new Date();
    const cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 0);
    const effectiveNow = now > cutoff ? cutoff : now;
    const punchIn = new Date(now.getFullYear(), now.getMonth(), now.getDate(), punchParts[0], punchParts[1], punchParts[2] || 0);
    let worked: number;
    if (stats.today_punch_out) {
      worked = Number(stats.today_work_hours) || 0;
    } else {
      const elapsedMs = effectiveNow.getTime() - punchIn.getTime();
      worked = Math.max(0, elapsedMs / (1000 * 60 * 60));
    }
    const balance = Math.max(0, shiftHours - worked);
    return { worked: worked.toFixed(1), required: shiftHours.toFixed(1), balance: balance.toFixed(1), done: worked >= shiftHours };
  };

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startDayOffset = getDay(monthStart);

  const getRecord = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return records.find((r) => (r.attendance_date || '').substring(0, 10) === dateStr);
  };
  const getLeavesForDate = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return leaves.filter((l) => {
      const start = (l.start_date || '').substring(0, 10);
      const end = (l.end_date || '').substring(0, 10);
      return dateStr >= start && dateStr <= end;
    });
  };
  const getRegsForDate = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return regularizations.filter((r) => (r.attendance_date || '').substring(0, 10) === dateStr);
  };

  const handleDayClick = (day: Date, e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    let x = rect.left + rect.width / 2;
    let y = rect.bottom + 8;
    if (x > window.innerWidth - 180) x = window.innerWidth - 200;
    if (x < 180) x = 200;
    if (y > window.innerHeight - 250) y = rect.top - 8;
    setPopupPos({ x, y });
    const record = getRecord(day);
    const dayLeaves = getLeavesForDate(day);
    const dayRegs = getRegsForDate(day);
    setSelectedDay(record || null);
    setSelectedDayLeaves(dayLeaves);
    setSelectedDayRegs(dayRegs);
    setSelectedDate(format(day, 'yyyy-MM-dd'));
  };

  const closeDetail = () => {
    setSelectedDay(null); setSelectedDayLeaves([]); setSelectedDayRegs([]); setSelectedDate(''); setPopupPos(null);
  };

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-3 border-primary-400 border-t-transparent rounded-full animate-spin" />
        </div>
      </AppShell>
    );
  }

  const balanceHours = getBalanceHours();
  const currentShift = shifts.find(s => s.id === Number(stats?.shift_id));

  return (
    <AppShell>
      <div className="space-y-4">
        {/* Row 1: Greeting + Shift + Employee Selector */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-bold truncate" style={{ color: 'var(--text-primary)' }}>
              Hi, {user?.first_name}!
            </h1>
            <div className="flex items-center gap-1.5 flex-wrap text-xs sm:text-sm" style={{ color: 'var(--text-muted)' }}>
              <span className="hidden sm:inline">{new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
              <span className="sm:hidden">{new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</span>
              {currentShift && (
                <button onClick={() => setShiftDropdownOpen(true)} disabled={changingShift}
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-lg text-[10px] sm:text-xs font-medium transition-all hover:opacity-80"
                  style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>
                  <Clock size={10} className="text-primary-400" />
                  {changingShift ? '...' : currentShift.name + ' \u00B7 ' + (currentShift.start_time || '').substring(0, 5) + '-' + (currentShift.end_time || '').substring(0, 5)}
                  <ChevronDown size={10} />
                </button>
              )}
            </div>
          </div>
          {canViewOthers && (
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              {/* Online indicator */}
              <div className="relative">
                <button onClick={() => { setShowOnlineDropdown(!showOnlineDropdown); setShowEmpDropdown(false); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all"
                  style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>
                  <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span><span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span></span>
                  <span style={{ color: '#22c55e' }} className="font-bold">{onlineEmployees.length}</span><span className="hidden sm:inline"> Today</span>
                </button>
                {showOnlineDropdown && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowOnlineDropdown(false)} />
                    <div className="absolute top-full right-0 mt-1 w-80 rounded-xl z-50 overflow-hidden" style={{
                      background: 'rgba(15,23,42,0.97)', border: '1px solid var(--border-color)',
                      boxShadow: '0 20px 40px rgba(0,0,0,0.5)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
                    }}>
                      <div className="px-3 py-2 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>Today's Attendance</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-md font-bold" style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e' }}>{onlineEmployees.filter(e => !e.punch_out).length} in</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-md font-bold" style={{ background: 'rgba(148,163,184,0.15)', color: '#94a3b8' }}>{onlineEmployees.filter(e => e.punch_out).length} left</span>
                      </div>
                      <div className="max-h-72 overflow-y-auto">
                        {onlineEmployees.length === 0 ? (
                          <p className="text-center py-6 text-xs" style={{ color: 'var(--text-muted)' }}>No attendance today</p>
                        ) : [...onlineEmployees].sort((a, b) => (a.punch_out ? 1 : 0) - (b.punch_out ? 1 : 0)).map(emp => {
                          const stillIn = !emp.punch_out;
                          let h = '00', m = '00', s = '00';
                          if (stillIn) {
                            const parts = (emp.punch_in || '').split(':').map(Number);
                            const now = new Date();
                            const pIn = new Date(now.getFullYear(), now.getMonth(), now.getDate(), parts[0] || 0, parts[1] || 0, parts[2] || 0);
                            const d = Math.max(0, Math.floor((now.getTime() - pIn.getTime()) / 1000));
                            h = String(Math.floor(d / 3600)).padStart(2, '0');
                            m = String(Math.floor((d % 3600) / 60)).padStart(2, '0');
                            s = String(d % 60).padStart(2, '0');
                          }
                          return (
                            <div key={emp.id} className="px-3 py-2 flex items-center gap-2.5 hover:bg-white/[0.03] transition-colors" style={{ borderBottom: '1px solid var(--border-color)', opacity: stillIn ? 1 : 0.7 }}>
                              <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0" style={{ background: stillIn ? 'rgba(34,197,94,0.15)' : 'rgba(148,163,184,0.15)', color: stillIn ? '#22c55e' : '#94a3b8' }}>
                                {(emp.first_name || '')[0]}{(emp.last_name || '')[0]}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-semibold truncate" style={{ color: '#f1f5f9' }}>{emp.first_name} {emp.last_name}</p>
                                <p className="text-[10px] font-medium" style={{ color: '#94a3b8' }}>{emp.department || 'N/A'}</p>
                              </div>
                              <div className="text-right shrink-0">
                                <p className="text-[10px] font-mono font-bold" style={{ color: stillIn ? '#4ade80' : '#94a3b8' }}>In {(emp.punch_in || '').substring(0, 5)}</p>
                                {stillIn ? (
                                  <p className="text-[10px] font-mono font-bold" style={{ color: '#86efac' }}>{h}:{m}:{s}</p>
                                ) : (
                                  <p className="text-[10px] font-mono font-bold" style={{ color: '#f97316' }}>Out {(emp.punch_out || '').substring(0, 5)}</p>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}
              </div>
              {/* My Calendar / Employee selector */}
              <div className="relative">
              <button onClick={() => { setShowEmpDropdown(!showEmpDropdown); setShowOnlineDropdown(false); }}
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium transition-all"
                style={{
                  background: selectedEmployeeId ? 'var(--bg-accent)' : 'var(--bg-surface)',
                  color: selectedEmployeeId ? 'var(--text-on-accent)' : 'var(--text-secondary)',
                  border: '1px solid var(--border-color)',
                }}>
                <Users size={14} />
                <span className="hidden sm:inline">{selectedEmployee ? selectedEmployee.first_name + ' ' + selectedEmployee.last_name : 'My Calendar'}</span>
              </button>
              {showEmpDropdown && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowEmpDropdown(false)} />
                  <div className="absolute top-full right-0 mt-1 w-72 rounded-xl z-50 overflow-hidden" style={{
                    background: 'var(--bg-card)', border: '1px solid var(--border-color)',
                    boxShadow: 'var(--shadow-lg)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
                  }}>
                    <div className="p-2">
                      <div className="relative">
                        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
                        <input type="text" value={empSearch} onChange={(e) => setEmpSearch(e.target.value)}
                          placeholder="Search employees..." className="input-field pl-8 py-1.5 text-xs" autoFocus />
                      </div>
                    </div>
                    <div className="max-h-56 overflow-y-auto">
                      <button onClick={() => { setSelectedEmployeeId(null); setShowEmpDropdown(false); setEmpSearch(''); }}
                        className="w-full text-left px-3 py-1.5 text-xs hover:opacity-80 transition-all flex items-center gap-2"
                        style={{ background: !selectedEmployeeId ? 'var(--bg-active-nav)' : 'transparent', color: 'var(--text-primary)' }}>
                        <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ background: 'var(--bg-accent)', color: 'var(--text-on-accent)' }}>Me</div>
                        My Calendar
                      </button>
                      {filteredEmployees.map(emp => (
                        <button key={emp.id} onClick={() => { setSelectedEmployeeId(emp.id); setShowEmpDropdown(false); setEmpSearch(''); }}
                          className="w-full text-left px-3 py-1.5 text-xs hover:opacity-80 transition-all flex items-center gap-2"
                          style={{ background: selectedEmployeeId === emp.id ? 'var(--bg-active-nav)' : 'transparent', color: 'var(--text-primary)' }}>
                          <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                            style={{ background: 'var(--bg-accent)', color: 'var(--text-on-accent)' }}>
                            {(emp.first_name || '')[0]}{(emp.last_name || '')[0]}
                          </div>
                          <div className="min-w-0">
                            <div className="truncate font-medium">{emp.first_name} {emp.last_name}</div>
                            <div className="text-[10px] truncate" style={{ color: 'var(--text-muted)' }}>{emp.employee_code} . {emp.department}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
            </div>
          )}
        </div>

        {/* Row 2: Compact Stats Strip */}
        {(() => {
          const todayStr = format(new Date(), 'yyyy-MM-dd');
          const todayRecord = records.find(r => (r.attendance_date || '').substring(0, 10) === todayStr);
          const punchIn = selectedEmployeeId ? todayRecord?.punch_in : stats?.today_punch_in;
          const punchOut = selectedEmployeeId ? todayRecord?.punch_out : stats?.today_punch_out;
          const todayStatus = selectedEmployeeId ? todayRecord?.status : stats?.today_status;
          const leaveCount = leaves.filter(l => l.status === 'approved' && (l.start_date || '').substring(0, 7) === format(currentMonth, 'yyyy-MM')).length;
          return (
            <div className="flex items-center gap-2 flex-wrap">
              {[
                { label: 'Present', value: stats?.month_present || 0, color: '#16a34a' },
                { label: 'Absent', value: stats?.month_absent || 0, color: '#dc2626' },
                { label: 'Leave', value: leaveCount, color: '#2563eb' },
              ].map((s) => (
                <div key={s.label} className="card px-2 sm:px-3 py-1 flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full" style={{ background: s.color }} />
                  <span className="text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>{s.label}</span>
                  <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{s.value}</span>
                </div>
              ))}
              <div className="card px-2 sm:px-3 py-1 flex items-center gap-2 flex-1 min-w-0 flex-wrap">
                <Clock size={11} className="text-primary-400 shrink-0" />
                <span className="text-[10px] font-medium shrink-0" style={{ color: 'var(--text-muted)' }}>In</span>
                <span className="text-xs font-bold shrink-0" style={{ color: 'var(--text-primary)' }}>{punchIn || '--:--'}</span>
                <span className="text-[10px] font-medium shrink-0" style={{ color: 'var(--text-muted)' }}>Out</span>
                <span className="text-xs font-bold shrink-0" style={{ color: 'var(--text-primary)' }}>{punchOut || '--:--'}</span>
                {todayStatus && (
                  <>
                    <span className="text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>Status</span>
                    <span className="text-xs font-bold capitalize" style={{ color: 'var(--text-primary)' }}>{todayStatus}</span>
                  </>
                )}
                {(() => {
                  const pi = selectedEmployeeId ? todayRecord?.punch_in : stats?.today_punch_in;
                  const po = selectedEmployeeId ? todayRecord?.punch_out : stats?.today_punch_out;
                  if (pi && !po) {
                    const parts = pi.split(':').map(Number);
                    const now = new Date();
                    const cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 0);
                    const effectiveNow = now > cutoff ? cutoff : now;
                    const punchInTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), parts[0], parts[1], parts[2] || 0);
                    const diff = Math.max(0, Math.floor((effectiveNow.getTime() - punchInTime.getTime()) / 1000));
                    const hh = String(Math.floor(diff / 3600)).padStart(2, '0');
                    const mm = String(Math.floor((diff % 3600) / 60)).padStart(2, '0');
                    const ss = String(diff % 60).padStart(2, '0');
                    const workedSec = diff;
                    const requiredSec = balanceHours ? parseFloat(balanceHours.required) * 3600 : 0;
                    const balSec = Math.max(0, requiredSec - workedSec);
                    const isDone = balanceHours ? workedSec >= requiredSec : false;
                    const bHH = String(Math.floor(balSec / 3600)).padStart(2, '0');
                    const bMM = String(Math.floor((balSec % 3600) / 60)).padStart(2, '0');
                    const bSS = String(Math.floor(balSec % 60)).padStart(2, '0');
                    return (
                      <>
                        <span className="text-[10px] font-medium" style={{ color: '#4ade80' }}>Session</span>
                        <span className="text-xs font-bold font-mono" style={{ color: '#86efac' }}>{hh}:{mm}:{ss}</span>
                        {!selectedEmployeeId && balanceHours && (
                          <>
                            <span className="text-[10px] font-medium" style={{ color: isDone ? '#4ade80' : '#fbbf24' }}>
                              {isDone ? 'Done' : 'Bal'}
                            </span>
                            <span className="text-xs font-bold font-mono" style={{ color: isDone ? '#86efac' : '#fde68a' }}>
                              {isDone ? (workedSec / 3600).toFixed(1) + 'h' : `${bHH}:${bMM}:${bSS}`}
                            </span>
                          </>
                        )}
                      </>
                    );
                  } else if (po && !selectedEmployeeId && balanceHours) {
                    return (
                      <>
                        <span className="text-[10px] font-medium" style={{ color: balanceHours.done ? '#4ade80' : '#fbbf24' }}>
                          {balanceHours.done ? 'Worked' : 'Bal'}
                        </span>
                        <span className="text-xs font-bold" style={{ color: balanceHours.done ? '#86efac' : '#fde68a' }}>
                          {balanceHours.done ? balanceHours.worked + 'h' : balanceHours.balance + 'h'}
                        </span>
                      </>
                    );
                  }
                  return null;
                })()}
              </div>
            </div>
          );
        })()}

        {/* Row 3: Calendar */}
        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="card p-2 sm:p-3">
          {/* Month nav */}
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1">
              <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="p-1 rounded-lg hover:opacity-70" style={{ color: 'var(--text-secondary)' }}>
                <ChevronLeft size={16} />
              </button>
              <span className="font-semibold text-sm min-w-[100px] sm:min-w-[120px] text-center" style={{ color: 'var(--text-primary)' }}>
                {format(currentMonth, 'MMMM yyyy')}
              </span>
              <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="p-1 rounded-lg hover:opacity-70" style={{ color: 'var(--text-secondary)' }}>
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
          {/* Legend */}
          <div className="flex flex-wrap gap-x-2 gap-y-0.5 mb-1.5 text-[9px] sm:text-[10px]">
            {Object.entries(STATUS_COLORS).map(([status, cls]) => (
              <div key={status} className="flex items-center gap-0.5">
                <div className={'w-2 h-2 rounded-sm ' + cls.split(' ')[0]} />
                <span className="capitalize" style={{ color: 'var(--text-secondary)' }}>{status === 'half-day' ? 'Half' : status}</span>
              </div>
            ))}
          </div>

          {calLoading ? (
            <div className="flex items-center justify-center h-48">
              <div className="w-6 h-6 border-2 border-primary-400 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="grid grid-cols-7 gap-[3px]">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                <div key={d} className={'text-center text-[10px] font-semibold py-1 ' + (d === 'Sun' ? 'text-red-400' : '')}
                  style={d !== 'Sun' ? { color: 'var(--text-muted)' } : undefined}>{d}</div>
              ))}
              {Array.from({ length: startDayOffset }).map((_, i) => <div key={'e-' + i} />)}
              {days.map((day) => {
                const record = getRecord(day);
                const dayNum = day.getDate();
                const isSunday = getDay(day) === 0;
                const dayStr = format(day, 'yyyy-MM-dd');
                const isHoliday = !!publicHolidays[dayStr];
                const dayLeaves = getLeavesForDate(day);
                const dayRegs = getRegsForDate(day);
                const isPast = day < new Date(new Date().toDateString());
                const hasApprovedLeave = dayLeaves.some(l => l.status === 'approved');
                const recordStatus = record?.status;
                const status = (isSunday ? 'weekend' : undefined)
                  || (isHoliday && (!recordStatus || recordStatus === 'absent') ? 'holiday' : undefined)
                  || recordStatus
                  || (hasApprovedLeave ? 'leave' : undefined)
                  || (isPast && !isSunday ? 'absent' : undefined);
                const colorClass = status ? STATUS_COLORS[status] || 'bg-slate-500/5 text-slate-500' : 'bg-slate-500/5 text-slate-500';
                const hasLeave = dayLeaves.length > 0;
                const hasReg = dayRegs.length > 0;
                const leaveStatus = hasLeave ? (dayLeaves.find(l => l.status === 'approved')?.status || dayLeaves.find(l => l.status === 'pending')?.status || dayLeaves[0].status) : null;
                const regStatus = hasReg ? (dayRegs.find(r => r.status === 'approved')?.status || dayRegs.find(r => r.status === 'pending')?.status || dayRegs[0].status) : null;
                const isSelected = selectedDate === format(day, 'yyyy-MM-dd');

                return (
                  <motion.button key={dayNum} whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                    onClick={(e) => handleDayClick(day, e)}
                    title={isHoliday ? publicHolidays[dayStr] : undefined}
                    className={'rounded-lg flex flex-col items-center justify-center transition-all border py-0.5 sm:py-1 min-h-[40px] sm:min-h-[60px] ' + colorClass + (isToday(day) ? ' ring-2 ring-primary-400 ring-offset-1 ring-offset-transparent' : '') + (isSelected ? ' ring-2 ring-white/50' : '')}>
                    <span className="text-[11px] sm:text-xs font-semibold leading-none">{dayNum}</span>
                    {record?.punch_in && (
                      <div className="hidden sm:block text-[8px] leading-tight mt-0.5 opacity-90 font-medium">
                        <div>{(record.punch_in || '').substring(0, 5)}</div>
                        <div>{record.punch_out ? (record.punch_out || '').substring(0, 5) : '\u2014'}</div>
                      </div>
                    )}
                    <div className="flex gap-0.5 mt-0.5">
                      {record?.is_late && <span className="text-[6px] font-bold bg-white/20 px-0.5 rounded leading-none">L</span>}
                      {hasLeave && leaveStatus && <div className={'w-1 h-1 rounded-full ' + (LEAVE_STATUS_DOT[leaveStatus] || 'bg-blue-400')} />}
                      {hasReg && regStatus && <div className={'w-1 h-1 rounded-full ' + (REG_STATUS_DOT[regStatus] || 'bg-teal-400')} />}
                    </div>
                  </motion.button>
                );
              })}
            </div>
          )}
        </motion.div>

        {/* Day Detail Popup */}
        <AnimatePresence>
          {selectedDate && popupPos && (
            <>
            {/* Backdrop on mobile */}
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/40 sm:hidden" onClick={closeDetail} />
            <motion.div
              ref={popupRef}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="fixed z-50 rounded-t-2xl sm:rounded-xl shadow-2xl p-4 left-0 right-0 bottom-0 sm:left-auto sm:right-auto sm:bottom-auto sm:w-80"
              style={{
                ...(typeof window !== 'undefined' && window.innerWidth >= 640 ? { left: popupPos.x + 'px', top: popupPos.y + 'px', transform: 'translateX(-50%)' } : {}),
                background: 'var(--bg-card)',
                border: '1px solid var(--border-color)',
                backdropFilter: 'blur(24px)',
                WebkitBackdropFilter: 'blur(24px)',
                maxHeight: '60vh',
                overflowY: 'auto',
              }}>
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                  {format(new Date(selectedDate + 'T00:00:00'), 'EEE, MMM d, yyyy')}
                </h3>
                <button onClick={closeDetail} className="p-0.5 rounded hover:opacity-70" style={{ color: 'var(--text-muted)' }}>
                  <X size={14} />
                </button>
              </div>
              {selectedDay && (
                <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                  <div className="p-2 rounded-lg" style={{ background: 'var(--bg-surface)' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Status</span>
                    <p className="font-semibold capitalize" style={{ color: 'var(--text-primary)' }}>{selectedDay.status}</p>
                  </div>
                  <div className="p-2 rounded-lg" style={{ background: 'var(--bg-surface)' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Work Hours</span>
                    <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>{selectedDay.work_hours ? selectedDay.work_hours + 'h' : '--'}</p>
                  </div>
                  <div className="p-2 rounded-lg" style={{ background: 'var(--bg-surface)' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Punch In</span>
                    <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>{selectedDay.punch_in || '--:--'}</p>
                  </div>
                  <div className="p-2 rounded-lg" style={{ background: 'var(--bg-surface)' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Punch Out</span>
                    <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>{selectedDay.punch_out || '--:--'}</p>
                  </div>
                </div>
              )}
              {selectedDay?.is_late && (
                <p className="mb-2 text-xs text-amber-400 font-medium">Late by {selectedDay.late_minutes} min</p>
              )}
              {selectedDayLeaves.length > 0 && (
                <div className="mb-2">
                  <h4 className="text-[10px] font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Leaves</h4>
                  {selectedDayLeaves.map((l) => (
                    <div key={l.id} className="flex items-center gap-1.5 py-1 px-2 rounded-lg mb-1 text-xs"
                      style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)' }}>
                      <span className={'px-1.5 py-0.5 rounded text-[10px] font-medium ' + (
                        l.status === 'approved' ? 'bg-green-500/15 text-green-400' :
                        l.status === 'pending' ? 'bg-yellow-500/15 text-yellow-400' :
                        'bg-red-500/15 text-red-400'
                      )}>{l.status}</span>
                      <span className="capitalize font-medium" style={{ color: 'var(--text-primary)' }}>{l.leave_type}</span>
                    </div>
                  ))}
                </div>
              )}
              {selectedDayRegs.length > 0 && (
                <div>
                  <h4 className="text-[10px] font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Regularizations</h4>
                  {selectedDayRegs.map((r) => (
                    <div key={r.id} className="flex items-center gap-1.5 py-1 px-2 rounded-lg mb-1 text-xs"
                      style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)' }}>
                      <span className={'px-1.5 py-0.5 rounded text-[10px] font-medium ' + (
                        r.status === 'approved' ? 'bg-green-500/15 text-green-400' :
                        r.status === 'pending' ? 'bg-yellow-500/15 text-yellow-400' :
                        'bg-red-500/15 text-red-400'
                      )}>{r.status}</span>
                      <span className="capitalize" style={{ color: 'var(--text-primary)' }}>{(r.regularization_type || 'miss_punch').replace(/_/g, ' ')}</span>
                      <span style={{ color: 'var(--text-muted)' }}>{r.requested_punch_in || '--'} to {r.requested_punch_out || '--'}</span>
                    </div>
                  ))}
                </div>
              )}
              {!selectedDay && selectedDayLeaves.length === 0 && selectedDayRegs.length === 0 && (
                <p className="text-xs py-2 text-center" style={{ color: 'var(--text-muted)' }}>No records for this day</p>
              )}
            </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* Shift Change Modal */}
        {shiftDropdownOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }}
            onClick={() => setShiftDropdownOpen(false)}>
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
              className="rounded-2xl p-5 w-80 shadow-2xl"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}
              onClick={(e) => e.stopPropagation()}>
              <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Change Shift</h3>
              <div className="space-y-1.5">
                {shifts.map((shift) => (
                  <button key={shift.id} onClick={() => handleShiftChange(shift.id)}
                    className={'w-full text-left px-4 py-3 rounded-xl text-sm flex items-center justify-between transition-all ' + (shift.id === Number(stats?.shift_id) ? 'ring-2 ring-primary-400' : 'hover:bg-primary-400/10')}
                    style={{ background: shift.id === Number(stats?.shift_id) ? 'var(--bg-surface)' : 'transparent', color: 'var(--text-primary)' }}>
                    <span className="font-medium">{shift.name}</span>
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {(shift.start_time || '').substring(0, 5)} - {(shift.end_time || '').substring(0, 5)}
                    </span>
                  </button>
                ))}
              </div>
            </motion.div>
          </div>
        )}
      </div>
    </AppShell>
  );
}