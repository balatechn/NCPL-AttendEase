'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useAuth } from '@/lib/auth';
import toast from 'react-hot-toast';
import Image from 'next/image';
import { Eye, EyeOff, LogIn } from 'lucide-react';

const spheres = [
  { size: 180, top: '8%',  left: '10%',  delay: 0,   duration: 8,  gradient: 'radial-gradient(circle at 35% 25%, #60a5fa, #1d4ed8 60%, #1e3a5f)' },
  { size: 120, top: '5%',  right: '18%', delay: 1.2, duration: 10, gradient: 'radial-gradient(circle at 40% 30%, #93c5fd, #2563eb 55%, #1e40af)' },
  { size: 60,  top: '30%', left: '5%',   delay: 0.5, duration: 7,  gradient: 'radial-gradient(circle at 35% 25%, #93c5fd, #3b82f6 60%, #1d4ed8)' },
  { size: 200, top: '45%', right: '3%',  delay: 1.8, duration: 9,  gradient: 'radial-gradient(circle at 30% 20%, #60a5fa, #1d4ed8 50%, #172554)' },
  { size: 70,  bottom: '15%', left: '15%', delay: 2.5, duration: 11, gradient: 'radial-gradient(circle at 35% 25%, #93c5fd, #3b82f6 60%, #1e40af)' },
  { size: 50,  top: '60%', right: '25%', delay: 0.8, duration: 8,  gradient: 'radial-gradient(circle at 30% 20%, #bfdbfe, #60a5fa 50%, #2563eb)' },
  { size: 90,  bottom: '5%', right: '10%', delay: 3, duration: 10, gradient: 'radial-gradient(circle at 35% 30%, #60a5fa, #1d4ed8 55%, #1e3a5f)' },
];

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [msLoading, setMsLoading] = useState(false);
  const { login } = useAuth();
  const router = useRouter();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const mserror = params.get('mserror');
    if (mserror) {
      const messages: Record<string, string> = {
        user_not_found: 'Your Microsoft account is not registered in AttendEase. Contact admin.',
        no_email: 'Could not retrieve email from Microsoft.',
        invalid_state: 'Login session expired. Please try again.',
        access_denied: 'Microsoft login was cancelled.',
      };
      toast.error(messages[mserror] || 'Microsoft login failed. Please try again.');
    }
  }, []);

  const handleMicrosoftLogin = () => {
    setMsLoading(true);
    window.location.href = '/auth/microsoft';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error('Please enter email and password');
      return;
    }
    setLoading(true);
    try {
      const result = await login(email, password);
      if (result.must_change_password) {
        toast('Please change your default password', { icon: '🔒' });
        router.replace('/change-password');
      } else {
        toast.success('Login successful!');
        router.replace('/attendance');
      }
    } catch (err: any) {
      toast.error(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #e8edf5 0%, #dde3ef 40%, #d5dcea 100%)' }}>

      {/* Floating blue spheres */}
      {spheres.map((s, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full"
          style={{
            width: s.size,
            height: s.size,
            top: s.top,
            left: s.left,
            right: s.right,
            bottom: s.bottom,
            background: s.gradient,
            boxShadow: `0 8px 32px rgba(29,78,216,0.3), inset 0 -4px 12px rgba(0,0,0,0.15), inset 0 4px 20px rgba(255,255,255,0.2)`,
          }}
          animate={{
            y: [0, -18, 0, 14, 0],
            x: [0, 10, 0, -8, 0],
          }}
          transition={{
            duration: s.duration,
            delay: s.delay,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      ))}

      {/* Glassmorphism circle behind card */}
      <div className="absolute w-[500px] h-[500px] rounded-full"
        style={{
          background: 'rgba(255,255,255,0.15)',
          border: '1px solid rgba(255,255,255,0.35)',
          backdropFilter: 'blur(2px)',
          boxShadow: '0 8px 32px rgba(31,38,135,0.08)',
        }}
      />

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: 'easeOut' }}
        className="w-full max-w-md relative z-10"
      >
        {/* Logo */}
        <div className="text-center mb-8">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.2 }}
            className="mx-auto mb-4"
          >
            <Image src="/national-logo.png" alt="National Group" width={280} height={200} className="mx-auto" priority />
          </motion.div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-800">
            NCPL <span className="bg-gradient-to-r from-blue-600 to-blue-400 bg-clip-text text-transparent">AttendEase</span>
          </h1>
          <p className="mt-2 text-sm text-slate-500">Sign in to your account</p>
        </div>

        {/* Glassmorphism Login Card */}
        <div className="rounded-2xl p-7" style={{
          background: 'rgba(255,255,255,0.55)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          border: '1px solid rgba(255,255,255,0.6)',
          boxShadow: '0 8px 32px rgba(31,38,135,0.12), 0 2px 8px rgba(0,0,0,0.06)',
        }}>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium mb-1.5 text-slate-600">Email Address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 rounded-xl outline-none transition-all duration-200 text-slate-800 placeholder-slate-400"
                style={{
                  background: 'rgba(255,255,255,0.6)',
                  border: '1px solid rgba(148,163,184,0.3)',
                  backdropFilter: 'blur(8px)',
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = 'rgba(59,130,246,0.5)';
                  e.target.style.boxShadow = '0 0 0 3px rgba(59,130,246,0.15)';
                  e.target.style.background = 'rgba(255,255,255,0.8)';
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = 'rgba(148,163,184,0.3)';
                  e.target.style.boxShadow = 'none';
                  e.target.style.background = 'rgba(255,255,255,0.6)';
                }}
                placeholder="you@company.com"
                autoComplete="email"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5 text-slate-600">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 pr-12 rounded-xl outline-none transition-all duration-200 text-slate-800 placeholder-slate-400"
                  style={{
                    background: 'rgba(255,255,255,0.6)',
                    border: '1px solid rgba(148,163,184,0.3)',
                    backdropFilter: 'blur(8px)',
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = 'rgba(59,130,246,0.5)';
                    e.target.style.boxShadow = '0 0 0 3px rgba(59,130,246,0.15)';
                    e.target.style.background = 'rgba(255,255,255,0.8)';
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = 'rgba(148,163,184,0.3)';
                    e.target.style.boxShadow = 'none';
                    e.target.style.background = 'rgba(255,255,255,0.6)';
                  }}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 font-semibold py-3 px-5 rounded-xl text-white transition-all duration-300 active:scale-[0.97] disabled:opacity-50"
              style={{
                background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
                boxShadow: '0 4px 20px rgba(29,78,216,0.35)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = '0 6px 28px rgba(29,78,216,0.5)';
                e.currentTarget.style.transform = 'translateY(-1px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = '0 4px 20px rgba(29,78,216,0.35)';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <LogIn size={18} />
                  Sign In
                </>
              )}
            </button>
          </form>
          {/* Divider */}
          <div className="flex items-center gap-3 mt-5">
            <div className="flex-1 h-px" style={{ background: 'rgba(148,163,184,0.3)' }} />
            <span className="text-xs text-slate-400 font-medium">OR</span>
            <div className="flex-1 h-px" style={{ background: 'rgba(148,163,184,0.3)' }} />
          </div>

          {/* Microsoft SSO Button */}
          <button
            type="button"
            onClick={handleMicrosoftLogin}
            disabled={msLoading}
            className="w-full flex items-center justify-center gap-3 py-3 px-5 rounded-xl font-medium text-slate-700 transition-all duration-200 active:scale-[0.97] disabled:opacity-50 mt-3"
            style={{
              background: 'rgba(255,255,255,0.8)',
              border: '1px solid rgba(148,163,184,0.4)',
              boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,1)';
              e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.8)';
              e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)';
            }}
          >
            {msLoading ? (
              <div className="w-5 h-5 border-2 border-slate-300 border-t-blue-500 rounded-full animate-spin" />
            ) : (
              <svg width="20" height="20" viewBox="0 0 21 21" xmlns="http://www.w3.org/2000/svg">
                <rect x="1" y="1" width="9" height="9" fill="#f25022"/>
                <rect x="11" y="1" width="9" height="9" fill="#7fba00"/>
                <rect x="1" y="11" width="9" height="9" fill="#00a4ef"/>
                <rect x="11" y="11" width="9" height="9" fill="#ffb900"/>
              </svg>
            )}
            Sign in with Microsoft
          </button>

          <div className="text-center mt-4">
            <a href="/forgot-password" className="text-sm text-blue-500 hover:text-blue-700 transition-colors">
              Forgot Password?
            </a>
          </div>
        </div>

        <p className="text-center text-xs mt-6 text-slate-400">
          Powered by NCPL &middot; Biometric Integrated
        </p>
      </motion.div>
    </div>
  );
}
