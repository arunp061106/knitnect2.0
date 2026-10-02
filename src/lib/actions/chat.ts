'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { chatMessageSchema } from '@/lib/validations/schemas';
import { revalidatePath } from 'next/cache';

export async function sendMessageAction(input: unknown) {
  const parsed = chatMessageSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.errors.map((e) => e.message).join(', '),
    };
  }

  const { channel_id, body, tagged_style_id, tagged_style_number, tagged_user_id, tagged_user_name } =
    parsed.data;
  const supabase = createServerSupabaseClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'Unauthorized: Session required to post messages.' };
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role')
    .eq('id', user.id)
    .single();

  const sender_name = profile?.full_name || 'Staff Member';
  const sender_role = profile?.role || 'employee';

  const { data, error } = await supabase
    .from('chat_messages')
    .insert({
      id: crypto.randomUUID(),
      channel_id,
      sender_id: user.id,
      sender_name,
      sender_role,
      body,
      tagged_style_id: tagged_style_id || null,
      tagged_style_number: tagged_style_number || null,
      tagged_user_id: tagged_user_id || null,
      tagged_user_name: tagged_user_name || null,
    })
    .select()
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath('/chat');
  return { success: true, data };
}
