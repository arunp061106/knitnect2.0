import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export interface AuthSession {
  userId: string;
  email: string;
  role: 'owner' | 'manager' | 'employee';
  full_name: string;
  org_id: string;
  department_id: string | null;
}

/**
 * Call in any Server Component or Server Action to get the authenticated user's
 * profile from public.profiles. Redirects to /login if no session.
 */
export async function requireAuth(): Promise<AuthSession> {
  const supabase = createServerSupabaseClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect('/login');
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, full_name, email, role, org_id, department_id')
    .eq('id', user.id)
    .single();

  if (profileError || !profile) {
    // Profile not found — sign out and redirect
    await supabase.auth.signOut();
    redirect('/login');
  }

  return {
    userId: profile.id,
    email: profile.email,
    role: profile.role as AuthSession['role'],
    full_name: profile.full_name,
    org_id: profile.org_id,
    department_id: profile.department_id ?? null,
  };
}

/**
 * Like requireAuth but also enforces that role is owner or manager.
 * Redirects employees to their tasks page.
 */
export async function requireManagement(): Promise<AuthSession> {
  const session = await requireAuth();
  if (session.role === 'employee') {
    redirect('/employee/tasks');
  }
  return session;
}

/**
 * Like requireAuth but only allows owner role.
 */
export async function requireOwner(): Promise<AuthSession> {
  const session = await requireAuth();
  if (session.role !== 'owner') {
    redirect('/dashboard');
  }
  return session;
}
