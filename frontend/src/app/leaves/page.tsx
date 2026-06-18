'use client';
import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import AppShell from '@/components/layout/AppShell';
import toast from 'react-hot-toast';
import { Plus, CheckCircle, XCircle, Clock, FileText, Send, Bot, User, ArrowLeft } from 'lucide-react';
import type { Leave, LeaveBalance } from '@/types';

// Chat message types
type ChatStep = 'idle' | 'type' | 'start_date' | 'end_date' | 'reason' | 'confirm' | 'done';
interface ChatMsg {
  id: number;
  from: 'bot' | 'user';
  text: string;
  options?: { label: string; value: string }[];
  inputType?: 'date' | 'text';
  timestamp: Date;
}

const LEAVE_TYPES = [
  { label: '🏖 Casual Leave', value: 'casual' },
  { label: '🤒 Sick Leave', value: 'sick' },
  { label: '📅 Earned Leave', value: 'earned' },
  { label: '🔄 Compensatory Off', value: 'compensatory' },
  { label: '📋 Unpaid Leave', value: 'unpaid' },
];

export default function LeavesPage() {
  const { user, isManager } = useAuth();
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [balance, setBalance] = useState<LeaveBalance[]>([]);
  const [pendingLeaves, setPendingLeaves] = useState<Leave[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'my' | 'pending'>('my');

  // Chat state
  const [chatMode, setChatMode] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [chatStep, setChatStep] = useState<ChatStep>('idle');
  const [chatInput, setChatInput] = useState('');
  const [chatForm, setChatForm] = useState({ leave_type: '', start_date: '', end_date: '', reason: '' });
  const [submitting, setSubmitting] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const msgIdRef = useRef(0);

  useEffect(() => { loadData(); }, []);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  async function loadData() {
    setLoading(true);
    try {
      const [myLeaves, bal] = await Promise.all([api.getMyLeaves(), api.getLeaveBalance()]);
      setLeaves(myLeaves);
      setBalance(bal);
      if (isManager) {
        const pending = await api.getPendingLeaves();
        setPendingLeaves(pending);
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
    setChatForm({ leave_type: '', start_date: '', end_date: '', reason: '' });
    msgIdRef.current = 0;
    setTimeout(() => {
      addMsg('bot', `Hey ${user?.first_name}! 👋 I'll help you apply for leave.`);
      setTimeout(() => {
        addMsg('bot', 'What type of leave would you like?', LEAVE_TYPES);
        setChatStep('type');
      }, 500);
    }, 300);
  }

  function handleOption(value: string, label: string) {
    if (chatStep === 'type') {
      addMsg('user', label);
      setChatForm(prev => ({ ...prev, leave_type: value }));
      const bal = balance.find(b => b.leave_type === value);
      setTimeout(() => {
        if (bal) addMsg('bot', `You have ${bal.remaining} of ${bal.total_allowed} ${value} leaves remaining.`);
        if (bal && bal.remaining <= 0) {
          setTimeout(() => {
            addMsg('bot', `❌ You have no ${value} leaves remaining. Please choose a different leave type or contact HR.`);
            setChatStep('done');
          }, 400);
          return;
        }
        setTimeout(() => {
          addMsg('bot', 'When does your leave start?', undefined, 'date');
          setChatStep('start_date');
        }, 400);
      }, 400);
    } else if (chatStep === 'confirm') {
      if (value === 'yes') {
        addMsg('user', '✅ Yes, submit!');
        submitLeave();
      } else {
        addMsg('user', '❌ Cancel');
        setTimeout(() => {
          addMsg('bot', 'No worries! Application cancelled. You can start again anytime.');
          setChatStep('done');
        }, 300);
      }
    }
  }

  function handleChatSend() {
    if (!chatInput.trim()) return;
    const val = chatInput.trim();
    setChatInput('');

    if (chatStep === 'start_date') {
      addMsg('user', val);
      setChatForm(prev => ({ ...prev, start_date: val }));
      setTimeout(() => {
        addMsg('bot', 'When does it end? (Same day if single day leave)', undefined, 'date');
        setChatStep('end_date');
      }, 400);
    } else if (chatStep === 'end_date') {
      addMsg('user', val);
      setChatForm(prev => {
        const updated = { ...prev, end_date: val };
        setTimeout(() => {
          addMsg('bot', 'Please share the reason for your leave:');
          setChatStep('reason');
        }, 400);
        return updated;
      });
    } else if (chatStep === 'reason') {
      addMsg('user', val);
      setChatForm(prev => {
        const updated = { ...prev, reason: val };
        setTimeout(() => {
          const typeLabel = LEAVE_TYPES.find(t => t.value === prev.leave_type)?.label || prev.leave_type;
          addMsg('bot',
            `📝 Here's your leave summary:\n\n• Type: ${typeLabel}\n• From: ${prev.start_date}\n• To: ${updated.end_date}\n• Reason: ${val}\n\nShall I submit this?`,
            [{ label: '✅ Yes, submit!', value: 'yes' }, { label: '❌ Cancel', value: 'no' }]
          );
          setChatStep('confirm');
        }, 400);
        return updated;
      });
    }
  }

  async function submitLeave() {
    setSubmitting(true);
    try {
      await api.applyLeave(chatForm);
      setTimeout(() => {
        addMsg('bot', '🎉 Your leave has been submitted successfully! Your manager will be notified.');
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

  async function handleCancel(id: number) {
    if (!confirm('Are you sure you want to cancel this leave request?')) return;
    try {
      await api.cancelLeave(id);
      toast.success('Leave cancelled');
      loadData();
    } catch (err: any) { toast.error(err.message); }
  }

  async function handleAction(id: number, action: 'approve' | 'reject') {
    const remarks = prompt(`${action === 'approve' ? 'Approval' : 'Rejection'} remarks (optional):`) || '';
    try {
      if (action === 'approve') await api.approveLeave(id, remarks);
      else await api.rejectLeave(id, remarks);
      toast.success(`Leave ${action}d`);
      loadData();
    } catch (err: any) { toast.error(err.message); }
  }

  const statusBadge = (status: string) => {
    const map: Record<string, { cls: string; style?: Record<string, string> }> = {
      pending: { cls: 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/20' },
      approved: { cls: 'bg-green-500/15 text-green-400 border border-green-500/20' },
      rejected: { cls: 'bg-red-500/15 text-red-400 border border-red-500/20' },
      cancelled: { cls: '', style: { background: 'var(--bg-surface)', color: 'var(--text-muted)', border: '1px solid var(--border-color)' } },
    };
    return map[status] || { cls: '', style: { background: 'var(--bg-surface)' } };
  };

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
              <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Leave Assistant</h2>
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
                type={chatStep === 'start_date' || chatStep === 'end_date' ? 'date' : 'text'}
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleChatSend()}
                placeholder={
                  chatStep === 'start_date' ? 'Select start date...' :
                  chatStep === 'end_date' ? 'Select end date...' :
                  'Type your reason...'
                }
                className="input-field flex-1"
                autoFocus
              />
              <button
                onClick={handleChatSend}
                disabled={!chatInput.trim()}
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
                <Plus size={18} /> Apply Another Leave
              </button>
              <button onClick={() => setChatMode(false)} className="btn-secondary">
                Back to Leaves
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
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Leave Management</h1>
          <button onClick={startChat} className="btn-primary flex items-center gap-2">
            <Bot size={18} /> Apply Leave
          </button>
        </div>

        {/* Leave Balance */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {balance.map((b) => (
            <div key={b.leave_type} className="card text-center">
              <p className="text-xs uppercase font-medium" style={{ color: 'var(--text-muted)' }}>{b.leave_type}</p>
              <p className="text-2xl font-bold mt-1" style={{ color: 'var(--text-primary)' }}>{b.remaining}</p>
              <p className="text-xs" style={{ color: 'var(--text-faint)' }}>of {b.total_allowed} left</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        {isManager && (
          <div className="flex gap-1 p-1 rounded-xl w-fit" style={{ background: 'var(--bg-tab)' }}>
            <button onClick={() => setTab('my')} className={`px-4 py-2 rounded-lg text-sm font-medium transition ${tab === 'my' ? 'shadow-sm' : ''}`} style={tab === 'my' ? { background: 'var(--bg-tab-active)', color: 'var(--text-primary)' } : { color: 'var(--text-muted)' }}>
              My Leaves
            </button>
            <button onClick={() => setTab('pending')} className={`px-4 py-2 rounded-lg text-sm font-medium transition ${tab === 'pending' ? 'shadow-sm' : ''}`} style={tab === 'pending' ? { background: 'var(--bg-tab-active)', color: 'var(--text-primary)' } : { color: 'var(--text-muted)' }}>
              Pending Approvals {pendingLeaves.length > 0 && <span className="ml-1 text-white text-xs px-1.5 py-0.5 rounded-full" style={{ background: '#dc2626' }}>{pendingLeaves.length}</span>}
            </button>
          </div>
        )}

        {/* Leaves List */}
        <div className="space-y-3">
          {loading ? (
            <div className="text-center py-12" style={{ color: 'var(--text-muted)' }}>Loading...</div>
          ) : (
            (tab === 'my' ? leaves : pendingLeaves).map((leave) => (
              <motion.div
                key={leave.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="card flex flex-col sm:flex-row sm:items-center gap-4"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`px-2.5 py-0.5 rounded-lg text-xs font-medium ${statusBadge(leave.status).cls}`} style={statusBadge(leave.status).style}>
                      {leave.status}
                    </span>
                    <span className="text-sm font-medium capitalize" style={{ color: 'var(--text-primary)' }}>{leave.leave_type} Leave</span>
                  </div>
                  {tab === 'pending' && (
                    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{leave.first_name} {leave.last_name} ({leave.employee_code})</p>
                  )}
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{leave.start_date} — {leave.end_date}</p>
                  <p className="text-sm mt-1" style={{ color: 'var(--text-faint)' }}>{leave.reason}</p>
                  {leave.remarks && <p className="text-xs mt-1 italic" style={{ color: 'var(--text-faint)' }}>Remarks: {leave.remarks}</p>}
                </div>
                {leave.status === 'pending' && tab === 'my' && (
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => handleCancel(leave.id)} className="flex items-center gap-1 px-3 py-2 rounded-xl text-sm font-medium text-red-400 transition" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}>
                      <XCircle size={16} /> Cancel
                    </button>
                  </div>
                )}
                {tab === 'pending' && leave.status === 'pending' && (
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => handleAction(leave.id, 'approve')} className="flex items-center gap-1 px-3 py-2 rounded-xl text-sm font-medium text-green-400 transition" style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)' }}>
                      <CheckCircle size={16} /> Approve
                    </button>
                    <button onClick={() => handleAction(leave.id, 'reject')} className="flex items-center gap-1 px-3 py-2 rounded-xl text-sm font-medium text-red-400 transition" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}>
                      <XCircle size={16} /> Reject
                    </button>
                  </div>
                )}
              </motion.div>
            ))
          )}
          {!loading && (tab === 'my' ? leaves : pendingLeaves).length === 0 && (
            <div className="text-center py-12">
              <FileText size={40} className="mx-auto mb-2" style={{ color: 'var(--text-faint)' }} />
              <p style={{ color: 'var(--text-muted)' }}>No leaves found</p>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
