'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  ArrowRight,
  Zap,
  Shield,
  Lock,
  Mail,
  UserCheck,
  Building2,
  Cpu,
  Layers,
  LogOut,
} from 'lucide-react';

interface AccountOption {
  email: string;
  full_name: string;
  role: 'owner' | 'manager' | 'employee';
  portalTitle: string;
  badge: string;
  description: string;
  features: string[];
}

const POSITIONS: AccountOption[] = [
  {
    email: 'owner@knitnect.com',
    full_name: 'R. Senthil Kumar',
    role: 'owner',
    portalTitle: 'Executive Portal (Owner)',
    badge: 'Full Access',
    description: 'Total strategic control across costing, finances, payroll, production, and audit logs.',
    features: ['All 10 ERP Modules', 'Live Profitability & Costing', 'Payroll & Disbursements', 'Audit Trail'],
  },
  {
    email: 'manager@knitnect.com',
    full_name: 'K. Vignesh',
    role: 'manager',
    portalTitle: 'Management Portal (Manager)',
    badge: 'Production & Ops',
    description: 'Factory floor oversight, 15-stage pipeline management, dispatch, and department tasking.',
    features: ['15-Stage Pipeline Tracking', 'Task Delegation', 'Dispatch & Shipping', 'Operations Chat'],
  },
  {
    email: 'employee@knitnect.com',
    full_name: 'M. Murugan',
    role: 'employee',
    portalTitle: 'Employee Portal (Floor Ops)',
    badge: 'Cutting Master',
    description: 'Isolated floor workspace dedicated to assigned department tasks, stage logs, and team chat.',
    features: ['Assigned Floor Tasks', 'Stage Progress Logging', 'Team Operations Chat'],
  },
];

const DEMO_PASSWORD = 'Knitnect2026!';

const roleStyles = {
  owner: {
    bg: 'bg-violet-950/20 hover:bg-violet-950/40',
    border: 'border-violet-500/30 hover:border-violet-500/60',
    badge: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
    accent: 'text-violet-400',
    dot: 'bg-violet-400',
  },
  manager: {
    bg: 'bg-cyan-950/20 hover:bg-cyan-950/40',
    border: 'border-cyan-500/30 hover:border-cyan-500/60',
    badge: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
    accent: 'text-cyan-400',
    dot: 'bg-cyan-400',
  },
  employee: {
    bg: 'bg-amber-950/20 hover:bg-amber-950/40',
    border: 'border-amber-500/30 hover:border-amber-500/60',
    badge: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    accent: 'text-amber-400',
    dot: 'bg-amber-400',
  },
};

export default function LoginPage() {
  const router = useRouter();

  const [activeUser, setActiveUser] = useState<{
    id: string;
    full_name: string;
    role: string;
    email: string;
  } | null>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);

  // Check if currently authenticated on mount
  useEffect(() => {
    const checkActiveSession = async () => {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('id, full_name, role, email')
            .eq('id', user.id)
            .single();

          if (profile) setActiveUser(profile);
        }
      } catch {
        // ignore
      }
    };
    checkActiveSession();
  }, []);

  const signInAs = async (targetEmail: string, targetPass: string, key: string) => {
    setLoading(key);
    setError(null);

    try {
      const supabase = createClient();

      // Sign out existing session first to ensure completely clean role credentials
      await supabase.auth.signOut();

      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: targetEmail,
        password: targetPass,
      });

      if (authError || !data.user) {
        throw new Error(authError?.message || 'Authentication failed. Please verify credentials.');
      }

      // Fetch profile role directly to determine destination
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', data.user.id)
        .single();

      const role = profile?.role ?? 'employee';

      // Full window navigation forces fresh memory state and eliminates stale session cookies
      window.location.href = role === 'employee' ? '/employee/tasks' : '/dashboard';
    } catch (err: any) {
      console.error('[login]', err);
      setError(err?.message || 'Sign in error occurred.');
      setLoading(null);
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please provide email and password.');
      return;
    }
    signInAs(email, password, 'manual');
  };

  const handleSignOutActive = async () => {
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      setActiveUser(null);
    } catch {
      setActiveUser(null);
    }
  };

  return (
    <div className="min-h-screen py-10 px-4 flex items-center justify-center">
      <div className="w-full max-w-2xl space-y-6 animate-fadeInUp">

        {/* Brand Banner */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl gradient-brand shadow-xl shadow-blue-500/20 mb-1">
            <Zap className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            KNITNECT Production ERP
          </h1>
          <p className="text-xs sm:text-sm text-slate-400">
            Garment Export/Import Manufacturing &amp; Production Management System
          </p>
          <div className="flex items-center justify-center gap-2 text-[11px] text-slate-500">
            <Shield className="w-3.5 h-3.5 text-emerald-400" />
            <span>Supabase Auth &amp; PostgreSQL Row-Level Security Active</span>
          </div>
        </div>

        {/* Active Session Notice (if user was already logged in) */}
        {activeUser && (
          <div className="p-4 rounded-xl bg-slate-900/90 border border-blue-500/30 shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-blue-500/10 border border-blue-500/30 flex items-center justify-center">
                <UserCheck className="w-4 h-4 text-blue-400" />
              </div>
              <div>
                <p className="text-xs text-slate-400">Currently logged in as:</p>
                <p className="text-sm font-semibold text-white">
                  {activeUser.full_name}{' '}
                  <span className="text-xs font-mono text-blue-400">({activeUser.role.toUpperCase()})</span>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  window.location.href = activeUser.role === 'employee' ? '/employee/tasks' : '/dashboard';
                }}
                className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow transition"
              >
                Enter Portal
              </button>
              <button
                type="button"
                onClick={handleSignOutActive}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700 transition"
              >
                Sign Out
              </button>
            </div>
          </div>
        )}

        {/* Position Selection Cards */}
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Select Your Portal Position
            </h2>
            <span className="text-[11px] text-slate-500 font-mono">1-click instant access</span>
          </div>

          <div className="grid grid-cols-1 gap-3">
            {POSITIONS.map((pos) => {
              const styles = roleStyles[pos.role];
              const isLoading = loading === pos.email;

              return (
                <div
                  key={pos.email}
                  className={`p-4 rounded-xl border ${styles.bg} ${styles.border} transition-all duration-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-md group`}
                >
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${styles.dot} ${isLoading ? 'animate-ping' : ''}`} />
                      <span className="text-sm font-bold text-white tracking-tight">{pos.portalTitle}</span>
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border ${styles.badge}`}>
                        {pos.badge}
                      </span>
                    </div>

                    <div className="text-xs text-slate-300">
                      <span className="font-semibold text-slate-200">{pos.full_name}</span> &middot;{' '}
                      <span className="text-slate-400 font-mono text-[11px]">{pos.email}</span>
                    </div>

                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      {pos.description}
                    </p>

                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {pos.features.map((feat) => (
                        <span
                          key={feat}
                          className="px-2 py-0.5 rounded bg-slate-900/80 border border-slate-800 text-[10px] text-slate-400 font-medium"
                        >
                          {feat}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="sm:self-center flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => signInAs(pos.email, DEMO_PASSWORD, pos.email)}
                      disabled={!!loading}
                      className="w-full sm:w-auto px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-xs font-semibold shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2 transition disabled:opacity-50"
                    >
                      {isLoading ? (
                        <>
                          <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                          <span>Entering...</span>
                        </>
                      ) : (
                        <>
                          <span>Enter as {pos.role.toUpperCase()}</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Divider */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-slate-800" />
          <span className="text-[10px] text-slate-500 uppercase font-mono tracking-wider">or sign in with custom credentials</span>
          <div className="flex-1 h-px bg-slate-800" />
        </div>

        {/* Manual Credentials Login Form */}
        <div className="glass-card p-5 rounded-xl border border-slate-800/80">
          {error && (
            <div className="mb-4 px-3 py-2.5 rounded-xl bg-rose-500/10 border border-rose-500/25 text-xs text-rose-300">
              {error}
            </div>
          )}

          <form onSubmit={handleManualSubmit} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="form-label flex items-center gap-1.5 text-xs text-slate-400 mb-1">
                  <Mail className="w-3.5 h-3.5 text-slate-400" /> Company Email
                </label>
                <input
                  type="email"
                  required
                  className="form-input text-xs"
                  placeholder="owner@knitnect.com"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setError(null); }}
                />
              </div>
              <div>
                <label className="form-label flex items-center gap-1.5 text-xs text-slate-400 mb-1">
                  <Lock className="w-3.5 h-3.5 text-slate-400" /> Password
                </label>
                <input
                  type="password"
                  required
                  className="form-input text-xs"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={!!loading}
              className="btn btn-primary w-full py-2.5 flex items-center justify-center gap-2 text-xs font-semibold"
            >
              {loading === 'manual' ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  <span>Authenticating...</span>
                </>
              ) : (
                'Sign In With Email'
              )}
            </button>
          </form>
        </div>

      </div>
    </div>
  );
}
