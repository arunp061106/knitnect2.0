'use client';

import React, { useState } from 'react';
import { usePathname } from 'next/navigation';
import { Header } from '@/components/layout/Header';
import { Sidebar } from '@/components/layout/Sidebar';
import { MobileBottomNav } from '@/components/layout/MobileBottomNav';

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Dedicated unauthenticated auth screen — no ERP sidebar or header
  if (pathname === '/login') {
    return (
      <div className="min-h-screen bg-[#0b0f19] text-slate-100 antialiased flex flex-col justify-center">
        {children}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0b0f19] text-slate-100 flex flex-col antialiased">
      <Header onToggleSidebar={() => setMobileMenuOpen(!mobileMenuOpen)} />
      <div className="flex flex-1 relative">
        <Sidebar isOpen={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} />
        <main className="flex-1 overflow-x-hidden p-3 sm:p-4 md:p-6 pb-20 md:pb-6 max-w-full min-w-0">
          {children}
        </main>
      </div>
      <MobileBottomNav onOpenDrawer={() => setMobileMenuOpen(true)} />
    </div>
  );
}
