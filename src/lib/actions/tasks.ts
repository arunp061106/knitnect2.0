'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { taskUpdateSchema, taskCreateSchema } from '@/lib/validations/schemas';
import { revalidatePath } from 'next/cache';

export async function updateTaskStatusAction(input: unknown) {
  const parsed = taskUpdateSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.errors.map((e) => e.message).join(', '),
    };
  }

  const { task_id, status, notes, actual_completion_date } = parsed.data;
  const supabase = createServerSupabaseClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'Unauthorized: Session required.' };
  }

  const updatePayload: Record<string, any> = {
    status,
    notes: notes || null,
  };
  if (status === 'completed') {
    updatePayload.actual_completion_date = actual_completion_date || new Date().toISOString().split('T')[0];
  }

  const { data, error } = await supabase
    .from('tasks')
    .update(updatePayload)
    .eq('id', task_id)
    .select()
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath('/tasks');
  revalidatePath('/employee/tasks');
  return { success: true, data };
}

export async function createTaskAction(input: unknown) {
  const parsed = taskCreateSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.errors.map((e) => e.message).join(', '),
    };
  }

  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'Unauthorized: Session required.' };
  }

  const { data, error } = await supabase
    .from('tasks')
    .insert({
      ...parsed.data,
      created_by: user.id,
      status: 'pending',
    })
    .select()
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath('/tasks');
  revalidatePath('/employee/tasks');
  return { success: true, data };
}
