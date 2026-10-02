'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  LayoutDashboard,
  Layers,
  GitBranch,
  Building2,
  CheckSquare,
  MessageSquare,
  Truck,
  CreditCard,
  Wallet,
  History,
  ChevronRight,
  X,
  Zap,
  LogOut,
} from 'lucide-react';

interface NavItem {
  name: string;
  href: string;
  icon: React.ElementType;
  description?: string;
}

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

// OWNER & MANAGER NAV — full access (10 modules)
const managementNav: NavItem[] = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Styles & Costing', href: '/styles', icon: Layers },
  { name: 'Production Pipeline', href: '/pipeline', icon: GitBranch },
  { name: 'Departments', href: '/departments', icon: Building2 },
  { name: 'Task Board', href: '/tasks', icon: CheckSquare },
  { name: 'Team Chat', href: '/chat', icon: MessageSquare },
  { name: 'Dispatch & Logistics', href: '/dispatch', icon: Truck },
  { name: 'Payments & Banking', href: '/payments', icon: CreditCard },
  { name: 'Payroll & HR', href: '/payroll', icon: Wallet },
  { name: 'Audit Trail', href: '/audit', icon: History },
];

// EMPLOYEE NAV — strictly limited, isolated routes under /employee/*
const employeeNav: NavItem[] = [
  { name: 'My Tasks', href: '/employee/tasks', icon: CheckSquare, description: 'Your assigned work' },
  { name: 'My Pipeline', href: '/employee/pipeline', icon: GitBranch, description: 'Stage completion status' },
  { name: 'Team Chat', href: '/chat', icon: MessageSquare, description: 'Team communication' },
];

interface SidebarProfile {
  full_name: string;
  role: string;
  department_id: string | null;
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  const [isMounted, setIsMounted] = useState(false);
  const [currentUser, setCurrentUser] = useState<SidebarProfile | null>(null);

  useEffect(() => {
    setIsMounted(true);
    const savedRole = localStorage.getItem('knitnect_user_role') || 'owner';
    const savedName = localStorage.getItem('knitnect_user_name') || 'Authenticated User';
    setCurrentUser({
      full_name: savedName,
      role: savedRole,
      department_id: null,
    });
    const supabase = createClient();

    const loadProfile = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setCurrentUser(null);
          return;
        }
        const { data } = await supabase
          .from('profiles')
          .select('full_name, role, department_id')
          .eq('id', user.id)
          .single();
        if (data) {
          setCurrentUser(data);
          if (typeof window !== 'undefined') {
            localStorage.setItem('knitnect_user_role', data.role);
            localStorage.setItem('knitnect_user_name', data.full_name);
          }
        }
      } catch {
        // preserve local cache
      }
    };

    loadProfile();

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event: unknown, session: any) => {
      if (session?.user) {
        try {
          const { data } = await supabase
            .from('profiles')
            .select('full_name, role, department_id')
            .eq('id', session.user.id)
            .single();
          if (data) {
            setCurrentUser(data);
            if (typeof window !== 'undefined') {
              localStorage.setItem('knitnect_user_role', data.role);
              localStorage.setItem('knitnect_user_name', data.full_name);
            }
          }
        } catch {
          // ignore
        }
      } else {
        setCurrentUser(null);
        if (typeof window !== 'undefined') {
          localStorage.removeItem('knitnect_user_role');
          localStorage.removeItem('knitnect_user_name');
        }
      }
    });

    return () => { listener.subscription.unsubscribe(); };
  }, []);

  const role = currentUser?.role || (typeof window !== 'undefined' ? localStorage.getItem('knitnect_user_role') : null) || 'owner';
  const isManagement = role === 'owner' || role === 'manager';
  const navItems = isManagement ? managementNav : employeeNav;

  const isActive = (href: string) => {
    if (href === '/dashboard') return pathname === '/dashboard';
    return pathname?.startsWith(href);
  };

  const portalLabel = isManagement
    ? role === 'owner'
      ? 'Executive Portal'
      : 'Management Portal'
    : 'Employee Portal';

  const portalColor = isManagement
    ? role === 'owner'
      ? 'text-violet-400'
      : 'text-cyan-400'
    : 'text-amber-400';

  const handleSwitchRole = async () => {
    try {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('knitnect_user_role');
        localStorage.removeItem('knitnect_user_name');
      }
      const supabase = createClient();
      await supabase.auth.signOut();
      window.location.href = '/login';
    } catch {
      window.location.href = '/login';
    }
  };

  if (!isMounted) {
    return (
      <aside className="hidden md:flex w-[220px] bg-[#080c14] border-r border-slate-800/60 flex-col flex-shrink-0 min-h-[calc(100vh-3.5rem)] select-none">
        <div className="px-4 pt-5 pb-3">
          <div className="h-3 w-28 rounded bg-slate-800/60 animate-pulse" />
        </div>
        <div className="flex-1 px-2 space-y-2">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-9 rounded-lg bg-slate-900/40 animate-pulse" />
          ))}
        </div>
      </aside>
    );
  }

  return (
    <>
      {/* Desktop Persistent Sidebar */}
      <aside className="hidden md:flex w-[220px] bg-[#080c14] border-r border-slate-800/60 flex-col flex-shrink-0 min-h-[calc(100vh-3.5rem)] select-none">
        {/* Portal label */}
        <div className="px-4 pt-5 pb-3">
          <div className={`text-[10px] font-bold uppercase tracking-widest ${portalColor} flex items-center gap-1.5`}>
            <span className={`w-1.5 h-1.5 rounded-full ${
              role === 'owner' ? 'bg-violet-400' : role === 'manager' ? 'bg-cyan-400' : 'bg-amber-400'
            }`} />
            {portalLabel}
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-2 space-y-0.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`nav-item w-full text-left flex items-center ${active ? 'active' : ''}`}
              >
                <Icon className={`nav-icon w-4 h-4`} />
                <span className="truncate">{item.name}</span>
                {active && (
                  <ChevronRight className="w-3 h-3 ml-auto text-blue-400 flex-shrink-0" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Footer info & Switch Role button */}
        <div className="p-3 mt-auto space-y-2">
          <div className="rounded-xl p-3 bg-slate-900/60 border border-slate-800/50">
            {isManagement && (
              <>
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Active Order</div>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs font-semibold text-slate-200 font-mono">Offer 9414</div>
                    <div className="text-[10px] text-slate-500 mt-0.5">W28 · KB13P301X1</div>
                  </div>
                  <div className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/25 text-[10px] font-bold text-emerald-400">
                    ACTIVE
                  </div>
                </div>
              </>
            )}

            {!isManagement && currentUser && (
              <>
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">My Assignment</div>
                <div className="text-xs font-semibold text-slate-300">{currentUser.full_name}</div>
                <div className="text-[10px] text-slate-500 mt-0.5">Floor Operations</div>
                <div className="mt-2 px-2 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[10px] text-amber-300 font-medium">
                  Floor Operations Active
                </div>
              </>
            )}

            {!isMounted && !currentUser && (
              <div className="h-10 rounded bg-slate-800/60 animate-pulse" />
            )}
          </div>

          <button
            type="button"
            onClick={handleSwitchRole}
            className="w-full flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-300 hover:text-rose-200 text-xs font-medium transition"
          >
            <LogOut className="w-3.5 h-3.5 text-rose-400" />
            <span>Switch Role / Logout</span>
          </button>
        </div>
      </aside>

      {/* Mobile Slide-Over Drawer */}
      {isOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex animate-fadeIn">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/75 backdrop-blur-sm transition-opacity"
            onClick={onClose}
          />

          {/* Drawer Panel */}
          <div className="relative w-72 max-w-[85vw] bg-[#080c14] border-r border-slate-800 flex flex-col h-full z-10 shadow-2xl p-0 animate-slideRight">
            <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-800/80">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg gradient-brand flex items-center justify-center">
                  <Zap className="w-3.5 h-3.5 text-white" />
                </div>
                <span className="font-bold text-sm text-white">KNITNECT</span>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
                aria-label="Close menu"
              >
                <X className="w-5 h-5 text-slate-300" />
              </button>
            </div>

            {/* Portal label */}
            <div className="px-4 pt-4 pb-2">
              <div className={`text-[10px] font-bold uppercase tracking-widest ${portalColor} flex items-center gap-1.5`}>
                <span className={`w-1.5 h-1.5 rounded-full ${
                  role === 'owner' ? 'bg-violet-400' : role === 'manager' ? 'bg-cyan-400' : 'bg-amber-400'
                }`} />
                {portalLabel}
              </div>
            </div>

            {/* Navigation */}
            <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onClose}
                    className={`nav-item w-full text-left py-2.5 px-3 rounded-lg flex items-center gap-3 ${active ? 'active bg-blue-600/15 text-blue-400' : 'text-slate-300 hover:bg-slate-800/60'}`}
                  >
                    <Icon className="nav-icon w-4 h-4 flex-shrink-0" />
                    <span className="truncate text-xs font-medium">{item.name}</span>
                    {active && (
                      <ChevronRight className="w-3.5 h-3.5 ml-auto text-blue-400 flex-shrink-0" />
                    )}
                  </Link>
                );
              })}
            </nav>

            {/* Footer info & Switch Role */}
            <div className="p-3 border-t border-slate-800/80 mt-auto space-y-2">
              <div className="rounded-xl p-3 bg-slate-900/60 border border-slate-800/50">
                {isManagement && (
                  <>
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Active Order</div>
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-xs font-semibold text-slate-200 font-mono">Offer 9414</div>
                        <div className="text-[10px] text-slate-500 mt-0.5">W28 · KB13P301X1</div>
                      </div>
                      <div className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/25 text-[10px] font-bold text-emerald-400">
                        ACTIVE
                      </div>
                    </div>
                  </>
                )}
                {!isManagement && currentUser && (
                  <>
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">My Assignment</div>
                    <div className="text-xs font-semibold text-slate-300">{currentUser.full_name}</div>
                    <div className="text-[10px] text-slate-500 mt-0.5">Floor Operations</div>
                  </>
                )}
              </div>

              <button
                type="button"
                onClick={handleSwitchRole}
                className="w-full flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-300 hover:text-rose-200 text-xs font-medium transition"
              >
                <LogOut className="w-3.5 h-3.5 text-rose-400" />
                <span>Switch Role / Logout</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
