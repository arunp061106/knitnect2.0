'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { dispatchCreateSchema } from '@/lib/validations/schemas';
import { revalidatePath } from 'next/cache';

export async function createDispatchAction(input: unknown) {
  const parsed = dispatchCreateSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.errors.map((e) => e.message).join(', '),
    };
  }

  const {
    production_run_id,
    style_id,
    order_qty,
    shipped_qty,
    transport_cost,
    fob_value,
    forwarding_cost,
    dispatch_date,
    notes,
  } = parsed.data;

  const is_partial = shipped_qty < order_qty;
  const status = is_partial ? 'partial' : 'pending';
  const supabase = createServerSupabaseClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'Unauthorized: You must be logged in to create a dispatch order.' };
  }

  // Insert into dispatch_records (enforcing Postgres dispatch clearance hard lock trigger)
  const { data, error } = await supabase
    .from('dispatch_records')
    .insert({
      production_run_id,
      style_id,
      order_qty,
      shipped_qty,
      is_partial,
      transport_cost,
      fob_value,
      forwarding_cost,
      dispatch_date,
      status,
      notes: notes || null,
    })
    .select()
    .single();

  if (error) {
    return {
      success: false,
      error: error.message,
      isDispatchLocked: error.message.includes('Dispatch Clearance Lock'),
    };
  }

  revalidatePath('/dispatch');
  return { success: true, data };
}
