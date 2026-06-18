'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import AppShell from '@/components/layout/AppShell';
import { Wallet, Download } from 'lucide-react';
import toast from 'react-hot-toast';

const MONTHS = ['', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

function inr(n: number) {
  return '₹' + (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function MyPayslipsPage() {
  const [payslips, setPayslips] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<number | null>(null);

  useEffect(() => {
    api.getMyPayslips()
      .then(setPayslips)
      .catch(() => toast.error('Failed to load payslips'))
      .finally(() => setLoading(false));
  }, []);

  async function download(id: number, label: string) {
    setDownloading(id);
    try {
      const blob = await api.getMyPayslipPdf(id) as unknown as Blob;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `payslip-${label}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Could not download payslip');
    } finally {
      setDownloading(null);
    }
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>My Payslips</h1>

        {loading ? (
          <div className="text-center py-12" style={{ color: 'var(--text-muted)' }}>Loading payslips...</div>
        ) : payslips.length === 0 ? (
          <div className="card text-center py-12" style={{ color: 'var(--text-faint)' }}>
            <Wallet size={40} className="mx-auto mb-2 opacity-30" />
            <p>No payslips available yet.</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {payslips.map((p) => {
              const label = `${MONTHS[p.period_month]}-${p.period_year}`;
              return (
                <div key={p.id} className="card">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                        {MONTHS[p.period_month]} {p.period_year}
                      </p>
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        Pay date: {p.pay_date ? String(p.pay_date).slice(0, 10) : '—'}
                      </p>
                    </div>
                    <Wallet size={18} className="text-primary-400" />
                  </div>
                  <div className="mt-4 space-y-1">
                    <div className="flex justify-between text-xs" style={{ color: 'var(--text-muted)' }}>
                      <span>Gross</span><span>{inr(p.gross_earnings)}</span>
                    </div>
                    <div className="flex justify-between text-xs" style={{ color: 'var(--text-muted)' }}>
                      <span>Deductions</span><span>{inr(p.total_deductions)}</span>
                    </div>
                    <div className="flex justify-between text-sm font-bold pt-1" style={{ color: 'var(--text-primary)' }}>
                      <span>Net Pay</span><span className="text-green-500">{inr(p.net_pay)}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => download(p.id, label)}
                    disabled={downloading === p.id}
                    className="btn-secondary w-full mt-4 flex items-center justify-center gap-2 text-sm"
                  >
                    <Download size={15} /> {downloading === p.id ? 'Preparing...' : 'Download PDF'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
