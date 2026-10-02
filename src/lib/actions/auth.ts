'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { loginSchema } from '@/lib/validations/schemas';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

export interface ActionResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

export async function loginAction(input: unknown): Promise<ActionResult<{ role: string; email: string }>> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.errors.map((e) => e.message).join(', '),
    };
  }

  const { email, password } = parsed.data;
  const supabase = createServerSupabaseClient();

  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (authError || !authData.user) {
    return {
      success: false,
      error: authError?.message || 'Invalid email or password credentials',
    };
  }

  // Fetch profile to resolve role
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', authData.user.id)
    .single();

  const role = profile?.role || 'employee';

  revalidatePath('/', 'layout');
  return {
    success: true,
    data: {
      role,
      email: authData.user.email || email,
    },
  };
}

export async function logoutAction(): Promise<void> {
  const supabase = createServerSupabaseClient();
  await supabase.auth.signOut();
  revalidatePath('/', 'layout');
  redirect('/login');
}

export async function getCurrentUserAction() {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    return null;
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  return profile || null;
}
