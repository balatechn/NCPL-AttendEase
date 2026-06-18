'use client';
import { useEffect, useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import AppShell from '@/components/layout/AppShell';
import { ChevronLeft, ChevronRight, Search, Users } from 'lucide-react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths, isToday } from 'date-fns';
import type { Attendance, Leave, RegularizationRequest } from '@/types';

const STATUS_COLORS: Record<string, string> = {
  present: 'bg-green-500/80 text-white border-green-400/30',
  absent: 'bg-red-500/60 text-white border-red-400/30',
  'half-day': 'bg-cyan-500/60 text-white border-cyan-400/30',
  leave: 'bg-blue-500/60 text-white border-blue-400/30',
  holiday: 'bg-yellow-500/70 text-white border-yellow-400/40',
  weekend: 'bg-slate-500/10 text-slate-500 border-slate-500/10',
  incomplete: 'bg-orange-500/60 text-white border-orange-400/30',
};

const LEAVE_STATUS_DOT: Record<string, string> = {
  pending: 'bg-yellow-400',
  approved: 'bg-blue-400',
  rejected: 'bg-red-400',
};

const REG_STATUS_DOT: Record<string, string> = {
  pending: 'bg-yellow-400',
  approved: 'bg-teal-400',
  rejected: 'bg-red-400',
};

export default function AttendanceCalendar() {
  const { isManager, user } = useAuth();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [records, setRecords] = useState<Attendance[]>([]);
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [regularizations, setRegularizations] = useState<RegularizationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<Attendance | null>(null);
  const [selectedDayLeaves, setSelectedDayLeaves] = useState<Leave[]>([]);
  const [selectedDayRegs, setSelectedDayRegs] = useState<RegularizationRequest[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [publicHolidays, setPublicHolidays] = useState<Record<string, string>>({});

  // Employee selection (admin/manager/hr only)
  const [employees, setEmployees] = useState<any[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | null>(null);
  const [empSearch, setEmpSearch] = useState('');
  const [showEmpDropdown, setShowEmpDropdown] = useState(false);

  const canViewOthers = isManager; // isManager is true for admin, hr, and manager

  // Load employee list for admin/manager/hr
  useEffect(() => {
    if (!canViewOthers) return;
    api.getEmployeeListForCalendar().then(setEmployees).catch(console.error);
  }, [canViewOthers]);

  const selectedEmployee = useMemo(() => {
    if (!selectedEmployeeId) return null;
    return employees.find(e => e.id === selectedEmployeeId) || null;
  }, [selectedEmployeeId, employees]);

  const filteredEmployees = useMemo(() => {
    if (!empSearch.trim()) return employees;
    const q = empSearch.toLowerCase();
    return employees.filter(e =>
      `${e.first_name} ${e.last_name}`.toLowerCase().includes(q) ||
      (e.employee_code || '').toLowerCase().includes(q) ||
      (e.department || '').toLowerCase().includes(q)
    );
  }, [employees, empSearch]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const year = currentMonth.getFullYear();
        const month = currentMonth.getMonth() + 1;
        const empId = selectedEmployeeId;

        const [attData, leaveData, regData] = await Promise.all([
          empId ? api.getEmployeeAttendance(empId, year, month) : api.getMyAttendance(year, month),
          empId ? api.getEmployeeLeaves(empId, year) : api.getMyLeaves(year),
          empId ? api.getEmployeeRegularizations(empId) : api.getMyRegularizations(),
        ]);
        setRecords(attData);
        setLeaves(leaveData);
        setRegularizations(regData);
        try {
          const hols = await api.getPublicHolidays(year);
          const holMap: Record<string, string> = {};
          hols.forEach((h: any) => { holMap[h.holiday_date?.substring(0, 10)] = h.name; });
          setPublicHolidays(holMap);
        } catch {}
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [currentMonth, selectedEmployeeId]);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startDay = getDay(monthStart);

  const getRecord = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return records.find((r) => (r.attendance_date || '').substring(0, 10) === dateStr);
  };

  // Get leaves that overlap a specific date
  const getLeavesForDate = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return leaves.filter((l) => {
      const start = (l.start_date || '').substring(0, 10);
      const end = (l.end_date || '').substring(0, 10);
      return dateStr >= start && dateStr <= end;
    });
  };

  // Get regularizations for a specific date
  const getRegsForDate = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return regularizations.filter((r) => (r.attendance_date || '').substring(0, 10) === dateStr);
  };

  const handleDayClick = (day: Date) => {
    const record = getRecord(day);
    const dayLeaves = getLeavesForDate(day);
    const dayRegs = getRegsForDate(day);
    const dateStr = format(day, 'yyyy-MM-dd');
    setSelectedDay(record || null);
    setSelectedDayLeaves(dayLeaves);
    setSelectedDayRegs(dayRegs);
    setSelectedDate(dateStr);
  };

  const closeDetail = () => {
    setSelectedDay(null);
    setSelectedDayLeaves([]);
    setSelectedDayRegs([]);
    setSelectedDate('');
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Attendance Calendar</h1>
            {/* Employee selector for admin/manager/hr */}
            {canViewOthers && (
              <div className="relative">
                <button
                  onClick={() => setShowEmpDropdown(!showEmpDropdown)}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all"
                  style={{
                    background: selectedEmployeeId ? 'var(--bg-accent)' : 'var(--bg-surface)',
                    color: selectedEmployeeId ? 'var(--text-on-accent)' : 'var(--text-secondary)',
                    border: '1px solid var(--border-color)',
                  }}
                >
                  <Users size={16} />
                  {selectedEmployee
                    ? `${selectedEmployee.first_name} ${selectedEmployee.last_name}`
                    : 'My Calendar'}
                </button>
                {showEmpDropdown && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowEmpDropdown(false)} />
                    <div className="absolute top-full left-0 mt-1 w-80 rounded-xl z-50 overflow-hidden" style={{
                      background: 'var(--bg-card)',
                      border: '1px solid var(--border-color)',
                      boxShadow: 'var(--shadow-lg)',
                      backdropFilter: 'blur(24px)',
                      WebkitBackdropFilter: 'blur(24px)',
                    }}>
                      <div className="p-2">
                        <div className="relative">
                          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
                          <input
                            type="text"
                            value={empSearch}
                            onChange={(e) => setEmpSearch(e.target.value)}
                            placeholder="Search employees..."
                            className="input-field pl-8 py-2 text-sm"
                            autoFocus
                          />
                        </div>
                      </div>
                      <div className="max-h-64 overflow-y-auto">
                        <button
                          onClick={() => { setSelectedEmployeeId(null); setShowEmpDropdown(false); setEmpSearch(''); }}
                          className="w-full text-left px-3 py-2 text-sm hover:opacity-80 transition-all flex items-center gap-2"
                          style={{
                            background: !selectedEmployeeId ? 'var(--bg-active-nav)' : 'transparent',
                            color: 'var(--text-primary)',
                          }}
                        >
                          <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: 'var(--bg-accent)', color: 'var(--text-on-accent)' }}>Me</div>
                          My Calendar
                        </button>
                        {filteredEmployees.map(emp => (
                          <button
                            key={emp.id}
                            onClick={() => { setSelectedEmployeeId(emp.id); setShowEmpDropdown(false); setEmpSearch(''); }}
                            className="w-full text-left px-3 py-2 text-sm hover:opacity-80 transition-all flex items-center gap-2"
                            style={{
                              background: selectedEmployeeId === emp.id ? 'var(--bg-active-nav)' : 'transparent',
                              color: 'var(--text-primary)',
                            }}
                          >
                            <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0" style={{ background: 'var(--bg-accent)', color: 'var(--text-on-accent)' }}>
                              {emp.first_name?.[0]}{emp.last_name?.[0]}
                            </div>
                            <div className="min-w-0">
                              <div className="truncate font-medium">{emp.first_name} {emp.last_name}</div>
                              <div className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{emp.employee_code} · {emp.department}</div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="p-2 rounded-xl" style={{ color: 'var(--text-secondary)' }}>
              <ChevronLeft size={20} />
            </button>
            <span className="font-semibold min-w-[140px] text-center" style={{ color: 'var(--text-primary)' }}>
              {format(currentMonth, 'MMMM yyyy')}
            </span>
            <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="p-2 rounded-xl" style={{ color: 'var(--text-secondary)' }}>
              <ChevronRight size={20} />
            </button>
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-3 text-xs">
          {Object.entries(STATUS_COLORS).map(([status, cls]) => (
            <div key={status} className="flex items-center gap-1.5">
              <div className={`w-3 h-3 rounded-sm ${cls.split(' ')[0]}`} />
              <span className="capitalize" style={{ color: 'var(--text-secondary)' }}>{status}</span>
            </div>
          ))}
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-blue-400" />
            <span style={{ color: 'var(--text-secondary)' }}>Leave</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-teal-400" />
            <span style={{ color: 'var(--text-secondary)' }}>Regularization</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-yellow-400" />
            <span style={{ color: 'var(--text-secondary)' }}>Pending</span>
          </div>
        </div>

        {/* Calendar Grid */}
        <div className="card p-2 sm:p-4">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="w-8 h-8 border-3 border-primary-400 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-7 gap-1">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                  <div key={d} className={`text-center text-xs font-medium py-2 ${d === 'Sun' ? 'text-red-400' : ''}`} style={d !== 'Sun' ? { color: 'var(--text-muted)' } : undefined}>
                    {d}
                  </div>
                ))}

                {Array.from({ length: startDay }).map((_, i) => (
                  <div key={`empty-${i}`} />
                ))}

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

                  // Determine indicator dots
                  const hasLeave = dayLeaves.length > 0;
                  const hasReg = dayRegs.length > 0;
                  // Pick the "best" status for each dot color
                  const leaveStatus = hasLeave ? (dayLeaves.find(l => l.status === 'approved')?.status || dayLeaves.find(l => l.status === 'pending')?.status || dayLeaves[0].status) : null;
                  const regStatus = hasReg ? (dayRegs.find(r => r.status === 'approved')?.status || dayRegs.find(r => r.status === 'pending')?.status || dayRegs[0].status) : null;

                  return (
                    <motion.button
                      key={dayNum}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => handleDayClick(day)}
                      title={isHoliday ? publicHolidays[dayStr] : undefined}
                      className={`aspect-square rounded-xl flex flex-col items-center justify-center text-sm font-medium transition-all border ${colorClass} ${
                        isToday(day) ? 'ring-2 ring-primary-400 ring-offset-1 ring-offset-transparent' : ''
                      }`}
                    >
                      <span>{dayNum}</span>
                      {/* Indicator dots row */}
                      <div className="flex gap-0.5 mt-0.5">
                        {record?.is_late && (
                          <span className="text-[7px] font-bold bg-white/20 px-0.5 rounded leading-none">L</span>
                        )}
                        {hasLeave && leaveStatus && (
                          <div className={`w-1.5 h-1.5 rounded-full ${LEAVE_STATUS_DOT[leaveStatus] || 'bg-blue-400'}`} title={`Leave: ${leaveStatus}`} />
                        )}
                        {hasReg && regStatus && (
                          <div className={`w-1.5 h-1.5 rounded-full ${REG_STATUS_DOT[regStatus] || 'bg-teal-400'}`} title={`Reg: ${regStatus}`} />
                        )}
                      </div>
                    </motion.button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Selected Day Detail */}
        {(selectedDay || selectedDayLeaves.length > 0 || selectedDayRegs.length > 0) && selectedDate && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="card"
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                {format(new Date(selectedDate + 'T00:00:00'), 'EEEE, MMMM d, yyyy')}
              </h3>
              <button onClick={closeDetail} className="text-xl" style={{ color: 'var(--text-muted)' }}>
                &times;
              </button>
            </div>

            {/* Attendance info */}
            {selectedDay && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm mb-4">
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Status</span>
                  <p className="font-medium capitalize" style={{ color: 'var(--text-primary)' }}>{selectedDay.status}</p>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Punch In</span>
                  <p className="font-medium" style={{ color: 'var(--text-primary)' }}>{selectedDay.punch_in || '--:--'}</p>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Punch Out</span>
                  <p className="font-medium" style={{ color: 'var(--text-primary)' }}>{selectedDay.punch_out || '--:--'}</p>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Work Hours</span>
                  <p className="font-medium" style={{ color: 'var(--text-primary)' }}>{selectedDay.work_hours ? `${selectedDay.work_hours}h` : '--'}</p>
                </div>
              </div>
            )}
            {selectedDay?.is_late && (
              <p className="mb-3 text-sm text-amber-400 font-medium">
                Late by {selectedDay.late_minutes} minutes
              </p>
            )}

            {/* Leaves on this day */}
            {selectedDayLeaves.length > 0 && (
              <div className="mb-3">
                <h4 className="text-sm font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>Leave Requests</h4>
                {selectedDayLeaves.map((l) => (
                  <div key={l.id} className="flex items-center gap-2 py-1.5 px-3 rounded-lg mb-1 text-sm" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)' }}>
                    <span className={`px-2 py-0.5 rounded-md text-xs font-medium ${
                      l.status === 'approved' ? 'bg-green-500/15 text-green-400 border border-green-500/20' :
                      l.status === 'pending' ? 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/20' :
                      'bg-red-500/15 text-red-400 border border-red-500/20'
                    }`}>{l.status}</span>
                    <span className="capitalize font-medium" style={{ color: 'var(--text-primary)' }}>{l.leave_type}</span>
                    <span style={{ color: 'var(--text-muted)' }}>({l.start_date?.substring(0, 10)} — {l.end_date?.substring(0, 10)})</span>
                    {l.reason && <span className="text-xs truncate" style={{ color: 'var(--text-faint)' }}>{l.reason}</span>}
                  </div>
                ))}
              </div>
            )}

            {/* Regularizations on this day */}
            {selectedDayRegs.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>Regularization Requests</h4>
                {selectedDayRegs.map((r) => (
                  <div key={r.id} className="flex items-center gap-2 py-1.5 px-3 rounded-lg mb-1 text-sm" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)' }}>
                    <span className={`px-2 py-0.5 rounded-md text-xs font-medium ${
                      r.status === 'approved' ? 'bg-green-500/15 text-green-400 border border-green-500/20' :
                      r.status === 'pending' ? 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/20' :
                      'bg-red-500/15 text-red-400 border border-red-500/20'
                    }`}>{r.status}</span>
                    <span className="capitalize font-medium" style={{ color: 'var(--text-primary)' }}>
                      {(r.regularization_type || 'miss_punch').replace(/_/g, ' ')}
                    </span>
                    <span style={{ color: 'var(--text-muted)' }}>In: {r.requested_punch_in || '--'} | Out: {r.requested_punch_out || '--'}</span>
                  </div>
                ))}
              </div>
            )}

            {/* No attendance and no leave/reg */}
            {!selectedDay && selectedDayLeaves.length === 0 && selectedDayRegs.length === 0 && (
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No records for this day.</p>
            )}
          </motion.div>
        )}
      </div>
    </AppShell>
  );
}
