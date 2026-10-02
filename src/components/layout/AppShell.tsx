'use client';

import React, { useState } from 'react';
import { Header } from '@/components/layout/Header';
import { Sidebar } from '@/components/layout/Sidebar';

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#0b0f19] text-slate-100 flex flex-col antialiased">
      <Header onToggleSidebar={() => setMobileMenuOpen(!mobileMenuOpen)} />
      <div className="flex flex-1 relative">
        <Sidebar isOpen={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} />
        <main className="flex-1 overflow-x-hidden p-3 sm:p-4 md:p-6 max-w-full min-w-0">
          {children}
        </main>
      </div>
    </div>
  );
}
