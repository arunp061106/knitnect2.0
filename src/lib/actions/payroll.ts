'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { payrollEntryUpdateSchema, monthlyPayrollRunSchema } from '@/lib/validations/schemas';
import { revalidatePath } from 'next/cache';

export async function updatePayrollEntryAction(input: unknown) {
  const parsed = payrollEntryUpdateSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.errors.map((e) => e.message).join(', '),
    };
  }

  const { user_id, base_salary, new_increment_date, new_salary, increment_note } = parsed.data;
  const supabase = createServerSupabaseClient();

  // Verify caller role is owner (Managers cannot edit payroll per specification)
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'Unauthorized: Session required.' };
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'owner') {
    return {
      success: false,
      error: 'Permission Denied: Managers cannot edit payroll records. Only the Owner can modify compensation.',
    };
  }

  // Fetch existing increment history
  const { data: currentEntry } = await supabase
    .from('payroll_entries')
    .select('increment_history')
    .eq('user_id', user_id)
    .single();

  const history = Array.isArray(currentEntry?.increment_history) ? [...currentEntry.increment_history] : [];
  if (new_increment_date && new_salary) {
    history.push({
      date: new_increment_date,
      new_salary,
      note: increment_note || 'Annual / Performance Adjustment',
    });
  }

  const { data, error } = await supabase
    .from('payroll_entries')
    .update({
      base_salary,
      increment_history: history,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', user_id)
    .select()
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath('/payroll');
  return { success: true, data };
}

export async function createPayrollRunAction(input: unknown) {
  const parsed = monthlyPayrollRunSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.errors.map((e) => e.message).join(', '),
    };
  }

  const { month_year, total_payroll_amount, employee_snapshots } = parsed.data;
  const supabase = createServerSupabaseClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'Unauthorized: Session required.' };
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, org_id')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'owner') {
    return {
      success: false,
      error: 'Permission Denied: Managers cannot disburse or edit payroll. Owner authorization required.',
    };
  }

  const { data, error } = await supabase
    .from('monthly_payroll_runs')
    .insert({
      org_id: profile.org_id || '00000000-0000-0000-0000-000000000001',
      month_year,
      total_payroll_amount,
      employee_snapshots,
      status: 'approved',
      approved_by: user.id,
      approved_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath('/payroll');
  return { success: true, data };
}
