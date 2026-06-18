'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import AppShell from '@/components/layout/AppShell';
import { Bell, Check, CheckCheck } from 'lucide-react';
import { motion } from 'framer-motion';
import type { Notification } from '@/types';

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getNotifications().then(setNotifications).catch(console.error).finally(() => setLoading(false));
  }, []);

  async function markRead(id: number) {
    await api.markNotificationRead(id);
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, is_read: true } : n));
  }

  async function markAllRead() {
    await api.markAllRead();
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  }

  const typeIcon = (type: string) => {
    const colors: Record<string, string> = {
      info: 'bg-blue-500/15 text-blue-400 border border-blue-500/20',
      success: 'bg-green-500/15 text-green-400 border border-green-500/20',
      warning: 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/20',
      error: 'bg-red-500/15 text-red-400 border border-red-500/20',
    };
    return colors[type] || 'bg-slate-500/10 text-slate-400 border border-slate-500/20';
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Notifications</h1>
          {notifications.some((n) => !n.is_read) && (
            <button onClick={markAllRead} className="btn-secondary flex items-center gap-2 text-sm">
              <CheckCheck size={16} /> Mark All Read
            </button>
          )}
        </div>

        {loading ? (
          <div className="text-center py-12" style={{ color: 'var(--text-muted)' }}>Loading...</div>
        ) : notifications.length === 0 ? (
          <div className="text-center py-12" style={{ color: 'var(--text-faint)' }}>
            <Bell size={40} className="mx-auto mb-2 opacity-30" /><p>No notifications</p>
          </div>
        ) : (
          <div className="space-y-2">
            {notifications.map((n) => (
              <motion.div
                key={n.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className={`card flex items-start gap-3 cursor-pointer transition ${!n.is_read ? 'border-l-4 border-l-primary-400' : ''}`}
                style={!n.is_read ? { background: 'rgba(99,102,241,0.06)' } : {}}
                onClick={() => !n.is_read && markRead(n.id)}
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${typeIcon(n.type)}`}>
                  <Bell size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>{n.title}</p>
                  <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>{n.message}</p>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-faint)' }}>{new Date(n.created_at).toLocaleString()}</p>
                </div>
                {!n.is_read && (
                  <div className="w-2.5 h-2.5 rounded-full mt-2 shrink-0" style={{ background: '#3b82f6' }} />
                )}
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
