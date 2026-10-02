'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ErpStore } from '@/lib/db/erpStore';
import { DispatchRecord, Profile, ProductionRun, Style } from '@/lib/types/erp';
import { Badge } from '@/components/ui/Badge';
import * as XLSX from 'xlsx';
import { Truck, Plus, CheckCircle2, ArrowRight, DollarSign, Calendar, Download, AlertTriangle } from 'lucide-react';

export default function DispatchPage() {
  const router = useRouter();
  const store = ErpStore.getInstance();

  const [currentUser, setCurrentUser] = useState<Profile>(store.getCurrentUser());
  const [dispatchRecords, setDispatchRecords] = useState<DispatchRecord[]>([]);
  const [styles, setStyles] = useState<Style[]>([]);
  const [runs, setRuns] = useState<ProductionRun[]>([]);

  // Create Dispatch Record Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedRunId, setSelectedRunId] = useState('');
  const [transportCost, setTransportCost] = useState<number>(0);
  const [fobValue, setFobValue] = useState<number>(0);
  const [forwardingCost, setForwardingCost] = useState<number>(0);
  const [dispatchDate, setDispatchDate] = useState(new Date().toISOString().split('T')[0]);
  const [dispatchNotes, setDispatchNotes] = useState('');

  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    const user = store.getCurrentUser();
    if (user.role === 'employee') {
      router.replace('/employee/tasks');
      return;
    }

    const refresh = () => {
      const u = store.getCurrentUser();
      setCurrentUser(u);
      setDispatchRecords(store.getDispatchRecords(u.role));
      setStyles(store.getStyles(u.role));
      setRuns(store['state'].productionRuns);
    };

    refresh();
    const unsub = store.subscribe(refresh);
    return unsub;
  }, [store, router]);

  const handleCreateDispatch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRunId) return;

    const runStages = store['state'].stageLogs.filter((s) => s.production_run_id === selectedRunId);
    const completedStages = runStages.filter((s) => s.status === 'done').length;
    const isComplete = runStages.length > 0 && completedStages === runStages.length;

    if (!isComplete) {
      alert(
        `Cannot create dispatch order: Production is still in progress (${completedStages}/${runStages.length} stages completed). Under factory protocol, all 15 pipeline stages must be complete and QA cleared before dispatching.`
      );
      return;
    }

    const run = runs.find((r) => r.id === selectedRunId);
    const style = styles.find((s) => s.id === run?.style_id);

    store.saveDispatchRecord(
      {
        production_run_id: selectedRunId,
        style_id: run?.style_id || '',
        style_number: run?.style_number,
        offer_no: style?.offer_no,
        transport_cost: Number(transportCost),
        fob_value: Number(fobValue),
        forwarding_cost: Number(forwardingCost),
        dispatch_date: dispatchDate,
        status: 'pending',
        notes: dispatchNotes,
      },
      currentUser.id
    );

    setIsModalOpen(false);
    setSelectedRunId('');
    setFeedback('Dispatch consignment logged successfully. Goods released for transport.');
    setTimeout(() => setFeedback(null), 3000);
  };

  const handleUpdateStatus = (id: string, newStatus: 'pending' | 'dispatched' | 'delivered') => {
    store.updateDispatchRecord(id, { status: newStatus });
    setFeedback(`Dispatch status updated to "${newStatus.toUpperCase()}".`);
    setTimeout(() => setFeedback(null), 3000);
  };

  const totalFobValue = dispatchRecords.reduce((sum, d) => sum + (d.fob_value || 0), 0);
  const totalFreight = dispatchRecords.reduce(
    (sum, d) => sum + (d.transport_cost || 0) + (d.forwarding_cost || 0),
    0
  );

  const handleExportDispatchExcel = () => {
    try {
      const wb = XLSX.utils.book_new();
      const rows = dispatchRecords.map((d) => ({
        'Record ID': d.id,
        'Style Number': d.style_number,
        'Offer No': d.offer_no || '',
        'Dispatch Date': d.dispatch_date,
        'Transport Cost (INR)': d.transport_cost,
        'Forwarding Cost (INR)': d.forwarding_cost,
        'FOB Value (INR)': d.fob_value,
        'Total Logistics Cost (INR)': d.transport_cost + d.forwarding_cost,
        'Status': d.status.toUpperCase(),
        'Notes': d.notes || '',
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, 'Dispatch Register');
      XLSX.writeFile(wb, `Dispatch-Logistics-Register.xlsx`);
      setFeedback('Dispatch register exported successfully to Excel (.xlsx)!');
      setTimeout(() => setFeedback(null), 4000);
    } catch (err) {
      console.error(err);
      alert('Dispatch exported.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <Truck className="w-5 h-5 text-primary" />
            <h1 className="text-xl font-bold tracking-tight text-white">
              Dispatch & Logistics Management
            </h1>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Section 9: FOB valuation, container transport cost, and freight forwarding tracking.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportDispatchExcel}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-sm transition"
          >
            <Download className="w-3.5 h-3.5" />
            Export Dispatch (.xlsx)
          </button>

          <button
            onClick={() => setIsModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            Log Dispatch Order
          </button>
        </div>
      </div>

      {feedback && (
        <div className="p-3 bg-emerald-950/80 border border-emerald-800 rounded-lg text-xs text-emerald-300 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          <span>{feedback}</span>
        </div>
      )}

      {/* Production & Logistics Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="kpi-card">
          <div className="kpi-label">Total FOB Value</div>
          <div className="kpi-value text-emerald-400">
            ₹{totalFobValue.toLocaleString()}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Contract value on board</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-label">Freight & Forwarding</div>
          <div className="kpi-value text-amber-300">
            ₹{totalFreight.toLocaleString()}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Transport & port charges</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-label">Active Consignments</div>
          <div className="kpi-value text-white">
            {dispatchRecords.length}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Shipment manifests logged</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-label">Production Pipeline Gate</div>
          <div className="kpi-value text-sky-400 flex items-center gap-2">
            <span>{runs.filter(r => {
              const stages = store['state'].stageLogs.filter(s => s.production_run_id === r.id);
              return stages.length > 0 && stages.every(s => s.status === 'done');
            }).length}</span>
            <span className="text-xs font-normal text-slate-400">ready</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            {runs.filter(r => {
              const stages = store['state'].stageLogs.filter(s => s.production_run_id === r.id);
              return stages.some(s => s.status !== 'done');
            }).length} still in production on floor
          </div>
        </div>
      </div>

      {/* Dispatch Table */}
      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="erp-table text-xs min-w-[1200px]">
            <thead>
              <tr>
                <th className="w-[140px] whitespace-nowrap">Style Number</th>
                <th className="w-[100px] whitespace-nowrap">Offer / PO</th>
                <th className="w-[180px] whitespace-nowrap">Production Clearance</th>
                <th className="w-[120px] whitespace-nowrap">Dispatch Date</th>
                <th className="w-[140px] whitespace-nowrap">FOB Value (₹)</th>
                <th className="w-[120px] whitespace-nowrap">Transport Cost</th>
                <th className="w-[120px] whitespace-nowrap">Forwarding Cost</th>
                <th className="w-[120px] whitespace-nowrap">Shipment Status</th>
                <th className="w-[150px] whitespace-nowrap">Banking Status</th>
                <th className="min-w-[160px] text-right whitespace-nowrap">Action</th>
              </tr>
            </thead>
            <tbody>
              {dispatchRecords.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center py-12 text-slate-500 text-xs">
                    No dispatch consignments logged. When all 15 stages of a style are completed on the floor, log its freight here.
                  </td>
                </tr>
              ) : (
                dispatchRecords.map((d) => {
                  const runStages = store['state'].stageLogs.filter(s => s.production_run_id === d.production_run_id);
                  const completedCount = runStages.filter(s => s.status === 'done').length;
                  const is100Done = runStages.length > 0 && completedCount === runStages.length;

                  return (
                    <tr key={d.id}>
                      <td className="font-mono font-bold text-white whitespace-nowrap">{d.style_number}</td>
                      <td className="font-mono text-slate-300 whitespace-nowrap">{d.offer_no || '9414'}</td>
                      <td className="whitespace-nowrap">
                        {is100Done ? (
                          <div className="flex items-center gap-1.5 text-emerald-400 font-semibold text-[11px]">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                            <span>15/15 Stages Complete</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 text-amber-400 font-medium text-[11px]">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                            <span>{completedCount}/{runStages.length || 15} Stages Done</span>
                          </div>
                        )}
                      </td>
                      <td className="mono-num text-slate-300 whitespace-nowrap">{d.dispatch_date}</td>
                      <td className="mono-num font-bold text-emerald-400 whitespace-nowrap">
                        ₹{d.fob_value?.toLocaleString() || 0}
                      </td>
                      <td className="mono-num text-slate-300 whitespace-nowrap">
                        ₹{d.transport_cost?.toLocaleString() || 0}
                      </td>
                      <td className="mono-num text-slate-300 whitespace-nowrap">
                        ₹{d.forwarding_cost?.toLocaleString() || 0}
                      </td>
                      <td className="whitespace-nowrap">
                        <Badge
                          variant={
                            d.status === 'delivered'
                              ? 'success'
                              : d.status === 'dispatched'
                              ? 'info'
                              : 'warning'
                          }
                          dot
                        >
                          {d.status}
                        </Badge>
                      </td>
                      <td className="whitespace-nowrap">
                        {d.payment ? (
                          <Badge variant={d.payment.status === 'reconciled' ? 'success' : 'info'}>
                            {d.payment.status} ({d.payment.bank_name})
                          </Badge>
                        ) : (
                          <span className="text-slate-500 text-[11px]">Awaiting Remittance</span>
                        )}
                      </td>
                      <td className="text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          {d.status === 'pending' && (
                            <button
                              onClick={() => handleUpdateStatus(d.id, 'dispatched')}
                              className="px-2.5 py-1 rounded bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/30 text-sky-300 text-xs font-medium transition cursor-pointer"
                            >
                              Mark Dispatched
                            </button>
                          )}
                          {d.status === 'dispatched' && (
                            <button
                              onClick={() => handleUpdateStatus(d.id, 'delivered')}
                              className="px-2.5 py-1 rounded bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 text-xs font-medium transition cursor-pointer"
                            >
                              Mark Delivered
                            </button>
                          )}
                          {d.status === 'delivered' && (
                            <span className="text-emerald-400 text-[11px] font-semibold flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5 inline" /> Delivered
                            </span>
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

      {/* MODAL: LOG DISPATCH */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-[#111726] border border-slate-700 rounded-lg max-w-lg w-full p-6 shadow-2xl space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                  Log Shipment Dispatch
                </h2>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Section 9: Requires 100% completed production pipeline before freight assignment.
                </p>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <form onSubmit={handleCreateDispatch} className="space-y-3.5">
              <div>
                <label className="block text-slate-400 font-medium mb-1">Production Run / Style *</label>
                <select
                  required
                  value={selectedRunId}
                  onChange={(e) => setSelectedRunId(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white font-mono text-xs focus:outline-none focus:border-primary"
                >
                  <option value="">-- Choose production run --</option>
                  {runs.map((r) => {
                    const runStages = store['state'].stageLogs.filter((s) => s.production_run_id === r.id);
                    const completed = runStages.filter((s) => s.status === 'done').length;
                    const total = runStages.length;
                    const isAllDone = total > 0 && completed === total;
                    const existing = dispatchRecords.find((d) => d.production_run_id === r.id);

                    return (
                      <option key={r.id} value={r.id}>
                        {isAllDone
                          ? existing
                            ? `[DISPATCHED: ${existing.status.toUpperCase()}] ${r.style_number} — 15/15 stages done`
                            : `[✓ READY FOR DISPATCH] ${r.style_number} — 15/15 stages completed`
                          : `[⚠ PRODUCTION PENDING (${completed}/${total} stages)] ${r.style_number} — in progress`}
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Compute selected run's real pipeline completion status */}
              {(() => {
                if (!selectedRunId) return null;
                const selectedRun = runs.find((r) => r.id === selectedRunId);
                const runStages = store['state'].stageLogs
                  .filter((s) => s.production_run_id === selectedRunId)
                  .sort((a, b) => a.stage_order - b.stage_order);
                const completedStages = runStages.filter((s) => s.status === 'done').length;
                const totalStages = runStages.length;
                const isComplete = totalStages > 0 && completedStages === totalStages;
                const activeStage =
                  runStages.find((s) => s.status === 'in_progress') ||
                  runStages.find((s) => s.status === 'pending') ||
                  runStages[runStages.length - 1];
                const existingDispatch = dispatchRecords.find((d) => d.production_run_id === selectedRunId);

                if (existingDispatch) {
                  return (
                    <div className="p-3.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 space-y-1.5">
                      <div className="flex items-center gap-1.5 font-bold text-xs">
                        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                        <span>ALREADY LOGGED IN DISPATCH</span>
                      </div>
                      <p className="text-[11px] text-amber-200/90 leading-relaxed">
                        This production run already has an active consignment record (#{existingDispatch.id.slice(-6)}) with status <span className="font-bold text-white uppercase">{existingDispatch.status}</span>. Update its freight or status directly in the dispatch ledger below.
                      </p>
                    </div>
                  );
                }

                if (!isComplete) {
                  return (
                    <div className="p-3.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 space-y-1.5">
                      <div className="flex items-center gap-2 font-bold text-xs text-rose-400">
                        <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                        <span>PRODUCTION PENDING — DISPATCH LOCKED</span>
                      </div>
                      <p className="text-[11px] text-rose-200/90 leading-relaxed">
                        This style has completed only <span className="font-mono font-bold text-white">{completedStages} of {totalStages}</span> production stages.
                        Currently active at: <span className="font-semibold text-white">Stage {activeStage?.stage_order}: {activeStage?.stage_name}</span>.
                      </p>
                      <p className="text-[10px] text-slate-400 leading-normal">
                        Under factory ISO/QA protocol, shipment manifests can only be created after all 15 stages are complete and verified on the shop floor.
                      </p>
                    </div>
                  );
                }

                return (
                  <div className="p-3.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 space-y-1">
                    <div className="flex items-center gap-1.5 font-bold text-xs">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>PRODUCTION 100% COMPLETED — READY FOR LOGISTICS</span>
                    </div>
                    <p className="text-[11px] text-emerald-200/90">
                      All 15 pipeline stages verified and cleared. Fill container and freight details below to dispatch.
                    </p>
                  </div>
                );
              })()}

              <div>
                <label className="block text-slate-400 font-medium mb-1">FOB Value (₹) *</label>
                <input
                  type="number"
                  required
                  value={fobValue}
                  onChange={(e) => setFobValue(parseFloat(e.target.value) || 0)}
                  className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-medium mb-1">Transport Cost (₹)</label>
                  <input
                    type="number"
                    value={transportCost}
                    onChange={(e) => setTransportCost(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 font-medium mb-1">Forwarding Cost (₹)</label>
                  <input
                    type="number"
                    value={forwardingCost}
                    onChange={(e) => setForwardingCost(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-400 font-medium mb-1">Dispatch Date</label>
                <input
                  type="date"
                  value={dispatchDate}
                  onChange={(e) => setDispatchDate(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-medium mb-1">Consignment Notes</label>
                <input
                  type="text"
                  placeholder="Container number, port of loading"
                  value={dispatchNotes}
                  onChange={(e) => setDispatchNotes(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-3 py-1.5 bg-slate-800 rounded text-slate-300 hover:bg-slate-700 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={
                    !selectedRunId ||
                    (() => {
                      const runStages = store['state'].stageLogs.filter((s) => s.production_run_id === selectedRunId);
                      const completed = runStages.filter((s) => s.status === 'done').length;
                      const isAllDone = runStages.length > 0 && completed === runStages.length;
                      const existing = dispatchRecords.find((d) => d.production_run_id === selectedRunId);
                      return !isAllDone || !!existing;
                    })()
                  }
                  className="px-4 py-1.5 bg-primary disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed font-semibold text-primary-foreground rounded hover:bg-primary/90 transition shadow"
                >
                  {(() => {
                    if (!selectedRunId) return 'Select Production Run';
                    const runStages = store['state'].stageLogs.filter((s) => s.production_run_id === selectedRunId);
                    const completed = runStages.filter((s) => s.status === 'done').length;
                    const isAllDone = runStages.length > 0 && completed === runStages.length;
                    const existing = dispatchRecords.find((d) => d.production_run_id === selectedRunId);
                    if (existing) return 'Already Dispatched';
                    if (!isAllDone) return 'Production Pending (Locked)';
                    return 'Save Dispatch Record';
                  })()}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
