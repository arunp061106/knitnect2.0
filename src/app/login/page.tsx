'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ErpStore, FIXTURE_USERS } from '@/lib/db/erpStore';
import { ArrowRight, Zap, Shield } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const store = ErpStore.getInstance();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);

  const navigateByRole = (userId: string) => {
    store.setCurrentUser(userId);
    const user = store.getCurrentUser();
    if (user.role === 'employee') {
      router.push('/employee/tasks');
    } else {
      router.push('/dashboard');
    }
  };

  const handleQuickLogin = (userId: string) => {
    setLoading(userId);
    setTimeout(() => {
      navigateByRole(userId);
    }, 150);
  };

  const handleCustomLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const matched = FIXTURE_USERS.find(
      (u) => u.email.toLowerCase() === email.trim().toLowerCase()
    );
    if (matched) {
      navigateByRole(matched.id);
    } else {
      setError('Invalid credentials. Please use one of the portal accounts below.');
    }
  };

  const roleColors: Record<string, { bg: string; text: string; border: string; dot: string }> = {
    owner: { bg: 'bg-violet-500/10', text: 'text-violet-300', border: 'border-violet-500/25', dot: 'bg-violet-400' },
    manager: { bg: 'bg-cyan-500/10', text: 'text-cyan-300', border: 'border-cyan-500/25', dot: 'bg-cyan-400' },
    employee: { bg: 'bg-amber-500/10', text: 'text-amber-300', border: 'border-amber-500/25', dot: 'bg-amber-400' },
  };

  const roleLabels: Record<string, string> = {
    owner: 'Executive · Full Access',
    manager: 'Production Management',
    employee: 'Floor Operations Portal',
  };

  return (
    <div className="min-h-[85vh] flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6 animate-fadeInUp">
        {/* Brand header */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl gradient-brand shadow-xl shadow-blue-500/20 mb-1">
            <Zap className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">KNITNECT ERP</h1>
            <p className="text-sm text-slate-400 mt-1">Garment Production Operations</p>
          </div>
          <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-500">
            <Shield className="w-3.5 h-3.5 text-emerald-500" />
            Role-based access control enforced
          </div>
        </div>

        {/* Quick login section */}
        <div className="glass-card p-5 space-y-3">
          <div className="section-header">Select Portal</div>

          <div className="space-y-2">
            {FIXTURE_USERS.map((user) => {
              const c = roleColors[user.role] || roleColors.employee;
              const isLoading = loading === user.id;

              return (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => handleQuickLogin(user.id)}
                  disabled={!!loading}
                  className={`w-full p-3.5 rounded-xl border ${c.bg} ${c.border} hover:brightness-110 transition-all duration-150 flex items-center gap-3 group disabled:opacity-60`}
                >
                  {/* Avatar dot */}
                  <div className={`w-8 h-8 rounded-full ${c.bg} border ${c.border} flex items-center justify-center flex-shrink-0`}>
                    <span className={`w-2.5 h-2.5 rounded-full ${c.dot} ${isLoading ? 'animate-ping' : ''}`} />
                  </div>

                  <div className="flex-1 text-left min-w-0">
                    <div className={`text-sm font-semibold ${c.text}`}>{user.full_name}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">{roleLabels[user.role]}</div>
                    <div className="text-[10px] text-slate-600 font-mono mt-0.5">{user.email}</div>
                  </div>

                  <ArrowRight className={`w-4 h-4 flex-shrink-0 ${c.text} opacity-50 group-hover:opacity-100 transition-opacity ${isLoading ? 'animate-pulse' : ''}`} />
                </button>
              );
            })}
          </div>
        </div>

        {/* Divider */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-slate-800" />
          <span className="text-[10px] text-slate-600 uppercase font-mono tracking-wider">or email login</span>
          <div className="flex-1 h-px bg-slate-800" />
        </div>

        {/* Form login */}
        <div className="glass-card p-5">
          {error && (
            <div className="mb-4 px-3 py-2.5 rounded-xl bg-rose-500/10 border border-rose-500/25 text-xs text-rose-300">
              {error}
            </div>
          )}

          <form onSubmit={handleCustomLogin} className="space-y-3">
            <div>
              <label className="form-label">Company Email</label>
              <input
                type="email"
                required
                className="form-input"
                placeholder="owner@knitnect.com"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(null); }}
              />
            </div>
            <div>
              <label className="form-label">Password</label>
              <input
                type="password"
                className="form-input"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <button type="submit" className="btn btn-primary w-full mt-1 py-2.5">
              Sign In
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
