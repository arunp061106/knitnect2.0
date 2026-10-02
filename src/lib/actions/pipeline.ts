'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { stageWeightSchema, managerOverrideSchema } from '@/lib/validations/schemas';
import { revalidatePath } from 'next/cache';

export async function updateStageWeightsAction(input: unknown) {
  const parsed = stageWeightSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.errors.map((e) => e.message).join(', '),
    };
  }

  const { stage_log_id, input_weight_kg, output_weight_kg, notes } = parsed.data;
  const supabase = createServerSupabaseClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'Unauthorized: You must be logged in to update stage weights.' };
  }

  // Update production_stage_logs (PostgreSQL trigger will enforce mass-conservation gate)
  const { data, error } = await supabase
    .from('production_stage_logs')
    .update({
      input_weight_kg,
      output_weight_kg,
      notes: notes || null,
      completed_by: user.id,
      completed_at: new Date().toISOString(),
    })
    .eq('id', stage_log_id)
    .select()
    .single();

  if (error) {
    return {
      success: false,
      error: error.message,
      isMassConservationGate: error.message.includes('Mass Conservation Gate Block'),
    };
  }

  revalidatePath('/pipeline');
  revalidatePath('/employee/pipeline');
  return { success: true, data };
}

export async function overrideStageWeightsAction(input: unknown) {
  const parsed = managerOverrideSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.errors.map((e) => e.message).join(', '),
    };
  }

  const { stage_log_id, input_weight_kg, output_weight_kg, override_reason, general_notes } = parsed.data;
  const supabase = createServerSupabaseClient();

  // Call the Postgres RPC function
  const { data, error } = await supabase.rpc('record_stage_weights_with_override', {
    p_stage_log_id: stage_log_id,
    p_input_weight_kg: input_weight_kg,
    p_output_weight_kg: output_weight_kg,
    p_override_reason: override_reason,
    p_general_notes: general_notes || null,
  });

  if (error) {
    return {
      success: false,
      error: error.message,
    };
  }

  revalidatePath('/pipeline');
  revalidatePath('/employee/pipeline');
  return { success: true, data };
}
