'use client';

import React, { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ErpStore } from '@/lib/db/erpStore';
import { Profile } from '@/lib/types/erp';
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
  ClipboardList,
  ChevronRight,
  X,
  Zap,
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

// OWNER & MANAGER NAV — full access
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

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const store = ErpStore.getInstance();

  const [isMounted, setIsMounted] = useState(false);
  const [currentUser, setCurrentUser] = useState<Profile>(store.getCurrentUser());

  useEffect(() => {
    setIsMounted(true);
    setCurrentUser(store.getCurrentUser());
    const unsub = store.subscribe(() => {
      setCurrentUser(store.getCurrentUser());
    });
    return unsub;
  }, [store]);

  const isManagement = isMounted
    ? currentUser.role === 'owner' || currentUser.role === 'manager'
    : false;

  const navItems = isManagement ? managementNav : employeeNav;

  const isActive = (href: string) => {
    if (href === '/dashboard') return pathname === '/dashboard';
    return pathname?.startsWith(href);
  };

  const handleNavClick = (href: string) => {
    router.push(href);
    if (onClose) onClose();
  };

  const portalLabel = isMounted
    ? currentUser.role === 'owner'
      ? 'Executive Portal'
      : currentUser.role === 'manager'
      ? 'Management Portal'
      : 'Employee Portal'
    : 'Portal';

  const portalColor = isMounted
    ? currentUser.role === 'owner'
      ? 'text-violet-400'
      : currentUser.role === 'manager'
      ? 'text-cyan-400'
      : 'text-amber-400'
    : 'text-slate-500';

  return (
    <>
      {/* Desktop Persistent Sidebar */}
      <aside className="hidden md:flex w-[220px] bg-[#080c14] border-r border-slate-800/60 flex-col flex-shrink-0 min-h-[calc(100vh-3.5rem)] select-none">
        {/* Portal label */}
        <div className="px-4 pt-5 pb-3">
          <div className={`text-[10px] font-bold uppercase tracking-widest ${portalColor} flex items-center gap-1.5`}>
            <span className={`w-1.5 h-1.5 rounded-full ${
              isMounted
                ? currentUser.role === 'owner' ? 'bg-violet-400' : currentUser.role === 'manager' ? 'bg-cyan-400' : 'bg-amber-400'
                : 'bg-slate-500'
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
              <button
                key={item.href}
                type="button"
                onClick={() => router.push(item.href)}
                className={`nav-item w-full text-left ${active ? 'active' : ''}`}
              >
                <Icon className={`nav-icon w-4 h-4`} />
                <span className="truncate">{item.name}</span>
                {active && (
                  <ChevronRight className="w-3 h-3 ml-auto text-blue-400 flex-shrink-0" />
                )}
              </button>
            );
          })}
        </nav>

        {/* Footer info */}
        <div className="p-3 mt-auto">
          <div className="rounded-xl p-3 bg-slate-900/60 border border-slate-800/50">
            {isMounted && isManagement && (
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

            {isMounted && !isManagement && (
              <>
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">My Assignment</div>
                <div className="text-xs font-semibold text-slate-300">{currentUser.full_name}</div>
                <div className="text-[10px] text-slate-500 mt-0.5">{currentUser.department_name || 'Floor Operations'}</div>
                <div className="mt-2 px-2 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[10px] text-amber-300 font-medium">
                  Floor Operations Active
                </div>
              </>
            )}

            {!isMounted && (
              <div className="h-10 rounded bg-slate-800/60 animate-pulse" />
            )}
          </div>
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
                  isMounted
                    ? currentUser.role === 'owner' ? 'bg-violet-400' : currentUser.role === 'manager' ? 'bg-cyan-400' : 'bg-amber-400'
                    : 'bg-slate-500'
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
                  <button
                    key={item.href}
                    type="button"
                    onClick={() => handleNavClick(item.href)}
                    className={`nav-item w-full text-left py-2.5 px-3 rounded-lg flex items-center gap-3 ${active ? 'active bg-blue-600/15 text-blue-400' : 'text-slate-300 hover:bg-slate-800/60'}`}
                  >
                    <Icon className="nav-icon w-4 h-4 flex-shrink-0" />
                    <span className="truncate text-xs font-medium">{item.name}</span>
                    {active && (
                      <ChevronRight className="w-3.5 h-3.5 ml-auto text-blue-400 flex-shrink-0" />
                    )}
                  </button>
                );
              })}
            </nav>

            {/* Footer info */}
            <div className="p-3 border-t border-slate-800/80 mt-auto">
              <div className="rounded-xl p-3 bg-slate-900/60 border border-slate-800/50">
                {isMounted && isManagement && (
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
                {isMounted && !isManagement && (
                  <>
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">My Assignment</div>
                    <div className="text-xs font-semibold text-slate-300">{currentUser.full_name}</div>
                    <div className="text-[10px] text-slate-500 mt-0.5">{currentUser.department_name || 'Floor Operations'}</div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
