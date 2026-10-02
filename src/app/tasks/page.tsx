'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ErpStore } from '@/lib/db/erpStore';
import { Task, Profile, Department, ProductionStageLog } from '@/lib/types/erp';
import { Badge } from '@/components/ui/Badge';
import { verifyFloorWeights } from '@/lib/domain/loss';
import * as XLSX from 'xlsx';
import {
  CheckSquare,
  Plus,
  Scale,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  Building2,
  User,
  Filter,
  FileText,
  Clock,
  ArrowRight,
  Download,
} from 'lucide-react';

export default function TasksPage() {
  const router = useRouter();
  const store = ErpStore.getInstance();
  const [isMounted, setIsMounted] = useState(false);
  const [currentUser, setCurrentUser] = useState<Profile>(store.getCurrentUser());
  const [tasks, setTasks] = useState<Task[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [users, setUsers] = useState<Profile[]>([]);
  const [stageLogs, setStageLogs] = useState<ProductionStageLog[]>([]);

  // Filter state
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [filterDepartment, setFilterDepartment] = useState<string>('ALL');

  // Employee Floor Measurement Drawer Modal
  const [selectedTaskForEntry, setSelectedTaskForEntry] = useState<Task | null>(null);
  const [measuredOutputWeight, setMeasuredOutputWeight] = useState<number>(0);
  const [measuredScrapWeight, setMeasuredScrapWeight] = useState<number>(0);
  const [pieceCount, setPieceCount] = useState<number>(500);
  const [scaleId, setScaleId] = useState('Scale #2 - Table A');
  const [employeeNotes, setEmployeeNotes] = useState('');

  // New Task Modal (Management only)
  const [isNewTaskOpen, setIsNewTaskOpen] = useState(false);
  const [selectedStageLogId, setSelectedStageLogId] = useState('');
  const [selectedDeptId, setSelectedDeptId] = useState('');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [specification, setSpecification] = useState('');
  const [expectedDate, setExpectedDate] = useState('');
  const [assignedTargetWeight, setAssignedTargetWeight] = useState<number>(90);
  const [taskNotes, setTaskNotes] = useState('');

  // Edit Task Modal (Edit any task including completed)
  const [selectedTaskForEdit, setSelectedTaskForEdit] = useState<Task | null>(null);
  const [editSpec, setEditSpec] = useState('');
  const [editDeptId, setEditDeptId] = useState('');
  const [editEmployeeId, setEditEmployeeId] = useState('');
  const [editTargetWeight, setEditTargetWeight] = useState<number>(0);
  const [editExpectedDate, setEditExpectedDate] = useState('');
  const [editStatus, setEditStatus] = useState<Task['status']>('pending');
  const [editNotes, setEditNotes] = useState('');

  const [feedback, setFeedback] = useState<string | null>(null);

  const handleOpenEditTask = (task: Task) => {
    setSelectedTaskForEdit(task);
    setEditSpec(task.specification || '');
    setEditDeptId(task.department_id || '');
    setEditEmployeeId(task.assigned_to || '');
    setEditTargetWeight(task.manager_assigned_weight_kg || 0);
    setEditExpectedDate(task.expected_completion_date || '');
    setEditStatus(task.status);
    setEditNotes(task.notes || '');
  };

  const handleSaveEditTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTaskForEdit) return;

    const res = store.updateTaskDetails(
      selectedTaskForEdit.id,
      {
        specification: editSpec,
        department_id: editDeptId,
        assigned_to: editEmployeeId,
        manager_assigned_weight_kg: editTargetWeight,
        expected_completion_date: editExpectedDate,
        status: editStatus,
        notes: editNotes,
      },
      currentUser.id
    );

    if (res.success) {
      setFeedback('Task details updated successfully.');
      setSelectedTaskForEdit(null);
      setTimeout(() => setFeedback(null), 4000);
    }
  };

  useEffect(() => {
    setIsMounted(true);
    const refresh = () => {
      const u = store.getCurrentUser();
      setCurrentUser(u);
      // Redirect employees to their isolated portal
      if (u.role === 'employee') {
        router.replace('/employee/tasks');
        return;
      }
      setTasks(store.getTasks(u));
      setDepartments(store.getDepartments());
      setUsers(store.getUsers());
      setStageLogs(store['state'].stageLogs);
    };

    refresh();
    const unsub = store.subscribe(refresh);
    return unsub;
  }, [store, router]);

  const isManagement = isMounted ? currentUser.role === 'owner' || currentUser.role === 'manager' : false;

  const handleOpenFloorMeasurement = (task: Task) => {
    setSelectedTaskForEntry(task);
    setMeasuredOutputWeight(task.employee_measured_output_weight_kg || 80);
    setMeasuredScrapWeight(task.employee_waste_scrap_weight_kg || 10);
    setPieceCount(task.employee_piece_count || 500);
    setScaleId(task.machine_scale_id || 'Scale #2 - Table A');
    setEmployeeNotes(task.employee_notes || '');
  };

  const handleSubmitFloorMeasurement = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTaskForEntry) return;

    if (measuredOutputWeight <= 0) {
      alert('Please enter a valid measured output weight in kg.');
      return;
    }

    const res = store.submitEmployeeFloorMeasurement(selectedTaskForEntry.id, {
      measuredOutputWeightKg: measuredOutputWeight,
      wasteScrapWeightKg: measuredScrapWeight,
      pieceCount,
      scaleId,
      employeeNotes,
      userId: currentUser.id,
    });

    if (res.success) {
      setFeedback(res.message);
      setSelectedTaskForEntry(null);
      setTimeout(() => setFeedback(null), 4000);
    }
  };

  const handleCreateTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!specification || !expectedDate || !selectedDeptId || !selectedEmployeeId) {
      alert('Please complete all required task fields.');
      return;
    }

    store.createTask(
      {
        production_stage_log_id: selectedStageLogId || store['state'].stageLogs[0]?.id || '',
        department_id: selectedDeptId,
        assigned_to: selectedEmployeeId,
        specification: specification.trim(),
        expected_completion_date: expectedDate,
        manager_assigned_weight_kg: assignedTargetWeight,
        notes: taskNotes,
      },
      currentUser.id
    );

    setIsNewTaskOpen(false);
    setSpecification('');
    setExpectedDate('');
    setFeedback('Task assigned successfully with target weight.');
    setTimeout(() => setFeedback(null), 3000);
  };

  const handleExportTasksExcel = () => {
    try {
      const wb = XLSX.utils.book_new();
      const rows = tasks.map((t) => {
        const discrepancy = t.manager_assigned_weight_kg && t.employee_measured_output_weight_kg
          ? Math.abs(t.manager_assigned_weight_kg - t.employee_measured_output_weight_kg).toFixed(2)
          : '0.00';
        return {
          'Task ID': t.id,
          'Stage Name': t.stage_name || 'Production Stage',
          'Department': t.department_name || '',
          'Assigned Employee': t.assigned_to_name || '',
          'Specification': t.specification,
          'Status': t.status.toUpperCase(),
          'Supervisor Target Weight (kg)': t.manager_assigned_weight_kg || 0,
          'Employee Measured Output (kg)': t.employee_measured_output_weight_kg || 'Pending',
          'Employee Scrap Weight (kg)': t.employee_waste_scrap_weight_kg || 0,
          'Piece Count': t.employee_piece_count || 0,
          'Machine Scale ID': t.machine_scale_id || 'N/A',
          'Discrepancy (kg)': discrepancy,
          'Expected Completion Date': t.expected_completion_date,
          'Notes': t.notes || '',
        };
      });
      const ws = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, 'Floor Tasks Log');
      XLSX.writeFile(wb, `Floor-Tasks-Weighing-Log.xlsx`);
      setFeedback('Floor tasks & floor measurements exported to Excel (.xlsx)!');
      setTimeout(() => setFeedback(null), 4000);
    } catch (err) {
      console.error(err);
      alert('Tasks exported.');
    }
  };

  const handleUpdateStatus = (taskId: string, newStatus: 'pending' | 'in_progress' | 'completed') => {
    const res = store.updateTaskStatus(taskId, newStatus, currentUser.id);
    if (res.success && res.task) {
      setFeedback(`Task status updated to "${newStatus.toUpperCase()}".`);
      setTimeout(() => setFeedback(null), 3000);
    }
  };

  const filteredTasks = tasks.filter((t) => {
    const matchStatus = filterStatus === 'ALL' || t.status === filterStatus;
    const matchDept =
      filterDepartment === 'ALL' ||
      t.department_id === filterDepartment ||
      t.department_name === filterDepartment;
    return matchStatus && matchDept;
  });

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <CheckSquare className="w-5 h-5 text-primary" />
            <h1 className="text-xl font-bold tracking-tight text-white">
              {isManagement ? 'Floor Task Assignment & Cross-Verification Deck' : 'My Department Work Queue'}
            </h1>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            {isManagement
              ? 'Section 7: Assign stage specifications, track employee floor measurements vs supervisor verified weights, and surface discrepancy errors.'
              : `Floor measurement input and task execution for ${currentUser.full_name} (${currentUser.department_name || 'Cutting'}).`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportTasksExcel}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-sm transition"
          >
            <Download className="w-3.5 h-3.5" />
            Export Tasks (.xlsx)
          </button>

          {isManagement && (
            <button
              onClick={() => setIsNewTaskOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              Assign New Task
            </button>
          )}
        </div>
      </div>

      {feedback && (
        <div className="p-3 bg-emerald-950/80 border border-emerald-800 rounded text-xs text-emerald-300 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          <span>{feedback}</span>
        </div>
      )}

      {/* Role-specific banner for Employee */}
      {!isManagement && isMounted && (
        <div className="p-4 bg-sky-950/50 border border-sky-800 rounded flex items-center justify-between text-xs text-sky-200">
          <div className="flex items-center gap-3">
            <Scale className="w-5 h-5 text-sky-400 flex-shrink-0" />
            <div>
              <div className="font-bold">Floor Operator Measurement Entry Mode</div>
              <div className="text-[11px] text-slate-300 mt-0.5">
                Weigh bundles/panels upon process completion and record output weight (kg), selvage waste (kg), and piece counts.
              </div>
            </div>
          </div>
          <span className="font-mono text-emerald-400 font-bold bg-slate-900 px-2.5 py-1 rounded border border-slate-800 text-[11px]">
            ALL DEPARTMENTS ACTIVE • {currentUser.full_name}
          </span>
        </div>
      )}

      {/* Bottleneck Summary (Management only) */}
      {isManagement && (
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div className="kpi-card">
            <div className="kpi-label">Total Active Tasks</div>
            <div className="kpi-value text-white">{tasks.length}</div>
            <div className="text-[11px] text-slate-500 mt-1">Across production stages</div>
          </div>

          <div className="kpi-card">
            <div className="kpi-label">Floor Weights Reported</div>
            <div className="kpi-value text-sky-400">
              {tasks.filter((t) => t.employee_measured_output_weight_kg && t.employee_measured_output_weight_kg > 0).length}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">Operator measurements recorded</div>
          </div>

          <div className="kpi-card">
            <div className="kpi-label">Pending Execution</div>
            <div className="kpi-value text-amber-300">
              {tasks.filter((t) => t.status === 'pending').length}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">Awaiting floor start</div>
          </div>

          <div className="kpi-card">
            <div className="kpi-label">Completed & Verified</div>
            <div className="kpi-value text-emerald-400">
              {tasks.filter((t) => t.status === 'completed').length}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">Actual days recorded</div>
          </div>
        </div>
      )}

      {/* Task Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 glass-card p-3 text-xs">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-400 font-medium">Status:</span>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-slate-200 text-xs focus:outline-none focus:border-primary cursor-pointer"
            >
              <option value="ALL">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-slate-400 font-medium">Department:</span>
            <select
              value={filterDepartment}
              onChange={(e) => setFilterDepartment(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-slate-200 text-xs focus:outline-none focus:border-primary cursor-pointer"
            >
              <option value="ALL">All Departments ({departments.length})</option>
              {departments.map((dept) => (
                <option key={dept.id} value={dept.id}>
                  {dept.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <span className="text-[11px] text-slate-400 font-mono">
          Showing <span className="text-slate-200 font-semibold">{filteredTasks.length}</span> task{filteredTasks.length === 1 ? '' : 's'}
        </span>
      </div>

      {/* Tasks Table */}
      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="erp-table text-xs min-w-[1240px]">
            <thead>
              <tr>
                <th className="w-[140px] whitespace-nowrap">Style / Stage</th>
                <th className="w-[110px] whitespace-nowrap">Department</th>
                <th className="min-w-[280px] max-w-[360px]">Task Specification</th>
                <th className="w-[140px] whitespace-nowrap">Assigned Staff</th>
                <th className="w-[170px] whitespace-nowrap">Floor Weight Entry (kg)</th>
                <th className="w-[180px] whitespace-nowrap">Cross-Verification Discrepancy</th>
                <th className="w-[120px] whitespace-nowrap">Expected Date</th>
                <th className="w-[120px] whitespace-nowrap">Status</th>
                <th className="min-w-[200px] text-right whitespace-nowrap">Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredTasks.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-12 text-slate-500 text-xs">
                    No tasks found in your departmental queue.
                  </td>
                </tr>
              ) : (
                filteredTasks.map((t) => {
                  const empWeight = t.employee_measured_output_weight_kg;
                  const mgrWeight = t.manager_assigned_weight_kg || 90;
                  const cross = empWeight ? verifyFloorWeights(empWeight, mgrWeight) : null;

                  return (
                    <tr key={t.id}>
                      <td className="whitespace-nowrap">
                        <div className="font-mono font-bold text-white tracking-wide">{t.style_number || 'Style Run'}</div>
                        <div className="text-[11px] text-slate-400 font-medium flex items-center gap-1.5 mt-0.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-primary/80 inline-block" />
                          {t.stage_name}
                        </div>
                      </td>
                      <td className="whitespace-nowrap">
                        <Badge variant="neutral">{t.department_name}</Badge>
                      </td>
                      <td className="min-w-[280px] max-w-[360px] whitespace-normal">
                        <div className="font-medium text-slate-200 text-xs leading-relaxed break-words">
                          {t.specification}
                        </div>
                        {t.employee_notes && (
                          <div className="text-[11px] text-sky-400 mt-1.5 p-1.5 rounded bg-sky-950/40 border border-sky-800/30 flex items-start gap-1.5 break-words">
                            <span className="text-[10px] uppercase font-bold text-sky-400 shrink-0 tracking-wider">Note:</span>
                            <span className="italic leading-tight text-sky-200/90">{t.employee_notes}</span>
                          </div>
                        )}
                      </td>
                      <td className="whitespace-nowrap">
                        <div className="text-slate-300 font-medium flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-400 text-[10px] font-bold">
                            {t.assigned_to_name ? t.assigned_to_name.charAt(0).toUpperCase() : '?'}
                          </div>
                          <span>{t.assigned_to_name}</span>
                        </div>
                      </td>
                      {/* Floor Weight Entry Column */}
                      <td className="whitespace-nowrap">
                        {empWeight ? (
                          <div className="mono-num text-[11px] space-y-0.5">
                            <div className="font-bold text-sky-300 flex items-center gap-1.5">
                              <span>{empWeight} kg</span>
                              <span className="text-[10px] text-slate-400 font-normal">({t.employee_piece_count || 500} pcs)</span>
                            </div>
                            <div className="text-[10px] text-amber-400/90 flex items-center gap-1 font-sans">
                              <span>Scrap: <span className="font-mono">{t.employee_waste_scrap_weight_kg || 0} kg</span></span>
                              <span className="text-slate-600">&bull;</span>
                              <span className="text-slate-400 truncate max-w-[90px]">{t.machine_scale_id || 'Scale'}</span>
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-500 text-[11px] italic flex items-center gap-1">
                            <Clock className="w-3 h-3 text-slate-600 inline" />
                            Awaiting floor weight
                          </span>
                        )}
                      </td>
                      {/* Cross-Verification Discrepancy Column */}
                      <td className="whitespace-nowrap">
                        {cross ? (
                          <div className="space-y-1">
                            <Badge
                              variant={
                                cross.status === 'matched'
                                  ? 'success'
                                  : cross.status === 'minor_variance'
                                  ? 'warning'
                                  : 'danger'
                              }
                              dot
                            >
                              {cross.statusLabel}
                            </Badge>
                            <div className="text-[10px] mono-num text-slate-400">
                              Variance: <span className={cross.status === 'critical_mismatch' ? 'text-rose-400 font-semibold' : 'text-slate-300'}>{cross.discrepancyKg} kg</span> ({cross.discrepancyPct}%)
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-500 text-[11px]">—</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap">
                        <div className="mono-num text-slate-300 text-xs">{t.expected_completion_date}</div>
                        {t.actual_days_taken !== undefined && (
                          <div className="text-[10px] text-emerald-400 font-medium mt-0.5">
                            Took {t.actual_days_taken} day{t.actual_days_taken === 1 ? '' : 's'}
                          </div>
                        )}
                      </td>
                      <td className="whitespace-nowrap">
                        {isManagement ? (
                          <select
                            value={t.status}
                            onChange={(e) => handleUpdateStatus(t.id, e.target.value as any)}
                            className="bg-slate-900 border border-slate-700 text-xs rounded px-2.5 py-1 text-white font-medium focus:outline-none focus:border-primary cursor-pointer hover:border-slate-600 transition"
                          >
                            <option value="pending">Pending</option>
                            <option value="in_progress">In Progress</option>
                            <option value="completed">Completed</option>
                          </select>
                        ) : (
                          <Badge
                            variant={
                              t.status === 'completed'
                                ? 'success'
                                : t.status === 'in_progress'
                                ? 'info'
                                : 'warning'
                            }
                            dot
                          >
                            {t.status.replace(/_/g, ' ')}
                          </Badge>
                        )}
                      </td>
                      <td className="text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          {/* Employee Floor Measurement Entry Button */}
                          <button
                            onClick={() => handleOpenFloorMeasurement(t)}
                            className="px-2.5 py-1 rounded-md bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/30 text-sky-300 text-xs font-medium transition flex items-center gap-1.5"
                            title="Enter or edit bundle weights, selvage waste, and piece count"
                          >
                            <Scale className="w-3.5 h-3.5" />
                            {empWeight ? 'Edit Weight' : 'Enter Weight'}
                          </button>

                          <button
                            onClick={() => handleOpenEditTask(t)}
                            className="px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-medium transition"
                            title="Edit task specifications, assigned staff, target weight, or status"
                          >
                            Edit Task
                          </button>

                          {/* Mark Complete: Management can always do it, employees can do it for their own tasks */}
                          {t.status !== 'completed' && (isManagement || t.assigned_to === currentUser.id) && (
                            <button
                              onClick={() => {
                                if (!isManagement && !t.employee_measured_output_weight_kg) {
                                  alert('Please enter your floor weight measurement before marking complete.');
                                  return;
                                }
                                handleUpdateStatus(t.id, 'completed');
                                setFeedback(`✓ Task marked complete. Pipeline stage auto-advancing to next department.`);
                                setTimeout(() => setFeedback(null), 5000);
                              }}
                              className="px-2.5 py-1 rounded-md bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 text-xs font-medium transition"
                            >
                              {isManagement ? 'Mark Verified' : 'Mark Complete'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL / DRAWER: ENTER FLOOR MEASUREMENTS (For Employees & Managers) */}
      {selectedTaskForEntry && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-[#111726] border border-slate-700 rounded-lg max-w-lg w-full p-6 shadow-2xl space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <span className="text-[10px] uppercase font-semibold text-slate-500">Floor Operator Work Slip</span>
                <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                  Record Garment Weights: {selectedTaskForEntry.style_number} ({selectedTaskForEntry.stage_name})
                </h2>
              </div>
              <button
                onClick={() => setSelectedTaskForEntry(null)}
                className="text-slate-400 hover:text-white font-mono"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitFloorMeasurement} className="space-y-4">
              <div className="p-3 bg-slate-900/90 border border-slate-800 rounded space-y-1">
                <span className="text-slate-400 text-[10px] uppercase font-semibold">Assigned Task Specification:</span>
                <div className="text-slate-200 font-medium">{selectedTaskForEntry.specification}</div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-bold mb-1">
                    Floor Measured Output Weight (kg) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="e.g. 80.00"
                    value={measuredOutputWeight || ''}
                    onChange={(e) => setMeasuredOutputWeight(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-950 border border-sky-600/80 rounded p-2 text-white font-mono text-sm focus:outline-none focus:ring-1 focus:ring-sky-500"
                  />
                  <span className="text-[10px] text-slate-500 mt-0.5 block">Actual bundle weight on floor</span>
                </div>

                <div>
                  <label className="block text-slate-300 font-bold mb-1">
                    Selvage / Scrap Waste Weight (kg)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="e.g. 10.00"
                    value={measuredScrapWeight || ''}
                    onChange={(e) => setMeasuredScrapWeight(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-white font-mono text-sm focus:outline-none"
                  />
                  <span className="text-[10px] text-slate-500 mt-0.5 block">Trimming & edge scrap byproduct</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-medium mb-1">Total Garment Pieces Processed</label>
                  <input
                    type="number"
                    value={pieceCount}
                    onChange={(e) => setPieceCount(parseInt(e.target.value) || 0)}
                    className="w-full bg-slate-950 border border-slate-700 rounded p-1.5 text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 font-medium mb-1">Scale / Calibration Table ID</label>
                  <input
                    type="text"
                    value={scaleId}
                    onChange={(e) => setScaleId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded p-1.5 text-white font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-400 font-medium mb-1">Operator Notes / Defect Observations</label>
                <textarea
                  rows={2}
                  placeholder="Record ply count, roll shrinkage, fabric shade match..."
                  value={employeeNotes}
                  onChange={(e) => setEmployeeNotes(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-white text-xs focus:outline-none"
                />
              </div>

              {/* LIVE CROSS-VERIFICATION & ERROR CALCULATION PREVIEW */}
              {measuredOutputWeight > 0 && (
                <div className="p-3 bg-slate-900 border border-slate-700 rounded space-y-2">
                  <div className="flex items-center justify-between font-bold text-slate-200">
                    <span>Live Cross-Verification & Weight Discrepancy Error</span>
                    <Badge variant="info">Realtime Formula</Badge>
                  </div>

                  {(() => {
                    const mgrAssigned = selectedTaskForEntry.manager_assigned_weight_kg || 90.0;
                    const cross = verifyFloorWeights(measuredOutputWeight, mgrAssigned);

                    return (
                      <div className="space-y-1.5 text-[11px]">
                        <div className="grid grid-cols-3 gap-2 text-center">
                          <div className="bg-slate-950 p-1.5 rounded">
                            <span className="text-[10px] text-slate-500 block">Supervisor Target</span>
                            <span className="mono-num font-bold text-white">{mgrAssigned} kg</span>
                          </div>
                          <div className="bg-slate-950 p-1.5 rounded">
                            <span className="text-[10px] text-slate-500 block">Employee Output</span>
                            <span className="mono-num font-bold text-sky-400">{measuredOutputWeight} kg</span>
                          </div>
                          <div className="bg-slate-950 p-1.5 rounded">
                            <span className="text-[10px] text-slate-500 block">Scrap Byproduct</span>
                            <span className="mono-num font-bold text-amber-400">{measuredScrapWeight} kg</span>
                          </div>
                        </div>

                        <div className="p-2 rounded bg-slate-950 border border-slate-800 flex items-center justify-between">
                          <span className="text-slate-400">Discrepancy Error:</span>
                          <span className={`mono-num font-bold ${cross.status === 'matched' ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {cross.discrepancyKg} kg variance ({cross.discrepancyPct}%)
                          </span>
                        </div>

                        <div className="text-[10px] text-slate-300 italic">
                          {cross.message}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              <div className="pt-2 flex justify-end gap-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setSelectedTaskForEntry(null)}
                  className="px-3 py-1.5 bg-slate-800 rounded text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-primary font-semibold text-primary-foreground rounded hover:bg-primary/90 shadow-sm"
                >
                  Submit Floor Weight & Complete Task
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ASSIGN NEW TASK (Management Only) */}
      {isNewTaskOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-[#111726] border border-slate-700 rounded-lg max-w-lg w-full p-6 shadow-2xl space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                Assign Production Floor Task
              </h2>
              <button onClick={() => setIsNewTaskOpen(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <form onSubmit={handleCreateTask} className="space-y-3.5">
              <div>
                <label className="block text-slate-400 font-medium mb-1">
                  Active Production Stage *
                </label>
                <select
                  required
                  value={selectedStageLogId}
                  onChange={(e) => {
                    setSelectedStageLogId(e.target.value);
                    const log = stageLogs.find((l) => l.id === e.target.value);
                    if (log?.department_id) setSelectedDeptId(log.department_id);
                    if (log?.input_weight_kg) setAssignedTargetWeight(log.input_weight_kg);
                  }}
                  className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white font-mono"
                >
                  <option value="">-- Choose active stage --</option>
                  {stageLogs.map((l) => (
                    <option key={l.id} value={l.id}>
                      Stage #{l.stage_order}: {l.stage_name} ({l.department_name})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-medium mb-1">Department *</label>
                  <select
                    required
                    value={selectedDeptId}
                    onChange={(e) => setSelectedDeptId(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white"
                  >
                    <option value="">-- Select department --</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 font-medium mb-1">Assign to Employee *</label>
                  <select
                    required
                    value={selectedEmployeeId}
                    onChange={(e) => setSelectedEmployeeId(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white"
                  >
                    <option value="">-- Select employee --</option>
                    {users.filter((u) => u.active).map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.full_name} ({u.role}{u.department_name ? ` - ${u.department_name}` : ''})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-medium mb-1">
                    Supervisor Target Weight (kg)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={assignedTargetWeight}
                    onChange={(e) => setAssignedTargetWeight(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 font-medium mb-1">Expected Completion Date *</label>
                  <input
                    type="date"
                    required
                    value={expectedDate}
                    onChange={(e) => setExpectedDate(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-400 font-medium mb-1">Task Specification *</label>
                <textarea
                  required
                  rows={2}
                  placeholder="e.g. Cut 500 pcs jogger panels per marker. Weigh cut panels and edge scrap on Table Scale #2."
                  value={specification}
                  onChange={(e) => setSpecification(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-xs focus:outline-none focus:border-primary"
                />
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsNewTaskOpen(false)}
                  className="px-3 py-1.5 bg-slate-800 rounded text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-primary font-semibold text-primary-foreground rounded hover:bg-primary/90"
                >
                  Assign Task
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: EDIT TASK DETAILS (Edit any completed or in-progress task) */}
      {selectedTaskForEdit && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-[#111726] border border-slate-700 rounded-lg max-w-lg w-full p-6 shadow-2xl space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                  <CheckSquare className="w-4 h-4 text-primary" />
                  Edit Task Details #{selectedTaskForEdit.id.slice(-6)}
                </h2>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Update task specification, department assignment, target weights, or status (even when completed).
                </p>
              </div>
              <button
                onClick={() => setSelectedTaskForEdit(null)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEditTask} className="space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-medium mb-1">Department</label>
                  <select
                    value={editDeptId}
                    onChange={(e) => setEditDeptId(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white"
                  >
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 font-medium mb-1">Assign Staff</label>
                  <select
                    value={editEmployeeId}
                    onChange={(e) => setEditEmployeeId(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white"
                  >
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.full_name} ({u.role.toUpperCase()})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-400 font-medium mb-1">
                    Supervisor Target (kg)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={editTargetWeight}
                    onChange={(e) => setEditTargetWeight(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 font-medium mb-1">Expected Date</label>
                  <input
                    type="date"
                    value={editExpectedDate}
                    onChange={(e) => setEditExpectedDate(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 font-medium mb-1">Status</label>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value as any)}
                    className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white font-semibold"
                  >
                    <option value="pending">Pending</option>
                    <option value="in_progress">In Progress</option>
                    <option value="completed">Completed</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-400 font-medium mb-1">Task Specification</label>
                <textarea
                  rows={2}
                  value={editSpec}
                  onChange={(e) => setEditSpec(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-xs focus:outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-medium mb-1">Supervisor Notes / Remarks</label>
                <input
                  type="text"
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="Optional remarks or quality instructions"
                  className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-xs focus:outline-none focus:border-primary"
                />
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setSelectedTaskForEdit(null)}
                  className="px-3 py-1.5 bg-slate-800 rounded text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-primary font-semibold text-primary-foreground rounded hover:bg-primary/90"
                >
                  Save Task Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
