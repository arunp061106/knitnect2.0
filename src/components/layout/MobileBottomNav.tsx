'use client';

import React, { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  LayoutDashboard,
  GitBranch,
  CheckSquare,
  MessageSquare,
  Menu,
} from 'lucide-react';

interface MobileBottomNavProps {
  onOpenDrawer: () => void;
}

export function MobileBottomNav({ onOpenDrawer }: MobileBottomNavProps) {
  const pathname = usePathname();
  const router = useRouter();

  const [isMounted, setIsMounted] = useState(false);
  const [role, setRole] = useState<string>('employee');

  useEffect(() => {
    setIsMounted(true);
    const supabase = createClient();

    const loadRole = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();
      if (data?.role) setRole(data.role);
    };

    loadRole();

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event: unknown, session: any) => {
      if (session?.user) {
        const { data } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', session.user.id)
          .single();
        if (data?.role) setRole(data.role);
      } else {
        setRole('employee');
      }
    });

    return () => { listener.subscription.unsubscribe(); };
  }, []);

  if (!isMounted) return null;

  const isManagement = role === 'owner' || role === 'manager';

  const employeeTabs = [
    { label: 'Tasks', href: '/employee/tasks', icon: CheckSquare },
    { label: 'Pipeline', href: '/employee/pipeline', icon: GitBranch },
    { label: 'Chat', href: '/chat', icon: MessageSquare },
  ];

  const managementTabs = [
    { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { label: 'Pipeline', href: '/pipeline', icon: GitBranch },
    { label: 'Tasks', href: '/tasks', icon: CheckSquare },
    { label: 'Chat', href: '/chat', icon: MessageSquare },
  ];

  const tabs = isManagement ? managementTabs : employeeTabs;

  const isActive = (href: string) => {
    if (href === '/dashboard') return pathname === '/dashboard';
    return pathname?.startsWith(href);
  };

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#070b14]/95 backdrop-blur-xl border-t border-slate-800/80 px-2 py-1 shadow-2xl pb-[max(0.35rem,env(safe-area-inset-bottom))]"
      aria-label="Mobile Bottom Navigation"
    >
      <div className="flex items-center justify-around max-w-md mx-auto">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = isActive(tab.href);

          return (
            <button
              key={tab.href}
              type="button"
              onClick={() => router.push(tab.href)}
              className={`flex flex-col items-center justify-center py-1.5 px-3 rounded-xl transition-all relative min-w-[56px] ${
                active
                  ? 'text-blue-400 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <div
                className={`p-1 rounded-lg transition-transform ${
                  active ? 'bg-blue-500/15 scale-105' : ''
                }`}
              >
                <Icon className={`w-5 h-5 ${active ? 'text-blue-400' : 'text-slate-400'}`} />
              </div>
              <span className="text-[10px] mt-0.5 tracking-tight font-medium">
                {tab.label}
              </span>
              {active && (
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 absolute -bottom-0.5" />
              )}
            </button>
          );
        })}

        {/* More / Menu Drawer Toggle */}
        <button
          type="button"
          onClick={onOpenDrawer}
          className="flex flex-col items-center justify-center py-1.5 px-3 rounded-xl transition-all text-slate-400 hover:text-slate-200 min-w-[56px]"
          aria-label="Open navigation menu"
        >
          <div className="p-1 rounded-lg">
            <Menu className="w-5 h-5 text-slate-400" />
          </div>
          <span className="text-[10px] mt-0.5 tracking-tight font-medium">
            Menu
          </span>
        </button>
      </div>
    </nav>
  );
}
