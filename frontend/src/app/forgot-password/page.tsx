'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import { Eye, EyeOff, Mail, KeyRound, ShieldCheck, ArrowLeft } from 'lucide-react';

const spheres = [
  { size: 160, top: '10%', left: '8%', delay: 0, duration: 9, gradient: 'radial-gradient(circle at 35% 25%, #60a5fa, #1d4ed8 60%, #1e3a5f)' },
  { size: 100, top: '8%', right: '15%', delay: 1, duration: 11, gradient: 'radial-gradient(circle at 40% 30%, #93c5fd, #2563eb 55%, #1e40af)' },
  { size: 200, top: '50%', right: '5%', delay: 2, duration: 8, gradient: 'radial-gradient(circle at 30% 20%, #60a5fa, #1d4ed8 50%, #172554)' },
  { size: 70, bottom: '12%', left: '12%', delay: 1.5, duration: 10, gradient: 'radial-gradient(circle at 35% 25%, #93c5fd, #3b82f6 60%, #1e40af)' },
];

type Step = 'email' | 'otp' | 'password';

export default function ForgotPasswordPage() {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const isValidPassword = newPassword.length >= 8 && /[a-zA-Z]/.test(newPassword) && /[0-9]/.test(newPassword);
  const passwordsMatch = newPassword === confirmPassword && confirmPassword.length > 0;

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    try {
      await api.forgotPassword(email);
      toast.success('OTP sent to your email!');
      setStep('otp');
    } catch (err: any) {
      toast.error(err.message || 'Failed to send OTP');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp || otp.length !== 6) { toast.error('Enter the 6-digit OTP'); return; }
    setLoading(true);
    try {
      const data = await api.verifyOtp(email, otp);
      setResetToken(data.resetToken);
      toast.success('OTP verified! Set your new password.');
      setStep('password');
    } catch (err: any) {
      toast.error(err.message || 'Invalid OTP');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidPassword) { toast.error('Password must be at least 8 characters with letters and numbers'); return; }
    if (!passwordsMatch) { toast.error('Passwords do not match'); return; }
    setLoading(true);
    try {
      await api.resetPassword(resetToken, newPassword);
      toast.success('Password reset successfully! Please login.');
      router.replace('/login');
    } catch (err: any) {
      toast.error(err.message || 'Failed to reset password');
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

  const stepIcon = { email: Mail, otp: KeyRound, password: ShieldCheck }[step];
  const stepColor = { email: '#3b82f6', otp: '#f59e0b', password: '#22c55e' }[step];
  const StepIcon = stepIcon;

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
          <motion.div key={step} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 200, damping: 15 }}
            className="w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center"
            style={{ background: `linear-gradient(135deg, ${stepColor}, ${stepColor}dd)`, boxShadow: `0 8px 30px ${stepColor}66` }}>
            <StepIcon className="w-8 h-8 text-white" />
          </motion.div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-800">
            {step === 'email' && 'Forgot Password'}
            {step === 'otp' && 'Enter OTP'}
            {step === 'password' && 'New Password'}
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            {step === 'email' && "Enter your email and we'll send you a verification code"}
            {step === 'otp' && `We sent a 6-digit code to ${email}`}
            {step === 'password' && 'Set your new secure password'}
          </p>

          {/* Step indicator */}
          <div className="flex items-center justify-center gap-2 mt-4">
            {['email', 'otp', 'password'].map((s, i) => (
              <div key={s} className="flex items-center gap-2">
                <div className={`w-2.5 h-2.5 rounded-full transition-all ${
                  s === step ? 'bg-blue-500 scale-125' :
                  ['email', 'otp', 'password'].indexOf(step) > i ? 'bg-green-500' : 'bg-slate-300'
                }`} />
                {i < 2 && <div className={`w-8 h-0.5 ${['email', 'otp', 'password'].indexOf(step) > i ? 'bg-green-400' : 'bg-slate-200'}`} />}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl p-7" style={{
          background: 'rgba(255,255,255,0.55)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
          border: '1px solid rgba(255,255,255,0.6)', boxShadow: '0 8px 32px rgba(31,38,135,0.12)',
        }}>
          <AnimatePresence mode="wait">
            {step === 'email' && (
              <motion.form key="email" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}
                onSubmit={handleSendOtp} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium mb-1.5 text-slate-600">Email Address</label>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl outline-none transition-all duration-200 text-slate-800 placeholder-slate-400"
                    style={inputStyle} {...focusHandlers} placeholder="you@company.com" required autoFocus />
                </div>
                <button type="submit" disabled={loading || !email}
                  className="w-full flex items-center justify-center gap-2 font-semibold py-3 px-5 rounded-xl text-white transition-all disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)', boxShadow: '0 4px 20px rgba(29,78,216,0.35)' }}>
                  {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><Mail size={18} /> Send OTP</>}
                </button>
              </motion.form>
            )}

            {step === 'otp' && (
              <motion.form key="otp" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}
                onSubmit={handleVerifyOtp} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium mb-1.5 text-slate-600">6-Digit OTP</label>
                  <input type="text" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="w-full px-4 py-4 rounded-xl outline-none transition-all duration-200 text-slate-800 text-center text-2xl tracking-[0.5em] font-mono"
                    style={inputStyle} {...focusHandlers} placeholder="• • • • • •" maxLength={6} required autoFocus />
                  <p className="text-xs text-slate-400 mt-2">Didn't receive it? Check spam or <button type="button" onClick={() => { setStep('email'); setOtp(''); }}
                    className="text-blue-500 hover:underline">resend</button></p>
                </div>
                <button type="submit" disabled={loading || otp.length !== 6}
                  className="w-full flex items-center justify-center gap-2 font-semibold py-3 px-5 rounded-xl text-white transition-all disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)', boxShadow: '0 4px 20px rgba(217,119,6,0.35)' }}>
                  {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><KeyRound size={18} /> Verify OTP</>}
                </button>
              </motion.form>
            )}

            {step === 'password' && (
              <motion.form key="password" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}
                onSubmit={handleResetPassword} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5 text-slate-600">New Password</label>
                  <div className="relative">
                    <input type={showPassword ? 'text' : 'password'} value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full px-4 py-3 pr-12 rounded-xl outline-none transition-all duration-200 text-slate-800 placeholder-slate-400"
                      style={inputStyle} {...focusHandlers} placeholder="Min 8 chars, letters + numbers" required autoFocus />
                    <button type="button" onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                      {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
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
                  <label className="block text-sm font-medium mb-1.5 text-slate-600">Confirm Password</label>
                  <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl outline-none transition-all duration-200 text-slate-800 placeholder-slate-400"
                    style={inputStyle} {...focusHandlers} placeholder="Confirm new password" required />
                  {confirmPassword && (
                    <p className={`text-xs mt-1 ${passwordsMatch ? 'text-green-600' : 'text-red-500'}`}>
                      {passwordsMatch ? '✓ Passwords match' : '✗ Passwords do not match'}
                    </p>
                  )}
                </div>
                <button type="submit" disabled={loading || !isValidPassword || !passwordsMatch}
                  className="w-full flex items-center justify-center gap-2 font-semibold py-3 px-5 rounded-xl text-white transition-all disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg, #22c55e, #16a34a)', boxShadow: '0 4px 20px rgba(22,163,74,0.35)' }}>
                  {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><ShieldCheck size={18} /> Reset Password</>}
                </button>
              </motion.form>
            )}
          </AnimatePresence>
        </div>

        <div className="text-center mt-5">
          <button onClick={() => router.push('/login')} className="text-sm text-slate-500 hover:text-blue-500 transition-colors flex items-center gap-1 mx-auto">
            <ArrowLeft size={14} /> Back to Login
          </button>
        </div>
      </motion.div>
    </div>
  );
}
