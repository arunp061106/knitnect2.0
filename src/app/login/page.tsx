'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { ArrowRight, Zap, Shield, Lock, Mail } from 'lucide-react';

// Static display-only fixture metadata (no salaries, no business data in client)
const DEMO_ACCOUNTS = [
  {
    email: 'owner@knitnect.com',
    full_name: 'R. Senthil Kumar',
    role: 'owner',
    label: 'Executive · Full Access',
  },
  {
    email: 'manager@knitnect.com',
    full_name: 'K. Vignesh',
    role: 'manager',
    label: 'Production Management',
  },
  {
    email: 'employee@knitnect.com',
    full_name: 'M. Murugan',
    role: 'employee',
    label: 'Floor Operations Portal',
  },
] as const;

const DEMO_PASSWORD = 'Knitnect2026!';

const roleColors: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  owner: { bg: 'bg-violet-500/10', text: 'text-violet-300', border: 'border-violet-500/25', dot: 'bg-violet-400' },
  manager: { bg: 'bg-cyan-500/10', text: 'text-cyan-300', border: 'border-cyan-500/25', dot: 'bg-cyan-400' },
  employee: { bg: 'bg-amber-500/10', text: 'text-amber-300', border: 'border-amber-500/25', dot: 'bg-amber-400' },
};

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);

  const signIn = async (loginEmail: string, loginPass: string, loadingKey: string) => {
    setLoading(loadingKey);
    setError(null);

    try {
      const supabase = createClient();
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password: loginPass,
      });

      if (authError || !data.user) {
        throw new Error(authError?.message || 'Authentication failed. Check credentials.');
      }

      // Read role from public.profiles via RLS — employee sees only own row
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', data.user.id)
        .single();

      const role = profile?.role ?? 'employee';
      router.replace(role === 'employee' ? '/employee/tasks' : '/dashboard');
    } catch (err: any) {
      console.error('[login]', err);
      setError(err?.message || 'Login error occurred.');
    } finally {
      setLoading(null);
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please enter both email and password.');
      return;
    }
    signIn(email, password, 'form');
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
            <p className="text-sm text-slate-400 mt-1">Garment Export Production Platform</p>
          </div>
          <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-500">
            <Shield className="w-3.5 h-3.5 text-emerald-500" />
            Supabase Auth &amp; Postgres RLS Active
          </div>
        </div>

        {/* Quick login section */}
        <div className="glass-card p-5 space-y-3">
          <div className="section-header flex items-center justify-between">
            <span>Instant Portal Sign-In</span>
            <span className="text-[10px] text-slate-500 font-mono">demo accounts</span>
          </div>

          <div className="space-y-2">
            {DEMO_ACCOUNTS.map((account) => {
              const c = roleColors[account.role];
              const isLoading = loading === account.email;
              return (
                <button
                  key={account.email}
                  type="button"
                  onClick={() => signIn(account.email, DEMO_PASSWORD, account.email)}
                  disabled={!!loading}
                  className={`w-full p-3.5 rounded-xl border ${c.bg} ${c.border} hover:brightness-110 transition-all duration-150 flex items-center gap-3 group disabled:opacity-60 text-left`}
                >
                  <div className={`w-8 h-8 rounded-full ${c.bg} border ${c.border} flex items-center justify-center flex-shrink-0`}>
                    <span className={`w-2.5 h-2.5 rounded-full ${c.dot} ${isLoading ? 'animate-ping' : ''}`} />
                  </div>
                  <div className="flex-1 text-left min-w-0">
                    <div className={`text-sm font-semibold ${c.text}`}>{account.full_name}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">{account.label}</div>
                    <div className="text-[10px] text-slate-600 font-mono mt-0.5">{account.email}</div>
                  </div>
                  <ArrowRight
                    className={`w-4 h-4 flex-shrink-0 ${c.text} opacity-50 group-hover:opacity-100 transition-opacity ${isLoading ? 'animate-pulse' : ''}`}
                  />
                </button>
              );
            })}
          </div>
        </div>

        {/* Divider */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-slate-800" />
          <span className="text-[10px] text-slate-600 uppercase font-mono tracking-wider">or email + password</span>
          <div className="flex-1 h-px bg-slate-800" />
        </div>

        {/* Form login */}
        <div className="glass-card p-5">
          {error && (
            <div className="mb-4 px-3 py-2.5 rounded-xl bg-rose-500/10 border border-rose-500/25 text-xs text-rose-300">
              {error}
            </div>
          )}

          <form onSubmit={handleFormSubmit} className="space-y-3">
            <div>
              <label className="form-label flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-slate-400" /> Company Email
              </label>
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
              <label className="form-label flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-slate-400" /> Password
              </label>
              <input
                type="password"
                required
                className="form-input"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <button
              type="submit"
              disabled={!!loading}
              className="btn btn-primary w-full mt-1 py-2.5 flex items-center justify-center gap-2"
            >
              {loading === 'form' ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  <span>Authenticating...</span>
                </>
              ) : (
                'Sign In'
              )}
            </button>
          </form>
        </div>

      </div>
    </div>
  );
}
