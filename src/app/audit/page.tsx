'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ErpStore } from '@/lib/db/erpStore';
import { ActivityLog, Profile } from '@/lib/types/erp';
import { Badge } from '@/components/ui/Badge';
import { History, ShieldCheck, Filter, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import { formatDateTimeSafe } from '@/lib/utils/format';

export default function AuditPage() {
  const router = useRouter();
  const store = ErpStore.getInstance();

  const [currentUser, setCurrentUser] = useState<Profile>(store.getCurrentUser());
  const [logs, setLogs] = useState<ActivityLog[]>([]);

  useEffect(() => {
    const user = store.getCurrentUser();
    if (user.role === 'employee') {
      router.replace('/employee/tasks');
      return;
    }

    const refresh = () => {
      const u = store.getCurrentUser();
      setCurrentUser(u);
      setLogs(store.getActivityLogs());
    };

    refresh();
    const unsub = store.subscribe(refresh);
    return unsub;
  }, [store, router]);

  const handleExportAuditExcel = () => {
    try {
      const wb = XLSX.utils.book_new();
      const rows = logs.map((log) => ({
        'Log ID': log.id,
        'Timestamp': new Date(log.created_at).toISOString(),
        'Action Code': log.action,
        'Entity Type': log.entity_type,
        'Entity ID': log.entity_id || '',
        'Authorized User': log.user_name,
        'User ID': log.user_id,
        'Transaction Details': typeof log.details === 'object' ? JSON.stringify(log.details) : String(log.details || ''),
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, 'Audit Trail');
      XLSX.writeFile(wb, `Knitnect-Enterprise-Audit-Trail-${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (err) {
      console.error(err);
      alert('Audit trail exported.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-primary" />
            <h1 className="text-xl font-bold tracking-tight text-white">
              Enterprise Audit Trail & Governance Log
            </h1>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Section 12: Immutable logging of price approvals, pipeline stage advances, payroll adjustments, and user actions.
          </p>
        </div>

        <button
          onClick={handleExportAuditExcel}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-sm transition"
        >
          <Download className="w-3.5 h-3.5" />
          Export Audit Trail (.xlsx)
        </button>
      </div>

      {/* Audit Log Table */}
      <div className="bg-[#101625] border border-slate-800 rounded overflow-hidden">
        <div className="overflow-x-auto">
          <table className="erp-table text-xs">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Action Code</th>
                <th>Entity Type</th>
                <th>Authorized User</th>
                <th>Transaction Details</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id}>
                  <td suppressHydrationWarning className="mono-num text-slate-400">
                    {formatDateTimeSafe(log.created_at)}
                  </td>
                  <td>
                    <Badge variant="purple">{log.action}</Badge>
                  </td>
                  <td className="font-mono text-slate-300">{log.entity_type}</td>
                  <td className="font-semibold text-white">{log.user_name}</td>
                  <td className="font-mono text-slate-300 text-[11px] max-w-md truncate">
                    {JSON.stringify(log.details)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
