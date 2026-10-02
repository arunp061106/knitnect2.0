'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Badge } from '@/components/ui/Badge';
import { Building2, Plus, UserPlus, CheckCircle2, Download } from 'lucide-react';
import { exportToExcel } from '@/lib/excel/excelExport';

interface DeptRow {
  id: string;
  name: string;
  stage_type: string;
  member_count?: number;
}

interface UserRow {
  id: string;
  full_name: string;
  email: string;
  role: string;
  department_id: string | null;
  department_name?: string;
  active: boolean;
}

export default function DepartmentsPage() {
  const router = useRouter();

  const [isMounted, setIsMounted] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string>('');
  const [role, setRole] = useState<string>('employee');
  const [departments, setDepartments] = useState<DeptRow[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Create Department Modal
  const [isDeptModalOpen, setIsDeptModalOpen] = useState(false);
  const [deptName, setDeptName] = useState('');
  const [deptStageType, setDeptStageType] = useState('Knitting');

  // Assign Employee Modal
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedDeptId, setSelectedDeptId] = useState('');

  const [feedback, setFeedback] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.replace('/login'); return; }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    const userRole = profile?.role ?? 'employee';
    setRole(userRole);
    setCurrentUserId(user.id);
    setIsMounted(true);

    if (userRole === 'employee') { router.replace('/employee/tasks'); return; }

    // Fetch departments
    const { data: depts } = await supabase
      .from('departments')
      .select('id, name, stage_type')
      .order('name');

    // Fetch all profiles in the same org (RLS handles org scoping)
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, email, role, department_id, active')
      .order('full_name');

    // Join department name onto each profile and count members per dept
    const deptMap = Object.fromEntries((depts ?? []).map((d: any) => [d.id, d.name]));
    const mappedProfiles: UserRow[] = (profiles ?? []).map((p: any) => ({
      ...p,
      department_name: p.department_id ? deptMap[p.department_id] : undefined,
    }));

    const mappedDepts: DeptRow[] = (depts ?? []).map((d: any) => ({
      ...d,
      member_count: mappedProfiles.filter((p: any) => p.department_id === d.id).length,
    }));

    setDepartments(mappedDepts);
    setUsers(mappedProfiles);
    setLoading(false);
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  const isManagement = isMounted && (role === 'owner' || role === 'manager');

  const handleExportStaffExcel = async () => {
    try {
      const staffRows = users.map((u) => {
        const dept = departments.find((d) => d.id === u.department_id);
        return {
          id: u.id,
          full_name: u.full_name,
          email: u.email,
          role: u.role.toUpperCase(),
          department: dept ? dept.name : 'Unassigned',
          status: u.active ? 'ACTIVE' : 'DEACTIVATED',
        };
      });

      const deptRows = departments.map((d) => ({
        id: d.id,
        name: d.name,
        stage_type: d.stage_type,
        staff_count: d.member_count ?? 0,
      }));

      await exportToExcel(
        [
          {
            name: 'Staff Directory',
            columns: [
              { header: 'User ID', key: 'id', width: 22 },
              { header: 'Full Name', key: 'full_name', width: 20 },
              { header: 'Email', key: 'email', width: 25 },
              { header: 'Role', key: 'role', width: 14 },
              { header: 'Department', key: 'department', width: 18 },
              { header: 'Status', key: 'status', width: 14 },
            ],
            rows: staffRows,
          },
          {
            name: 'Departments',
            columns: [
              { header: 'Department ID', key: 'id', width: 22 },
              { header: 'Department Name', key: 'name', width: 20 },
              { header: 'Stage Type', key: 'stage_type', width: 18 },
              { header: 'Staff Count', key: 'staff_count', width: 14 },
            ],
            rows: deptRows,
          },
        ],
        `Knitnect-Staff-Departments-${new Date().toISOString().slice(0, 10)}.xlsx`
      );

      setFeedback('Staff and departments directory exported to Excel (.xlsx)!');
      setTimeout(() => setFeedback(null), 4000);
    } catch (err) {
      console.error(err);
      alert('Directory exported.');
    }
  };

  const handleCreateDepartment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deptName) return;
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: org } = await supabase
      .from('profiles')
      .select('org_id')
      .eq('id', user.id)
      .single();

    const { error } = await supabase
      .from('departments')
      .insert({ org_id: org?.org_id, name: deptName.trim(), stage_type: deptStageType });

    setIsDeptModalOpen(false);
    setDeptName('');
    if (!error) {
      setFeedback(`Department "${deptName}" created successfully.`);
      setTimeout(() => setFeedback(null), 3000);
      await load();
    } else {
      setFeedback(`Error: ${error.message}`);
    }
  };

  const handleAssignEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserId || !selectedDeptId) return;
    const supabase = createClient();

    const { error } = await supabase
      .from('profiles')
      .update({ department_id: selectedDeptId })
      .eq('id', selectedUserId);

    setIsAssignModalOpen(false);
    if (!error) {
      setFeedback('Employee assigned to department successfully.');
      setTimeout(() => setFeedback(null), 3000);
      await load();
    } else {
      setFeedback(`Error: ${error.message}`);
    }
  };

  const handleDeactivateUser = async (userId: string) => {
    if (!confirm('Are you sure you want to deactivate this employee account? Historical task records will be preserved.')) return;
    const supabase = createClient();
    const { error } = await supabase
      .from('profiles')
      .update({ active: false })
      .eq('id', userId);

    if (!error) {
      setFeedback('Employee account deactivated successfully.');
      setTimeout(() => setFeedback(null), 4000);
      await load();
    } else {
      setFeedback(`Error: ${error.message}`);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="w-6 h-6 border-2 border-blue-500/40 border-t-blue-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-primary" />
            <h1 className="text-xl font-bold tracking-tight text-white">
              {isManagement ? 'Departments & Floor Staff Management' : 'Department Directory'}
            </h1>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            {isManagement
              ? 'Pipeline stage mapping, employee departmental assignment, and user offboarding.'
              : 'View the production department structure and your assigned stage.'}
          </p>
        </div>

        {isManagement && (
          <div className="flex items-center gap-2.5">
            <button
              onClick={handleExportStaffExcel}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-sm transition"
            >
              <Download className="w-3.5 h-3.5" />
              Export Directory (.xlsx)
            </button>
            <button
              onClick={() => setIsAssignModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-slate-800 border border-slate-700 text-slate-200 text-xs font-semibold hover:bg-slate-700 transition"
            >
              <UserPlus className="w-3.5 h-3.5 text-slate-400" />
              Assign Staff
            </button>
            <button
              onClick={() => setIsDeptModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              New Department
            </button>
          </div>
        )}
      </div>

      {feedback && (
        <div className="p-3 bg-emerald-950/80 border border-emerald-800 rounded text-xs text-emerald-300 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          <span>{feedback}</span>
        </div>
      )}

      <div className={isManagement ? 'grid grid-cols-1 lg:grid-cols-2 gap-6' : 'grid grid-cols-1 gap-6'}>
        {/* Departments Table */}
        <div className="bg-[#101625] border border-slate-800 rounded overflow-hidden">
          <div className="px-4 py-3 bg-[#0d1320] border-b border-slate-800 flex items-center justify-between">
            <h2 className="text-xs font-bold text-white uppercase tracking-wider">
              Departments ({departments.length})
            </h2>
            <span className="text-[11px] text-slate-400">Mapped to pipeline stages</span>
          </div>
          <div className="overflow-x-auto">
            <table className="erp-table text-xs">
              <thead>
                <tr>
                  <th>Department Name</th>
                  <th>Mapped Stage</th>
                  <th>Active Staff</th>
                </tr>
              </thead>
              <tbody>
                {departments.map((dept) => (
                  <tr key={dept.id}>
                    <td className="font-semibold text-white">{dept.name}</td>
                    <td>
                      <Badge variant="neutral">{dept.stage_type}</Badge>
                    </td>
                    <td className="mono-num text-slate-300">
                      {dept.member_count || 0} employee{dept.member_count === 1 ? '' : 's'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Staff Registry — Management Only */}
        {isManagement && (
          <div className="bg-[#101625] border border-slate-800 rounded overflow-hidden">
            <div className="px-4 py-3 bg-[#0d1320] border-b border-slate-800 flex items-center justify-between">
              <h2 className="text-xs font-bold text-white uppercase tracking-wider">
                Personnel Registry ({users.length})
              </h2>
              <span className="text-[11px] text-slate-400">Supabase auth users</span>
            </div>
            <div className="overflow-x-auto">
              <table className="erp-table text-xs">
                <thead>
                  <tr>
                    <th>Employee Name</th>
                    <th>Role</th>
                    <th>Department</th>
                    <th>Status</th>
                    <th className="text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td>
                        <div className="font-semibold text-white">{u.full_name}</div>
                        <div className="text-[10px] text-slate-500 font-mono">{u.email}</div>
                      </td>
                      <td>
                        <Badge
                          variant={
                            u.role === 'owner' ? 'purple' : u.role === 'manager' ? 'info' : 'warning'
                          }
                        >
                          {u.role}
                        </Badge>
                      </td>
                      <td className="text-slate-300">
                        {u.department_name || (u.role === 'owner' ? 'Company Leadership' : 'General')}
                      </td>
                      <td>
                        <Badge variant={u.active ? 'success' : 'danger'}>
                          {u.active ? 'Active' : 'Deactivated'}
                        </Badge>
                      </td>
                      <td className="text-right">
                        {u.active && u.role === 'employee' && u.id !== currentUserId && (
                          <button
                            onClick={() => handleDeactivateUser(u.id)}
                            className="px-2 py-0.5 rounded bg-rose-950 hover:bg-rose-900 text-rose-300 text-[10px] font-medium transition"
                          >
                            Deactivate
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* MODAL: CREATE DEPARTMENT */}
      {isDeptModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-[#111726] border border-slate-700 rounded-lg max-w-md w-full p-6 shadow-2xl space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">Create Production Department</h2>
              <button onClick={() => setIsDeptModalOpen(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>
            <form onSubmit={handleCreateDepartment} className="space-y-3.5">
              <div>
                <label className="block text-slate-400 font-medium mb-1">Department Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Sampling & Pattern Making"
                  value={deptName}
                  onChange={(e) => setDeptName(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white focus:outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="block text-slate-400 font-medium mb-1">Mapped Production Stage Type *</label>
                <select
                  value={deptStageType}
                  onChange={(e) => setDeptStageType(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white focus:outline-none"
                >
                  <option value="Yarn Buying">Yarn Buying</option>
                  <option value="Knitting">Knitting</option>
                  <option value="Dyeing">Dyeing</option>
                  <option value="Heat Setting">Heat Setting</option>
                  <option value="Finishing & Compacting">Finishing &amp; Compacting</option>
                  <option value="Cutting">Cutting</option>
                  <option value="Sewing">Sewing</option>
                  <option value="Embroidery & Printing">Embroidery &amp; Printing</option>
                  <option value="Checking">Checking / QC</option>
                  <option value="Packing">Packing</option>
                  <option value="Dispatch">Dispatch</option>
                </select>
              </div>
              <div className="pt-2 flex justify-end gap-2">
                <button type="button" onClick={() => setIsDeptModalOpen(false)} className="px-3 py-1.5 bg-slate-800 rounded text-slate-300">Cancel</button>
                <button type="submit" className="px-4 py-1.5 bg-primary font-semibold text-primary-foreground rounded hover:bg-primary/90">Create Department</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ASSIGN EMPLOYEE */}
      {isAssignModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-[#111726] border border-slate-700 rounded-lg max-w-md w-full p-6 shadow-2xl space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">Assign Staff to Department</h2>
              <button onClick={() => setIsAssignModalOpen(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>
            <form onSubmit={handleAssignEmployee} className="space-y-3.5">
              <div>
                <label className="block text-slate-400 font-medium mb-1">Select Employee *</label>
                <select
                  required
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white"
                >
                  <option value="">-- Choose employee --</option>
                  {users.filter((u) => u.active).map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.full_name} ({u.role}) — Current: {u.department_name || 'None'}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-slate-400 font-medium mb-1">Target Department *</label>
                <select
                  required
                  value={selectedDeptId}
                  onChange={(e) => setSelectedDeptId(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white"
                >
                  <option value="">-- Choose department --</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>{d.name} ({d.stage_type})</option>
                  ))}
                </select>
              </div>
              <div className="pt-2 flex justify-end gap-2">
                <button type="button" onClick={() => setIsAssignModalOpen(false)} className="px-3 py-1.5 bg-slate-800 rounded text-slate-300">Cancel</button>
                <button type="submit" className="px-4 py-1.5 bg-primary font-semibold text-primary-foreground rounded hover:bg-primary/90">Assign Department</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
