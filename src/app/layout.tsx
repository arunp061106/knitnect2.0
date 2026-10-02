import type { Metadata } from 'next';
import './globals.css';
import { Header } from '@/components/layout/Header';
import { Sidebar } from '@/components/layout/Sidebar';

export const metadata: Metadata = {
  title: 'KNITNECT — Garment Export/Import ERP',
  description: 'Production-grade ERP for garment export/import manufacturing, costing, production pipelines, loss tracking, and operations.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-[#0b0f19] text-slate-100 flex flex-col antialiased">
        <Header />
        <div className="flex flex-1">
          <Sidebar />
          <main className="flex-1 overflow-x-hidden p-6 max-w-full">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
