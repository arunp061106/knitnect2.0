'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Badge } from '@/components/ui/Badge';
import { History, Download } from 'lucide-react';
import { exportToExcel } from '@/lib/excel/excelExport';
import { formatDateTimeSafe } from '@/lib/utils/format';

interface AuditLogRow {
  id: string;
  created_at: string;
  action: string;
  table_name: string;
  record_id: string | null;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  notes: string | null;
  user_id: string | null;
  // joined
  user_name?: string;
}

export default function AuditPage() {
  const router = useRouter();
  const [logs, setLogs] = useState<AuditLogRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();

      // Role guard
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace('/login'); return; }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      if (profile?.role === 'employee') { router.replace('/employee/tasks'); return; }

      // Fetch audit logs — RLS enforces management-only
      const { data: rows, error } = await supabase
        .from('audit_log')
        .select('id, created_at, action, table_name, record_id, old_data, new_data, notes, user_id')
        .order('created_at', { ascending: false })
        .limit(500);

      if (error) { console.error('[audit] fetch error', error); setLoading(false); return; }

      // Resolve user names in one batch query
      const userIds = Array.from(new Set((rows ?? []).map((r: any) => r.user_id).filter(Boolean))) as string[];
      let nameMap: Record<string, string> = {};
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', userIds);
        nameMap = Object.fromEntries((profiles ?? []).map((p: any) => [p.id, p.full_name]));
      }

      setLogs(
        (rows ?? []).map((r: any) => ({
          ...r,
          user_name: r.user_id ? (nameMap[r.user_id] ?? r.user_id.slice(0, 8)) : 'System',
        }))
      );
      setLoading(false);
    };

    load();
  }, [router]);

  const handleExportAuditExcel = () => {
    try {
      const rows = logs.map((log) => ({
        log_id: log.id,
        timestamp: new Date(log.created_at).toISOString(),
        action: log.action,
        entity_type: log.table_name,
        entity_id: log.record_id || '',
        user_name: log.user_name || '',
        user_id: log.user_id || '',
        details: JSON.stringify(log.new_data ?? log.old_data ?? {}),
      }));

      exportToExcel(
        [
          {
            name: 'Audit Trail',
            columns: [
              { header: 'Log ID', key: 'log_id', width: 16 },
              { header: 'Timestamp', key: 'timestamp', width: 22 },
              { header: 'Action Code', key: 'action', width: 18 },
              { header: 'Entity Type', key: 'entity_type', width: 16 },
              { header: 'Entity ID', key: 'entity_id', width: 16 },
              { header: 'Authorized User', key: 'user_name', width: 20 },
              { header: 'User ID', key: 'user_id', width: 16 },
              { header: 'Transaction Details', key: 'details', width: 35 },
            ],
            rows,
          },
        ],
        `Knitnect-Enterprise-Audit-Trail-${new Date().toISOString().slice(0, 10)}.xlsx`
      );
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
              Enterprise Audit Trail &amp; Governance Log
            </h1>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Immutable log of price approvals, pipeline stage advances, payroll adjustments, and user actions.
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
        {loading ? (
          <div className="flex items-center justify-center h-32 text-slate-500 text-sm">Loading audit trail...</div>
        ) : logs.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-slate-500 text-sm">No audit entries yet.</div>
        ) : (
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
                    <td className="font-mono text-slate-300">{log.table_name}</td>
                    <td className="font-semibold text-white">{log.user_name}</td>
                    <td className="font-mono text-slate-300 text-[11px] max-w-md truncate">
                      {JSON.stringify(log.new_data ?? log.old_data ?? {})}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
