'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { PayrollEntry, MonthlyPayrollRun } from '@/lib/types/erp';
import { Badge } from '@/components/ui/Badge';
import { exportToExcel } from '@/lib/excel/excelExport';
import {
  Wallet,
  Download,
  CheckCircle2,
  Calendar,
  TrendingUp,
} from 'lucide-react';

export default function PayrollPage() {
  const router = useRouter();
  const supabase = createClient();

  const [currentUserId, setCurrentUserId] = useState<string>('');
  const [payrollEntries, setPayrollEntries] = useState<PayrollEntry[]>([]);
  const [payrollRuns, setPayrollRuns] = useState<MonthlyPayrollRun[]>([]);
  const [loading, setLoading] = useState(true);

  // Update Salary / Add Increment Modal
  const [isIncrementModalOpen, setIsIncrementModalOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [newSalary, setNewSalary] = useState<number>(0);
  const [incrementNote, setIncrementNote] = useState('');

  // Selected Month for Payroll Run
  const [selectedMonth, setSelectedMonth] = useState('2026-09');

  const [feedback, setFeedback] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      // 1. Fetch profiles with departments
      const { data: profs, error: profsErr } = await supabase
        .from('profiles')
        .select(`
          id,
          full_name,
          email,
          role,
          department_id,
          joined_on,
          base_salary,
          increment_history,
          active,
          departments (
            name
          )
        `)
        .order('full_name');

      if (profsErr) console.error('Error fetching profiles:', profsErr);

      if (profs) {
        const entries: PayrollEntry[] = profs.map((p: any) => ({
          id: p.id,
          user_id: p.id,
          user_name: p.full_name,
          user_email: p.email,
          department_name: p.departments?.name || (p.role === 'owner' ? 'Executive' : 'Operations'),
          role: p.role,
          joined_on: p.joined_on || '2026-01-01',
          base_salary: Number(p.base_salary || 0),
          increment_history: Array.isArray(p.increment_history) ? p.increment_history : [],
          updated_at: p.created_at || new Date().toISOString(),
        }));
        setPayrollEntries(entries);
      }

      // 2. Fetch monthly payroll runs
      const { data: runs, error: runsErr } = await supabase
        .from('monthly_payroll_runs')
        .select('*')
        .order('month_year', { ascending: false });

      if (runsErr) console.error('Error fetching payroll runs:', runsErr);
      if (runs) {
        setPayrollRuns(
          runs.map((r: any) => ({
            ...r,
            employee_snapshots: Array.isArray(r.employee_snapshots) ? r.employee_snapshots : [],
          }))
        );
      }
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    const init = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace('/login');
        return;
      }

      setCurrentUserId(user.id);

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      if (!profile || profile.role === 'employee') {
        router.replace('/employee/tasks');
        return;
      }

      await fetchData();
    };

    init();
  }, [supabase, router, fetchData]);

  const handleUpdateSalary = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserId || newSalary <= 0) {
      alert('Please select an employee and enter a valid salary amount.');
      return;
    }

    const targetProfile = payrollEntries.find((p) => p.user_id === selectedUserId);
    const currentHistory = targetProfile?.increment_history || [];
    const increment = {
      date: new Date().toISOString().split('T')[0],
      new_salary: Number(newSalary),
      note: incrementNote || 'Annual increment',
    };
    const updatedHistory = [...currentHistory, increment];

    // Update profiles
    const { error: profErr } = await supabase
      .from('profiles')
      .update({
        base_salary: Number(newSalary),
        increment_history: updatedHistory,
      })
      .eq('id', selectedUserId);

    if (profErr) {
      alert('Failed to update profile salary: ' + profErr.message);
      return;
    }

    // Upsert into payroll_entries
    await supabase.from('payroll_entries').upsert(
      {
        user_id: selectedUserId,
        base_salary: Number(newSalary),
        increment_history: updatedHistory,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );

    // Audit log
    await supabase.from('audit_log').insert({
      user_id: currentUserId,
      action: 'UPDATE',
      table_name: 'payroll_entries',
      notes: `Updated salary to ₹${newSalary} for ${targetProfile?.user_name || selectedUserId}`,
    });

    setIsIncrementModalOpen(false);
    setIncrementNote('');
    setFeedback(`Salary updated to ₹${newSalary} for ${targetProfile?.user_name || 'employee'}.`);
    setTimeout(() => setFeedback(null), 4000);
    await fetchData();
  };

  const handleGeneratePayrollRun = async () => {
    const snapshots = payrollEntries.map((p) => ({
      user_id: p.user_id,
      full_name: p.user_name || 'Staff',
      department_name: p.department_name || 'Operations',
      role: p.role || 'employee',
      salary: p.base_salary,
    }));

    const totalAmount = snapshots.reduce((sum, s) => sum + s.salary, 0);

    const { data: uProf } = await supabase
      .from('profiles')
      .select('org_id')
      .eq('id', currentUserId)
      .single();

    const orgId = uProf?.org_id;
    if (!orgId) {
      alert('Organization ID not found for current user.');
      return;
    }

    const { data: existing } = await supabase
      .from('monthly_payroll_runs')
      .select('id')
      .eq('month_year', selectedMonth)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from('monthly_payroll_runs')
        .update({
          total_payroll_amount: totalAmount,
          employee_snapshots: snapshots,
          status: 'approved',
          approved_by: currentUserId,
        })
        .eq('id', existing.id);

      if (error) {
        alert('Failed to update payroll run: ' + error.message);
        return;
      }
    } else {
      const { error } = await supabase.from('monthly_payroll_runs').insert({
        org_id: orgId,
        month_year: selectedMonth,
        total_payroll_amount: totalAmount,
        employee_snapshots: snapshots,
        status: 'approved',
        approved_by: currentUserId,
      });

      if (error) {
        alert('Failed to create payroll run: ' + error.message);
        return;
      }
    }

    // Audit log
    await supabase.from('audit_log').insert({
      user_id: currentUserId,
      action: 'CREATE',
      table_name: 'monthly_payroll_runs',
      notes: `Generated monthly payroll run for ${selectedMonth} (₹${totalAmount})`,
    });

    setFeedback(`Monthly payroll run generated for ${selectedMonth} totaling ₹${totalAmount.toLocaleString()}.`);
    setTimeout(() => setFeedback(null), 4000);
    await fetchData();
  };

  const handleExportCSV = (run: MonthlyPayrollRun) => {
    const headers = ['User ID', 'Full Name', 'Department', 'Role', 'Monthly Salary (INR)'];
    const rows = (run.employee_snapshots || []).map((s) => [
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

  const handleExportPayrollRegisterExcel = async () => {
    try {
      // Sheet 1: Employee Compensation Registry
      const empRows = payrollEntries.map((p) => ({
        user_id: p.user_id,
        user_name: p.user_name,
        user_email: p.user_email,
        department_name: p.department_name,
        role: p.role ? p.role.toUpperCase() : '',
        joined_on: p.joined_on,
        base_salary: p.base_salary,
        increments_count: p.increment_history?.length || 0,
        increment_details:
          p.increment_history && p.increment_history.length > 0
            ? p.increment_history.map((h) => `${h.date}: ₹${h.new_salary} (${h.note || 'None'})`).join('; ')
            : 'None',
      }));

      // Sheet 2: Monthly Historical Runs
      const runRows = payrollRuns.map((r) => ({
        id: r.id,
        month_year: r.month_year,
        total_payroll_amount: r.total_payroll_amount,
        status: (r.status || '').toUpperCase(),
        approved_by: r.approved_by || 'Management',
        employees_count: r.employee_snapshots?.length || 0,
        created_at: r.created_at,
      }));

      await exportToExcel(
        [
          {
            name: 'Staff Compensation',
            columns: [
              { header: 'Employee ID', key: 'user_id', width: 22 },
              { header: 'Employee Name', key: 'user_name', width: 20 },
              { header: 'Email Address', key: 'user_email', width: 25 },
              { header: 'Department', key: 'department_name', width: 18 },
              { header: 'Role', key: 'role', width: 14 },
              { header: 'Joining Date', key: 'joined_on', width: 15 },
              { header: 'Base Salary (Monthly INR)', key: 'base_salary', width: 24 },
              { header: 'Increments Recorded', key: 'increments_count', width: 20 },
              { header: 'Latest Increment Details', key: 'increment_details', width: 35 },
            ],
            rows: empRows,
          },
          {
            name: 'Payroll Runs',
            columns: [
              { header: 'Run ID', key: 'id', width: 22 },
              { header: 'Billing Month', key: 'month_year', width: 16 },
              { header: 'Total Disbursal (INR)', key: 'total_payroll_amount', width: 22 },
              { header: 'Status', key: 'status', width: 14 },
              { header: 'Authorized By', key: 'approved_by', width: 20 },
              { header: 'Employees Count', key: 'employees_count', width: 18 },
              { header: 'Generated Timestamp', key: 'created_at', width: 22 },
            ],
            rows: runRows,
          },
        ],
        `Knitnect-Payroll-Register-${new Date().toISOString().slice(0, 10)}.xlsx`
      );

      setFeedback('Payroll register exported to Excel (.xlsx) successfully!');
      setTimeout(() => setFeedback(null), 4000);
    } catch (err) {
      console.error(err);
      alert('Payroll exported.');
    }
  };

  const handleExportRunExcel = async (run: MonthlyPayrollRun) => {
    try {
      const rows = (run.employee_snapshots || []).map((s) => ({
        user_id: s.user_id,
        full_name: s.full_name,
        department_name: s.department_name,
        role: s.role.toUpperCase(),
        salary: s.salary,
        month_year: run.month_year,
      }));

      await exportToExcel(
        [
          {
            name: `Payroll ${run.month_year}`,
            columns: [
              { header: 'User ID', key: 'user_id', width: 22 },
              { header: 'Full Name', key: 'full_name', width: 20 },
              { header: 'Department', key: 'department_name', width: 18 },
              { header: 'Role', key: 'role', width: 14 },
              { header: 'Monthly Disbursal (INR)', key: 'salary', width: 22 },
              { header: 'Snapshot Month', key: 'month_year', width: 16 },
            ],
            rows,
          },
        ],
        `Knitnect-Payroll-${run.month_year}.xlsx`
      );
      setFeedback(`Payroll snapshot for ${run.month_year} exported to Excel!`);
      setTimeout(() => setFeedback(null), 4000);
    } catch (err) {
      console.error(err);
    }
  };

  const totalMonthlyLiability = payrollEntries.reduce((sum, p) => sum + (Number(p.base_salary) || 0), 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-slate-400 text-xs">Loading payroll registry & snapshot runs...</div>
      </div>
    );
  }

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
                No monthly payroll snapshot runs generated yet. Click &quot;Generate Monthly Payroll Run&quot; above.
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
