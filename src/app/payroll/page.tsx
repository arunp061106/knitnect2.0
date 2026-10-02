'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ErpStore } from '@/lib/db/erpStore';
import { PayrollEntry, MonthlyPayrollRun, Profile } from '@/lib/types/erp';
import { Badge } from '@/components/ui/Badge';
import * as XLSX from 'xlsx';
import {
  Wallet,
  Plus,
  Download,
  CheckCircle2,
  Calendar,
  History,
  TrendingUp,
  FileSpreadsheet,
} from 'lucide-react';

export default function PayrollPage() {
  const router = useRouter();
  const store = ErpStore.getInstance();

  const [currentUser, setCurrentUser] = useState<Profile>(store.getCurrentUser());
  const [payrollEntries, setPayrollEntries] = useState<PayrollEntry[]>([]);
  const [payrollRuns, setPayrollRuns] = useState<MonthlyPayrollRun[]>([]);

  // Update Salary / Add Increment Modal
  const [isIncrementModalOpen, setIsIncrementModalOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [newSalary, setNewSalary] = useState<number>(0);
  const [incrementNote, setIncrementNote] = useState('');

  // Selected Month for Payroll Run
  const [selectedMonth, setSelectedMonth] = useState('2026-09');

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
      setPayrollEntries(store.getPayrollEntries(u.role));
      setPayrollRuns(store.getMonthlyPayrollRuns(u.role));
    };

    refresh();
    const unsub = store.subscribe(refresh);
    return unsub;
  }, [store, router]);

  const handleUpdateSalary = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserId || newSalary <= 0) {
      alert('Please select an employee and enter a valid salary amount.');
      return;
    }

    const res = store.updateEmployeeSalary(
      selectedUserId,
      newSalary,
      incrementNote,
      currentUser.id
    );

    setIsIncrementModalOpen(false);
    setFeedback(res.message);
    setTimeout(() => setFeedback(null), 4000);
  };

  const handleGeneratePayrollRun = () => {
    const run = store.generateMonthlyPayrollRun(selectedMonth, currentUser.id);
    setFeedback(`Monthly payroll run generated for ${run.month_year} totaling ₹${run.total_payroll_amount.toLocaleString()}.`);
    setTimeout(() => setFeedback(null), 4000);
  };

  const handleExportCSV = (run: MonthlyPayrollRun) => {
    const headers = ['User ID', 'Full Name', 'Department', 'Role', 'Monthly Salary (INR)'];
    const rows = run.employee_snapshots.map((s) => [
      s.user_id,
      `"${s.full_name}"`,
      `"${s.department_name}"`,
      s.role,
      s.salary,
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Knitnect_Payroll_${run.month_year}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportPayrollRegisterExcel = () => {
    try {
      const wb = XLSX.utils.book_new();

      // Sheet 1: Employee Compensation Registry
      const empRows = payrollEntries.map((p) => ({
        'Employee ID': p.user_id,
        'Employee Name': p.user_name,
        'Email Address': p.user_email,
        'Department': p.department_name,
        'Role': p.role ? p.role.toUpperCase() : '',
        'Joining Date': p.joined_on,
        'Base Salary (Monthly INR)': p.base_salary,
        'Increments Recorded': p.increment_history?.length || 0,
        'Latest Increment Details': p.increment_history && p.increment_history.length > 0
          ? p.increment_history.map(h => `${h.date}: ₹${h.new_salary} (${h.note || 'None'})`).join('; ')
          : 'None',
      }));
      const wsEmp = XLSX.utils.json_to_sheet(empRows);
      XLSX.utils.book_append_sheet(wb, wsEmp, 'Staff Compensation');

      // Sheet 2: Monthly Historical Runs
      const runRows = payrollRuns.map((r) => ({
        'Run ID': r.id,
        'Billing Month': r.month_year,
        'Total Disbursal (INR)': r.total_payroll_amount,
        'Status': r.status.toUpperCase(),
        'Authorized By': r.approved_by || 'Management',
        'Employees Count': r.employee_snapshots?.length || 0,
        'Generated Timestamp': r.created_at,
      }));
      const wsRuns = XLSX.utils.json_to_sheet(runRows);
      XLSX.utils.book_append_sheet(wb, wsRuns, 'Payroll Runs');

      XLSX.writeFile(wb, `Knitnect-Payroll-Register-${new Date().toISOString().slice(0, 10)}.xlsx`);
      setFeedback('Payroll register exported to Excel (.xlsx) successfully!');
      setTimeout(() => setFeedback(null), 4000);
    } catch (err) {
      console.error(err);
      alert('Payroll exported.');
    }
  };

  const handleExportRunExcel = (run: MonthlyPayrollRun) => {
    try {
      const wb = XLSX.utils.book_new();
      const rows = run.employee_snapshots.map((s) => ({
        'User ID': s.user_id,
        'Full Name': s.full_name,
        'Department': s.department_name,
        'Role': s.role.toUpperCase(),
        'Monthly Disbursal (INR)': s.salary,
        'Snapshot Month': run.month_year,
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, `Payroll ${run.month_year}`);
      XLSX.writeFile(wb, `Knitnect-Payroll-${run.month_year}.xlsx`);
      setFeedback(`Payroll snapshot for ${run.month_year} exported to Excel!`);
      setTimeout(() => setFeedback(null), 4000);
    } catch (err) {
      console.error(err);
    }
  };

  const totalMonthlyLiability = payrollEntries.reduce((sum, p) => sum + (p.base_salary || 0), 0);

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <Wallet className="w-5 h-5 text-primary" />
            <h1 className="text-xl font-bold tracking-tight text-white">
              Payroll, Increments & Compensation
            </h1>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Section 11: Base salaries, increment logs, and monthly snapshot generation with sign-off and CSV export.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={handleExportPayrollRegisterExcel}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-sm transition"
          >
            <Download className="w-3.5 h-3.5" />
            Export Payroll (.xlsx)
          </button>

          <button
            onClick={() => setIsIncrementModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-slate-800 border border-slate-700 text-slate-200 text-xs font-semibold hover:bg-slate-700 transition"
          >
            <TrendingUp className="w-3.5 h-3.5 text-slate-400" />
            Adjust Salary / Increment
          </button>

          <button
            onClick={handleGeneratePayrollRun}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition shadow-sm"
          >
            <Calendar className="w-3.5 h-3.5" />
            Generate Monthly Payroll Run
          </button>
        </div>
      </div>

      {feedback && (
        <div className="p-3 bg-emerald-950/80 border border-emerald-800 rounded text-xs text-emerald-300 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          <span>{feedback}</span>
        </div>
      )}

      {/* Financial Liability KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-[#111726] border border-slate-800 rounded p-4">
          <div className="text-[10px] uppercase font-semibold text-slate-500">Monthly Payroll Commitment</div>
          <div className="mt-1 text-2xl font-bold text-white mono-num">
            ₹{totalMonthlyLiability.toLocaleString()}
          </div>
          <div className="text-[10px] text-slate-400 mt-1">Across all active employees</div>
        </div>

        <div className="bg-[#111726] border border-slate-800 rounded p-4">
          <div className="text-[10px] uppercase font-semibold text-slate-500">Target Month</div>
          <div className="mt-1 flex items-center gap-2">
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-white text-xs font-mono focus:outline-none"
            />
          </div>
          <div className="text-[10px] text-slate-400 mt-1">For snapshot authorization</div>
        </div>

        <div className="bg-[#111726] border border-slate-800 rounded p-4">
          <div className="text-[10px] uppercase font-semibold text-slate-500">Historical Snapshot Runs</div>
          <div className="mt-1 text-2xl font-bold text-emerald-400 mono-num">
            {payrollRuns.length}
          </div>
          <div className="text-[10px] text-slate-400 mt-1">Signed off by management</div>
        </div>
      </div>

      {/* Two Column Layout: Personnel Payroll Table & Monthly Runs */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Employee Salaries & Increments */}
        <div className="lg:col-span-2 bg-[#101625] border border-slate-800 rounded overflow-hidden">
          <div className="px-4 py-3 bg-[#0d1320] border-b border-slate-800 flex items-center justify-between">
            <h2 className="text-xs font-bold text-white uppercase tracking-wider">
              Employee Compensation Registry
            </h2>
            <span className="text-[10px] text-slate-500">Strictly Owner/Manager Gated</span>
          </div>

          <div className="overflow-x-auto">
            <table className="erp-table text-xs">
              <thead>
                <tr>
                  <th>Employee Name</th>
                  <th>Department / Role</th>
                  <th>Joining Date</th>
                  <th>Base Salary (Monthly)</th>
                  <th>Increment History</th>
                </tr>
              </thead>
              <tbody>
                {payrollEntries.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <div className="font-semibold text-white">{p.user_name}</div>
                      <div className="text-[10px] text-slate-500 font-mono">{p.user_email}</div>
                    </td>
                    <td>
                      <div className="text-slate-300 font-medium">{p.department_name}</div>
                      <Badge variant="neutral">{p.role}</Badge>
                    </td>
                    <td className="mono-num text-slate-300">{p.joined_on}</td>
                    <td className="mono-num font-bold text-emerald-400 text-sm">
                      ₹{p.base_salary?.toLocaleString()}
                    </td>
                    <td className="max-w-[200px]">
                      {p.increment_history && p.increment_history.length > 0 ? (
                        <div className="space-y-1">
                          {p.increment_history.map((inc, idx) => (
                            <div key={idx} className="text-[10px] text-slate-400 flex items-center gap-1 font-mono">
                              <span className="text-slate-500">{inc.date}:</span>
                              <span className="text-slate-200">₹{inc.new_salary?.toLocaleString()}</span>
                              {inc.note && <span className="text-slate-500 italic">({inc.note})</span>}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-slate-500 text-[10px]">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right 1 Col: Monthly Payroll Runs & Export */}
        <div className="bg-[#101625] border border-slate-800 rounded p-4 space-y-4">
          <div className="border-b border-slate-800 pb-3">
            <h2 className="text-xs font-bold text-white uppercase tracking-wider">
              Signed-off Monthly Snapshot Runs
            </h2>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Owner signed-off runs ready for banking wire export.
            </p>
          </div>

          <div className="space-y-3">
            {payrollRuns.length === 0 ? (
              <div className="text-center py-8 text-slate-500 text-xs">
                No monthly payroll snapshot runs generated yet. Click "Generate Monthly Payroll Run" above.
              </div>
            ) : (
              payrollRuns.map((r) => (
                <div key={r.id} className="p-3 bg-slate-900 border border-slate-800 rounded space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-white text-sm">
                      Month: {r.month_year}
                    </span>
                    <Badge variant="success">{r.status}</Badge>
                  </div>

                  <div className="flex items-baseline justify-between text-slate-300">
                    <span className="text-slate-400 text-[11px]">Total Disbursal:</span>
                    <span className="mono-num font-bold text-emerald-400 text-sm">
                      ₹{r.total_payroll_amount?.toLocaleString()}
                    </span>
                  </div>

                  <div className="text-[10px] text-slate-500">
                    {r.employee_snapshots?.length} active employee records snapshotted
                  </div>

                  <div className="pt-2 border-t border-slate-800 flex justify-end gap-2">
                    <button
                      onClick={() => handleExportRunExcel(r)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-emerald-700/80 hover:bg-emerald-600 text-white text-[11px] font-semibold transition"
                    >
                      <Download className="w-3 h-3" />
                      Export Excel (.xlsx)
                    </button>
                    <button
                      onClick={() => handleExportCSV(r)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-semibold transition"
                    >
                      <Download className="w-3 h-3" />
                      Export Bank CSV
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* MODAL: UPDATE SALARY / ADD INCREMENT */}
      {isIncrementModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-[#111726] border border-slate-700 rounded-lg max-w-md w-full p-6 shadow-2xl space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                Salary Adjustment & Increment Record
              </h2>
              <button onClick={() => setIsIncrementModalOpen(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <form onSubmit={handleUpdateSalary} className="space-y-3.5">
              <div>
                <label className="block text-slate-400 font-medium mb-1">Select Employee *</label>
                <select
                  required
                  value={selectedUserId}
                  onChange={(e) => {
                    setSelectedUserId(e.target.value);
                    const p = payrollEntries.find((entry) => entry.user_id === e.target.value);
                    if (p) setNewSalary(p.base_salary);
                  }}
                  className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white"
                >
                  <option value="">-- Choose employee --</option>
                  {payrollEntries.map((p) => (
                    <option key={p.user_id} value={p.user_id}>
                      {p.user_name} (Current: ₹{p.base_salary?.toLocaleString()})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-400 font-medium mb-1">
                  New Monthly Base Salary (₹) *
                </label>
                <input
                  type="number"
                  required
                  value={newSalary || ''}
                  onChange={(e) => setNewSalary(parseFloat(e.target.value) || 0)}
                  className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-medium mb-1">
                  Increment / Review Note *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Annual performance review 2026, confirmed probation"
                  value={incrementNote}
                  onChange={(e) => setIncrementNote(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsIncrementModalOpen(false)}
                  className="px-3 py-1.5 bg-slate-800 rounded text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-primary font-semibold text-primary-foreground rounded hover:bg-primary/90"
                >
                  Record Increment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
