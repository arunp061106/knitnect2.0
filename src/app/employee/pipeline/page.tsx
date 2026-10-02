'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ErpStore } from '@/lib/db/erpStore';
import { Profile, ProductionStageLog } from '@/lib/types/erp';
import { Badge } from '@/components/ui/Badge';
import {
  GitBranch,
  CheckCircle2,
  Clock,
  Layers,
  ChevronRight,
  AlertCircle,
} from 'lucide-react';

export default function EmployeePipelinePage() {
  const router = useRouter();
  const store = ErpStore.getInstance();

  const [isMounted, setIsMounted] = useState(false);
  const [currentUser, setCurrentUser] = useState<Profile>(store.getCurrentUser());
  const [myStages, setMyStages] = useState<ProductionStageLog[]>([]);
  const [allStageLogs, setAllStageLogs] = useState<ProductionStageLog[]>([]);

  useEffect(() => {
    setIsMounted(true);
    const refresh = () => {
      const u = store.getCurrentUser();
      setCurrentUser(u);

      if (u.role !== 'employee') {
        router.push('/pipeline');
        return;
      }

      const logs = store['state'].stageLogs;
      setAllStageLogs(logs);

      // STRICT: Employee sees only stages assigned to them OR stages in their department
      const relevantStages = logs.filter(
        (l) =>
          l.assigned_to === u.id ||
          l.department_id === u.department_id
      );
      setMyStages(relevantStages.sort((a, b) => a.stage_order - b.stage_order));
    };

    refresh();
    const unsub = store.subscribe(refresh);
    return unsub;
  }, [store, router]);

  if (!isMounted) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 rounded-xl bg-slate-900/60 animate-pulse border border-slate-800/50" />
        ))}
      </div>
    );
  }

  const totalStages = allStageLogs.length;
  const completedCount = allStageLogs.filter((s) => s.status === 'done').length;
  const progressPct = totalStages > 0 ? Math.round((completedCount / totalStages) * 100) : 0;

  const myCompletedCount = myStages.filter((s) => s.status === 'done').length;

  return (
    <div className="space-y-6 animate-fadeInUp">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-blue-500/20 border border-blue-500/30 flex items-center justify-center">
            <GitBranch className="w-4 h-4 text-blue-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white tracking-tight">My Pipeline</h1>
            <p className="text-xs text-slate-400 mt-0.5">
              {currentUser.department_name || 'Floor Operations'} · Stage completion status
            </p>
          </div>
        </div>
      </div>

      {/* Overall progress card */}
      <div className="glass-card p-3.5 sm:p-5">
        <div className="flex items-start justify-between gap-3 sm:gap-4 mb-4">
          <div>
            <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-1">Overall Production Progress</div>
            <div className="text-xl sm:text-2xl font-bold mono-num text-white">
              {completedCount}
              <span className="text-slate-500 text-sm sm:text-base font-normal"> / {totalStages}</span>
            </div>
            <div className="text-[11px] sm:text-xs text-slate-400 mt-0.5">stages completed across all departments</div>
          </div>
          <div className="text-right">
            <div className="text-2xl sm:text-3xl font-bold gradient-text mono-num">{progressPct}%</div>
            <div className="text-[10px] sm:text-[11px] text-slate-500 mt-0.5">completion</div>
          </div>
        </div>

        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${progressPct}%` }} />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2.5 sm:gap-4 text-[11px] sm:text-xs text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            {completedCount} Done
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-blue-400" />
            {allStageLogs.filter((s) => s.status === 'in_progress').length} Active
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-slate-600" />
            {allStageLogs.filter((s) => s.status === 'pending').length} Pending
          </span>
        </div>
      </div>

      {/* My department stages */}
      <div>
        <div className="section-header mb-3">
          My Department Stages
          <span className="ml-2 text-slate-600 normal-case font-normal text-[10px]">
            ({currentUser.department_name || 'Cutting'})
          </span>
        </div>

        {myStages.length === 0 ? (
          <div className="rounded-xl border border-slate-800/50 bg-slate-900/30 p-10 text-center">
            <Layers className="w-8 h-8 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-400 text-sm">No stages assigned to your department yet.</p>
            <p className="text-slate-600 text-xs mt-1">Stages will appear here when your department is active.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {myStages.map((stage, i) => {
              const isDone = stage.status === 'done';
              const isActive = stage.status === 'in_progress';

              return (
                <div
                  key={stage.id}
                  className={`glass-card-light p-4 transition-all animate-fadeInUp ${
                    isActive ? 'border-blue-500/30 bg-blue-500/5' : ''
                  } ${isDone ? 'border-emerald-500/20 bg-emerald-500/3' : ''}`}
                  style={{ animationDelay: `${i * 30}ms` }}
                >
                  <div className="flex items-center gap-4">
                    <div className={`stage-dot ${
                      isDone ? 'stage-dot-done' : isActive ? 'stage-dot-active' : 'stage-dot-pending'
                    }`}>
                      {isDone ? '✓' : stage.stage_order}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="text-sm font-semibold text-white">{stage.stage_name}</span>
                        <Badge
                          variant={isDone ? 'success' : isActive ? 'info' : 'neutral'}
                          dot={isActive}
                        >
                          {stage.status === 'in_progress' ? 'In Progress' : stage.status === 'done' ? 'Completed' : 'Pending'}
                        </Badge>
                      </div>

                      {/* EMPLOYEE ONLY SEES COMPLETION DATA - no financial info */}
                      {isDone && (
                        <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
                          <span>
                            Output: <span className="text-emerald-400 font-mono font-semibold">{stage.output_weight_kg} kg</span>
                          </span>
                          {stage.completed_at && (
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              Completed {new Date(stage.completed_at).toLocaleDateString('en-IN')}
                            </span>
                          )}
                          {stage.discrepancy_status === 'matched' && (
                            <span className="text-emerald-400 flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" /> Verified
                            </span>
                          )}
                        </div>
                      )}

                      {isActive && (
                        <div className="text-[11px] text-blue-300 flex items-center gap-1.5 mt-0.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                          Currently in progress — enter your measurements in My Tasks
                        </div>
                      )}

                      {!isDone && !isActive && (
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          Queued for processing
                        </div>
                      )}
                    </div>

                    {/* NO financial data for employees */}
                    <div className="flex-shrink-0 text-right">
                      <div className={`text-xs font-semibold mono-num ${
                        isDone ? 'text-emerald-400' : isActive ? 'text-blue-400' : 'text-slate-600'
                      }`}>
                        {isDone ? `${stage.output_weight_kg} kg` : isActive ? 'Active' : '—'}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Full pipeline overview — completion only, no financials */}
      <div>
        <div className="section-header mb-3">All Stages — Completion Overview</div>

        <div className="glass-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="erp-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Stage</th>
                  <th>Department</th>
                  <th>Status</th>
                  <th className="text-right">Output</th>
                </tr>
              </thead>
              <tbody>
                {allStageLogs.map((stage) => {
                  const isDone = stage.status === 'done';
                  const isActive = stage.status === 'in_progress';
                  const isMyDept = stage.department_id === currentUser.department_id;

                  return (
                    <tr
                      key={stage.id}
                      className={isMyDept ? 'bg-amber-500/5' : ''}
                    >
                      <td>
                        <div className={`stage-dot mx-auto ${
                          isDone ? 'stage-dot-done' : isActive ? 'stage-dot-active' : 'stage-dot-pending'
                        } w-6 h-6 text-[10px]`}>
                          {isDone ? '✓' : stage.stage_order}
                        </div>
                      </td>
                      <td>
                        <div className="font-semibold text-slate-200 flex items-center gap-2">
                          {stage.stage_name}
                          {isMyDept && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/20 font-bold">
                              MY DEPT
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="text-slate-400">{stage.department_name}</td>
                      <td>
                        <Badge variant={isDone ? 'success' : isActive ? 'info' : 'neutral'} dot={isActive}>
                          {stage.status === 'in_progress' ? 'In Progress' : stage.status === 'done' ? 'Done' : 'Pending'}
                        </Badge>
                      </td>
                      <td className="text-right">
                        {/* EMPLOYEES ONLY SEE COMPLETION STATUS, NOT FINANCIAL LOSS DATA */}
                        {isDone ? (
                          <span className="mono-num text-emerald-400 font-semibold">{stage.output_weight_kg} kg</span>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
