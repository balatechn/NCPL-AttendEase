'use client';
import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import AppShell from '@/components/layout/AppShell';
import toast from 'react-hot-toast';
import { Plus, CheckCircle, XCircle, ClipboardCheck, Send, Bot, ArrowLeft } from 'lucide-react';
import type { RegularizationRequest } from '@/types';

type ChatStep = 'idle' | 'type' | 'date' | 'punch_in' | 'punch_out' | 'reason' | 'confirm' | 'done';
interface ChatMsg {
  id: number;
  from: 'bot' | 'user';
  text: string;
  options?: { label: string; value: string }[];
  inputType?: 'date' | 'time' | 'text';
  timestamp: Date;
}

const REG_TYPES = [
  { label: '🕐 Miss Punch', value: 'miss_punch' },
  { label: '🏢 Client Visit', value: 'client_visit' },
  { label: '🏠 Work from Home', value: 'work_from_home' },
];

const TYPE_LABELS: Record<string, string> = {
  miss_punch: 'Miss Punch',
  client_visit: 'Client Visit',
  work_from_home: 'Work from Home',
};

export default function RegularizationPage() {
  const { user, isManager } = useAuth();
  const [requests, setRequests] = useState<RegularizationRequest[]>([]);
  const [pendingRequests, setPendingRequests] = useState<RegularizationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'my' | 'pending'>('my');

  // Chat state
  const [chatMode, setChatMode] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [chatStep, setChatStep] = useState<ChatStep>('idle');
  const [chatInput, setChatInput] = useState('');
  const [chatForm, setChatForm] = useState({ regularization_type: '', attendance_date: '', requested_punch_in: '', requested_punch_out: '', reason: '' });
  const [submitting, setSubmitting] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const msgIdRef = useRef(0);

  useEffect(() => { loadData(); }, []);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  async function loadData() {
    setLoading(true);
    try {
      const my = await api.getMyRegularizations();
      setRequests(my);
      if (isManager) {
        const p = await api.getPendingRegularizations();
        setPendingRequests(p);
      }
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }

  function addMsg(from: 'bot' | 'user', text: string, options?: ChatMsg['options'], inputType?: ChatMsg['inputType']) {
    const msg: ChatMsg = { id: ++msgIdRef.current, from, text, options, inputType, timestamp: new Date() };
    setMessages(prev => [...prev, msg]);
    return msg;
  }

  function startChat() {
    setChatMode(true);
    setMessages([]);
    setChatForm({ regularization_type: '', attendance_date: '', requested_punch_in: '', requested_punch_out: '', reason: '' });
    msgIdRef.current = 0;
    setTimeout(() => {
      addMsg('bot', `Hey ${user?.first_name}! 👋 I'll help you submit a regularization request.`);
      setTimeout(() => {
        addMsg('bot', 'What type of regularization do you need?', REG_TYPES);
        setChatStep('type');
      }, 500);
    }, 300);
  }

  function handleOption(value: string, label: string) {
    if (chatStep === 'type') {
      addMsg('user', label);
      setChatForm(prev => ({ ...prev, regularization_type: value }));
      setTimeout(() => {
        addMsg('bot', 'Which date needs regularization?', undefined, 'date');
        setChatStep('date');
      }, 400);
    } else if (chatStep === 'confirm') {
      if (value === 'yes') {
        addMsg('user', '✅ Yes, submit!');
        submitRequest();
      } else {
        addMsg('user', '❌ Cancel');
        setTimeout(() => {
          addMsg('bot', 'No worries! Request cancelled. You can start again anytime.');
          setChatStep('done');
        }, 300);
      }
    }
  }

  function handleChatSend() {
    if (!chatInput.trim()) return;
    const val = chatInput.trim();
    setChatInput('');

    if (chatStep === 'date') {
      addMsg('user', val);
      setChatForm(prev => ({ ...prev, attendance_date: val }));
      setTimeout(() => {
        if (chatForm.regularization_type === 'work_from_home') {
          addMsg('bot', 'Please explain the reason for this regularization:');
          setChatStep('reason');
        } else {
          addMsg('bot', 'What was your punch-in time? (Leave blank if N/A)', undefined, 'time');
          setChatStep('punch_in');
        }
      }, 400);
    } else if (chatStep === 'punch_in') {
      addMsg('user', val || '—');
      setChatForm(prev => ({ ...prev, requested_punch_in: val }));
      setTimeout(() => {
        addMsg('bot', 'And the punch-out time? (Leave blank if N/A)', undefined, 'time');
        setChatStep('punch_out');
      }, 400);
    } else if (chatStep === 'punch_out') {
      // Validate punch_out > punch_in to prevent AM/PM mix-ups
      if (val && chatForm.requested_punch_in && val <= chatForm.requested_punch_in) {
        addMsg('user', val);
        setTimeout(() => {
          addMsg('bot', `⚠️ Punch-out time (${val}) must be after punch-in time (${chatForm.requested_punch_in}). Please make sure you're using 24-hour format (e.g., 18:30 for 6:30 PM, not 06:30).`, undefined, 'time');
        }, 400);
        return;
      }
      addMsg('user', val || '—');
      setChatForm(prev => ({ ...prev, requested_punch_out: val }));
      setTimeout(() => {
        addMsg('bot', 'Please explain the reason for this regularization:');
        setChatStep('reason');
      }, 400);
    } else if (chatStep === 'reason') {
      addMsg('user', val);
      setChatForm(prev => {
        const updated = { ...prev, reason: val };
        const typeLabel = TYPE_LABELS[prev.regularization_type] || prev.regularization_type;
        setTimeout(() => {
          addMsg('bot',
            `📝 Here's your request summary:\n\n• Type: ${typeLabel}\n• Date: ${prev.attendance_date}\n• Punch In: ${prev.requested_punch_in || '—'}\n• Punch Out: ${prev.requested_punch_out || '—'}\n• Reason: ${val}\n\nShall I submit this?`,
            [{ label: '✅ Yes, submit!', value: 'yes' }, { label: '❌ Cancel', value: 'no' }]
          );
          setChatStep('confirm');
        }, 400);
        return updated;
      });
    }
  }

  function handleSkipTime() {
    setChatInput('');
    if (chatStep === 'punch_in') {
      addMsg('user', '— (skipped)');
      setChatForm(prev => ({ ...prev, requested_punch_in: '' }));
      setTimeout(() => {
        addMsg('bot', 'And the punch-out time? (Leave blank if N/A)', undefined, 'time');
        setChatStep('punch_out');
      }, 400);
    } else if (chatStep === 'punch_out') {
      addMsg('user', '— (skipped)');
      setChatForm(prev => ({ ...prev, requested_punch_out: '' }));
      setTimeout(() => {
        addMsg('bot', 'Please explain the reason for this regularization:');
        setChatStep('reason');
      }, 400);
    }
  }

  async function submitRequest() {
    setSubmitting(true);
    try {
      await api.applyRegularization(chatForm);
      setTimeout(() => {
        addMsg('bot', '🎉 Your regularization request has been submitted! Your manager will be notified.');
        setChatStep('done');
        loadData();
      }, 500);
    } catch (err: any) {
      addMsg('bot', `❌ Oops! ${err.message}. Please try again.`);
      setChatStep('done');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAction(id: number, action: 'approve' | 'reject') {
    const remarks = prompt(`${action === 'approve' ? 'Approval' : 'Rejection'} remarks (optional):`) || '';
    try {
      if (action === 'approve') await api.approveRegularization(id, remarks);
      else await api.rejectRegularization(id, remarks);
      toast.success(`Request ${action}d`);
      loadData();
    } catch (err: any) { toast.error(err.message); }
  }

  const statusBadge = (s: string) => ({
    pending: 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/20',
    approved: 'bg-green-500/15 text-green-400 border border-green-500/20',
    rejected: 'bg-red-500/15 text-red-400 border border-red-500/20',
  })[s] || 'bg-slate-500/10 text-slate-500';

  // ====================== CHAT MODE UI ======================
  if (chatMode) {
    return (
      <AppShell>
        <div className="flex flex-col h-[calc(100vh-100px)] max-w-2xl mx-auto">
          {/* Chat Header */}
          <div className="flex items-center gap-3 mb-4">
            <button onClick={() => setChatMode(false)} className="p-2 rounded-xl" style={{ color: 'var(--text-secondary)' }}>
              <ArrowLeft size={20} />
            </button>
            <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'var(--bg-accent)' }}>
              <Bot size={20} className="text-white" />
            </div>
            <div>
              <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Regularization Assistant</h2>
              <p className="text-xs text-green-400">Online</p>
            </div>
          </div>

          {/* Chat Messages */}
          <div className="flex-1 overflow-y-auto space-y-3 pr-2 pb-4">
            <AnimatePresence>
              {messages.map((msg) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.3 }}
                  className={`flex ${msg.from === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`max-w-[80%] ${msg.from === 'user' ? '' : 'flex gap-2'}`}>
                    {msg.from === 'bot' && (
                      <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-1" style={{ background: 'var(--bg-accent)' }}>
                        <Bot size={14} className="text-white" />
                      </div>
                    )}
                    <div>
                      <div
                        className={`px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-line ${
                          msg.from === 'user'
                            ? 'rounded-br-md text-white'
                            : 'rounded-bl-md'
                        }`}
                        style={
                          msg.from === 'user'
                            ? { background: 'var(--bg-accent)' }
                            : { background: 'var(--bg-surface)', color: 'var(--text-primary)', border: '1px solid var(--border-color)' }
                        }
                      >
                        {msg.text}
                      </div>

                      {/* Option buttons */}
                      {msg.options && chatStep !== 'done' && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {msg.options.map((opt) => (
                            <button
                              key={opt.value}
                              onClick={() => handleOption(opt.value, opt.label)}
                              className="px-3 py-2 rounded-xl text-sm font-medium transition-all"
                              style={{ background: 'var(--bg-tab)', color: 'var(--text-secondary)', border: '1px solid var(--border-color)' }}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      )}

                      <p className="text-[10px] mt-1 px-1" style={{ color: 'var(--text-faint)' }}>
                        {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            {submitting && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-2">
                <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: 'var(--bg-accent)' }}>
                  <Bot size={14} className="text-white" />
                </div>
                <div className="px-4 py-3 rounded-2xl rounded-bl-md" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)' }}>
                  <div className="flex gap-1">
                    <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </motion.div>
            )}

            <div ref={chatEndRef} />
          </div>

          {/* Chat Input Bar */}
          {chatStep !== 'done' && chatStep !== 'idle' && chatStep !== 'type' && chatStep !== 'confirm' && (
            <div className="flex gap-2 pt-3" style={{ borderTop: '1px solid var(--border-color)' }}>
              <input
                type={chatStep === 'date' ? 'date' : chatStep === 'punch_in' || chatStep === 'punch_out' ? 'time' : 'text'}
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleChatSend()}
                placeholder={
                  chatStep === 'date' ? 'Select date...' :
                  chatStep === 'punch_in' ? 'Enter punch-in time...' :
                  chatStep === 'punch_out' ? 'Enter punch-out time...' :
                  'Type your reason...'
                }
                className="input-field flex-1"
                autoFocus
              />
              {(chatStep === 'punch_in' || chatStep === 'punch_out') && (
                <button
                  onClick={handleSkipTime}
                  className="px-3 py-2 rounded-xl text-xs font-medium transition-all"
                  style={{ background: 'var(--bg-tab)', color: 'var(--text-muted)', border: '1px solid var(--border-color)' }}
                >
                  Skip
                </button>
              )}
              <button
                onClick={handleChatSend}
                disabled={!chatInput.trim() && chatStep !== 'punch_in' && chatStep !== 'punch_out'}
                className="p-3 rounded-xl disabled:opacity-30 transition-all"
                style={{ background: 'var(--bg-accent)' }}
              >
                <Send size={18} className="text-white" />
              </button>
            </div>
          )}

          {chatStep === 'done' && (
            <div className="flex gap-2 pt-3" style={{ borderTop: '1px solid var(--border-color)' }}>
              <button onClick={startChat} className="btn-primary flex-1 flex items-center justify-center gap-2">
                <Plus size={18} /> New Request
              </button>
              <button onClick={() => setChatMode(false)} className="btn-secondary">
                Back to Requests
              </button>
            </div>
          )}
        </div>
      </AppShell>
    );
  }

  // ====================== LIST MODE UI ======================
  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Regularization</h1>
          <button onClick={startChat} className="btn-primary flex items-center gap-2">
            <Bot size={18} /> New Request
          </button>
        </div>

        {isManager && (
          <div className="flex gap-1 p-1 rounded-xl w-fit" style={{ background: 'var(--bg-tab)' }}>
            <button onClick={() => setTab('my')} className={`px-4 py-2 rounded-lg text-sm font-medium transition ${tab === 'my' ? 'shadow-sm' : ''}`} style={tab === 'my' ? { background: 'var(--bg-tab-active)', color: 'var(--text-primary)' } : { color: 'var(--text-muted)' }}>My Requests</button>
            <button onClick={() => setTab('pending')} className={`px-4 py-2 rounded-lg text-sm font-medium transition ${tab === 'pending' ? 'shadow-sm' : ''}`} style={tab === 'pending' ? { background: 'var(--bg-tab-active)', color: 'var(--text-primary)' } : { color: 'var(--text-muted)' }}>
              Pending {pendingRequests.length > 0 && <span className="ml-1 text-white text-xs px-1.5 py-0.5 rounded-full" style={{ background: '#dc2626' }}>{pendingRequests.length}</span>}
            </button>
          </div>
        )}

        <div className="space-y-3">
          {loading ? (
            <div className="text-center py-12" style={{ color: 'var(--text-muted)' }}>Loading...</div>
          ) : (
            (tab === 'my' ? requests : pendingRequests).map((req) => (
              <motion.div key={req.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="card flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`px-2.5 py-0.5 rounded-lg text-xs font-medium ${statusBadge(req.status)}`}>{req.status}</span>
                    <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{req.attendance_date}</span>
                    <span className="px-2 py-0.5 rounded-md text-xs font-medium" style={{ background: 'var(--bg-tab)', color: 'var(--text-secondary)' }}>
                      {TYPE_LABELS[req.regularization_type] || req.regularization_type}
                    </span>
                  </div>
                  {tab === 'pending' && <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{req.first_name} {req.last_name} ({req.employee_code})</p>}
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>In: {req.requested_punch_in || '--'} | Out: {req.requested_punch_out || '--'}</p>
                  <p className="text-sm mt-1" style={{ color: 'var(--text-faint)' }}>{req.reason}</p>
                  {req.remarks && <p className="text-xs mt-1 italic" style={{ color: 'var(--text-faint)' }}>Remarks: {req.remarks}</p>}
                </div>
                {tab === 'pending' && req.status === 'pending' && (
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => handleAction(req.id, 'approve')} className="flex items-center gap-1 px-3 py-2 rounded-xl text-sm font-medium text-green-400 transition" style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)' }}><CheckCircle size={16} /> Approve</button>
                    <button onClick={() => handleAction(req.id, 'reject')} className="flex items-center gap-1 px-3 py-2 rounded-xl text-sm font-medium text-red-400 transition" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}><XCircle size={16} /> Reject</button>
                  </div>
                )}
              </motion.div>
            ))
          )}
          {!loading && (tab === 'my' ? requests : pendingRequests).length === 0 && (
            <div className="text-center py-12">
              <ClipboardCheck size={40} className="mx-auto mb-2" style={{ color: 'var(--text-faint)' }} /><p style={{ color: 'var(--text-muted)' }}>No requests found</p>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
