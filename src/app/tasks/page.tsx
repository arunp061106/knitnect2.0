'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Task, Department, ProductionStageLog } from '@/lib/types/erp';
import { Badge } from '@/components/ui/Badge';
import { verifyFloorWeights } from '@/lib/domain/loss';
import { exportToExcel } from '@/lib/excel/excelExport';
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

interface SimpleProfile {
  id: string;
  full_name: string;
  email: string;
  role: string;
  department_id?: string | null;
  department_name?: string;
}

export default function TasksPage() {
  const router = useRouter();
  const supabase = createClient();

  const [isMounted, setIsMounted] = useState(false);
  const [currentUser, setCurrentUser] = useState<SimpleProfile>({
    id: '',
    full_name: '',
    email: '',
    role: 'manager',
  });
  const [tasks, setTasks] = useState<Task[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [users, setUsers] = useState<SimpleProfile[]>([]);
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

  const fetchData = useCallback(async () => {
    // 1. Fetch tasks with relations
    const { data: tData, error: tErr } = await supabase
      .from('tasks')
      .select(`
        *,
        departments (
          id,
          name
        ),
        profiles!tasks_assigned_to_fkey (
          id,
          full_name,
          email,
          role
        ),
        production_stage_logs (
          id,
          stage_name,
          stage_order,
          input_weight_kg,
          output_weight_kg,
          scrap_waste_kg,
          piece_count,
          machine_scale_id,
          stage_notes,
          production_runs (
            id,
            style_number
          )
        )
      `)
      .order('created_at', { ascending: false });

    if (tErr) console.error('Error fetching tasks:', tErr);
    if (tData) {
      const mapped: Task[] = tData.map((t: any) => {
        const stage = t.production_stage_logs;
        return {
          id: t.id,
          department_id: t.department_id,
          department_name: t.departments?.name,
          assigned_to: t.assigned_to,
          assigned_to_name: t.profiles?.full_name || 'Unassigned',
          created_by: t.created_by,
          specification: t.specification,
          status: t.status,
          expected_completion_date: t.expected_completion_date || '',
          actual_completion_date: t.actual_completion_date,
          actual_days_taken: t.actual_days_taken,
          notes: t.notes,
          production_stage_log_id: t.production_stage_log_id,
          created_at: t.created_at,
          stage_name: stage?.stage_name || 'Production Stage',
          style_number: stage?.production_runs?.style_number,
          manager_assigned_weight_kg: Number(stage?.input_weight_kg || 90),
          employee_measured_output_weight_kg: Number(stage?.output_weight_kg || 0),
          employee_waste_scrap_weight_kg: Number(stage?.scrap_waste_kg || 0),
          employee_piece_count: Number(stage?.piece_count || 0),
          machine_scale_id: stage?.machine_scale_id || '',
          employee_notes: stage?.stage_notes || '',
        };
      });
      setTasks(mapped);
    }

    // 2. Fetch departments
    const { data: dData } = await supabase.from('departments').select('*').order('name');
    if (dData) setDepartments(dData as Department[]);

    // 3. Fetch users
    const { data: uData } = await supabase
      .from('profiles')
      .select('id, full_name, email, role, department_id, departments(name)')
      .order('full_name');
    if (uData) {
      setUsers(
        uData.map((u: any) => ({
          id: u.id,
          full_name: u.full_name,
          email: u.email,
          role: u.role,
          department_id: u.department_id,
          department_name: u.departments?.name,
        }))
      );
    }

    // 4. Fetch stage logs
    const { data: stData } = await supabase
      .from('production_stage_logs')
      .select('*, production_runs(style_number)')
      .order('stage_order');
    if (stData) setStageLogs(stData as ProductionStageLog[]);
  }, [supabase]);

  useEffect(() => {
    setIsMounted(true);
    const init = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace('/login');
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('id, role, full_name, email, department_id, departments(name)')
        .eq('id', user.id)
        .single();

      if (!profile) {
        router.replace('/login');
        return;
      }

      if (profile.role === 'employee') {
        router.replace('/employee/tasks');
        return;
      }

      setCurrentUser({
        id: profile.id,
        role: profile.role,
        full_name: profile.full_name || 'Staff',
        email: profile.email || '',
        department_id: profile.department_id,
        department_name: (profile.departments as any)?.name,
      });

      await fetchData();
    };

    init();
  }, [supabase, router, fetchData]);

  const isManagement = isMounted ? currentUser.role === 'owner' || currentUser.role === 'manager' : false;

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

  const handleSaveEditTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTaskForEdit) return;

    const { error: tErr } = await supabase
      .from('tasks')
      .update({
        specification: editSpec,
        department_id: editDeptId,
        assigned_to: editEmployeeId,
        expected_completion_date: editExpectedDate,
        status: editStatus,
        notes: editNotes,
      })
      .eq('id', selectedTaskForEdit.id);

    if (tErr) {
      alert('Failed to update task: ' + tErr.message);
      return;
    }

    if (selectedTaskForEdit.production_stage_log_id && editTargetWeight > 0) {
      await supabase
        .from('production_stage_logs')
        .update({
          input_weight_kg: editTargetWeight,
        })
        .eq('id', selectedTaskForEdit.production_stage_log_id);
    }

    await supabase.from('audit_log').insert({
      user_id: currentUser.id,
      action: 'UPDATE',
      table_name: 'tasks',
      record_id: selectedTaskForEdit.id,
      notes: `Updated task details for #${selectedTaskForEdit.id.slice(-6)}`,
    });

    setFeedback('Task details updated successfully.');
    setSelectedTaskForEdit(null);
    setTimeout(() => setFeedback(null), 3000);
    await fetchData();
  };

  const handleOpenFloorMeasurement = (task: Task) => {
    setSelectedTaskForEntry(task);
    setMeasuredOutputWeight(task.employee_measured_output_weight_kg || 80);
    setMeasuredScrapWeight(task.employee_waste_scrap_weight_kg || 10);
    setPieceCount(task.employee_piece_count || 500);
    setScaleId(task.machine_scale_id || 'Scale #2 - Table A');
    setEmployeeNotes(task.employee_notes || '');
  };

  const handleSubmitFloorMeasurement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTaskForEntry) return;

    if (measuredOutputWeight <= 0) {
      alert('Please enter a valid measured output weight in kg.');
      return;
    }

    if (selectedTaskForEntry.production_stage_log_id) {
      await supabase
        .from('production_stage_logs')
        .update({
          output_weight_kg: Number(measuredOutputWeight),
          scrap_waste_kg: Number(measuredScrapWeight),
          piece_count: Number(pieceCount),
          machine_scale_id: scaleId,
          stage_notes: employeeNotes,
          status: 'done',
          completed_at: new Date().toISOString(),
        })
        .eq('id', selectedTaskForEntry.production_stage_log_id);
    }

    const today = new Date().toISOString().split('T')[0];
    const { error: tErr } = await supabase
      .from('tasks')
      .update({
        status: 'completed',
        actual_completion_date: today,
        actual_days_taken: 1,
      })
      .eq('id', selectedTaskForEntry.id);

    if (tErr) {
      alert('Failed to submit floor measurement: ' + tErr.message);
      return;
    }

    await supabase.from('audit_log').insert({
      user_id: currentUser.id,
      action: 'UPDATE',
      table_name: 'tasks',
      record_id: selectedTaskForEntry.id,
      notes: `Floor measurement logged: ${measuredOutputWeight} kg on ${scaleId}`,
    });

    setFeedback('Floor measurement submitted successfully.');
    setSelectedTaskForEntry(null);
    setTimeout(() => setFeedback(null), 4000);
    await fetchData();
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!specification || !expectedDate || !selectedDeptId || !selectedEmployeeId) {
      alert('Please complete all required task fields.');
      return;
    }

    const stageId = selectedStageLogId || stageLogs[0]?.id || null;

    const { error: insErr } = await supabase.from('tasks').insert({
      production_stage_log_id: stageId,
      department_id: selectedDeptId,
      assigned_to: selectedEmployeeId,
      created_by: currentUser.id,
      specification: specification.trim(),
      expected_completion_date: expectedDate,
      status: 'pending',
      notes: taskNotes,
    });

    if (insErr) {
      alert('Failed to create task: ' + insErr.message);
      return;
    }

    if (stageId && assignedTargetWeight > 0) {
      await supabase
        .from('production_stage_logs')
        .update({
          input_weight_kg: assignedTargetWeight,
        })
        .eq('id', stageId);
    }

    await supabase.from('audit_log').insert({
      user_id: currentUser.id,
      action: 'CREATE',
      table_name: 'tasks',
      notes: `Assigned new task to ${users.find((u) => u.id === selectedEmployeeId)?.full_name || 'staff'}`,
    });

    setIsNewTaskOpen(false);
    setSpecification('');
    setExpectedDate('');
    setTaskNotes('');
    setFeedback('Task assigned successfully with target weight.');
    setTimeout(() => setFeedback(null), 3000);
    await fetchData();
  };

  const handleExportTasksExcel = () => {
    try {
      const rows = tasks.map((t) => {
        const discrepancy =
          t.manager_assigned_weight_kg && t.employee_measured_output_weight_kg
            ? Math.abs(t.manager_assigned_weight_kg - t.employee_measured_output_weight_kg).toFixed(2)
            : '0.00';
        return {
          task_id: t.id,
          stage_name: t.stage_name || 'Production Stage',
          department: t.department_name || '',
          assigned_employee: t.assigned_to_name || '',
          specification: t.specification,
          status: t.status.toUpperCase(),
          manager_assigned_weight: t.manager_assigned_weight_kg || 0,
          employee_measured_output: t.employee_measured_output_weight_kg || 'Pending',
          employee_scrap_weight: t.employee_waste_scrap_weight_kg || 0,
          piece_count: t.employee_piece_count || 0,
          scale_id: t.machine_scale_id || 'N/A',
          discrepancy,
          expected_date: t.expected_completion_date,
          notes: t.notes || '',
        };
      });

      exportToExcel(
        [
          {
            name: 'Floor Tasks Log',
            columns: [
              { header: 'Task ID', key: 'task_id', width: 14 },
              { header: 'Stage Name', key: 'stage_name', width: 18 },
              { header: 'Department', key: 'department', width: 16 },
              { header: 'Assigned Employee', key: 'assigned_employee', width: 20 },
              { header: 'Specification', key: 'specification', width: 30 },
              { header: 'Status', key: 'status', width: 12 },
              { header: 'Target Weight (kg)', key: 'manager_assigned_weight', width: 18 },
              { header: 'Measured Output (kg)', key: 'employee_measured_output', width: 20 },
              { header: 'Scrap Weight (kg)', key: 'employee_scrap_weight', width: 18 },
              { header: 'Piece Count', key: 'piece_count', width: 14 },
              { header: 'Scale ID', key: 'scale_id', width: 16 },
              { header: 'Discrepancy (kg)', key: 'discrepancy', width: 16 },
              { header: 'Expected Date', key: 'expected_date', width: 16 },
              { header: 'Notes', key: 'notes', width: 25 },
            ],
            rows,
          },
        ],
        'Floor-Tasks-Weighing-Log.xlsx'
      );

      setFeedback('Floor tasks & floor measurements exported to Excel (.xlsx)!');
      setTimeout(() => setFeedback(null), 4000);
    } catch (err) {
      console.error(err);
      alert('Tasks exported.');
    }
  };

  const handleUpdateStatus = async (taskId: string, newStatus: 'pending' | 'in_progress' | 'completed') => {
    const today = new Date().toISOString().split('T')[0];
    const { error } = await supabase
      .from('tasks')
      .update({
        status: newStatus,
        actual_completion_date: newStatus === 'completed' ? today : null,
      })
      .eq('id', taskId);

    if (error) {
      alert('Failed to update task status: ' + error.message);
      return;
    }

    const task = tasks.find((t) => t.id === taskId);
    if (newStatus === 'completed' && task?.production_stage_log_id) {
      await supabase
        .from('production_stage_logs')
        .update({
          status: 'done',
          completed_at: new Date().toISOString(),
        })
        .eq('id', task.production_stage_log_id);
    }

    await supabase.from('audit_log').insert({
      user_id: currentUser.id,
      action: 'UPDATE',
      table_name: 'tasks',
      record_id: taskId,
      notes: `Updated status to ${newStatus}`,
    });

    setFeedback(`Task status updated to "${newStatus.toUpperCase()}".`);
    setTimeout(() => setFeedback(null), 3000);
    await fetchData();
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
            <div className="text-[11px] text-slate-500 mt-1">Awaiting machine assignment</div>
          </div>

          <div className="kpi-card">
            <div className="kpi-label">Tasks Completed</div>
            <div className="kpi-value text-emerald-400">
              {tasks.filter((t) => t.status === 'completed').length}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">Ready for next process stage</div>
          </div>
        </div>
      )}

      {/* Filter Strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-[#111726] border border-slate-800 rounded text-xs">
        <div className="flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-slate-400" />
          <span className="font-semibold text-slate-300">Filters:</span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400">Status:</span>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white focus:outline-none"
            >
              <option value="ALL">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-slate-400">Department:</span>
            <select
              value={filterDepartment}
              onChange={(e) => setFilterDepartment(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white focus:outline-none"
            >
              <option value="ALL">All Departments</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Tasks Table */}
      <div className="bg-[#101625] border border-slate-800 rounded overflow-hidden">
        <div className="overflow-x-auto">
          <table className="erp-table text-xs">
            <thead>
              <tr>
                <th>Task ID / Stage</th>
                <th>Department</th>
                <th>Assigned Staff</th>
                <th>Specification</th>
                <th>Target Weight</th>
                <th>Floor Measured Weight</th>
                <th>Cross-Verification Discrepancy</th>
                <th>Expected Date</th>
                <th>Status</th>
                <th className="text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredTasks.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center py-8 text-slate-500 text-xs">
                    No tasks match the selected filter criteria.
                  </td>
                </tr>
              ) : (
                filteredTasks.map((t) => {
                  const targetWeight = t.manager_assigned_weight_kg || 0;
                  const measuredWeight = t.employee_measured_output_weight_kg || 0;
                  const cross =
                    targetWeight > 0 && measuredWeight > 0
                      ? verifyFloorWeights(measuredWeight, targetWeight)
                      : null;

                  return (
                    <tr key={t.id}>
                      <td className="font-mono text-white">
                        <div className="font-bold text-xs">{t.stage_name || 'Production Stage'}</div>
                        <div className="text-[10px] text-slate-400 font-mono">#{t.id.slice(-6)}</div>
                      </td>
                      <td className="text-slate-300 font-medium">
                        <div className="flex items-center gap-1.5">
                          <Building2 className="w-3.5 h-3.5 text-slate-500" />
                          {t.department_name}
                        </div>
                      </td>
                      <td className="text-slate-200">
                        <div className="flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 text-slate-400" />
                          <span className="font-medium">{t.assigned_to_name}</span>
                        </div>
                      </td>
                      <td className="text-slate-300 max-w-[220px]">
                        <p className="line-clamp-2">{t.specification}</p>
                      </td>
                      <td className="mono-num text-slate-300">
                        {t.manager_assigned_weight_kg ? (
                          <span className="font-semibold text-slate-200">
                            {t.manager_assigned_weight_kg} kg
                          </span>
                        ) : (
                          <span className="text-slate-500 text-[11px]">—</span>
                        )}
                      </td>
                      <td className="mono-num">
                        {t.employee_measured_output_weight_kg ? (
                          <div>
                            <span className="font-bold text-sky-400">
                              {t.employee_measured_output_weight_kg} kg
                            </span>
                            <div className="text-[10px] text-slate-400 font-normal">
                              Scrap: {t.employee_waste_scrap_weight_kg || 0} kg • Pcs: {t.employee_piece_count || 0}
                            </div>
                            <div className="text-[9px] text-slate-500 font-mono">
                              {t.machine_scale_id}
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
                                  : (cross.status as string) === 'minor_variance'
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
                            className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white font-medium focus:outline-none"
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
                          >
                            {t.status.toUpperCase()}
                          </Badge>
                        )}
                      </td>
                      <td className="text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5 justify-end">
                          <button
                            onClick={() => handleOpenFloorMeasurement(t)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-sky-950 text-sky-300 border border-sky-800 hover:bg-sky-900 transition text-[11px] font-semibold"
                          >
                            <Scale className="w-3 h-3 text-sky-400" />
                            {t.employee_measured_output_weight_kg ? 'Re-Weigh' : 'Log Weight'}
                          </button>
                          {isManagement && (
                            <button
                              onClick={() => handleOpenEditTask(t)}
                              className="px-2 py-1 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white transition text-[11px]"
                            >
                              Edit
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

      {/* MODAL: FLOOR OPERATOR MEASUREMENT DRAWER */}
      {selectedTaskForEntry && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-[#111726] border border-slate-700 rounded-lg max-w-lg w-full p-6 shadow-2xl space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                  Log Operator Floor Weight Measurement
                </h2>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Task #{selectedTaskForEntry.id.slice(-6)} • {selectedTaskForEntry.stage_name}
                </p>
              </div>
              <button
                onClick={() => setSelectedTaskForEntry(null)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitFloorMeasurement} className="space-y-4">
              <div className="p-3 bg-slate-900 rounded border border-slate-800 space-y-1">
                <div className="text-slate-400">Supervisor Target Weight:</div>
                <div className="text-base font-bold text-emerald-400 font-mono">
                  {selectedTaskForEntry.manager_assigned_weight_kg
                    ? `${selectedTaskForEntry.manager_assigned_weight_kg} kg`
                    : 'Not Specified'}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-medium mb-1">
                    Floor Measured Output (kg) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={measuredOutputWeight}
                    onChange={(e) => setMeasuredOutputWeight(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white font-mono text-sm"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 font-medium mb-1">
                    Scrap / Selvage Waste (kg)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={measuredScrapWeight}
                    onChange={(e) => setMeasuredScrapWeight(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white font-mono text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-medium mb-1">Piece Count</label>
                  <input
                    type="number"
                    value={pieceCount}
                    onChange={(e) => setPieceCount(parseInt(e.target.value) || 0)}
                    className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 font-medium mb-1">Floor Scale / Table ID</label>
                  <input
                    type="text"
                    value={scaleId}
                    onChange={(e) => setScaleId(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-400 font-medium mb-1">Floor Operator Notes</label>
                <textarea
                  rows={2}
                  value={employeeNotes}
                  onChange={(e) => setEmployeeNotes(e.target.value)}
                  placeholder="Record edge tears, machine tension remarks, or reason for scrap variance..."
                  className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-xs"
                />
              </div>

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
                  className="px-4 py-1.5 bg-primary font-semibold text-primary-foreground rounded hover:bg-primary/90"
                >
                  Confirm & Submit Weight
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ASSIGN NEW TASK */}
      {isNewTaskOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-[#111726] border border-slate-700 rounded-lg max-w-lg w-full p-6 shadow-2xl space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                Assign Stage Task & Target Weight
              </h2>
              <button onClick={() => setIsNewTaskOpen(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <form onSubmit={handleCreateTask} className="space-y-3.5">
              <div>
                <label className="block text-slate-400 font-medium mb-1">Stage *</label>
                <select
                  required
                  value={selectedStageLogId}
                  onChange={(e) => setSelectedStageLogId(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white font-mono"
                >
                  <option value="">-- Choose pipeline stage --</option>
                  {stageLogs.map((s) => (
                    <option key={s.id} value={s.id}>
                      Stage {s.stage_order}: {s.stage_name} ({s.status})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-medium mb-1">Target Department *</label>
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
                  <label className="block text-slate-400 font-medium mb-1">Assignee Employee *</label>
                  <select
                    required
                    value={selectedEmployeeId}
                    onChange={(e) => setSelectedEmployeeId(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white"
                  >
                    <option value="">-- Select employee --</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.full_name} ({u.role.toUpperCase()})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-medium mb-1">
                    Supervisor Target Weight (kg) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={assignedTargetWeight}
                    onChange={(e) => setAssignedTargetWeight(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 font-medium mb-1">Expected Date *</label>
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
                <label className="block text-slate-400 font-medium mb-1">
                  Task Specification & Guidelines *
                </label>
                <textarea
                  required
                  rows={2}
                  value={specification}
                  onChange={(e) => setSpecification(e.target.value)}
                  placeholder="e.g. Cut 500 pcs size M from Roll #3, inspect Selvage tension"
                  className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-xs"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-medium mb-1">Supervisor Notes</label>
                <input
                  type="text"
                  value={taskNotes}
                  onChange={(e) => setTaskNotes(e.target.value)}
                  placeholder="Optional internal supervisor instructions"
                  className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-slate-800">
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

      {/* MODAL: EDIT ANY TASK (INCLUDING COMPLETED) */}
      {selectedTaskForEdit && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-[#111726] border border-slate-700 rounded-lg max-w-xl w-full p-6 shadow-2xl space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                  Edit Task #{selectedTaskForEdit.id.slice(-6)}
                </h2>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {selectedTaskForEdit.stage_name}
                </p>
              </div>
              <button onClick={() => setSelectedTaskForEdit(null)} className="text-slate-400 hover:text-white">✕</button>
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
