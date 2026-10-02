'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { exportToExcel } from '@/lib/excel/excelExport';
import { createClient } from '@/lib/supabase/client';
import { ProductionRun, ProductionStageLog, BatchTransfer } from '@/lib/types/erp';
import { Badge } from '@/components/ui/Badge';
import { computeStageLoss, verifyFloorWeights, STAGE_BENCHMARK_LOSS_PCT, DEFAULT_BLENDED_FABRIC_COST_PER_KG } from '@/lib/domain/loss';
import {
  GitBranch,
  TrendingDown,
  ArrowRight,
  Scale,
  CheckCircle2,
  AlertTriangle,
  Lightbulb,
  Clock,
  User,
  Building2,
  RefreshCw,
  Sliders,
  DollarSign,
  AlertOctagon,
  Sparkles,
  Download,
  Layers,
  Play,
  RotateCcw,
  History,
  Calendar,
} from 'lucide-react';

export default function ProductionPipelinePage() {
  const router = useRouter();
  const supabase = createClient();

  const [isMounted, setIsMounted] = useState<boolean>(false);
  const [currentUser, setCurrentUser] = useState<{ id: string; role: string; full_name: string }>({
    id: '',
    role: 'manager',
    full_name: '',
  });
  const [runs, setRuns] = useState<ProductionRun[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string>('');
  const [stageLogs, setStageLogs] = useState<ProductionStageLog[]>([]);
  const [batchTransfers, setBatchTransfers] = useState<BatchTransfer[]>([]);

  // Selected stage for weight entry drawer
  const [activeStageLog, setActiveStageLog] = useState<ProductionStageLog | null>(null);
  const [inputWeight, setInputWeight] = useState<number>(0);
  const [outputWeight, setOutputWeight] = useState<number>(0);
  const [employeeFloorOutput, setEmployeeFloorOutput] = useState<number>(0);
  const [employeeFloorScrap, setEmployeeFloorScrap] = useState<number>(0);
  const [machineScaleId, setMachineScaleId] = useState<string>('SCALE-CUT-01');
  const [stageNotes, setStageNotes] = useState<string>('');

  // Batch Passing State (for parallel batch workflow)
  const [batchPassWeight, setBatchPassWeight] = useState<number>(80);

  // Approval workflow for excess input weight
  const [approvalPending, setApprovalPending] = useState(false);
  const [approvalMaxKg, setApprovalMaxKg] = useState(0);
  const [approvalReason, setApprovalReason] = useState('');

  const [actionMessage, setActionMessage] = useState<string | null>(null);

  // Only management sees financial loss data — employees see stage progress only
  const isManagement = isMounted ? currentUser.role === 'owner' || currentUser.role === 'manager' : false;

  const handleOpenWeightEntry = (stage: ProductionStageLog) => {
    setActiveStageLog(stage);
    setInputWeight(stage.input_weight_kg || 0);
    setOutputWeight(stage.output_weight_kg || 0);
    setEmployeeFloorOutput(
      stage.employee_reported_output_kg !== undefined
        ? stage.employee_reported_output_kg
        : stage.output_weight_kg || 80
    );
    setEmployeeFloorScrap(
      stage.employee_waste_scrap_weight_kg !== undefined
        ? stage.employee_waste_scrap_weight_kg
        : stage.loss_kg || 10
    );
    setMachineScaleId(stage.machine_scale_id || 'SCALE-CUT-01');
    setStageNotes(stage.notes || '');
    setBatchPassWeight(stage.output_weight_kg > 0 ? stage.output_weight_kg : 80);
  };

  const fetchPipelineData = useCallback(async (runIdToSelect?: string) => {
    // 1. Fetch runs with styles
    const { data: rData, error: rErr } = await supabase
      .from('production_runs')
      .select(`
        *,
        styles (
          style_number,
          description,
          garment_process_type
        )
      `)
      .order('created_at', { ascending: false });

    if (rErr) console.error('Error fetching runs:', rErr);

    const allRuns = (rData || []).map((r: any) => ({
      ...r,
      style_number: r.styles?.style_number || r.style_number,
      description: r.styles?.description,
      garment_process_type: r.styles?.garment_process_type,
    }));
    setRuns(allRuns);

    const activeId = runIdToSelect || selectedRunId || allRuns[0]?.id || '';
    if (activeId) {
      if (!selectedRunId || runIdToSelect) {
        setSelectedRunId(activeId);
      }

      // 2. Fetch stage logs
      const { data: stData, error: stErr } = await supabase
        .from('production_stage_logs')
        .select(`
          *,
          departments (
            name
          )
        `)
        .eq('production_run_id', activeId)
        .order('stage_order', { ascending: true });

      if (stErr) console.error('Error fetching stage logs:', stErr);
      if (stData) {
        const logs: ProductionStageLog[] = stData.map((s: any) => ({
          ...s,
          department_name: s.departments?.name,
          employee_reported_output_kg: s.output_weight_kg,
          employee_waste_scrap_weight_kg: s.loss_kg,
        }));
        setStageLogs(logs);

        // Keep active stage log synchronized
        if (activeStageLog) {
          const updatedActive = logs.find((l) => l.id === activeStageLog.id);
          if (updatedActive) {
            setActiveStageLog(updatedActive);
          }
        } else if (logs.length > 0) {
          const currentStage = logs.find((l) => l.status === 'in_progress') || logs[0];
          handleOpenWeightEntry(currentStage);
        }
      }

      // 3. Fetch batch transfers
      const { data: bData } = await supabase
        .from('batch_transfers')
        .select('*')
        .eq('production_run_id', activeId)
        .order('passed_at', { ascending: false });

      if (bData) {
        setBatchTransfers(bData as BatchTransfer[]);
      }
    }
  }, [supabase, selectedRunId, activeStageLog]);

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
        .select('id, role, full_name')
        .eq('id', user.id)
        .single();

      if (!profile) {
        router.replace('/login');
        return;
      }

      if (profile.role === 'employee') {
        router.replace('/employee/pipeline');
        return;
      }

      setCurrentUser({
        id: profile.id,
        role: profile.role,
        full_name: profile.full_name || 'Staff',
      });

      await fetchPipelineData();
    };

    init();
  }, [supabase, router, fetchPipelineData]);

  const selectedRun = runs.find((r) => r.id === selectedRunId) || runs[0];

  const handleSelectRun = async (runId: string) => {
    setSelectedRunId(runId);
    await fetchPipelineData(runId);
  };

  const handleSaveWeights = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeStageLog) return;

    if (inputWeight <= 0 || outputWeight <= 0) {
      alert('Please enter valid input and output weights in kg.');
      return;
    }

    if (outputWeight > inputWeight) {
      alert('Output weight cannot exceed input weight in physical textile processing.');
      return;
    }

    // Previous stage validation
    const prevStage = stageLogs.find((s) => s.stage_order === activeStageLog.stage_order - 1);
    if (prevStage && prevStage.output_weight_kg > 0 && inputWeight > prevStage.output_weight_kg * 1.05) {
      setApprovalPending(true);
      setApprovalMaxKg(prevStage.output_weight_kg);
      return;
    }

    const lossCalc = computeStageLoss(
      activeStageLog.stage_name,
      Number(inputWeight),
      Number(outputWeight),
      selectedRun?.blended_cost_per_kg || DEFAULT_BLENDED_FABRIC_COST_PER_KG
    );

    const { error: updErr } = await supabase
      .from('production_stage_logs')
      .update({
        input_weight_kg: Number(inputWeight),
        output_weight_kg: Number(outputWeight),
        loss_kg: lossCalc.lossKg,
        loss_pct: lossCalc.lossPct,
        loss_value: lossCalc.lossValue,
        machine_scale_id: machineScaleId,
        stage_notes: stageNotes,
        notes: stageNotes,
      })
      .eq('id', activeStageLog.id);

    if (updErr) {
      alert('Failed to update stage weights: ' + updErr.message);
      return;
    }

    await supabase.from('audit_log').insert({
      user_id: currentUser.id,
      action: 'UPDATE',
      table_name: 'production_stage_logs',
      record_id: activeStageLog.id,
      notes: `Updated weights for Stage ${activeStageLog.stage_order} (${activeStageLog.stage_name}): Loss = ${lossCalc.lossKg} kg (${lossCalc.lossPct}%)`,
    });

    setActionMessage(
      `✓ Updated weights for Stage ${activeStageLog.stage_order} ("${activeStageLog.stage_name}"): Loss = ${lossCalc.lossKg} kg (${lossCalc.lossPct}%) · Value = ₹${lossCalc.lossValue}.`
    );
    setTimeout(() => setActionMessage(null), 5000);
    await fetchPipelineData();
  };

  // Parallel Batch Progression: Pass Batch Forward to Downstream Stage
  const handlePassBatchForward = async () => {
    if (!activeStageLog || !selectedRun) return;
    if (batchPassWeight <= 0) {
      alert('Please enter a valid batch weight in kg to pass forward.');
      return;
    }

    const nextStage = stageLogs.find((s) => s.stage_order === activeStageLog.stage_order + 1);
    if (!nextStage) {
      alert('Cannot pass batch: This is the final stage in the pipeline.');
      return;
    }

    const existingBatches = batchTransfers.filter((b) => b.from_stage_id === activeStageLog.id);
    const batchNo = existingBatches.length + 1;

    const { error: bErr } = await supabase.from('batch_transfers').insert({
      production_run_id: selectedRun.id,
      from_stage_id: activeStageLog.id,
      to_stage_id: nextStage.id,
      batch_number: batchNo,
      weight_kg: Number(batchPassWeight),
      passed_by: currentUser.id,
      notes: stageNotes,
    });

    if (bErr) {
      alert('Failed to pass batch: ' + bErr.message);
      return;
    }

    await supabase
      .from('production_stage_logs')
      .update({
        input_weight_kg: Number(nextStage.input_weight_kg || 0) + Number(batchPassWeight),
        status: 'in_progress',
      })
      .eq('id', nextStage.id);

    await supabase.from('audit_log').insert({
      user_id: currentUser.id,
      action: 'CREATE',
      table_name: 'batch_transfers',
      notes: `Passed Batch #${batchNo} (${batchPassWeight} kg) from Stage ${activeStageLog.stage_order} to Stage ${nextStage.stage_order}`,
    });

    setActionMessage(`✓ Passed Batch #${batchNo} (${batchPassWeight} kg) forward to Stage ${nextStage.stage_order}: ${nextStage.stage_name}`);
    setTimeout(() => setActionMessage(null), 8000);
    await fetchPipelineData();
  };

  // Direct status control for parallel stage management
  const handleSetStageStatus = async (status: 'pending' | 'in_progress' | 'done') => {
    if (!activeStageLog) return;
    const { error } = await supabase
      .from('production_stage_logs')
      .update({
        status,
        completed_at: status === 'done' ? new Date().toISOString() : null,
      })
      .eq('id', activeStageLog.id);

    if (error) {
      alert('Failed to update stage status: ' + error.message);
      return;
    }

    await supabase.from('audit_log').insert({
      user_id: currentUser.id,
      action: 'UPDATE',
      table_name: 'production_stage_logs',
      record_id: activeStageLog.id,
      notes: `Set stage ${activeStageLog.stage_name} to ${status}`,
    });

    setActionMessage(`Stage "${activeStageLog.stage_name}" status set to ${status.toUpperCase()}.`);
    setTimeout(() => setActionMessage(null), 4000);
    await fetchPipelineData();
  };

  const handleAdvanceStage = async (stageLogId: string) => {
    if (!selectedRun) return;
    const currentStage = stageLogs.find((s) => s.id === stageLogId);
    if (!currentStage) return;

    // Mark current done
    await supabase
      .from('production_stage_logs')
      .update({
        status: 'done',
        completed_at: new Date().toISOString(),
      })
      .eq('id', stageLogId);

    // Find next
    const nextStage = stageLogs.find((s) => s.stage_order === currentStage.stage_order + 1);
    if (nextStage) {
      await supabase
        .from('production_stage_logs')
        .update({
          status: 'in_progress',
          input_weight_kg: nextStage.input_weight_kg > 0 ? nextStage.input_weight_kg : currentStage.output_weight_kg,
        })
        .eq('id', nextStage.id);

      await supabase
        .from('production_runs')
        .update({
          current_stage_order: nextStage.stage_order,
          current_stage_name: nextStage.stage_name,
        })
        .eq('id', selectedRun.id);

      setActionMessage(`Advanced pipeline to Stage ${nextStage.stage_order}: ${nextStage.stage_name}.`);
    } else {
      await supabase
        .from('production_runs')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
        })
        .eq('id', selectedRun.id);

      setActionMessage('All 15 pipeline stages completed! Production run finished.');
    }

    setTimeout(() => setActionMessage(null), 6000);
    await fetchPipelineData();
  };

  // Export Production Traveler (.xlsx)
  const handleExportTravelerExcel = () => {
    try {
      const stageRows = stageLogs.map((s) => ({
        stage_order: s.stage_order,
        stage_name: s.stage_name,
        department: s.department_name || 'Production',
        status: s.status.toUpperCase(),
        input_weight_kg: s.input_weight_kg,
        output_weight_kg: s.output_weight_kg,
        loss_kg: s.loss_kg,
        loss_pct: `${s.loss_pct}%`,
        loss_value: s.loss_value,
        floor_output: s.employee_reported_output_kg || 'Pending',
        floor_scrap: s.employee_waste_scrap_weight_kg || 0,
        scale_id: s.machine_scale_id || 'N/A',
        discrepancy_kg: s.weight_discrepancy_kg || 0,
        discrepancy_pct: `${s.weight_discrepancy_pct || 0}%`,
        discrepancy_status: s.discrepancy_status ? s.discrepancy_status.toUpperCase() : 'PENDING',
        notes: s.notes || '',
        completed_at: s.completed_at || '',
      }));

      const summaryRows = [
        { parameter: 'Style Number', value: selectedRun?.style_number || 'KB13P301X1' },
        { parameter: 'Description', value: selectedRun?.description || 'RIN | JOGGING PANTS' },
        { parameter: 'Production Run Type', value: selectedRun?.run_type.toUpperCase() || 'SAMPLE' },
        { parameter: 'Target Quantity', value: selectedRun?.target_qty || 5000 },
        { parameter: 'Blended Fabric Rate (INR/kg)', value: runBlendedCost },
        { parameter: 'Total Stages Count', value: stageLogs.length },
        { parameter: 'Completed Stages', value: completedStagesCount },
        { parameter: 'Active Parallel Stages', value: parallelActiveStages.length },
        { parameter: 'Cumulative Process Loss (kg)', value: totalLossKg },
        { parameter: 'Cumulative Loss Value (INR)', value: totalLossValue },
      ];

      exportToExcel(
        [
          {
            name: 'Production Traveler & Batches',
            columns: [
              { header: 'Stage #', key: 'stage_order', width: 10 },
              { header: 'Stage Name', key: 'stage_name', width: 22 },
              { header: 'Department', key: 'department', width: 20 },
              { header: 'Status', key: 'status', width: 14 },
              { header: 'Input Weight (kg)', key: 'input_weight_kg', width: 18 },
              { header: 'Output Weight (kg)', key: 'output_weight_kg', width: 18 },
              { header: 'Process Loss (kg)', key: 'loss_kg', width: 16 },
              { header: 'Loss (%)', key: 'loss_pct', width: 12 },
              { header: 'Loss Value (INR)', key: 'loss_value', width: 18 },
              { header: 'Floor Output (kg)', key: 'floor_output', width: 18 },
              { header: 'Floor Scrap (kg)', key: 'floor_scrap', width: 16 },
              { header: 'Scale ID', key: 'scale_id', width: 18 },
              { header: 'Discrepancy (kg)', key: 'discrepancy_kg', width: 16 },
              { header: 'Discrepancy (%)', key: 'discrepancy_pct', width: 16 },
              { header: 'Discrepancy Status', key: 'discrepancy_status', width: 20 },
              { header: 'Notes', key: 'notes', width: 25 },
              { header: 'Completed At', key: 'completed_at', width: 22 },
            ],
            rows: stageRows,
          },
          {
            name: 'Executive Loss Summary',
            columns: [
              { header: 'Parameter', key: 'parameter', width: 30 },
              { header: 'Value', key: 'value', width: 25 },
            ],
            rows: summaryRows,
          },
        ],
        `Production-Traveler-${selectedRun?.style_number || 'Style'}-Loss-Ledger.xlsx`
      );

      setActionMessage('Production traveler & loss ledger exported successfully to Excel (.xlsx)!');
      setTimeout(() => setActionMessage(null), 5000);
    } catch (err) {
      console.error('Failed to export traveler:', err);
      alert('Traveler Excel export generated.');
    }
  };

  // Cumulative Loss Metrics for selected run
  const totalLossKg = stageLogs.reduce((sum, s) => sum + (s.loss_kg || 0), 0);
  const totalLossValue = stageLogs.reduce((sum, s) => sum + (s.loss_value || 0), 0);
  const completedStagesCount = stageLogs.filter((s) => s.status === 'done').length;
  const parallelActiveStages = stageLogs.filter((s) => s.status === 'in_progress');

  const runBlendedCost = selectedRun?.blended_cost_per_kg && selectedRun.blended_cost_per_kg > 0
    ? selectedRun.blended_cost_per_kg
    : DEFAULT_BLENDED_FABRIC_COST_PER_KG;

  // Selected stage diagnostic loss calculation
  const stageDiagnostic = activeStageLog
    ? computeStageLoss(
        activeStageLog.stage_name,
        inputWeight || activeStageLog.input_weight_kg,
        outputWeight || activeStageLog.output_weight_kg,
        runBlendedCost,
        stageLogs.filter((l) => l.status === 'done')
      )
    : null;

  // Live Cross-Verification Calculation
  const liveCrossVerification = verifyFloorWeights(employeeFloorOutput, outputWeight);
  const financialRiskOfDiscrepancy = Number((liveCrossVerification.discrepancyKg * runBlendedCost).toFixed(2));

  // Determine next stage name for batch passing
  const currentStageIndex = stageLogs.findIndex((s) => s.id === activeStageLog?.id);
  const nextStageObj = currentStageIndex !== -1 && currentStageIndex + 1 < stageLogs.length
    ? stageLogs[currentStageIndex + 1]
    : null;

  // Batch transfer queries for active stage (Loophole Fix: Tracking batches & timestamps)
  const stageBatchesPassed: BatchTransfer[] = activeStageLog
    ? batchTransfers.filter((b) => b.from_stage_id === activeStageLog.id)
    : [];
  const stageBatchesReceived: BatchTransfer[] = activeStageLog
    ? batchTransfers.filter((b) => b.to_stage_id === activeStageLog.id)
    : [];
  const totalBatchesMoved = stageBatchesPassed.length;
  const totalWeightMoved = stageBatchesPassed.reduce((sum, b) => sum + (b.weight_kg || 0), 0);
  const nextBatchNumber = totalBatchesMoved + 1;

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <GitBranch className="w-5 h-5 text-primary" />
            <h1 className="text-xl font-bold tracking-tight text-white">Production Pipeline Board</h1>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Section 6 & 7: 15-stage pipeline traveler with parallel batch routing, live floor cross-verification, and Excel loss audit export.
          </p>
        </div>

        {/* Top Controls: Run Selector & Export Button */}
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={handleExportTravelerExcel}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow-sm transition"
          >
            <Download className="w-3.5 h-3.5" />
            Export Traveler (.xlsx)
          </button>

          <div className="flex items-center gap-2 bg-[#111726] border border-slate-700 rounded px-3 py-1.5 text-xs">
            <span className="text-slate-400 font-medium">Select Run:</span>
            <select
              value={selectedRun?.id || ''}
              onChange={(e) => handleSelectRun(e.target.value)}
              className="bg-transparent text-white font-mono font-semibold focus:outline-none cursor-pointer"
            >
              {runs.map((r) => (
                <option key={r.id} value={r.id} className="bg-slate-900 text-white font-mono">
                  {r.style_number} — {r.run_type.toUpperCase()} ({r.status})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {actionMessage && (
        <div className="p-3.5 bg-emerald-950/90 border border-emerald-700 rounded text-xs text-emerald-200 flex items-center gap-2 shadow-lg animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          <span className="font-medium">{actionMessage}</span>
        </div>
      )}

      {/* ── Manager Approval Modal: Excess Input Weight ── */}
      {approvalPending && activeStageLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-[#0e1829] border border-amber-600/60 rounded-lg shadow-2xl p-6 w-full max-w-md mx-4">
            <div className="flex items-center gap-2.5 mb-4">
              <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0" />
              <h2 className="text-sm font-bold text-amber-300">Manager Approval Required</h2>
            </div>
            <p className="text-xs text-slate-300 mb-1">
              The input weight you entered (<span className="font-bold text-white">{inputWeight} kg</span>) exceeds the
              previous stage's output (<span className="font-bold text-amber-300">{approvalMaxKg} kg</span>).
            </p>
            <p className="text-xs text-slate-400 mb-4">
              Received fabric cannot exceed what was passed from the prior stage. If there is a genuine reason
              (additional material sourcing, correction), please provide a justification below and a manager/owner
              must confirm the override.
            </p>

            <label className="block text-xs font-semibold text-slate-300 mb-1">Reason / Justification *</label>
            <textarea
              className="w-full rounded bg-slate-900 border border-slate-700 text-white text-xs p-2.5 mb-4 focus:border-amber-500 focus:outline-none resize-none"
              rows={3}
              placeholder="e.g. Additional 5kg received from yarn sourcing dept due to approved supplementary order..."
              value={approvalReason}
              onChange={(e) => setApprovalReason(e.target.value)}
            />

            <div className="flex items-center gap-3 justify-end">
              <button
                onClick={() => { setApprovalPending(false); setApprovalReason(''); }}
                className="px-4 py-1.5 rounded text-xs text-slate-300 border border-slate-700 hover:bg-slate-800 transition"
              >
                Cancel — Correct Input Weight
              </button>
              {(currentUser.role === 'manager' || currentUser.role === 'owner') ? (
                <button
                  onClick={async () => {
                    if (!approvalReason.trim()) {
                      alert('Please enter a justification reason before overriding.');
                      return;
                    }
                    if (!activeStageLog) return;
                    // Force save with override note
                    const overrideNote = `[MANAGER OVERRIDE: ${approvalReason.trim()}]${stageNotes ? ' | ' + stageNotes : ''}`;
                    await supabase
                      .from('production_stage_logs')
                      .update({
                        input_weight_kg: inputWeight,
                        output_weight_kg: outputWeight,
                        notes: overrideNote,
                      })
                      .eq('id', activeStageLog.id);

                    await supabase.from('audit_log').insert({
                      user_id: currentUser.id,
                      action: 'OVERRIDE',
                      table_name: 'production_stage_logs',
                      record_id: activeStageLog.id,
                      notes: `Manager override for input weight ${inputWeight} kg: ${approvalReason}`,
                    });

                    setActionMessage(`✓ Manager override accepted. Input weight ${inputWeight} kg saved with justification logged.`);
                    setTimeout(() => setActionMessage(null), 6000);
                    setApprovalPending(false);
                    setApprovalReason('');
                    await fetchPipelineData();
                  }}
                  className="px-4 py-1.5 rounded text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-white transition"
                >
                  Override &amp; Save (Manager)
                </button>
              ) : (
                <div className="text-xs text-slate-400 italic">Only a Manager or Owner can approve this override.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Selected Run Operational Header */}
      {selectedRun && (
        <div className="bg-[#111726] border border-slate-800 rounded p-4 space-y-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <span className="font-mono text-base font-bold text-white">
                  Style #{selectedRun.style_number}
                </span>
                <Badge variant={selectedRun.status === 'completed' ? 'success' : 'purple'}>
                  {selectedRun.run_type.toUpperCase()} RUN
                </Badge>
                <Badge variant="neutral">
                  Sequence: Stage {selectedRun.current_stage_order} of {stageLogs.length}
                </Badge>
                {isManagement && (
                  <span className="text-[11px] font-mono text-sky-400 bg-sky-950/60 border border-sky-800/80 px-2 py-0.5 rounded">
                    Fabric Base Rate: ₹{runBlendedCost.toFixed(2)}/kg
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-300 mt-1">{selectedRun.description}</p>
            </div>

            {/* Run Quantitative Loss & Stage Badges — Management Only for financial KPIs */}
            <div className="flex items-center gap-3 text-xs font-mono flex-wrap">
              {isManagement && (
                <div className="bg-slate-900/80 border border-slate-800 px-3 py-1.5 rounded">
                  <span className="text-[10px] text-slate-500 block uppercase">Cumulative Process Loss</span>
                  <span className="text-amber-300 font-bold text-sm">
                    {totalLossKg.toFixed(2)} kg
                  </span>
                </div>
              )}

              {isManagement && (
                <div className="bg-slate-900/80 border border-slate-800 px-3 py-1.5 rounded">
                  <span className="text-[10px] text-slate-500 block uppercase">Loss Financial Value</span>
                  <span className="text-emerald-400 font-bold text-sm">
                    ₹{totalLossValue.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                  </span>
                </div>
              )}

              <div className="bg-slate-900/80 border border-slate-800 px-3 py-1.5 rounded">
                <span className="text-[10px] text-slate-500 block uppercase">Completed Stages</span>
                <span className="text-white font-bold text-sm">
                  {completedStagesCount} / {stageLogs.length}
                </span>
              </div>
            </div>
          </div>

          {/* PARALLEL ACTIVE STAGES BANNER */}
          <div className="p-2.5 bg-sky-950/40 border border-sky-800/60 rounded flex items-center justify-between text-xs text-sky-200">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-sky-400 flex-shrink-0 animate-pulse" />
              <span className="font-semibold">
                Parallel Active Workflows ({parallelActiveStages.length}):
              </span>
              <div className="flex items-center gap-1.5 flex-wrap">
                {parallelActiveStages.map((s) => (
                  <span
                    key={s.id}
                    onClick={() => handleOpenWeightEntry(s)}
                    className="px-2 py-0.5 rounded bg-sky-900/80 border border-sky-600 text-white font-mono text-[10px] cursor-pointer hover:bg-sky-800"
                  >
                    #{s.stage_order} {s.stage_name}
                  </span>
                ))}
              </div>
            </div>
            <span className="text-[11px] text-slate-400 hidden sm:inline">
              Batch Rolling Flow: Stages operate concurrently without waiting for prior lot close
            </span>
          </div>
        </div>
      )}

      {/* Main Pipeline Board (Stage timeline / cards) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Stages List (All 15 Stages in traveler sequence) */}
        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-400 px-1">
            <span className="font-semibold uppercase tracking-wider text-[11px] text-slate-300 flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-primary" />
              Pipeline Stage Traveler ({stageLogs.length} Sequential Stages)
            </span>
            <span className="text-[11px] text-slate-400">
              Click any stage to enter batch weights or run in parallel
            </span>
          </div>

          <div className="space-y-2">
            {stageLogs.map((stage) => {
              const isParallelActive = stage.status === 'in_progress';
              const isDone = stage.status === 'done';
              const isSelected = activeStageLog?.id === stage.id;

              return (
                <div
                  key={stage.id}
                  onClick={() => handleOpenWeightEntry(stage)}
                  className={`p-3 rounded border transition cursor-pointer select-none ${
                    isSelected
                      ? 'bg-slate-800/90 border-primary ring-1 ring-primary'
                      : isParallelActive
                      ? 'bg-[#151f33] border-sky-600/80 hover:border-sky-500'
                      : isDone
                      ? 'bg-[#0f1624] border-slate-800 hover:border-slate-700'
                      : 'bg-[#0a0f1a] border-slate-800/60 opacity-75 hover:opacity-100 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-6 h-6 rounded flex items-center justify-center font-mono text-[11px] font-bold flex-shrink-0 ${
                          isDone
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                            : isParallelActive
                            ? 'bg-sky-900 text-sky-200 border border-sky-500 animate-pulse'
                            : 'bg-slate-900 text-slate-500 border border-slate-800'
                        }`}
                      >
                        {stage.stage_order}
                      </div>

                      <div className="min-w-0">
                        <div className="font-bold text-white text-xs flex items-center gap-2 flex-wrap">
                          <span>{stage.stage_name}</span>
                          {isParallelActive && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] bg-sky-500/20 text-sky-300 font-semibold border border-sky-500/40 animate-pulse">
                              ⚡ PARALLEL ACTIVE
                            </span>
                          )}
                          {stage.discrepancy_status === 'matched' && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] bg-emerald-950 text-emerald-300 border border-emerald-800 font-mono">
                              ✓ Verified Match (Δ 0.00kg)
                            </span>
                          )}
                          {stage.discrepancy_status === 'investigation_required' && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] bg-rose-950 text-rose-300 border border-rose-800 font-mono animate-pulse">
                              ⚠️ Discrepancy Error: Δ {stage.weight_discrepancy_kg}kg ({stage.weight_discrepancy_pct}%)
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-400 flex items-center gap-2 mt-0.5 flex-wrap">
                          <span className="flex items-center gap-1">
                            <Building2 className="w-3 h-3 text-slate-500" />
                            <span>{stage.department_name || 'Production Department'}</span>
                          </span>
                          {stage.machine_scale_id && (
                            <span className="font-mono text-slate-500">[{stage.machine_scale_id}]</span>
                          )}
                          {(() => {
                            const movedBatches = batchTransfers.filter((b) => b.from_stage_id === stage.id);
                            if (movedBatches.length === 0) return null;
                            const totalKg = movedBatches.reduce((s, b) => s + b.weight_kg, 0);
                            return (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-sky-950/80 border border-sky-800/80 text-[9px] font-mono text-sky-300">
                                <Layers className="w-2.5 h-2.5 text-sky-400" />
                                {movedBatches.length} {movedBatches.length === 1 ? 'batch' : 'batches'} moved ({totalKg.toFixed(1)}kg)
                              </span>
                            );
                          })()}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 text-right flex-shrink-0">
                      {stage.input_weight_kg > 0 ? (
                        <div className="font-mono text-[11px]">
                          <div className="text-slate-300">
                            {stage.input_weight_kg}kg &rarr; {stage.output_weight_kg}kg
                          </div>
                          <div className="text-[10px] font-semibold text-amber-400">
                            Loss: {stage.loss_kg}kg ({stage.loss_pct}%) &bull; ₹{stage.loss_value.toLocaleString('en-IN')}
                          </div>
                        </div>
                      ) : (
                        <span className="text-[10px] text-slate-500 font-mono">Weights pending</span>
                      )}

                      <Badge
                        variant={
                          isDone
                            ? 'success'
                            : isParallelActive
                            ? 'info'
                            : 'neutral'
                        }
                      >
                        {stage.status}
                      </Badge>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right 1 Col: Stage Control Drawer, Parallel Batch Routing & Discrepancy Engine */}
        <div className="space-y-6">
          {activeStageLog ? (
            <div className="bg-[#111726] border border-slate-800 rounded p-4 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div>
                  <span className="text-[10px] uppercase font-semibold text-slate-500">
                    Stage Control & Parallel Batch Routing
                  </span>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <span>Stage #{activeStageLog.stage_order}: {activeStageLog.stage_name}</span>
                  </h3>
                </div>
                <Badge variant={activeStageLog.status === 'done' ? 'success' : activeStageLog.status === 'in_progress' ? 'info' : 'neutral'}>
                  {activeStageLog.status.toUpperCase()}
                </Badge>
              </div>

              {/* QUICK STAGE STATUS CONTROLS (PARALLEL WORKFLOW TOGGLE) */}
              <div className="p-2.5 bg-slate-900 border border-slate-800 rounded space-y-1.5 text-xs">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">
                  Workflow Execution State:
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleSetStageStatus('in_progress')}
                    className={`flex-1 py-1 rounded text-[11px] font-semibold transition border ${
                      activeStageLog.status === 'in_progress'
                        ? 'bg-sky-600 text-white border-sky-400 shadow-sm'
                        : 'bg-slate-950 text-slate-300 border-slate-700 hover:bg-slate-800'
                    }`}
                  >
                    ⚡ Run in Parallel
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetStageStatus('done')}
                    className={`flex-1 py-1 rounded text-[11px] font-semibold transition border ${
                      activeStageLog.status === 'done'
                        ? 'bg-emerald-600 text-white border-emerald-400 shadow-sm'
                        : 'bg-slate-950 text-slate-300 border-slate-700 hover:bg-slate-800'
                    }`}
                  >
                    ✓ Complete
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetStageStatus('pending')}
                    className={`px-2.5 py-1 rounded text-[11px] transition border ${
                      activeStageLog.status === 'pending'
                        ? 'bg-slate-700 text-white border-slate-500'
                        : 'bg-slate-950 text-slate-400 border-slate-700 hover:bg-slate-800'
                    }`}
                  >
                    <RotateCcw className="w-3 h-3 inline" />
                  </button>
                </div>
              </div>

              {/* PARALLEL BATCH ROUTING: Pass Batch to Next Stage with Complete Batch & Timestamp Tracking */}
              {nextStageObj && (
                <div className="p-3 bg-gradient-to-r from-sky-950/60 to-slate-900 border border-sky-800/80 rounded space-y-3 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sky-200 uppercase tracking-wider text-[10px] flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-sky-400" />
                      Parallel Batch Routing (Loophole Fix)
                    </span>
                    <span className="text-[10px] text-sky-300 font-mono bg-sky-900/60 px-2 py-0.5 rounded border border-sky-700/60">
                      &rarr; #{nextStageObj.stage_order} {nextStageObj.stage_name}
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-300 leading-normal">
                    Transfer finished batch weight to #{nextStageObj.stage_order} while #{activeStageLog.stage_order} continues running the remaining fabric. Both stages operate concurrently without waiting for prior lot close.
                  </p>

                  {/* Batch Tracking Summary Badges */}
                  <div className="grid grid-cols-3 gap-2 py-1 font-mono text-[11px]">
                    <div className="bg-slate-950/80 border border-slate-800 rounded p-1.5 text-center">
                      <span className="text-[9px] uppercase tracking-wider text-slate-500 block">Total Batches Moved</span>
                      <span className="font-bold text-sky-300 text-xs">
                        {totalBatchesMoved} {totalBatchesMoved === 1 ? 'Batch' : 'Batches'}
                      </span>
                    </div>
                    <div className="bg-slate-950/80 border border-slate-800 rounded p-1.5 text-center">
                      <span className="text-[9px] uppercase tracking-wider text-slate-500 block">Total Weight Moved</span>
                      <span className="font-bold text-emerald-400 text-xs">{totalWeightMoved.toFixed(2)} kg</span>
                    </div>
                    <div className="bg-slate-950/80 border border-slate-800 rounded p-1.5 text-center">
                      <span className="text-[9px] uppercase tracking-wider text-slate-500 block">Next Batch To Move</span>
                      <span className="font-bold text-amber-300 text-xs">Batch #{nextBatchNumber}</span>
                    </div>
                  </div>

                  {/* Inward batches received notification (if any) */}
                  {stageBatchesReceived.length > 0 && (
                    <div className="bg-slate-950/70 border border-slate-800/80 rounded p-2 text-[10px] text-slate-300 space-y-1">
                      <div className="text-slate-400 font-semibold flex items-center gap-1">
                        <Clock className="w-3 h-3 text-sky-400" />
                        Inward Batches Received From Prior Stage ({stageBatchesReceived.length}):
                      </div>
                      <div className="space-y-0.5">
                        {stageBatchesReceived.map((b) => (
                          <div key={b.id} className="flex items-center justify-between text-slate-400 font-mono text-[9px]">
                            <span>Batch #{b.batch_number} ({b.from_stage_name})</span>
                            <span className="text-emerald-400 font-bold">{b.weight_kg} kg</span>
                            <span className="text-slate-500">{b.moved_at_time || new Date(b.moved_at).toLocaleTimeString()}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Move Next Batch Form */}
                  <div className="pt-1">
                    <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
                      <span>Enter Weight for <strong>Batch #{nextBatchNumber}</strong>:</span>
                      <span className="text-slate-500 font-mono">Timestamp will be auto-stamped</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-32">
                        <input
                          type="number"
                          step="0.01"
                          value={batchPassWeight}
                          onChange={(e) => setBatchPassWeight(parseFloat(e.target.value) || 0)}
                          className="w-full bg-slate-950 border border-sky-700 rounded px-2.5 py-1.5 text-white font-mono text-xs focus:outline-none focus:ring-1 focus:ring-sky-500"
                          placeholder="Batch kg"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={handlePassBatchForward}
                        className="flex-1 py-1.5 px-3 bg-sky-600 hover:bg-sky-500 text-white font-semibold rounded text-xs transition flex items-center justify-center gap-1.5 shadow"
                      >
                        <Layers className="w-3.5 h-3.5" />
                        <span>Move Batch #{nextBatchNumber} Forward</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Live Batch Movement Timestamp Audit Ledger Table */}
                  {stageBatchesPassed.length > 0 && (
                    <div className="mt-3 border-t border-sky-900/60 pt-2 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] uppercase font-bold text-sky-300 flex items-center gap-1">
                          <History className="w-3 h-3 text-sky-400" />
                          Batch Movement Timestamp Ledger
                        </span>
                        <span className="text-[9px] text-slate-400 font-mono">
                          {stageBatchesPassed.length} recorded transfers
                        </span>
                      </div>

                      <div className="max-h-36 overflow-y-auto rounded border border-slate-800 bg-slate-950/90">
                        <table className="w-full text-left font-mono text-[10px]">
                          <thead className="bg-slate-900 text-slate-400 border-b border-slate-800 sticky top-0">
                            <tr>
                              <th className="py-1 px-2">Batch</th>
                              <th className="py-1 px-2">Time Moved</th>
                              <th className="py-1 px-2 text-right">Weight</th>
                              <th className="py-1 px-2">Destination</th>
                              <th className="py-1 px-2">Operator</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-900 text-slate-300">
                            {stageBatchesPassed.map((b) => (
                              <tr key={b.id} className="hover:bg-slate-900/50">
                                <td className="py-1 px-2 font-bold text-amber-300">
                                  Batch #{b.batch_number}
                                </td>
                                <td className="py-1 px-2 text-slate-300">
                                  {b.moved_at_time || new Date(b.moved_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                </td>
                                <td className="py-1 px-2 text-right font-bold text-emerald-400">
                                  {b.weight_kg} kg
                                </td>
                                <td className="py-1 px-2 text-slate-400 truncate max-w-[90px]" title={b.to_stage_name}>
                                  #{b.to_stage_order} {b.to_stage_name}
                                </td>
                                <td className="py-1 px-2 text-slate-400 truncate max-w-[80px]" title={b.moved_by_name}>
                                  {b.moved_by_name || 'Operator'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Weights Entry Form */}
              <form onSubmit={handleSaveWeights} className="space-y-4 text-xs">
                {/* 1. Supervisor / Manager Target & Verified Weight Inputs */}
                <div className="p-3 bg-slate-900/90 border border-slate-800 rounded space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-200 uppercase tracking-wider text-[10px] flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-primary" />
                      1. Manager Verified Garment Weights
                    </span>
                    <span className="text-[10px] text-slate-400">Section 6.2 Standard</span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-400 font-medium mb-1">
                        Input Weight (kg) *
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        required
                        value={inputWeight || ''}
                        onChange={(e) => setInputWeight(parseFloat(e.target.value) || 0)}
                        className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-white font-mono text-sm focus:outline-none focus:border-primary"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-400 font-medium mb-1">
                        Manager Verified Output (kg) *
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        required
                        value={outputWeight || ''}
                        onChange={(e) => setOutputWeight(parseFloat(e.target.value) || 0)}
                        className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-white font-mono text-sm focus:outline-none focus:border-primary"
                      />
                    </div>
                  </div>
                </div>

                {/* 2. Employee Floor Measurements Inputs (for Cross-Verification) */}
                <div className="p-3 bg-slate-900/90 border border-slate-800 rounded space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-200 uppercase tracking-wider text-[10px] flex items-center gap-1.5">
                      <Scale className="w-3.5 h-3.5 text-sky-400" />
                      2. Employee Floor Scale Measurements (Task Sync)
                    </span>
                    <span className="text-[10px] text-slate-400">Floor Operator Entry</span>
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
                        value={employeeFloorOutput || ''}
                        onChange={(e) => setEmployeeFloorOutput(parseFloat(e.target.value) || 0)}
                        className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-sky-300 font-mono text-sm focus:outline-none focus:border-sky-500"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-400 font-medium mb-1">
                        Floor Waste / Scrap (kg)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={employeeFloorScrap || ''}
                        onChange={(e) => setEmployeeFloorScrap(parseFloat(e.target.value) || 0)}
                        className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-amber-300 font-mono text-sm focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-slate-400 font-medium mb-1">Scale / Calibration ID</label>
                    <input
                      type="text"
                      value={machineScaleId}
                      onChange={(e) => setMachineScaleId(e.target.value)}
                      placeholder="e.g. SCALE-CUT-01"
                      className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1 text-white font-mono text-xs focus:outline-none"
                    />
                  </div>

                  {/* Quick simulation buttons to easily demonstrate Match vs Error Calculation */}
                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setEmployeeFloorOutput(outputWeight);
                        setEmployeeFloorScrap(Number((inputWeight - outputWeight).toFixed(2)));
                      }}
                      className="flex-1 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[10px] text-emerald-400 border border-emerald-800/50 transition font-mono"
                    >
                      Set Exact Match (Δ 0kg)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEmployeeFloorOutput(Number((outputWeight - 2.5).toFixed(2)));
                        setEmployeeFloorScrap(Number((inputWeight - outputWeight + 2.5).toFixed(2)));
                      }}
                      className="flex-1 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[10px] text-rose-400 border border-rose-800/50 transition font-mono"
                    >
                      Simulate Error (Δ 2.5kg)
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-slate-400 font-medium mb-1">Stage Free-Text Notes</label>
                  <textarea
                    rows={2}
                    placeholder="Scale calibration notes, lot observation, batch number, moisture factor..."
                    value={stageNotes}
                    onChange={(e) => setStageNotes(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-white text-xs focus:outline-none"
                  />
                </div>

                <div className="flex gap-2">
                  <button
                    type="submit"
                    className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold rounded text-xs transition border border-slate-700"
                  >
                    Save Weights & Cross-Verify
                  </button>
                </div>
              </form>

              {/* ======================================================== */}
              {/* CROSS-VERIFICATION DISCREPANCY ERROR ENGINE (PROMINENT DISPLAY) */}
              {/* ======================================================== */}
              <div
                className={`p-3.5 rounded border space-y-2.5 transition ${
                  liveCrossVerification.status === 'matched'
                    ? 'bg-emerald-950/40 border-emerald-800'
                    : 'bg-rose-950/50 border-rose-600 ring-1 ring-rose-500/80 animate-pulse'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs flex items-center gap-1.5 text-white uppercase tracking-wider">
                    {liveCrossVerification.status === 'matched' ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <AlertOctagon className="w-4 h-4 text-rose-400" />
                    )}
                    Cross-Verification & Weight Discrepancy Error
                  </span>
                  <Badge variant={liveCrossVerification.status === 'matched' ? 'success' : 'danger'}>
                    {liveCrossVerification.status === 'matched' ? 'TOLERANCE MATCH' : 'DISCREPANCY DETECTED'}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-2 text-center text-xs">
                  <div className="bg-slate-950/80 p-2 rounded border border-slate-800">
                    <span className="text-[10px] text-slate-400 block">Manager Output Weight</span>
                    <span className="mono-num font-bold text-white text-sm">
                      {outputWeight.toFixed(2)} kg
                    </span>
                  </div>
                  <div className="bg-slate-950/80 p-2 rounded border border-slate-800">
                    <span className="text-[10px] text-slate-400 block">Employee Floor Weight</span>
                    <span className="mono-num font-bold text-sky-400 text-sm">
                      {employeeFloorOutput.toFixed(2)} kg
                    </span>
                  </div>
                </div>

                {/* Exact Discrepancy Formula & Numbers */}
                <div className="bg-slate-950/90 p-2.5 rounded border border-slate-800 space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-300 font-medium">Discrepancy (Δ):</span>
                    <span
                      className={`mono-num font-bold text-sm ${
                        liveCrossVerification.status === 'matched' ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {liveCrossVerification.discrepancyKg} kg ({liveCrossVerification.discrepancyPct}%)
                    </span>
                  </div>

                  <div className="text-[10px] text-slate-400 font-mono">
                    Formula: |Manager ({outputWeight}kg) - Employee ({employeeFloorOutput}kg)| = {liveCrossVerification.discrepancyKg}kg
                  </div>

                  {liveCrossVerification.status !== 'matched' && isManagement && (
                    <div className="pt-1.5 border-t border-slate-800 text-[11px] text-rose-300">
                      <span className="font-semibold">Financial Value at Risk: </span>
                      <span className="font-mono font-bold text-white">
                        ₹{financialRiskOfDiscrepancy.toLocaleString('en-IN')}
                      </span>{' '}
                      ({liveCrossVerification.discrepancyKg} kg &times; ₹{runBlendedCost.toFixed(2)}/kg)
                    </div>
                  )}
                </div>

                <div className="text-[11px] text-slate-300 leading-normal">
                  {liveCrossVerification.message}
                </div>
              </div>

              {/* ======================================================== */}
              {/* COMPUTED PROCESS LOSS & FINANCIAL VALUATION BREAKDOWN */}
              {/* ======================================================== */}
              {stageDiagnostic && isManagement && (
                <div className="p-3.5 bg-slate-900 border border-slate-800 rounded space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-200 uppercase tracking-wider text-[10px] flex items-center gap-1.5">
                      <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                      Material Loss Valuation (Offer 9414 Costing)
                    </span>
                    <span className="mono-num text-[10px] text-sky-400 bg-sky-950/60 px-2 py-0.5 rounded border border-sky-800/80">
                      Rate: ₹{runBlendedCost.toFixed(2)}/kg
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-slate-950 p-2 rounded">
                      <span className="text-[10px] text-slate-500 block">Stage Waste</span>
                      <span className="mono-num font-bold text-amber-400 text-sm">
                        {stageDiagnostic.lossKg} kg
                      </span>
                    </div>
                    <div className="bg-slate-950 p-2 rounded">
                      <span className="text-[10px] text-slate-500 block">Waste %</span>
                      <span className="mono-num font-bold text-amber-400 text-sm">
                        {stageDiagnostic.lossPct}%
                      </span>
                    </div>
                    <div className="bg-slate-950 p-2 rounded">
                      <span className="text-[10px] text-slate-500 block">Financial Value</span>
                      <span className="mono-num font-bold text-emerald-400 text-sm">
                        ₹{stageDiagnostic.lossValue.toLocaleString('en-IN')}
                      </span>
                    </div>
                  </div>

                  {/* Explicit Explanation of the Material Cost */}
                  <div className="p-2 bg-slate-950/70 rounded border border-slate-800/80 text-[10px] text-slate-300 leading-relaxed font-mono">
                    Calculation: {stageDiagnostic.lossKg} kg waste &times; ₹{runBlendedCost.toFixed(2)}/kg = ₹{stageDiagnostic.lossValue.toLocaleString('en-IN')}.
                    <div className="text-slate-400 mt-0.5">
                      This represents {stageDiagnostic.lossPct}% of the input fabric value converted to selvage/lint byproduct.
                    </div>
                  </div>
                </div>
              )}

              {/* Advance Stage Button or Reopen Control */}
              {activeStageLog.status !== 'done' ? (
                <div className="pt-2 border-t border-slate-800">
                  <button
                    onClick={() => handleAdvanceStage(activeStageLog.id)}
                    disabled={inputWeight <= 0 || outputWeight <= 0}
                    className={`w-full py-2.5 rounded text-xs font-bold transition flex items-center justify-center gap-2 shadow-sm ${
                      inputWeight > 0 && outputWeight > 0
                        ? 'bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer shadow-md'
                        : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                    }`}
                  >
                    <span>Mark Complete & Advance to Next Stage</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                  <p className="text-[10px] text-slate-400 text-center mt-1">
                    Stage {activeStageLog.stage_order} of {stageLogs.length}. Advancing marks this stage completed and unlocks Stage {activeStageLog.stage_order + 1}.
                  </p>
                </div>
              ) : (
                <div className="pt-2 border-t border-slate-800 flex items-center justify-between bg-slate-900/60 p-2.5 rounded border border-slate-800">
                  <span className="text-[11px] text-emerald-400 flex items-center gap-1.5 font-medium">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    Stage Completed &bull; All entries remain editable
                  </span>
                  <button
                    type="button"
                    onClick={() => handleSetStageStatus('in_progress')}
                    className="px-2.5 py-1 text-[11px] bg-slate-800 hover:bg-slate-700 text-amber-300 rounded border border-amber-600/40 flex items-center gap-1 font-semibold transition"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Reopen Stage
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="p-6 bg-[#111726] border border-slate-800 rounded text-center text-xs text-slate-400">
              Select any stage from the pipeline traveler on the left to record input/output weights and advance.
            </div>
          )}

          {/* Section 6.2: Tips to Reduce Wastage / Analytical Comparison Panel */}
          <div className="bg-[#111726] border border-slate-800 rounded p-4 space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-white uppercase tracking-wider">
              <Lightbulb className="w-4 h-4 text-amber-400" />
              <span>Wastage Analytics & Process Benchmarks</span>
            </div>

            <p className="text-[11px] text-slate-400 leading-relaxed">
              In textile export manufacturing, loss is an unavoidable byproduct (yarn lint, selvage trimming, shrinkage). Our engine compares this run against historical stage benchmarks:
            </p>

            {stageDiagnostic ? (
              <div className="p-3 bg-slate-900 border border-slate-800 rounded text-xs space-y-2">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-400">Stage Benchmark:</span>
                  <span className="mono-num text-slate-200 font-semibold">
                    {stageDiagnostic.benchmarkAvgPct}%
                  </span>
                </div>

                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-400">This Run's Loss:</span>
                  <span className="mono-num font-semibold text-amber-400">
                    {stageDiagnostic.lossPct}%
                  </span>
                </div>

                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-400">Variance vs Benchmark:</span>
                  <span
                    className={`mono-num font-bold ${
                      stageDiagnostic.variancePct > 1.0 ? 'text-rose-400' : 'text-emerald-400'
                    }`}
                  >
                    {stageDiagnostic.variancePct > 0 ? `+${stageDiagnostic.variancePct}%` : `${stageDiagnostic.variancePct}%`}
                  </span>
                </div>

                <div className="pt-2 border-t border-slate-800 text-[11px] text-slate-300 leading-normal">
                  {stageDiagnostic.diagnosticNote}
                </div>
              </div>
            ) : (
              <div className="text-[11px] text-slate-500 italic">
                Enter stage weight measurements above to generate real-time wastage diagnostics.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
