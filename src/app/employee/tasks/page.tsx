'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ErpStore } from '@/lib/db/erpStore';
import { Task, Profile } from '@/lib/types/erp';
import { Badge } from '@/components/ui/Badge';
import {
  CheckSquare,
  Scale,
  CheckCircle2,
  Clock,
  AlertCircle,
  X,
  FileText,
} from 'lucide-react';

export default function EmployeeTasksPage() {
  const router = useRouter();
  const store = ErpStore.getInstance();

  const [isMounted, setIsMounted] = useState(false);
  const [currentUser, setCurrentUser] = useState<Profile>(store.getCurrentUser());
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Measurement form state
  const [measuredOutput, setMeasuredOutput] = useState(0);
  const [scrapWeight, setScrapWeight] = useState(0);
  const [pieceCount, setPieceCount] = useState(500);
  const [scaleId, setScaleId] = useState('Scale #2 - Table A');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    setIsMounted(true);
    const refresh = () => {
      const u = store.getCurrentUser();
      setCurrentUser(u);

      // STRICT: Only show tasks assigned to this employee
      if (u.role === 'employee') {
        const allTasks = store.getTasks(u);
        const myTasks = allTasks.filter((t) => t.assigned_to === u.id);
        setTasks(myTasks);
      } else {
        // Non-employees shouldn't be here, redirect
        router.push('/dashboard');
      }
    };

    refresh();
    const unsub = store.subscribe(refresh);
    return unsub;
  }, [store, router]);

  const handleOpenMeasurement = (task: Task) => {
    setSelectedTask(task);
    setMeasuredOutput(task.employee_measured_output_weight_kg || 0);
    setScrapWeight(task.employee_waste_scrap_weight_kg || 0);
    setPieceCount(task.employee_piece_count || 500);
    setScaleId(task.machine_scale_id || 'Scale #2 - Table A');
    setNotes(task.employee_notes || '');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTask) return;

    if (measuredOutput <= 0) {
      alert('Please enter a valid output weight.');
      return;
    }

    const res = store.submitEmployeeFloorMeasurement(selectedTask.id, {
      measuredOutputWeightKg: measuredOutput,
      wasteScrapWeightKg: scrapWeight,
      pieceCount,
      scaleId,
      employeeNotes: notes,
      userId: currentUser.id,
    });

    if (res.success) {
      setFeedback('✓ Floor measurement submitted successfully.');
      setSelectedTask(null);
      setTimeout(() => setFeedback(null), 4000);
    }
  };

  const handleMarkComplete = (taskId: string) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task?.employee_measured_output_weight_kg) {
      alert('Please enter your floor weight measurement before marking complete.');
      return;
    }
    store.updateTaskStatus(taskId, 'completed', currentUser.id);
    setFeedback('✓ Task marked as complete.');
    setTimeout(() => setFeedback(null), 4000);
  };

  const stats = {
    total: tasks.length,
    pending: tasks.filter((t) => t.status === 'pending').length,
    inProgress: tasks.filter((t) => t.status === 'in_progress').length,
    completed: tasks.filter((t) => t.status === 'completed').length,
  };

  if (!isMounted) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 rounded-xl bg-slate-900/60 animate-pulse border border-slate-800/50" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeInUp">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center">
              <CheckSquare className="w-4.5 h-4.5 text-amber-400" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white tracking-tight">My Tasks</h1>
              <p className="text-xs text-slate-400 mt-0.5">
                {currentUser.full_name} · {currentUser.department_name || 'Floor Operations'}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <div className="px-3 py-1.5 rounded-lg bg-slate-900/80 border border-slate-700/60 text-slate-400">
            <span className="font-mono text-white font-semibold">{tasks.length}</span> task{tasks.length !== 1 ? 's' : ''} assigned
          </div>
        </div>
      </div>

      {/* Feedback banner */}
      {feedback && (
        <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 text-sm animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          {feedback}
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
        {[
          { label: 'Total', value: stats.total, color: 'text-slate-200', bg: 'bg-slate-500/10 border-slate-500/20' },
          { label: 'Pending', value: stats.pending, color: 'text-amber-300', bg: 'bg-amber-500/10 border-amber-500/20' },
          { label: 'In Progress', value: stats.inProgress, color: 'text-blue-300', bg: 'bg-blue-500/10 border-blue-500/20' },
          { label: 'Completed', value: stats.completed, color: 'text-emerald-300', bg: 'bg-emerald-500/10 border-emerald-500/20' },
        ].map((stat) => (
          <div key={stat.label} className={`rounded-xl border p-2.5 sm:p-3 ${stat.bg}`}>
            <div className={`text-lg sm:text-xl font-bold mono-num ${stat.color}`}>{stat.value}</div>
            <div className="text-[10px] sm:text-[11px] text-slate-500 mt-0.5">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Tasks list */}
      {tasks.length === 0 ? (
        <div className="rounded-xl border border-slate-800/50 bg-slate-900/30 p-8 sm:p-12 text-center">
          <CheckSquare className="w-8 h-8 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400 text-sm font-medium">No tasks assigned to you yet.</p>
          <p className="text-slate-600 text-xs mt-1">Your manager will assign tasks to you shortly.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {tasks.map((task, i) => {
            const statusVariant = task.status === 'completed' ? 'success' : task.status === 'in_progress' ? 'info' : 'warning';
            const hasMeasurement = !!task.employee_measured_output_weight_kg;

            return (
              <div
                key={task.id}
                className="glass-card p-3.5 sm:p-4 hover:border-slate-600/50 transition-all animate-fadeInUp"
                style={{ animationDelay: `${i * 40}ms` }}
              >
                <div className="flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4">
                  {/* Stage number */}
                  <div className="flex-shrink-0">
                    <div className={`stage-dot ${
                      task.status === 'completed' ? 'stage-dot-done' : task.status === 'in_progress' ? 'stage-dot-active' : 'stage-dot-pending'
                    }`}>
                      {task.status === 'completed' ? '✓' : i + 1}
                    </div>
                  </div>

                  {/* Task info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mb-2">
                      <span className="text-sm font-semibold text-white">{task.stage_name}</span>
                      <Badge variant={statusVariant} dot>
                        {task.status.replace(/_/g, ' ')}
                      </Badge>
                      {task.style_number && (
                        <span className="text-[11px] font-mono text-slate-500 bg-slate-900/60 px-2 py-0.5 rounded">
                          {task.style_number}
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-slate-300 leading-relaxed mb-3">
                      {task.specification}
                    </p>

                    {/* Measurement status */}
                    {hasMeasurement ? (
                      <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-[11px] text-slate-400 mb-3 bg-slate-900/40 p-2 rounded-lg border border-slate-800/40">
                        <span className="flex items-center gap-1.5 text-emerald-400">
                          <Scale className="w-3.5 h-3.5" />
                          <span className="font-semibold mono-num">{task.employee_measured_output_weight_kg} kg</span> measured
                        </span>
                        <span>Scrap: <span className="text-amber-400 font-mono">{task.employee_waste_scrap_weight_kg || 0} kg</span></span>
                        <span>Pcs: <span className="text-slate-300 font-mono">{task.employee_piece_count || 0}</span></span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-[11px] text-amber-400/80 mb-3 bg-amber-500/5 p-2 rounded-lg border border-amber-500/15">
                        <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                        Floor measurement pending
                      </div>
                    )}

                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-2 border-t border-slate-800/40">
                      <div className="flex items-center gap-2 text-[11px] text-slate-500">
                        <Clock className="w-3.5 h-3.5 flex-shrink-0" />
                        Due: <span className="text-slate-300">{task.expected_completion_date}</span>
                      </div>

                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          onClick={() => handleOpenMeasurement(task)}
                          className="btn btn-ghost text-[11px] flex-1 sm:flex-initial"
                        >
                          <Scale className="w-3 h-3" />
                          {hasMeasurement ? 'Edit Weight' : 'Enter Weight'}
                        </button>

                        {task.status !== 'completed' && (
                          <button
                            onClick={() => handleMarkComplete(task.id)}
                            className="btn btn-success text-[11px] flex-1 sm:flex-initial"
                          >
                            <CheckCircle2 className="w-3 h-3" />
                            Mark Complete
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Measurement Modal */}
      {selectedTask && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setSelectedTask(null); }}>
          <div className="modal-panel max-w-lg w-full p-4 sm:p-6">
            <div className="flex items-start justify-between mb-4 sm:mb-5">
              <div>
                <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-1">Floor Weight Entry</p>
                <h2 className="text-base font-bold text-white">{selectedTask.stage_name}</h2>
                <p className="text-xs text-slate-400 mt-0.5">{selectedTask.specification}</p>
              </div>
              <button
                onClick={() => setSelectedTask(null)}
                className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Target weight reference */}
              {selectedTask.manager_assigned_weight_kg && (
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20">
                  <FileText className="w-4 h-4 text-blue-400 flex-shrink-0" />
                  <div className="text-xs">
                    <span className="text-slate-400">Supervisor target: </span>
                    <span className="font-bold text-blue-300 mono-num">{selectedTask.manager_assigned_weight_kg} kg</span>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="form-label">Your Measured Output (kg) *</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    min="0.01"
                    className="form-input mono-num text-sm sm:text-xs min-h-[40px]"
                    value={measuredOutput || ''}
                    onChange={(e) => setMeasuredOutput(parseFloat(e.target.value) || 0)}
                    placeholder="e.g. 80.00"
                  />
                </div>
                <div>
                  <label className="form-label">Scrap / Waste (kg)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="form-input mono-num text-sm sm:text-xs min-h-[40px]"
                    value={scrapWeight || ''}
                    onChange={(e) => setScrapWeight(parseFloat(e.target.value) || 0)}
                    placeholder="e.g. 10.00"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="form-label">Pieces Processed</label>
                  <input
                    type="number"
                    min="0"
                    className="form-input mono-num text-sm sm:text-xs min-h-[40px]"
                    value={pieceCount}
                    onChange={(e) => setPieceCount(parseInt(e.target.value) || 0)}
                  />
                </div>
                <div>
                  <label className="form-label">Scale / Table ID</label>
                  <input
                    type="text"
                    className="form-input text-sm sm:text-xs min-h-[40px]"
                    value={scaleId}
                    onChange={(e) => setScaleId(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="form-label">Operator Notes (optional)</label>
                <textarea
                  rows={2}
                  className="form-input resize-none"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Any observations, defects, shade issues..."
                />
              </div>

              {/* Live discrepancy preview */}
              {measuredOutput > 0 && selectedTask.manager_assigned_weight_kg && (
                <div className="rounded-xl bg-slate-900/60 border border-slate-800/60 p-3">
                  <div className="text-[10px] uppercase font-bold text-slate-500 mb-2">Variance Preview</div>
                  <div className="flex items-center justify-between text-xs">
                    <div className="space-y-1">
                      <div className="text-slate-400">Target: <span className="text-slate-200 font-mono">{selectedTask.manager_assigned_weight_kg} kg</span></div>
                      <div className="text-slate-400">Your output: <span className="text-sky-300 font-mono">{measuredOutput} kg</span></div>
                    </div>
                    <div className="text-right">
                      <div className={`text-sm font-bold mono-num ${Math.abs(measuredOutput - selectedTask.manager_assigned_weight_kg) <= 1 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        Δ {Math.abs(measuredOutput - selectedTask.manager_assigned_weight_kg).toFixed(2)} kg
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5">
                        {Math.abs(measuredOutput - selectedTask.manager_assigned_weight_kg) <= 1 ? '✓ Within tolerance' : '⚠ Above threshold'}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800/60">
                <button
                  type="button"
                  onClick={() => setSelectedTask(null)}
                  className="btn btn-ghost"
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Submit Measurement
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

