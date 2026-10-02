'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    const role = typeof window !== 'undefined' ? localStorage.getItem('knitnect_user_role') : null;

    if (!role) {
      router.replace('/login');
    } else if (role === 'employee') {
      router.replace('/employee/tasks');
    } else {
      router.replace('/dashboard');
    }
  }, [router]);

  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 rounded-full border-2 border-blue-500/40 border-t-blue-500 animate-spin" />
        <p className="text-slate-500 text-sm">Loading Knitnect ERP...</p>
      </div>
    </div>
  );
}
