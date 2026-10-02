'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Badge } from '@/components/ui/Badge';
import { exportToExcel } from '@/lib/excel/excelExport';
import { formatTimeSafe } from '@/lib/utils/format';
import {
  Layers,
  GitBranch,
  AlertTriangle,
  ArrowRight,
  PlusCircle,
  CheckCircle2,
  Download,
  Activity,
  TrendingUp,
  Users,
  Package,
} from 'lucide-react';

interface DashboardStyle {
  id: string;
  style_number: string;
  offer_no: string;
  season: string;
  garment_category: string;
  description: string;
  garment_process_type: string;
  status: string;
  created_at: string;
  costing?: {
    approved_price?: number | null;
    quoted_price?: number | null;
    final_price_approved_by?: string | null;
    bulk_target_qty?: number | null;
  };
  current_run?: {
    id: string;
    current_stage_name: string;
    target_qty: number;
    status: string;
  };
}

interface DashboardRun {
  id: string;
  status: string;
  target_qty: number;
  current_stage_name: string;
}

interface DashboardTask {
  id: string;
  status: string;
  department_id: string;
}

interface DashboardStageLog {
  id: string;
  stage_order: number;
  stage_name: string;
  status: 'pending' | 'in_progress' | 'done';
  department_id: string | null;
}

interface DashboardAuditItem {
  id: string;
  action: string;
  user_name: string;
  created_at: string;
}

interface DashboardDept {
  id: string;
  name: string;
  member_count: number;
}

export default function DashboardPage() {
  const router = useRouter();
  const supabase = createClient();

  const [isMounted, setIsMounted] = useState(false);
  const [currentUserRole, setCurrentUserRole] = useState('manager');
  const [currentUserName, setCurrentUserName] = useState('');
  const [styles, setStyles] = useState<DashboardStyle[]>([]);
  const [runs, setRuns] = useState<DashboardRun[]>([]);
  const [tasks, setTasks] = useState<DashboardTask[]>([]);
  const [activityLogs, setActivityLogs] = useState<DashboardAuditItem[]>([]);
  const [stageLogs, setStageLogs] = useState<DashboardStageLog[]>([]);
  const [departments, setDepartments] = useState<DashboardDept[]>([]);
  const [pendingLabDipsCount, setPendingLabDipsCount] = useState(0);

  const fetchDashboardData = useCallback(async () => {
    // 1. Styles with costing and runs
    const { data: sData } = await supabase
      .from('styles')
      .select(`
        *,
        costing_sheets (
          approved_price,
          quoted_price,
          final_price_approved_by,
          bulk_target_qty
        ),
        production_runs (
          id,
          current_stage_name,
          target_qty,
          status
        )
      `)
      .order('created_at', { ascending: false });

    if (sData) {
      setStyles(
        sData.map((s: any) => ({
          ...s,
          costing: s.costing_sheets?.[0] || undefined,
          current_run: s.production_runs?.[0] || undefined,
        }))
      );
    }

    // 2. Production runs
    const { data: rData } = await supabase
      .from('production_runs')
      .select('id, status, target_qty, current_stage_name')
      .order('created_at', { ascending: false });

    if (rData) setRuns(rData as DashboardRun[]);

    // 3. Tasks
    const { data: tData } = await supabase
      .from('tasks')
      .select('id, status, department_id');

    if (tData) setTasks(tData as DashboardTask[]);

    // 4. Stage logs
    const { data: stData } = await supabase
      .from('production_stage_logs')
      .select('id, stage_order, stage_name, status, department_id')
      .order('stage_order', { ascending: true });

    if (stData) setStageLogs(stData as DashboardStageLog[]);

    // 5. Lab dips
    const { data: ldData } = await supabase
      .from('lab_dips')
      .select('id, approval_status');

    if (ldData) {
      setPendingLabDipsCount(ldData.filter((ld: any) => ld.approval_status === 'pending').length);
    }

    // 6. Audit logs
    const { data: aData } = await supabase
      .from('audit_log')
      .select(`
        id,
        action,
        created_at,
        profiles (
          full_name
        )
      `)
      .order('created_at', { ascending: false })
      .limit(10);

    if (aData) {
      setActivityLogs(
        aData.map((a: any) => ({
          id: a.id,
          action: a.action,
          created_at: a.created_at,
          user_name: a.profiles?.full_name || 'System / Staff',
        }))
      );
    }

    // 7. Departments
    const { data: dData } = await supabase
      .from('departments')
      .select(`
        id,
        name,
        department_members (
          id
        )
      `)
      .order('name');

    if (dData) {
      setDepartments(
        dData.map((d: any) => ({
          id: d.id,
          name: d.name,
          member_count: d.department_members?.length || 0,
        }))
      );
    }
  }, [supabase]);

  useEffect(() => {
    setIsMounted(true);
    const localRole = typeof window !== 'undefined' ? localStorage.getItem('knitnect_user_role') : null;
    const localName = typeof window !== 'undefined' ? localStorage.getItem('knitnect_user_name') : null;

    if (localRole === 'employee') {
      router.replace('/employee/tasks');
      return;
    }

    if (localRole) {
      setCurrentUserRole(localRole);
      setCurrentUserName(localName || 'Operator');
    }

    fetchDashboardData();

    // Async background verification without blocking render
    const verifyUser = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('role, full_name')
            .eq('id', user.id)
            .single();
          if (profile) {
            if (profile.role === 'employee') {
              router.replace('/employee/tasks');
              return;
            }
            setCurrentUserRole(profile.role);
            setCurrentUserName(profile.full_name || 'Operator');
          }
        }
      } catch {
        // fallback to local role
      }
    };
    verifyUser();
  }, [supabase, router, fetchDashboardData]);

  const activeStylesCount = styles.filter((s) => s.status !== 'completed').length;
  const dispatchReadyCount = styles.filter((s) => s.status === 'dispatch_ready').length;
  const activeRunsCount = runs.filter((r) => r.status === 'in_progress').length;
  const totalTargetPieces = runs.reduce((sum, r) => sum + (r.target_qty || 0), 0) || 5000;
  const completedStagesCount = stageLogs.filter((l) => l.status === 'done').length;
  const pendingTasksCount = tasks.filter((t) => t.status === 'pending').length;

  const handleExportDashboardExcel = () => {
    try {
      const styleRows = styles.map((s) => ({
        style_number: s.style_number,
        offer_no: s.offer_no,
        season: s.season,
        garment_category: s.garment_category,
        description: s.description,
        process_route: s.garment_process_type,
        status: s.status.toUpperCase(),
        price_approved: s.costing?.final_price_approved_by ? 'YES' : 'NO',
        target_qty: s.costing?.bulk_target_qty || s.current_run?.target_qty || 0,
        created_at: s.created_at,
      }));

      exportToExcel(
        [
          {
            name: 'Styles Portfolio',
            columns: [
              { header: 'Style Number', key: 'style_number', width: 16 },
              { header: 'Offer No', key: 'offer_no', width: 12 },
              { header: 'Season', key: 'season', width: 12 },
              { header: 'Garment Category', key: 'garment_category', width: 18 },
              { header: 'Description', key: 'description', width: 26 },
              { header: 'Process Route', key: 'process_route', width: 18 },
              { header: 'Status', key: 'status', width: 16 },
              { header: 'Price Approved', key: 'price_approved', width: 16 },
              { header: 'Target Bulk Pcs', key: 'target_qty', width: 16 },
              { header: 'Created At', key: 'created_at', width: 20 },
            ],
            rows: styleRows,
          },
        ],
        `Knitnect-Dashboard-${new Date().toISOString().slice(0, 10)}.xlsx`
      );
    } catch (err) {
      console.error(err);
    }
  };

  if (!isMounted) {
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 rounded-xl bg-slate-900/60 animate-pulse border border-slate-800/50" />
          ))}
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
            <Badge variant={currentUserRole === 'owner' ? 'purple' : 'info'} dot>
              {currentUserRole.toUpperCase()}
            </Badge>
          </div>
          <p className="text-xs text-slate-400">
            Real-time tracking · Offer 9414 · W28 Season · {currentUserName}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={handleExportDashboardExcel} className="btn btn-ghost">
            <Download className="w-3.5 h-3.5" />
            Export Report
          </button>
          <button onClick={() => router.push('/styles')} className="btn btn-primary">
            <PlusCircle className="w-3.5 h-3.5" />
            New Style
          </button>
          <button onClick={() => router.push('/pipeline')} className="btn btn-ghost">
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
            <span>{completedStagesCount} of {stageLogs.length} stages complete</span>
            <span className="font-bold text-white mono-num">
              {stageLogs.length > 0 ? Math.round((completedStagesCount / stageLogs.length) * 100) : 0}%
            </span>
          </div>
          <div className="progress-track">
            <div
              className="progress-fill"
              style={{ width: `${stageLogs.length > 0 ? (completedStagesCount / stageLogs.length) * 100 : 0}%` }}
            />
          </div>
        </div>

        <div className="flex gap-2 flex-wrap">
          {stageLogs.slice(0, 15).map((stage) => (
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
                ) : (
                  styles.map((style) => {
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
                              style.status === 'completed'
                                ? 'success'
                                : style.status === 'dispatch_ready'
                                ? 'info'
                                : style.status === 'bulk_production'
                                ? 'purple'
                                : 'warning'
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
                  })
                )}
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
          {departments.map((dept) => {
            const deptTasks = tasks.filter((t) => t.department_id === dept.id);
            const activeTasks = deptTasks.filter((t) => t.status === 'in_progress' || t.status === 'pending').length;
            const deptStages = stageLogs.filter((s) => s.department_id === dept.id);
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
