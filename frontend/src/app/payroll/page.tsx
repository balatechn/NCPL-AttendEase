'use client';
import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import AppShell from '@/components/layout/AppShell';
import { useAuth } from '@/lib/auth';
import {
  Wallet, Play, CheckCircle2, Trash2, Download, Pencil, X, Lock, FileText, Search,
} from 'lucide-react';
import toast from 'react-hot-toast';

const MONTHS = ['', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

function inr(n: number) {
  return '₹' + (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function downloadBlob(promise: Promise<any>, filename: string) {
  const blob = (await promise) as unknown as Blob;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function PayrollPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<'runs' | 'setup' | 'settings'>('runs');

  if (user && user.role !== 'admin' && user.role !== 'hr') {
    return (
      <AppShell>
        <div className="card text-center py-12" style={{ color: 'var(--text-muted)' }}>
          You do not have access to Payroll.
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Payroll</h1>
        </div>

        <div className="flex gap-2">
          <button onClick={() => setTab('runs')} className={tab === 'runs' ? 'btn-primary' : 'btn-secondary'}>
            Run Payroll
          </button>
          <button onClick={() => setTab('setup')} className={tab === 'setup' ? 'btn-primary' : 'btn-secondary'}>
            Salary Setup
          </button>
          <button onClick={() => setTab('settings')} className={tab === 'settings' ? 'btn-primary' : 'btn-secondary'}>
            Settings
          </button>
        </div>

        {tab === 'runs' ? <RunPayroll /> : tab === 'setup' ? <SalarySetup /> : <SettingsTab />}
      </div>
    </AppShell>
  );
}

// =====================================================================
// RUN PAYROLL — draft -> finalize
// =====================================================================
function RunPayroll() {
  const now = new Date();
  const [runs, setRuns] = useState<any[]>([]);
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [payDate, setPayDate] = useState('');
  const [selected, setSelected] = useState<{ run: any; payslips: any[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);

  const loadRuns = useCallback(() => {
    api.getPayrollRuns().then(setRuns).catch(() => toast.error('Failed to load runs'));
  }, []);
  useEffect(() => { loadRuns(); }, [loadRuns]);

  async function openRun(id: number) {
    try {
      setSelected(await api.getPayrollRun(id));
    } catch { toast.error('Failed to open run'); }
  }

  async function generate() {
    setBusy(true);
    try {
      const res = await api.generatePayrollDraft({
        period_month: month, period_year: year, pay_date: payDate || undefined,
      });
      toast.success(`Draft generated — ${res.payslips.length} payslip(s)`);
      if (res.skipped) toast(res.skipped, { icon: '⚠️' });
      loadRuns();
      setSelected({ run: res.run, payslips: res.payslips });
    } catch (e: any) {
      toast.error(e.message || 'Failed to generate draft');
    } finally { setBusy(false); }
  }

  async function finalize() {
    if (!selected) return;
    if (!confirm(`Finalize payroll for ${MONTHS[selected.run.period_month]} ${selected.run.period_year}? This locks the run and makes payslips visible to employees.`)) return;
    setBusy(true);
    try {
      await api.finalizePayrollRun(selected.run.id);
      toast.success('Payroll finalized');
      loadRuns();
      await openRun(selected.run.id);
    } catch (e: any) {
      toast.error(e.message || 'Failed to finalize');
    } finally { setBusy(false); }
  }

  async function removeDraft(id: number) {
    if (!confirm('Delete this draft run? This cannot be undone.')) return;
    try {
      await api.deletePayrollRun(id);
      toast.success('Draft deleted');
      setSelected(null);
      loadRuns();
    } catch (e: any) { toast.error(e.message || 'Failed to delete'); }
  }

  const isDraft = selected?.run.status === 'draft';

  return (
    <div className="space-y-6">
      {/* Generate draft */}
      <div className="card">
        <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-secondary)' }}>Generate Draft Payroll</h2>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Month</label>
            <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="input-field">
              {MONTHS.slice(1).map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Year</label>
            <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} className="input-field w-24" />
          </div>
          <div>
            <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Pay Date</label>
            <input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} className="input-field" />
          </div>
          <button onClick={generate} disabled={busy} className="btn-primary flex items-center gap-2">
            <Play size={15} /> {busy ? 'Working...' : 'Generate Draft'}
          </button>
        </div>
        <p className="text-xs mt-2" style={{ color: 'var(--text-faint)' }}>
          Re-running a draft for the same month replaces it. Finalized months cannot be regenerated.
        </p>
      </div>

      {/* Runs list */}
      <div className="card overflow-x-auto">
        <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-secondary)' }}>Payroll Runs</h2>
        {runs.length === 0 ? (
          <p className="text-sm py-6 text-center" style={{ color: 'var(--text-faint)' }}>No payroll runs yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <th className="text-left py-2 px-2 font-medium" style={{ color: 'var(--text-muted)' }}>Period</th>
                <th className="text-center py-2 px-2 font-medium" style={{ color: 'var(--text-muted)' }}>Status</th>
                <th className="text-center py-2 px-2 font-medium" style={{ color: 'var(--text-muted)' }}>Employees</th>
                <th className="text-right py-2 px-2 font-medium" style={{ color: 'var(--text-muted)' }}>Net Total</th>
                <th className="text-right py-2 px-2 font-medium" style={{ color: 'var(--text-muted)' }}></th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                  <td className="py-2.5 px-2" style={{ color: 'var(--text-primary)' }}>{MONTHS[r.period_month]} {r.period_year}</td>
                  <td className="py-2.5 px-2 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${r.status === 'finalized' ? 'bg-green-500/15 text-green-500' : 'bg-amber-500/15 text-amber-500'}`}>
                      {r.status === 'finalized' ? 'Finalized' : 'Draft'}
                    </span>
                  </td>
                  <td className="py-2.5 px-2 text-center" style={{ color: 'var(--text-secondary)' }}>{r.employee_count}</td>
                  <td className="py-2.5 px-2 text-right" style={{ color: 'var(--text-secondary)' }}>{inr(r.total_net)}</td>
                  <td className="py-2.5 px-2 text-right">
                    <button onClick={() => openRun(r.id)} className="btn-secondary text-xs py-1 px-3">View</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Selected run detail */}
      {selected && (
        <div className="card overflow-x-auto">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
                {MONTHS[selected.run.period_month]} {selected.run.period_year}
              </h2>
              {selected.run.status === 'finalized'
                ? <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/15 text-green-500 flex items-center gap-1"><Lock size={11} /> Finalized</span>
                : <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-500">Draft</span>}
            </div>
            <div className="flex gap-2">
              {isDraft && (
                <>
                  <button onClick={() => removeDraft(selected.run.id)} className="btn-secondary text-sm flex items-center gap-1.5">
                    <Trash2 size={14} /> Delete
                  </button>
                  <button onClick={finalize} disabled={busy} className="btn-primary text-sm flex items-center gap-1.5">
                    <CheckCircle2 size={15} /> Finalize Payroll
                  </button>
                </>
              )}
            </div>
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <th className="text-left py-2 px-2 font-medium" style={{ color: 'var(--text-muted)' }}>Employee</th>
                <th className="text-center py-2 px-2 font-medium" style={{ color: 'var(--text-muted)' }}>Paid</th>
                <th className="text-center py-2 px-2 font-medium" style={{ color: 'var(--text-muted)' }}>LOP</th>
                <th className="text-right py-2 px-2 font-medium" style={{ color: 'var(--text-muted)' }}>Gross</th>
                <th className="text-right py-2 px-2 font-medium" style={{ color: 'var(--text-muted)' }}>Income Tax</th>
                <th className="text-right py-2 px-2 font-medium" style={{ color: 'var(--text-muted)' }}>Deductions</th>
                <th className="text-right py-2 px-2 font-medium" style={{ color: 'var(--text-muted)' }}>Net Pay</th>
                <th className="text-right py-2 px-2 font-medium" style={{ color: 'var(--text-muted)' }}></th>
              </tr>
            </thead>
            <tbody>
              {selected.payslips.map((p) => (
                <tr key={p.id} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                  <td className="py-2.5 px-2" style={{ color: 'var(--text-primary)' }}>
                    {p.first_name} {p.last_name}
                    <span className="block text-xs font-mono" style={{ color: 'var(--text-faint)' }}>{p.employee_code}</span>
                  </td>
                  <td className="py-2.5 px-2 text-center" style={{ color: 'var(--text-secondary)' }}>{p.paid_days}</td>
                  <td className="py-2.5 px-2 text-center" style={{ color: p.lop_days > 0 ? '#ef4444' : 'var(--text-secondary)' }}>{p.lop_days}</td>
                  <td className="py-2.5 px-2 text-right" style={{ color: 'var(--text-secondary)' }}>{inr(p.gross_earnings)}</td>
                  <td className="py-2.5 px-2 text-right" style={{ color: 'var(--text-secondary)' }}>{inr(p.income_tax)}</td>
                  <td className="py-2.5 px-2 text-right" style={{ color: 'var(--text-secondary)' }}>{inr(p.total_deductions)}</td>
                  <td className="py-2.5 px-2 text-right font-semibold text-green-500">{inr(p.net_pay)}</td>
                  <td className="py-2.5 px-2 text-right whitespace-nowrap">
                    {isDraft && (
                      <button onClick={() => setEditing(p)} className="p-1.5 rounded-lg hover:bg-white/[0.06]" title="Edit" style={{ color: 'var(--text-muted)' }}>
                        <Pencil size={14} />
                      </button>
                    )}
                    <button
                      onClick={() => downloadBlob(api.getPayslipPdf(p.id), `payslip-${p.employee_code}.pdf`)}
                      className="p-1.5 rounded-lg hover:bg-white/[0.06]" title="Download PDF" style={{ color: 'var(--text-muted)' }}
                    >
                      <Download size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <EditPayslipModal
          payslip={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => { setEditing(null); if (selected) await openRun(selected.run.id); }}
        />
      )}
    </div>
  );
}

function EditPayslipModal({ payslip, onClose, onSaved }: { payslip: any; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    paid_days: payslip.paid_days,
    lop_days: payslip.lop_days,
    basic: payslip.basic,
    hra: payslip.hra,
    fixed_allowance: payslip.fixed_allowance,
    epf: payslip.epf,
    professional_tax: payslip.professional_tax,
    income_tax: payslip.income_tax,
  });
  const [saving, setSaving] = useState(false);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v === '' ? '' : Number(v) }));
  const gross = Number(form.basic || 0) + Number(form.hra || 0) + Number(form.fixed_allowance || 0);
  const ded = Number(form.epf || 0) + Number(form.professional_tax || 0) + Number(form.income_tax || 0);
  const net = gross - ded;

  async function save() {
    setSaving(true);
    try {
      await api.updatePayslip(payslip.id, form);
      toast.success('Payslip updated');
      onSaved();
    } catch (e: any) {
      toast.error(e.message || 'Failed to update');
    } finally { setSaving(false); }
  }

  const fields: [string, string][] = [
    ['paid_days', 'Paid Days'], ['lop_days', 'LOP Days'],
    ['basic', 'Basic'], ['hra', 'House Rent Allowance'], ['fixed_allowance', 'Fixed Allowance'],
    ['epf', 'EPF Contribution'], ['professional_tax', 'Professional Tax'], ['income_tax', 'Income Tax'],
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'var(--bg-overlay)', backdropFilter: 'blur(4px)' }} onClick={onClose}>
      <div className="card w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
            Edit Payslip — {payslip.first_name} {payslip.last_name}
          </h3>
          <button onClick={onClose} style={{ color: 'var(--text-muted)' }}><X size={18} /></button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {fields.map(([k, label]) => (
            <div key={k}>
              <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>{label}</label>
              <input type="number" step="0.01" value={(form as any)[k]} onChange={(e) => set(k, e.target.value)} className="input-field w-full" />
            </div>
          ))}
        </div>
        <div className="mt-4 p-3 rounded-xl space-y-1 text-sm" style={{ background: 'var(--bg-active-nav)' }}>
          <div className="flex justify-between" style={{ color: 'var(--text-secondary)' }}><span>Gross Earnings</span><span>{inr(gross)}</span></div>
          <div className="flex justify-between" style={{ color: 'var(--text-secondary)' }}><span>Total Deductions</span><span>{inr(ded)}</span></div>
          <div className="flex justify-between font-bold" style={{ color: 'var(--text-primary)' }}><span>Net Pay</span><span className="text-green-500">{inr(net)}</span></div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="btn-secondary text-sm">Cancel</button>
          <button onClick={save} disabled={saving} className="btn-primary text-sm">{saving ? 'Saving...' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// SALARY SETUP
// =====================================================================
function SalarySetup() {
  const [rows, setRows] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<any | null>(null);

  const load = useCallback((q?: string) => {
    api.getSalaryStructures(q).then(setRows).catch(() => toast.error('Failed to load salary structures'));
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="flex gap-2 items-center">
          <div className="relative flex-1 max-w-xs">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-faint)' }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && load(search)}
              placeholder="Search employees..."
              className="input-field w-full pl-9"
            />
          </div>
          <button onClick={() => load(search)} className="btn-secondary text-sm">Search</button>
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/[0.06]">
              <th className="text-left py-2 px-2 font-medium" style={{ color: 'var(--text-muted)' }}>Employee</th>
              <th className="text-right py-2 px-2 font-medium" style={{ color: 'var(--text-muted)' }}>Basic</th>
              <th className="text-right py-2 px-2 font-medium" style={{ color: 'var(--text-muted)' }}>HRA</th>
              <th className="text-right py-2 px-2 font-medium" style={{ color: 'var(--text-muted)' }}>Fixed Allow.</th>
              <th className="text-right py-2 px-2 font-medium" style={{ color: 'var(--text-muted)' }}>Gross</th>
              <th className="text-right py-2 px-2 font-medium" style={{ color: 'var(--text-muted)' }}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.employee_id} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                <td className="py-2.5 px-2" style={{ color: 'var(--text-primary)' }}>
                  {r.first_name} {r.last_name}
                  <span className="block text-xs font-mono" style={{ color: 'var(--text-faint)' }}>{r.employee_code} · {r.designation || '—'}</span>
                </td>
                <td className="py-2.5 px-2 text-right" style={{ color: 'var(--text-secondary)' }}>{r.basic != null ? inr(r.basic) : '—'}</td>
                <td className="py-2.5 px-2 text-right" style={{ color: 'var(--text-secondary)' }}>{r.hra != null ? inr(r.hra) : '—'}</td>
                <td className="py-2.5 px-2 text-right" style={{ color: 'var(--text-secondary)' }}>{r.fixed_allowance != null ? inr(r.fixed_allowance) : '—'}</td>
                <td className="py-2.5 px-2 text-right font-medium" style={{ color: 'var(--text-primary)' }}>{r.monthly_gross != null ? inr(r.monthly_gross) : '—'}</td>
                <td className="py-2.5 px-2 text-right">
                  <button onClick={() => setEditing(r)} className="btn-secondary text-xs py-1 px-3 flex items-center gap-1.5 ml-auto">
                    <Pencil size={12} /> {r.structure_id ? 'Edit' : 'Set'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <StructureModal
          row={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(search); }}
        />
      )}
    </div>
  );
}

function StructureModal({ row, onClose, onSaved }: { row: any; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    effective_from: row.effective_from ? String(row.effective_from).slice(0, 10) : new Date().toISOString().slice(0, 10),
    basic: row.basic ?? 0,
    hra: row.hra ?? 0,
    fixed_allowance: row.fixed_allowance ?? 0,
    pf_applicable: row.pf_applicable ?? true,
    pt_applicable: row.pt_applicable ?? true,
    bank_account_no: row.bank_account_no ?? '',
    uan: row.uan ?? '',
    pan: row.pan ?? '',
    pf_number: row.pf_number ?? '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));
  const gross = Number(form.basic || 0) + Number(form.hra || 0) + Number(form.fixed_allowance || 0);

  async function save() {
    if (!form.effective_from) { toast.error('Effective date is required'); return; }
    setSaving(true);
    try {
      await api.saveSalaryStructure({ employee_id: row.employee_id, ...form });
      toast.success('Salary structure saved');
      onSaved();
    } catch (e: any) {
      toast.error(e.message || 'Failed to save');
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'var(--bg-overlay)', backdropFilter: 'blur(4px)' }} onClick={onClose}>
      <div className="card w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
            Salary — {row.first_name} {row.last_name}
          </h3>
          <button onClick={onClose} style={{ color: 'var(--text-muted)' }}><X size={18} /></button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Effective From</label>
            <input type="date" value={form.effective_from} onChange={(e) => set('effective_from', e.target.value)} className="input-field w-full" />
          </div>
          {([['basic', 'Basic'], ['hra', 'House Rent Allowance'], ['fixed_allowance', 'Fixed Allowance']] as [string, string][]).map(([k, l]) => (
            <div key={k}>
              <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>{l}</label>
              <input type="number" step="0.01" value={(form as any)[k]} onChange={(e) => set(k, e.target.value === '' ? '' : Number(e.target.value))} className="input-field w-full" />
            </div>
          ))}
          <div className="flex items-end gap-4 col-span-2 pt-1">
            <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
              <input type="checkbox" checked={form.pf_applicable} onChange={(e) => set('pf_applicable', e.target.checked)} /> PF applicable
            </label>
            <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
              <input type="checkbox" checked={form.pt_applicable} onChange={(e) => set('pt_applicable', e.target.checked)} /> Professional Tax
            </label>
          </div>

          {([['bank_account_no', 'Bank Account No'], ['uan', 'UAN'], ['pan', 'PAN'], ['pf_number', 'PF Number']] as [string, string][]).map(([k, l]) => (
            <div key={k}>
              <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>{l}</label>
              <input value={(form as any)[k]} onChange={(e) => set(k, e.target.value)} className="input-field w-full" />
            </div>
          ))}
        </div>

        <div className="mt-4 p-3 rounded-xl flex justify-between text-sm font-semibold" style={{ background: 'var(--bg-active-nav)', color: 'var(--text-primary)' }}>
          <span>Monthly Gross</span><span>{inr(gross)}</span>
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="btn-secondary text-sm">Cancel</button>
          <button onClick={save} disabled={saving} className="btn-primary text-sm">{saving ? 'Saving...' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// SETTINGS — company + statutory config
// =====================================================================
function SettingsTab() {
  const [form, setForm] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.getPayrollSettings()
      .then(setForm)
      .catch(() => toast.error('Failed to load settings'))
      .finally(() => setLoading(false));
  }, []);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function save() {
    setSaving(true);
    try {
      const updated = await api.updatePayrollSettings(form);
      setForm(updated);
      toast.success('Settings saved');
    } catch (e: any) {
      toast.error(e.message || 'Failed to save settings');
    } finally { setSaving(false); }
  }

  if (loading) return <div className="text-center py-12" style={{ color: 'var(--text-muted)' }}>Loading settings...</div>;

  const fields: { key: string; label: string; type?: string; hint?: string }[] = [
    { key: 'company_name', label: 'Company Name' },
    { key: 'company_address', label: 'Company Address' },
    { key: 'payroll_pf_percent', label: 'EPF Percent (%)', type: 'number', hint: 'Employee PF contribution rate' },
    { key: 'payroll_pf_wage_ceiling', label: 'PF Wage Ceiling (₹)', type: 'number', hint: 'EPF computed on min(Basic, ceiling)' },
    { key: 'payroll_pt_amount', label: 'Professional Tax (₹/month)', type: 'number' },
    { key: 'payroll_fy_start_month', label: 'Financial Year Start Month', type: 'number', hint: '4 = April (used for YTD)' },
  ];

  return (
    <div className="card max-w-2xl">
      <h2 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-secondary)' }}>Company & Statutory Settings</h2>
      <div className="space-y-4">
        {fields.map((f) => (
          <div key={f.key}>
            <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>{f.label}</label>
            {f.key === 'company_address' ? (
              <textarea value={form[f.key] || ''} onChange={(e) => set(f.key, e.target.value)} rows={2} className="input-field w-full" />
            ) : (
              <input type={f.type || 'text'} step="0.01" value={form[f.key] || ''} onChange={(e) => set(f.key, e.target.value)} className="input-field w-full" />
            )}
            {f.hint && <p className="text-xs mt-1" style={{ color: 'var(--text-faint)' }}>{f.hint}</p>}
          </div>
        ))}
      </div>
      <div className="flex justify-end mt-5">
        <button onClick={save} disabled={saving} className="btn-primary text-sm">{saving ? 'Saving...' : 'Save Settings'}</button>
      </div>
    </div>
  );
}
