'use client';

import React, { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { ErpStore, FIXTURE_USERS } from '@/lib/db/erpStore';
import { Profile } from '@/lib/types/erp';
import { ChevronDown, LogOut, RefreshCw, Zap, Calendar, Clock, Menu } from 'lucide-react';

interface HeaderProps {
  onToggleSidebar?: () => void;
}

export function Header({ onToggleSidebar }: HeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const store = ErpStore.getInstance();

  const [isMounted, setIsMounted] = useState(false);
  const [currentUser, setCurrentUser] = useState<Profile>(store.getCurrentUser());
  const [users, setUsers] = useState<Profile[]>(store.getUsers());
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // Live date & time based on user device settings
  const [deviceDateTime, setDeviceDateTime] = useState<{
    dateStr: string;
    timeStr: string;
    fullDateStr: string;
  }>({
    dateStr: '',
    timeStr: '',
    fullDateStr: '',
  });

  useEffect(() => {
    setIsMounted(true);
    setCurrentUser(store.getCurrentUser());
    setUsers(store.getUsers());

    const updateDateTime = () => {
      const now = new Date();
      setDeviceDateTime({
        dateStr: now.toLocaleDateString(undefined, {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        }),
        timeStr: now.toLocaleTimeString(undefined, {
          hour: '2-digit',
          minute: '2-digit',
        }),
        fullDateStr: now.toLocaleDateString(undefined, {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        }),
      });
    };

    updateDateTime();
    const timer = setInterval(updateDateTime, 1000);

    const unsub = store.subscribe(() => {
      setCurrentUser(store.getCurrentUser());
      setUsers(store.getUsers());
    });
    return () => {
      clearInterval(timer);
      unsub();
    };
  }, [store]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('#user-switcher')) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleSwitchUser = (userId: string) => {
    store.setCurrentUser(userId);
    const selected = users.find((u) => u.id === userId);
    setDropdownOpen(false);
    if (!selected) return;

    if (selected.role === 'employee') {
      router.push('/employee/tasks');
    } else {
      router.push('/dashboard');
    }
  };

  const handleReset = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('knitnect_erp_state_v2');
      window.location.reload();
    }
  };

  const roleColors: Record<string, string> = {
    owner: 'role-owner',
    manager: 'role-manager',
    employee: 'role-employee',
  };

  const roleLabel: Record<string, string> = {
    owner: 'Owner',
    manager: 'Manager',
    employee: 'Employee',
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

        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg gradient-brand flex items-center justify-center shadow-lg flex-shrink-0">
            <Zap className="w-4 h-4 text-white" />
          </div>
          <div>
            <span className="font-bold text-sm text-white tracking-tight">KNITNECT</span>
            <span className="text-slate-500 text-xs ml-1.5 font-medium hidden sm:inline">Production ERP</span>
          </div>
        </div>

        {/* Live indicator */}
        <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-semibold text-emerald-400">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 status-dot-active" />
          LIVE
        </div>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Device Today's Date Display (Hidden on very small screens to make room for profile) */}
        {isMounted && deviceDateTime.dateStr && (
          <div
            className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900/80 border border-slate-700/60 text-slate-300 text-xs shadow-sm hover:border-slate-600 transition"
            title={`Today: ${deviceDateTime.fullDateStr} · ${deviceDateTime.timeStr} (System Device Settings)`}
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

        {/* Current user info + switcher */}
        {isMounted && (
          <div className="relative" id="user-switcher">
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg bg-slate-900/80 border border-slate-700/60 hover:border-slate-600/80 transition-all"
            >
              <div className="text-right hidden sm:block">
                <div className="text-xs font-semibold text-slate-200 leading-tight">{currentUser.full_name}</div>
                <div className="text-[10px] text-slate-500">{currentUser.email}</div>
              </div>
              <div className={`status-pill text-[10px] ${roleColors[currentUser.role] || 'role-employee'}`}>
                {roleLabel[currentUser.role] || currentUser.role}
              </div>
              <ChevronDown className={`w-3.5 h-3.5 text-slate-500 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {/* Dropdown */}
            {dropdownOpen && (
              <div className="absolute right-0 top-full mt-2 w-64 modal-panel shadow-2xl z-50 overflow-hidden animate-fadeInUp">
                <div className="px-3 py-2.5 border-b border-slate-800/60">
                  <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Switch Account</p>
                </div>
                <div className="p-1.5 space-y-0.5">
                  {users.map((user) => (
                    <button
                      key={user.id}
                      onClick={() => handleSwitchUser(user.id)}
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-left transition-all group ${
                        user.id === currentUser.id
                          ? 'bg-slate-800/80 border border-slate-700/50'
                          : 'hover:bg-slate-800/50'
                      }`}
                    >
                      <div>
                        <div className="text-xs font-semibold text-slate-200">{user.full_name}</div>
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          {user.email}
                        </div>
                      </div>
                      <div className={`status-pill text-[10px] ${roleColors[user.role] || 'role-employee'}`}>
                        {roleLabel[user.role] || user.role}
                      </div>
                    </button>
                  ))}
                </div>
                <div className="px-3 py-2.5 border-t border-slate-800/60">
                  <button
                    onClick={handleReset}
                    className="w-full flex items-center gap-2 text-xs text-slate-400 hover:text-slate-200 transition py-1"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Reset to Fixture State
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {!isMounted && (
          <div className="h-9 w-44 rounded-lg bg-slate-900/60 animate-pulse border border-slate-800" />
        )}
      </div>
    </header>
  );
}
