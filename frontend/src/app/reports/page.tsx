'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import AppShell from '@/components/layout/AppShell';
import { Download, BarChart3 } from 'lucide-react';

export default function ReportsPage() {
  const [reportType, setReportType] = useState<'attendance' | 'leaves' | 'summary'>('summary');
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  async function fetchReport() {
    setLoading(true);
    try {
      if (reportType === 'summary') {
        const d = await api.getSummaryReport(year, month);
        setData(d);
      } else if (reportType === 'attendance') {
        if (!startDate || !endDate) return;
        const d = await api.getAttendanceReport(startDate, endDate);
        setData(d);
      } else {
        const d = await api.getLeaveReport(year);
        setData(d);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function downloadExcel() {
    try {
      let blob: Blob;
      if (reportType === 'attendance') {
        blob = await api.getAttendanceReport(startDate, endDate, 'excel') as unknown as Blob;
      } else {
        blob = await api.getLeaveReport(year, 'excel') as unknown as Blob;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${reportType}-report.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
    }
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Reports</h1>

        <div className="card">
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Report Type</label>
              <select value={reportType} onChange={(e) => setReportType(e.target.value as any)} className="input-field">
                <option value="summary">Monthly Summary</option>
                <option value="attendance">Attendance Detail</option>
                <option value="leaves">Leave Report</option>
              </select>
            </div>

            {(reportType === 'summary' || reportType === 'leaves') && (
              <>
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Year</label>
                  <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} className="input-field w-28" />
                </div>
                {reportType === 'summary' && (
                  <div>
                    <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Month</label>
                    <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="input-field">
                      {Array.from({ length: 12 }, (_, i) => (
                        <option key={i} value={i + 1}>{new Date(2000, i).toLocaleString('default', { month: 'long' })}</option>
                      ))}
                    </select>
                  </div>
                )}
              </>
            )}

            {reportType === 'attendance' && (
              <>
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Start Date</label>
                  <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="input-field" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>End Date</label>
                  <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="input-field" />
                </div>
              </>
            )}

            <button onClick={fetchReport} className="btn-primary">Generate</button>
            {data.length > 0 && reportType !== 'summary' && (
              <button onClick={downloadExcel} className="btn-secondary flex items-center gap-2">
                <Download size={16} /> Export Excel
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12" style={{ color: 'var(--text-muted)' }}>Loading report...</div>
        ) : data.length > 0 ? (
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  {reportType === 'summary' ? (
                    <>
                      <th className="text-left py-3 px-2 font-medium" style={{ color: 'var(--text-muted)' }}>Emp Code</th>
                      <th className="text-left py-3 px-2 font-medium" style={{ color: 'var(--text-muted)' }}>Name</th>
                      <th className="text-left py-3 px-2 font-medium" style={{ color: 'var(--text-muted)' }}>Dept</th>
                      <th className="text-center py-3 px-2 font-medium text-green-400">Present</th>
                      <th className="text-center py-3 px-2 font-medium text-red-400">Absent</th>
                      <th className="text-center py-3 px-2 font-medium text-yellow-400">Half Day</th>
                      <th className="text-center py-3 px-2 font-medium text-blue-400">Leave</th>
                      <th className="text-center py-3 px-2 font-medium text-amber-400">Late</th>
                      <th className="text-center py-3 px-2 font-medium" style={{ color: 'var(--text-muted)' }}>Avg Hrs</th>
                    </>
                  ) : reportType === 'attendance' ? (
                    <>
                      <th className="text-left py-3 px-2 font-medium" style={{ color: 'var(--text-muted)' }}>Emp Code</th>
                      <th className="text-left py-3 px-2 font-medium" style={{ color: 'var(--text-muted)' }}>Name</th>
                      <th className="text-left py-3 px-2 font-medium" style={{ color: 'var(--text-muted)' }}>Date</th>
                      <th className="text-left py-3 px-2 font-medium" style={{ color: 'var(--text-muted)' }}>In</th>
                      <th className="text-left py-3 px-2 font-medium" style={{ color: 'var(--text-muted)' }}>Out</th>
                      <th className="text-center py-3 px-2 font-medium" style={{ color: 'var(--text-muted)' }}>Hours</th>
                      <th className="text-center py-3 px-2 font-medium" style={{ color: 'var(--text-muted)' }}>Status</th>
                    </>
                  ) : (
                    <>
                      <th className="text-left py-3 px-2 font-medium" style={{ color: 'var(--text-muted)' }}>Emp Code</th>
                      <th className="text-left py-3 px-2 font-medium" style={{ color: 'var(--text-muted)' }}>Name</th>
                      <th className="text-left py-3 px-2 font-medium" style={{ color: 'var(--text-muted)' }}>Type</th>
                      <th className="text-left py-3 px-2 font-medium" style={{ color: 'var(--text-muted)' }}>From</th>
                      <th className="text-left py-3 px-2 font-medium" style={{ color: 'var(--text-muted)' }}>To</th>
                      <th className="text-center py-3 px-2 font-medium" style={{ color: 'var(--text-muted)' }}>Status</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {data.map((row: any, i: number) => (
                  <tr key={i} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                    {reportType === 'summary' ? (
                      <>
                        <td className="py-2.5 px-2 font-mono text-xs" style={{ color: 'var(--text-secondary)' }}>{row.employee_code}</td>
                        <td className="py-2.5 px-2" style={{ color: 'var(--text-primary)' }}>{row.first_name} {row.last_name}</td>
                        <td className="py-2.5 px-2" style={{ color: 'var(--text-muted)' }}>{row.department}</td>
                        <td className="py-2.5 px-2 text-center font-medium text-green-400">{row.present_days}</td>
                        <td className="py-2.5 px-2 text-center font-medium text-red-400">{row.absent_days}</td>
                        <td className="py-2.5 px-2 text-center font-medium text-yellow-400">{row.half_days}</td>
                        <td className="py-2.5 px-2 text-center font-medium text-blue-400">{row.leave_days}</td>
                        <td className="py-2.5 px-2 text-center font-medium text-amber-400">{row.late_days}</td>
                        <td className="py-2.5 px-2 text-center" style={{ color: 'var(--text-secondary)' }}>{row.avg_hours}h</td>
                      </>
                    ) : reportType === 'attendance' ? (
                      <>
                        <td className="py-2.5 px-2 font-mono text-xs" style={{ color: 'var(--text-secondary)' }}>{row.employee_code}</td>
                        <td className="py-2.5 px-2" style={{ color: 'var(--text-primary)' }}>{row.first_name} {row.last_name}</td>
                        <td className="py-2.5 px-2" style={{ color: 'var(--text-secondary)' }}>{row.attendance_date}</td>
                        <td className="py-2.5 px-2" style={{ color: 'var(--text-secondary)' }}>{row.punch_in || '--'}</td>
                        <td className="py-2.5 px-2" style={{ color: 'var(--text-secondary)' }}>{row.punch_out || '--'}</td>
                        <td className="py-2.5 px-2 text-center" style={{ color: 'var(--text-secondary)' }}>{row.work_hours || '--'}</td>
                        <td className="py-2.5 px-2 text-center capitalize" style={{ color: 'var(--text-secondary)' }}>{row.status}</td>
                      </>
                    ) : (
                      <>
                        <td className="py-2.5 px-2 font-mono text-xs" style={{ color: 'var(--text-secondary)' }}>{row.employee_code}</td>
                        <td className="py-2.5 px-2" style={{ color: 'var(--text-primary)' }}>{row.first_name} {row.last_name}</td>
                        <td className="py-2.5 px-2 capitalize" style={{ color: 'var(--text-secondary)' }}>{row.leave_type}</td>
                        <td className="py-2.5 px-2" style={{ color: 'var(--text-secondary)' }}>{row.start_date}</td>
                        <td className="py-2.5 px-2" style={{ color: 'var(--text-secondary)' }}>{row.end_date}</td>
                        <td className="py-2.5 px-2 text-center capitalize" style={{ color: 'var(--text-secondary)' }}>{row.status}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-12" style={{ color: 'var(--text-faint)' }}>
            <BarChart3 size={40} className="mx-auto mb-2 opacity-30" />
            <p>Select parameters and click Generate</p>
          </div>
        )}
      </div>
    </AppShell>
  );
}
