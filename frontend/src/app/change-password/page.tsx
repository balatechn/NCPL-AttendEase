'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import { Eye, EyeOff, Lock, ShieldCheck } from 'lucide-react';

const spheres = [
  { size: 160, top: '10%', left: '8%', delay: 0, duration: 9, gradient: 'radial-gradient(circle at 35% 25%, #60a5fa, #1d4ed8 60%, #1e3a5f)' },
  { size: 100, top: '8%', right: '15%', delay: 1, duration: 11, gradient: 'radial-gradient(circle at 40% 30%, #93c5fd, #2563eb 55%, #1e40af)' },
  { size: 200, top: '50%', right: '5%', delay: 2, duration: 8, gradient: 'radial-gradient(circle at 30% 20%, #60a5fa, #1d4ed8 50%, #172554)' },
  { size: 70, bottom: '12%', left: '12%', delay: 1.5, duration: 10, gradient: 'radial-gradient(circle at 35% 25%, #93c5fd, #3b82f6 60%, #1e40af)' },
];

export default function ChangePasswordPage() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const isValidPassword = newPassword.length >= 8 && /[a-zA-Z]/.test(newPassword) && /[0-9]/.test(newPassword);
  const passwordsMatch = newPassword === confirmPassword && confirmPassword.length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidPassword) {
      toast.error('Password must be at least 8 characters with letters and numbers');
      return;
    }
    if (!passwordsMatch) {
      toast.error('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      await api.changePassword(currentPassword, newPassword);
      toast.success('Password changed successfully!');
      localStorage.removeItem('must_change_password');
      router.replace('/attendance');
    } catch (err: any) {
      toast.error(err.message || 'Failed to change password');
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = {
    background: 'rgba(255,255,255,0.6)',
    border: '1px solid rgba(148,163,184,0.3)',
    backdropFilter: 'blur(8px)',
  };

  const focusHandlers = {
    onFocus: (e: React.FocusEvent<HTMLInputElement>) => {
      e.target.style.borderColor = 'rgba(59,130,246,0.5)';
      e.target.style.boxShadow = '0 0 0 3px rgba(59,130,246,0.15)';
      e.target.style.background = 'rgba(255,255,255,0.8)';
    },
    onBlur: (e: React.FocusEvent<HTMLInputElement>) => {
      e.target.style.borderColor = 'rgba(148,163,184,0.3)';
      e.target.style.boxShadow = 'none';
      e.target.style.background = 'rgba(255,255,255,0.6)';
    },
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #e8edf5 0%, #dde3ef 40%, #d5dcea 100%)' }}>

      {spheres.map((s, i) => (
        <motion.div key={i} className="absolute rounded-full"
          style={{ width: s.size, height: s.size, top: s.top, left: s.left, right: s.right, bottom: s.bottom, background: s.gradient, boxShadow: '0 8px 32px rgba(29,78,216,0.3), inset 0 -4px 12px rgba(0,0,0,0.15), inset 0 4px 20px rgba(255,255,255,0.2)' }}
          animate={{ y: [0, -18, 0, 14, 0], x: [0, 10, 0, -8, 0] }}
          transition={{ duration: s.duration, delay: s.delay, repeat: Infinity, ease: 'easeInOut' }}
        />
      ))}

      <div className="absolute w-[500px] h-[500px] rounded-full"
        style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.35)', backdropFilter: 'blur(2px)' }} />

      <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }} className="w-full max-w-md relative z-10">
        <div className="text-center mb-8">
          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.2 }}
            className="w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)', boxShadow: '0 8px 30px rgba(217,119,6,0.4)' }}>
            <Lock className="w-8 h-8 text-white" />
          </motion.div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-800">Change Your Password</h1>
          <p className="mt-2 text-sm text-slate-500">Please set a new secure password to continue</p>
        </div>

        <div className="rounded-2xl p-7" style={{
          background: 'rgba(255,255,255,0.55)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
          border: '1px solid rgba(255,255,255,0.6)', boxShadow: '0 8px 32px rgba(31,38,135,0.12)',
        }}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5 text-slate-600">Current Password</label>
              <div className="relative">
                <input type={showCurrent ? 'text' : 'password'} value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full px-4 py-3 pr-12 rounded-xl outline-none transition-all duration-200 text-slate-800 placeholder-slate-400"
                  style={inputStyle} {...focusHandlers} placeholder="Enter current password" required />
                <button type="button" onClick={() => setShowCurrent(!showCurrent)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  {showCurrent ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5 text-slate-600">New Password</label>
              <div className="relative">
                <input type={showNew ? 'text' : 'password'} value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-4 py-3 pr-12 rounded-xl outline-none transition-all duration-200 text-slate-800 placeholder-slate-400"
                  style={inputStyle} {...focusHandlers} placeholder="Min 8 chars, letters + numbers" required />
                <button type="button" onClick={() => setShowNew(!showNew)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  {showNew ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
              {newPassword && (
                <div className="mt-2 space-y-1">
                  <div className="flex items-center gap-2 text-xs">
                    <div className={`w-1.5 h-1.5 rounded-full ${newPassword.length >= 8 ? 'bg-green-500' : 'bg-slate-300'}`} />
                    <span className={newPassword.length >= 8 ? 'text-green-600' : 'text-slate-400'}>At least 8 characters</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <div className={`w-1.5 h-1.5 rounded-full ${/[a-zA-Z]/.test(newPassword) ? 'bg-green-500' : 'bg-slate-300'}`} />
                    <span className={/[a-zA-Z]/.test(newPassword) ? 'text-green-600' : 'text-slate-400'}>Contains a letter</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <div className={`w-1.5 h-1.5 rounded-full ${/[0-9]/.test(newPassword) ? 'bg-green-500' : 'bg-slate-300'}`} />
                    <span className={/[0-9]/.test(newPassword) ? 'text-green-600' : 'text-slate-400'}>Contains a number</span>
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5 text-slate-600">Confirm New Password</label>
              <input type="password" value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-xl outline-none transition-all duration-200 text-slate-800 placeholder-slate-400"
                style={inputStyle} {...focusHandlers} placeholder="Confirm new password" required />
              {confirmPassword && (
                <p className={`text-xs mt-1 ${passwordsMatch ? 'text-green-600' : 'text-red-500'}`}>
                  {passwordsMatch ? '✓ Passwords match' : '✗ Passwords do not match'}
                </p>
              )}
            </div>

            <button type="submit" disabled={loading || !isValidPassword || !passwordsMatch}
              className="w-full flex items-center justify-center gap-2 font-semibold py-3 px-5 rounded-xl text-white transition-all duration-300 active:scale-[0.97] disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)', boxShadow: '0 4px 20px rgba(29,78,216,0.35)' }}>
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <><ShieldCheck size={18} /> Update Password</>
              )}
            </button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}
