'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  LogOut,
  Zap,
  Calendar,
  Clock,
  Menu,
  Shield,
  ChevronDown,
  UserCheck,
  LogIn,
} from 'lucide-react';

interface HeaderProps {
  onToggleSidebar?: () => void;
}

interface SessionProfile {
  id: string;
  full_name: string;
  email: string;
  role: string;
}

const roleColors: Record<string, string> = {
  owner: 'role-owner',
  manager: 'role-manager',
  employee: 'role-employee',
};

const roleLabel: Record<string, string> = {
  owner: 'Executive (Owner)',
  manager: 'Manager',
  employee: 'Floor Employee',
};

export function Header({ onToggleSidebar }: HeaderProps) {
  const router = useRouter();

  const [isMounted, setIsMounted] = useState(false);
  const [profile, setProfile] = useState<SessionProfile | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const [deviceDateTime, setDeviceDateTime] = useState<{
    dateStr: string;
    timeStr: string;
    fullDateStr: string;
  }>({ dateStr: '', timeStr: '', fullDateStr: '' });

  // Load authenticated profile once on mount, then listen for auth changes
  useEffect(() => {
    setIsMounted(true);
    const supabase = createClient();

    const loadProfile = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setProfile(null);
          setAuthChecked(true);
          return;
        }

        const { data } = await supabase
          .from('profiles')
          .select('id, full_name, email, role')
          .eq('id', user.id)
          .single();

        if (data) setProfile(data);
      } catch {
        setProfile(null);
      } finally {
        setAuthChecked(true);
      }
    };

    loadProfile();

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event: unknown, session: any) => {
      if (session?.user) {
        try {
          const { data } = await supabase
            .from('profiles')
            .select('id, full_name, email, role')
            .eq('id', session.user.id)
            .single();
          if (data) setProfile(data);
        } catch {
          // ignore
        }
      } else {
        setProfile(null);
      }
      setAuthChecked(true);
    });

    return () => { listener.subscription.unsubscribe(); };
  }, []);

  // Live clock
  useEffect(() => {
    const update = () => {
      const now = new Date();
      setDeviceDateTime({
        dateStr: now.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }),
        timeStr: now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
        fullDateStr: now.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
      });
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('#user-menu')) setDropdownOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSignOut = async () => {
    setIsSigningOut(true);
    setDropdownOpen(false);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      window.location.href = '/login';
    } catch {
      window.location.href = '/login';
    } finally {
      setIsSigningOut(false);
    }
  };

  return (
    <header className="h-14 border-b border-slate-800/80 bg-[#080c14]/90 backdrop-blur-md px-3 sm:px-5 flex items-center justify-between sticky top-0 z-40">
      {/* Brand & Mobile Hamburger */}
      <div className="flex items-center gap-2 sm:gap-3">
        {onToggleSidebar && (
          <button
            type="button"
            onClick={onToggleSidebar}
            className="md:hidden p-1.5 -ml-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
            aria-label="Toggle navigation drawer"
          >
            <Menu className="w-5 h-5 text-slate-300" />
          </button>
        )}

        <Link href="/" className="flex items-center gap-2 hover:opacity-90 transition">
          <div className="w-7 h-7 rounded-lg gradient-brand flex items-center justify-center shadow-lg flex-shrink-0">
            <Zap className="w-4 h-4 text-white" />
          </div>
          <div>
            <span className="font-bold text-sm text-white tracking-tight">KNITNECT</span>
            <span className="text-slate-500 text-xs ml-1.5 font-medium hidden sm:inline">Production ERP</span>
          </div>
        </Link>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Date/time */}
        {isMounted && deviceDateTime.dateStr && (
          <div
            className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900/80 border border-slate-700/60 text-slate-300 text-xs shadow-sm hover:border-slate-600 transition"
            title={`Today: ${deviceDateTime.fullDateStr} · ${deviceDateTime.timeStr}`}
          >
            <Calendar className="w-3.5 h-3.5 text-sky-400 flex-shrink-0" />
            <span className="font-medium text-slate-200">{deviceDateTime.dateStr}</span>
            <span className="text-slate-600">&bull;</span>
            <span className="flex items-center gap-1 font-mono text-slate-400 text-[11px]">
              <Clock className="w-3 h-3 text-slate-500" />
              {deviceDateTime.timeStr}
            </span>
          </div>
        )}

        {/* User menu or Sign In button */}
        {isMounted && profile ? (
          <div className="flex items-center gap-2">
            {/* Quick Switch Role button */}
            <button
              type="button"
              onClick={handleSignOut}
              disabled={isSigningOut}
              title="Switch between Executive, Manager, and Floor Employee"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/60 text-slate-300 hover:text-white text-xs transition"
            >
              <LogOut className="w-3.5 h-3.5 text-rose-400" />
              <span className="hidden sm:inline font-medium">Switch Role</span>
            </button>

            {/* User Dropdown */}
            <div className="relative" id="user-menu">
              <button
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="flex items-center gap-2 px-2.5 sm:px-3 py-1.5 rounded-lg bg-slate-900/80 border border-slate-700/60 hover:border-slate-600/80 transition-all text-left"
              >
                <div className="text-right hidden sm:block">
                  <div className="text-xs font-semibold text-slate-200 leading-tight">{profile.full_name}</div>
                  <div className="text-[10px] text-slate-500 font-mono">{profile.email}</div>
                </div>
                <div className={`status-pill text-[10px] ${roleColors[profile.role] || 'role-employee'}`}>
                  {roleLabel[profile.role] || profile.role}
                </div>
                <ChevronDown className={`w-3.5 h-3.5 text-slate-500 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {dropdownOpen && (
                <div className="absolute right-0 top-full mt-2 w-64 modal-panel shadow-2xl z-50 overflow-hidden animate-fadeInUp">
                  <div className="px-3.5 py-3 border-b border-slate-800/80 bg-slate-900/50">
                    <div className="flex items-center gap-2 mb-1">
                      <Shield className="w-3.5 h-3.5 text-blue-400" />
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-300">
                        Active Supabase Session
                      </span>
                    </div>
                    <p className="text-xs font-semibold text-white truncate">{profile.full_name}</p>
                    <p className="text-[11px] text-slate-400 font-mono truncate">{profile.email}</p>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-[10px] text-slate-500 uppercase">Current Position</span>
                      <span className={`status-pill text-[10px] ${roleColors[profile.role] || 'role-employee'}`}>
                        {roleLabel[profile.role] || profile.role}
                      </span>
                    </div>
                  </div>

                  <div className="p-2 space-y-1">
                    <button
                      onClick={handleSignOut}
                      disabled={isSigningOut}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-rose-300 hover:text-rose-200 hover:bg-rose-500/10 transition text-left disabled:opacity-50"
                    >
                      <LogOut className="w-3.5 h-3.5 text-rose-400" />
                      <span>{isSigningOut ? 'Signing out...' : 'Switch Role / Sign Out'}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : isMounted && authChecked ? (
          <Link
            href="/login"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-md transition"
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>Select Position / Login</span>
          </Link>
        ) : (
          <div className="h-9 w-32 rounded-lg bg-slate-900/60 animate-pulse border border-slate-800" />
        )}
      </div>
    </header>
  );
}
