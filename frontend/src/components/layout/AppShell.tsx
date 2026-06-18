'use client';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '@/lib/api';
import {
  LayoutDashboard, CalendarDays, Clock, FileText, Settings, Bell, LogOut, Menu, X,
  ClipboardCheck, BarChart3, Users, Sun, Moon, Shield
} from 'lucide-react';

const navItems = [
  { label: 'Dashboard', href: '/attendance', icon: LayoutDashboard },
  { label: 'Leaves', href: '/leaves', icon: FileText },
  { label: 'Regularization', href: '/regularization', icon: ClipboardCheck },
  { label: 'Manager', href: '/manager', icon: Shield, roles: ['admin', 'hr', 'manager'] },
  { label: 'HR Dashboard', href: '/hr', icon: Users, roles: ['admin', 'hr'] },
  { label: 'Reports', href: '/reports', icon: BarChart3, roles: ['admin', 'hr', 'manager'] },
  { label: 'Admin', href: '/admin', icon: Settings, roles: ['admin', 'hr'] },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!loading && !user) {
      // Double-check localStorage before redirecting (React state may lag behind)
      const token = localStorage.getItem('accessToken');
      const storedUser = localStorage.getItem('user');
      if (!token || !storedUser) {
        router.replace('/login');
      }
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (user) {
      api.getUnreadCount().then((d) => setUnreadCount(d.count)).catch(() => {});
      const interval = setInterval(() => {
        api.getUnreadCount().then((d) => setUnreadCount(d.count)).catch(() => {});
      }, 30000);
      return () => clearInterval(interval);
    }
  }, [user]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-3 border-primary-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return null;

  const filteredNav = navItems.filter((item) => {
    if (!item.roles) return true;
    return item.roles.includes(user.role);
  });

  return (
    <div className="min-h-screen relative z-10">
      {/* Top Bar — Glass Header */}
      <header className="sticky top-0 z-40" style={{ background: 'var(--bg-header)', backdropFilter: 'blur(20px)', borderBottom: '1px solid var(--border-color)' }}>
        <div className="flex items-center justify-between px-4 py-3 max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="lg:hidden p-2 rounded-xl transition" style={{ color: 'var(--text-muted)' }}
            >
              {mobileOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
            <Link href="/attendance" className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center shadow-lg" style={{ background: 'var(--bg-accent)' }}>
                <Clock size={17} className="text-white" />
              </div>
              <span className="font-bold hidden sm:inline text-lg tracking-tight" style={{ color: 'var(--text-primary)' }}>Attend<span className="text-primary-400">Ease</span></span>
            </Link>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={toggleTheme}
              className="p-2.5 rounded-xl transition"
              style={{ color: 'var(--text-muted)' }}
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {theme === 'dark' ? <Sun size={19} /> : <Moon size={19} />}
            </button>
            <Link
              href="/notifications"
              className="relative p-2.5 rounded-xl transition"
              style={{ color: 'var(--text-muted)' }}
            >
              <Bell size={19} />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-5 h-5 text-white text-xs rounded-full flex items-center justify-center font-bold" style={{ background: '#dc2626' }}>
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </Link>
            <div className="flex items-center gap-2.5 pl-3 ml-1" style={{ borderLeft: '1px solid var(--border-color)' }}>
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-white font-semibold text-sm" style={{ background: 'var(--bg-accent)' }}>
                {user.first_name[0]}{user.last_name[0]}
              </div>
              <div className="hidden sm:block">
                <p className="text-sm font-semibold leading-tight" style={{ color: 'var(--text-primary)' }}>{user.first_name} {user.last_name}</p>
                <p className="text-xs capitalize" style={{ color: 'var(--text-muted)' }}>{user.role}</p>
              </div>
              <button onClick={logout} className="p-2 rounded-xl hover:bg-red-500/10 text-slate-500 hover:text-red-400 transition" title="Logout">
                <LogOut size={17} />
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="flex max-w-7xl mx-auto">
        {/* Desktop Sidebar — Glass Navigation */}
        <aside className="hidden lg:block w-56 shrink-0 py-6 pr-4">
          <nav className="space-y-1 sticky top-20">
            {filteredNav.map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href + '/');
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                    active
                      ? 'shadow-lg'
                      : ''
                  }`}
                  style={active ? { background: 'var(--bg-active-nav)', borderLeft: '2px solid #3b82f6', color: 'var(--text-primary)' } : { color: 'var(--text-muted)' }}
                >
                  <item.icon size={18} className={active ? 'text-primary-400' : ''} />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </aside>

        {/* Mobile Sidebar */}
        <AnimatePresence>
          {mobileOpen && (
            <>
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="fixed inset-0 z-40 lg:hidden"
                style={{ background: 'var(--bg-overlay)', backdropFilter: 'blur(4px)' }}
                onClick={() => setMobileOpen(false)}
              />
              <motion.aside
                initial={{ x: -280 }} animate={{ x: 0 }} exit={{ x: -280 }}
                transition={{ type: 'spring', damping: 25 }}
                className="fixed left-0 top-0 bottom-0 w-72 z-50 p-6 shadow-2xl lg:hidden"
                style={{ background: 'var(--bg-sidebar)', backdropFilter: 'blur(20px)', borderRight: '1px solid var(--border-color)' }}
              >
                <div className="flex items-center justify-between mb-8">
                  <span className="font-bold text-lg" style={{ color: 'var(--text-primary)' }}>Attend<span className="text-primary-400">Ease</span></span>
                  <button onClick={() => setMobileOpen(false)} className="p-2 rounded-xl transition" style={{ color: 'var(--text-muted)' }}>
                    <X size={20} />
                  </button>
                </div>
                <nav className="space-y-1">
                  {filteredNav.map((item) => {
                    const active = pathname === item.href || pathname.startsWith(item.href + '/');
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setMobileOpen(false)}
                        className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                          active ? '' : ''
                        }`}
                        style={active ? { background: 'var(--bg-active-nav)', color: 'var(--text-primary)' } : { color: 'var(--text-muted)' }}
                      >
                        <item.icon size={18} className={active ? 'text-primary-400' : ''} />
                        {item.label}
                      </Link>
                    );
                  })}
                </nav>
              </motion.aside>
            </>
          )}
        </AnimatePresence>

        {/* Main Content */}
        <main className="flex-1 py-6 px-4 min-w-0">
          {children}
        </main>
      </div>
    </div>
  );
}
