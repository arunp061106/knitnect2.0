'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ErpStore } from '@/lib/db/erpStore';
import { Profile, Style, ProductionRun, Task } from '@/lib/types/erp';
import { Badge } from '@/components/ui/Badge';
import * as XLSX from 'xlsx';
import { formatTimeSafe } from '@/lib/utils/format';
import {
  Layers,
  GitBranch,
  AlertTriangle,
  ArrowRight,
  PlusCircle,
  CheckCircle2,
  Clock,
  Download,
  Activity,
  TrendingUp,
  Users,
  Package,
} from 'lucide-react';

export default function DashboardPage() {
  const router = useRouter();
  const store = ErpStore.getInstance();
  const [isMounted, setIsMounted] = useState(false);
  const [currentUser, setCurrentUser] = useState<Profile>(store.getCurrentUser());
  const [styles, setStyles] = useState<Style[]>([]);
  const [runs, setRuns] = useState<ProductionRun[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activityLogs, setActivityLogs] = useState(store.getActivityLogs());

  useEffect(() => {
    setIsMounted(true);
    const refresh = () => {
      const u = store.getCurrentUser();
      setCurrentUser(u);

      // Redirect employees away from this management dashboard
      if (u.role === 'employee') {
        router.replace('/employee/tasks');
        return;
      }

      setStyles(store.getStyles(u.role));
      setRuns(store.getStyles(u.role).map((s) => s.current_run).filter(Boolean) as ProductionRun[]);
      setTasks(store.getTasks(u));
      setActivityLogs(store.getActivityLogs());
    };

    refresh();
    const unsub = store.subscribe(refresh);
    return unsub;
  }, [store, router]);

  const activeStylesCount = styles.filter((s) => s.status !== 'completed').length;
  const dispatchReadyCount = styles.filter((s) => s.status === 'dispatch_ready').length;
  const activeRunsCount = runs.filter((r) => r.status === 'in_progress').length;
  const totalTargetPieces = runs.reduce((sum, r) => sum + (r.target_qty || 0), 0) || 5000;
  const allStageLogs = store['state'].stageLogs;
  const completedStagesCount = allStageLogs.filter((l) => l.status === 'done').length;
  const pendingTasksCount = tasks.filter((t) => t.status === 'pending').length;
  const pendingLabDipsCount = store['state'].labDips.filter((ld) => ld.approval_status === 'pending').length;

  const handleExportDashboardExcel = () => {
    try {
      const wb = XLSX.utils.book_new();
      const styleRows = styles.map((s) => ({
        'Style Number': s.style_number,
        'Offer No': s.offer_no,
        'Season': s.season,
        'Garment Category': s.garment_category,
        'Description': s.description,
        'Process Route': s.garment_process_type,
        'Status': s.status.toUpperCase(),
        'Price Approved': s.costing?.final_price_approved_by ? 'YES' : 'NO',
        'Target Bulk Pcs': s.costing?.bulk_target_qty || s.current_run?.target_qty || 0,
        'Created At': s.created_at,
      }));
      const wsStyles = XLSX.utils.json_to_sheet(styleRows);
      XLSX.utils.book_append_sheet(wb, wsStyles, 'Styles Portfolio');
      XLSX.writeFile(wb, `Knitnect-Dashboard-${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (err) {
      console.error(err);
    }
  };

  if (!isMounted) {
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <div key={i} className="h-28 rounded-xl bg-slate-900/60 animate-pulse border border-slate-800/50" />)}
        </div>
        <div className="h-64 rounded-xl bg-slate-900/60 animate-pulse border border-slate-800/50" />
      </div>
    );
  }

  const kpis = [
    {
      label: 'Active Styles',
      value: activeStylesCount,
      sub: `${dispatchReadyCount} dispatch ready`,
      icon: Layers,
      color: 'text-blue-400',
      bg: 'bg-blue-500/10 border-blue-500/20',
      iconBg: 'bg-blue-500/20',
    },
    {
      label: 'Target Pieces',
      value: totalTargetPieces.toLocaleString('en-IN'),
      sub: `${activeRunsCount || 1} active run`,
      icon: Package,
      color: 'text-emerald-400',
      bg: 'bg-emerald-500/10 border-emerald-500/20',
      iconBg: 'bg-emerald-500/20',
    },
    {
      label: 'Floor Tasks',
      value: tasks.length,
      sub: `${pendingTasksCount} pending`,
      icon: CheckCircle2,
      color: 'text-violet-400',
      bg: 'bg-violet-500/10 border-violet-500/20',
      iconBg: 'bg-violet-500/20',
    },
    {
      label: 'Lab Dip Approvals',
      value: pendingLabDipsCount,
      sub: pendingLabDipsCount === 0 ? 'All approved' : 'Awaiting signoff',
      icon: AlertTriangle,
      color: pendingLabDipsCount > 0 ? 'text-amber-400' : 'text-emerald-400',
      bg: pendingLabDipsCount > 0 ? 'bg-amber-500/10 border-amber-500/20' : 'bg-emerald-500/10 border-emerald-500/20',
      iconBg: pendingLabDipsCount > 0 ? 'bg-amber-500/20' : 'bg-emerald-500/20',
    },
  ];

  return (
    <div className="space-y-6 animate-fadeInUp">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <h1 className="text-xl font-bold text-white tracking-tight">Operations Dashboard</h1>
            <Badge variant={currentUser.role === 'owner' ? 'purple' : 'info'} dot>
              {currentUser.role.toUpperCase()}
            </Badge>
          </div>
          <p className="text-xs text-slate-400">
            Real-time tracking · Offer 9414 · W28 Season · {currentUser.full_name}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportDashboardExcel}
            className="btn btn-ghost"
          >
            <Download className="w-3.5 h-3.5" />
            Export Report
          </button>
          <button
            onClick={() => router.push('/styles')}
            className="btn btn-primary"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            New Style
          </button>
          <button
            onClick={() => router.push('/pipeline')}
            className="btn btn-ghost"
          >
            <GitBranch className="w-3.5 h-3.5" />
            Pipeline
          </button>
        </div>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <div key={kpi.label} className={`kpi-card border ${kpi.bg}`}>
              <div className="flex items-start justify-between mb-3">
                <div className={`w-8 h-8 rounded-lg ${kpi.iconBg} flex items-center justify-center`}>
                  <Icon className={`w-4 h-4 ${kpi.color}`} />
                </div>
                <TrendingUp className="w-3.5 h-3.5 text-slate-700" />
              </div>
              <div className={`text-2xl font-bold mono-num ${kpi.color}`}>{kpi.value}</div>
              <div className="text-[11px] text-slate-500 mt-1 font-medium uppercase tracking-wider">{kpi.label}</div>
              <div className="text-[10px] text-slate-600 mt-0.5">{kpi.sub}</div>
            </div>
          );
        })}
      </div>

      {/* Pipeline stage progress */}
      <div className="glass-card p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-blue-400" />
            <h2 className="text-sm font-bold text-white">Production Stage Progress</h2>
          </div>
          <button onClick={() => router.push('/pipeline')} className="text-[11px] text-blue-400 hover:text-blue-300 flex items-center gap-1 transition">
            View Pipeline <ArrowRight className="w-3 h-3" />
          </button>
        </div>

        <div className="mb-3">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
            <span>{completedStagesCount} of {allStageLogs.length} stages complete</span>
            <span className="font-bold text-white mono-num">
              {allStageLogs.length > 0 ? Math.round((completedStagesCount / allStageLogs.length) * 100) : 0}%
            </span>
          </div>
          <div className="progress-track">
            <div
              className="progress-fill"
              style={{ width: `${allStageLogs.length > 0 ? (completedStagesCount / allStageLogs.length) * 100 : 0}%` }}
            />
          </div>
        </div>

        <div className="flex gap-2 flex-wrap">
          {allStageLogs.slice(0, 15).map((stage) => (
            <div
              key={stage.id}
              title={`Stage ${stage.stage_order}: ${stage.stage_name} (${stage.status})`}
              className={`h-7 px-2 rounded flex items-center justify-center text-[9px] font-bold mono-num transition ${
                stage.status === 'done'
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : stage.status === 'in_progress'
                  ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40 animate-pulse'
                  : 'bg-slate-900/60 text-slate-600 border border-slate-800/60'
              }`}
            >
              {stage.stage_order}
            </div>
          ))}
        </div>
      </div>

      {/* Bottom grid: Styles table + Activity log */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Styles table */}
        <div className="lg:col-span-2 glass-card overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-800/60 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-blue-400" />
              <h2 className="text-xs font-bold text-white uppercase tracking-wider">Style Portfolio</h2>
            </div>
            <button onClick={() => router.push('/styles')} className="text-[11px] text-blue-400 hover:text-blue-300 flex items-center gap-1 transition">
              All Styles <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="erp-table min-w-[600px]">
              <thead>
                <tr>
                  <th>Style</th>
                  <th>Season / Offer</th>
                  <th>Stage</th>
                  <th>Status</th>
                  <th>Price</th>
                  <th className="text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {styles.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-slate-600 text-xs">No styles found.</td>
                  </tr>
                ) : styles.map((style) => {
                  const costing = style.costing;
                  return (
                    <tr key={style.id}>
                      <td>
                        <div className="font-mono font-bold text-white text-xs">{style.style_number}</div>
                        <div className="text-[10px] text-slate-500 mt-0.5 max-w-[140px] truncate">{style.description}</div>
                      </td>
                      <td className="font-mono text-slate-400 text-xs">{style.season} / {style.offer_no}</td>
                      <td className="text-xs text-blue-300">{style.current_run?.current_stage_name || 'Costing'}</td>
                      <td>
                        <Badge
                          variant={
                            style.status === 'completed' ? 'success' :
                            style.status === 'dispatch_ready' ? 'info' :
                            style.status === 'bulk_production' ? 'purple' : 'warning'
                          }
                          dot
                        >
                          {style.status.replace(/_/g, ' ')}
                        </Badge>
                      </td>
                      <td className="mono-num">
                        {costing?.approved_price ? (
                          <span className="text-emerald-400 font-semibold text-xs">₹{costing.approved_price}</span>
                        ) : costing?.quoted_price ? (
                          <span className="text-slate-300 text-xs">₹{costing.quoted_price}</span>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>
                      <td className="text-right">
                        <button
                          onClick={() => router.push(`/styles/${style.id}`)}
                          className="text-[11px] text-blue-400 hover:text-blue-300 flex items-center gap-1 ml-auto transition"
                        >
                          View <ArrowRight className="w-3 h-3" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Activity log */}
        <div className="glass-card overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-800/60 flex items-center justify-between">
            <h2 className="text-xs font-bold text-white uppercase tracking-wider">Audit Trail</h2>
            <button onClick={() => router.push('/audit')} className="text-[11px] text-blue-400 hover:text-blue-300 transition">
              View All
            </button>
          </div>

          <div className="p-3 space-y-2 max-h-[320px] overflow-y-auto">
            {activityLogs.slice(0, 10).map((log, i) => (
              <div
                key={log.id}
                className="p-2.5 rounded-xl bg-slate-900/50 border border-slate-800/50 animate-fadeInUp"
                style={{ animationDelay: `${i * 20}ms` }}
              >
                <div className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" />
                  {log.action.replace(/_/g, ' ')}
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5 pl-3">
                  {log.user_name}
                </div>
                <div suppressHydrationWarning className="text-[9px] text-slate-600 mt-0.5 pl-3 mono-num">
                  {formatTimeSafe(log.created_at)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Department workload */}
      <div className="glass-card p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-violet-400" />
            <h2 className="text-xs font-bold text-white uppercase tracking-wider">Department Status</h2>
          </div>
          <button onClick={() => router.push('/departments')} className="text-[11px] text-blue-400 hover:text-blue-300 transition">
            Manage
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {store.getDepartments().map((dept) => {
            const deptTasks = tasks.filter((t) => t.department_id === dept.id);
            const activeTasks = deptTasks.filter((t) => t.status === 'in_progress' || t.status === 'pending').length;
            const deptStages = allStageLogs.filter((s) => s.department_id === dept.id);
            const activeStage = deptStages.find((s) => s.status === 'in_progress');
            const allDone = deptStages.length > 0 && deptStages.every((s) => s.status === 'done');

            return (
              <div key={dept.id} className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-slate-900/50 border border-slate-800/40">
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-slate-200 truncate">{dept.name}</div>
                  <div className="text-[10px] text-slate-600 mt-0.5">{dept.member_count || 0} staff</div>
                </div>
                <div className="flex-shrink-0 ml-2">
                  {activeStage ? (
                    <Badge variant="info" dot>Active</Badge>
                  ) : allDone ? (
                    <Badge variant="success">Done</Badge>
                  ) : activeTasks > 0 ? (
                    <Badge variant="warning">{activeTasks} tasks</Badge>
                  ) : (
                    <Badge variant="neutral">Standby</Badge>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
