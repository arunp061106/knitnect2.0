-- ============================================================
-- KNITNECT PRODUCTION ERP — FULL SUPABASE AUTH, RLS & POSTGRES GATES
-- Migration 004:
-- 1. Security-definer get_role() function
-- 2. profiles table locked to service role write, public.get_role() exposed
-- 3. Mass-conservation gate & Manager Override RPC in Postgres
-- 4. Dispatch clearance hard lock trigger (all 15 stages completed)
-- 5. Immutable audit_log table with automatic mutation triggers (no update/delete)
-- 6. Strict RLS across all tables (employees cannot see costing, payments, payroll, margins, audit_log)
-- 7. Manager blocked from modifying payroll (Owner-only payroll mutations)
-- 8. Chat policies by channel type (common=all, owner_manager=executives, DMs=participants)
-- 9. Fixture user creation in auth.users with email/password support
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ------------------------------------------------------------
-- 1. SECURITY DEFINER get_role() & ROLE HELPERS
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_role()
RETURNS TEXT AS $$
DECLARE
  v_role TEXT;
BEGIN
  SELECT role INTO v_role 
  FROM public.profiles 
  WHERE id = auth.uid() 
  LIMIT 1;

  RETURN COALESCE(v_role, 'employee');
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, auth;

CREATE OR REPLACE FUNCTION public.is_management()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN public.get_role() IN ('owner', 'manager');
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- Keep backward-compatible alias
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT AS $$
BEGIN
  RETURN public.get_role();
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- ------------------------------------------------------------
-- 2. PROFILES TABLE & SERVICE ROLE WRITE ONLY
-- ------------------------------------------------------------

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Drop legacy permissive profile policies
DROP POLICY IF EXISTS "Profiles viewable by management, or own profile" ON public.profiles;
DROP POLICY IF EXISTS "Profiles updateable by management, or self for non-role fields" ON public.profiles;
DROP POLICY IF EXISTS "Profiles insertable by management" ON public.profiles;
DROP POLICY IF EXISTS "Profiles viewable by authenticated users" ON public.profiles;
DROP POLICY IF EXISTS "Profiles writable by service role only" ON public.profiles;
DROP POLICY IF EXISTS "Profiles viewable by management or self" ON public.profiles;

-- Authenticated users can view management or their own profile (or all if management)
CREATE POLICY "Profiles viewable by management or self" ON public.profiles
  FOR SELECT TO authenticated
  USING (public.is_management() OR id = auth.uid());

-- NO INSERT, UPDATE, or DELETE policies for authenticated users on public.profiles!
-- This guarantees public.profiles is WRITABLE ONLY by service role.

-- Trigger to automatically create profile on auth.users signup
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER AS $$
DECLARE
  default_org_id UUID;
  user_role TEXT;
  full_name TEXT;
BEGIN
  SELECT id INTO default_org_id FROM public.organizations LIMIT 1;
  IF default_org_id IS NULL THEN
    default_org_id := '00000000-0000-0000-0000-000000000001';
  END IF;

  user_role := COALESCE(NEW.raw_user_meta_data->>'role', 'employee');
  full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1));

  INSERT INTO public.profiles (id, org_id, full_name, email, role, active, created_at)
  VALUES (
    NEW.id,
    default_org_id,
    full_name,
    NEW.email,
    user_role,
    true,
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- ------------------------------------------------------------
-- 3. IMMUTABLE AUDIT LOG (INSERT ONLY, NO UPDATE / NO DELETE)
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  user_id UUID,
  action TEXT NOT NULL, -- 'INSERT', 'UPDATE', 'DELETE', 'RPC_OVERRIDE'
  table_name TEXT NOT NULL,
  record_id TEXT,
  old_data JSONB,
  new_data JSONB,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Audit log viewable by management" ON public.audit_log;
DROP POLICY IF EXISTS "Audit log insertable" ON public.audit_log;
DROP POLICY IF EXISTS "Audit log updateable" ON public.audit_log;
DROP POLICY IF EXISTS "Audit log deletable" ON public.audit_log;

-- Only Owner and Manager can select audit logs. Employees have ZERO access.
CREATE POLICY "Audit log viewable by management" ON public.audit_log
  FOR SELECT TO authenticated
  USING (public.is_management());

-- NO INSERT, UPDATE, or DELETE policies for authenticated role on public.audit_log.
-- Written only by PostgreSQL DB triggers running as SECURITY DEFINER.

-- Generic Trigger Function to capture mutations into audit_log
CREATE OR REPLACE FUNCTION public.log_mutation_to_audit()
RETURNS TRIGGER AS $$
DECLARE
  v_user_id UUID;
  v_rec_id TEXT;
  v_old JSONB := NULL;
  v_new JSONB := NULL;
BEGIN
  v_user_id := auth.uid();

  IF TG_OP = 'DELETE' THEN
    v_rec_id := OLD.id::TEXT;
    v_old := to_jsonb(OLD);
  ELSIF TG_OP = 'UPDATE' THEN
    v_rec_id := NEW.id::TEXT;
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
  ELSIF TG_OP = 'INSERT' THEN
    v_rec_id := NEW.id::TEXT;
    v_new := to_jsonb(NEW);
  END IF;

  INSERT INTO public.audit_log (
    user_id,
    action,
    table_name,
    record_id,
    old_data,
    new_data,
    created_at
  ) VALUES (
    v_user_id,
    TG_OP,
    TG_TABLE_NAME,
    v_rec_id,
    v_old,
    v_new,
    now()
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attach audit trigger to high-integrity tables
DROP TRIGGER IF EXISTS audit_styles ON public.styles;
CREATE TRIGGER audit_styles AFTER INSERT OR UPDATE OR DELETE ON public.styles
  FOR EACH ROW EXECUTE FUNCTION public.log_mutation_to_audit();

DROP TRIGGER IF EXISTS audit_costing_sheets ON public.costing_sheets;
CREATE TRIGGER audit_costing_sheets AFTER INSERT OR UPDATE OR DELETE ON public.costing_sheets
  FOR EACH ROW EXECUTE FUNCTION public.log_mutation_to_audit();

DROP TRIGGER IF EXISTS audit_stage_logs ON public.production_stage_logs;
CREATE TRIGGER audit_stage_logs AFTER INSERT OR UPDATE OR DELETE ON public.production_stage_logs
  FOR EACH ROW EXECUTE FUNCTION public.log_mutation_to_audit();

DROP TRIGGER IF EXISTS audit_dispatch_records ON public.dispatch_records;
CREATE TRIGGER audit_dispatch_records AFTER INSERT OR UPDATE OR DELETE ON public.dispatch_records
  FOR EACH ROW EXECUTE FUNCTION public.log_mutation_to_audit();

DROP TRIGGER IF EXISTS audit_payroll_entries ON public.payroll_entries;
CREATE TRIGGER audit_payroll_entries AFTER INSERT OR UPDATE OR DELETE ON public.payroll_entries
  FOR EACH ROW EXECUTE FUNCTION public.log_mutation_to_audit();

DROP TRIGGER IF EXISTS audit_monthly_payroll ON public.monthly_payroll_runs;
CREATE TRIGGER audit_monthly_payroll AFTER INSERT OR UPDATE OR DELETE ON public.monthly_payroll_runs
  FOR EACH ROW EXECUTE FUNCTION public.log_mutation_to_audit();

DROP TRIGGER IF EXISTS audit_payment_records ON public.payment_records;
CREATE TRIGGER audit_payment_records AFTER INSERT OR UPDATE OR DELETE ON public.payment_records
  FOR EACH ROW EXECUTE FUNCTION public.log_mutation_to_audit();

-- ------------------------------------------------------------
-- 4. MASS-CONSERVATION GATE & MANAGER OVERRIDE IN POSTGRES
-- ------------------------------------------------------------

-- A: Check constraint on non-negative weights and valid stage loss
ALTER TABLE public.production_stage_logs 
  DROP CONSTRAINT IF EXISTS check_stage_weight_positive;

ALTER TABLE public.production_stage_logs
  ADD CONSTRAINT check_stage_weight_positive
  CHECK (input_weight_kg >= 0 AND output_weight_kg >= 0 AND loss_kg >= -0.05);

-- B: Mass conservation trigger across pipeline stages
CREATE OR REPLACE FUNCTION public.enforce_mass_conservation_gate()
RETURNS TRIGGER AS $$
DECLARE
  prev_stage_out NUMERIC(12,4);
  is_mgr BOOLEAN;
BEGIN
  -- Compute loss values automatically
  IF NEW.input_weight_kg > 0 AND NEW.output_weight_kg > 0 THEN
    NEW.loss_kg := GREATEST(0, ROUND((NEW.input_weight_kg - NEW.output_weight_kg)::numeric, 4));
    NEW.loss_pct := ROUND(((NEW.loss_kg / NEW.input_weight_kg) * 100)::numeric, 2);
  END IF;

  -- For stage 2 onwards, check previous stage output weight in the same production run
  IF NEW.stage_order > 1 AND NEW.input_weight_kg > 0 THEN
    SELECT output_weight_kg INTO prev_stage_out
    FROM public.production_stage_logs
    WHERE production_run_id = NEW.production_run_id
      AND stage_order = NEW.stage_order - 1
    LIMIT 1;

    -- If prior stage output exists and input exceeds it by more than 0.05kg tolerance
    IF prev_stage_out IS NOT NULL AND prev_stage_out > 0 AND NEW.input_weight_kg > (prev_stage_out + 0.05) THEN
      is_mgr := public.is_management();
      -- If not manager or no override flag recorded in notes
      IF NOT is_mgr OR (NEW.notes IS NULL OR NEW.notes NOT LIKE '%[MANAGER OVERRIDE:%') THEN
        RAISE EXCEPTION 'Mass Conservation Gate Block: Stage input weight (% kg) exceeds previous stage output (% kg). Received fabric cannot exceed prior stage output without an authorized Manager/Owner override.',
          NEW.input_weight_kg, prev_stage_out;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_enforce_mass_conservation ON public.production_stage_logs;
CREATE TRIGGER trg_enforce_mass_conservation
  BEFORE INSERT OR UPDATE ON public.production_stage_logs
  FOR EACH ROW EXECUTE FUNCTION public.enforce_mass_conservation_gate();

-- C: Manager Override RPC Function
CREATE OR REPLACE FUNCTION public.record_stage_weights_with_override(
  p_stage_log_id UUID,
  p_input_weight_kg NUMERIC,
  p_output_weight_kg NUMERIC,
  p_override_reason TEXT,
  p_general_notes TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_role TEXT;
  v_user_id UUID;
  v_notes TEXT;
  v_updated RECORD;
BEGIN
  v_role := public.get_role();
  v_user_id := auth.uid();

  IF v_role NOT IN ('owner', 'manager') THEN
    RAISE EXCEPTION 'Access Denied: Only a Manager or Owner can approve a mass-conservation weight override.';
  END IF;

  IF p_override_reason IS NULL OR trim(p_override_reason) = '' THEN
    RAISE EXCEPTION 'Validation Failed: An explicit justification reason is required for a manager override.';
  END IF;

  v_notes := '[MANAGER OVERRIDE: ' || trim(p_override_reason) || ']';
  IF p_general_notes IS NOT NULL AND trim(p_general_notes) <> '' THEN
    v_notes := v_notes || ' | ' || trim(p_general_notes);
  END IF;

  UPDATE public.production_stage_logs
  SET
    input_weight_kg = p_input_weight_kg,
    output_weight_kg = p_output_weight_kg,
    notes = v_notes,
    completed_by = v_user_id
  WHERE id = p_stage_log_id
  RETURNING * INTO v_updated;

  -- Explicit audit trail entry
  INSERT INTO public.audit_log (
    user_id,
    action,
    table_name,
    record_id,
    new_data,
    notes,
    created_at
  ) VALUES (
    v_user_id,
    'RPC_MANAGER_OVERRIDE',
    'production_stage_logs',
    p_stage_log_id::text,
    to_jsonb(v_updated),
    p_override_reason,
    now()
  );

  RETURN jsonb_build_object(
    'success', true,
    'stage_log_id', p_stage_log_id,
    'input_weight_kg', p_input_weight_kg,
    'output_weight_kg', p_output_weight_kg,
    'override_applied_by', v_user_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ------------------------------------------------------------
-- 5. DISPATCH CLEARANCE HARD LOCK IN POSTGRES
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enforce_dispatch_clearance_lock()
RETURNS TRIGGER AS $$
DECLARE
  v_total_stages INT;
  v_done_stages INT;
BEGIN
  -- Count total and completed stages for this production run
  SELECT 
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'done')
  INTO v_total_stages, v_done_stages
  FROM public.production_stage_logs
  WHERE production_run_id = NEW.production_run_id;

  -- Require at least 15 stages defined and all 15 stages completed
  IF v_total_stages < 15 OR v_done_stages < v_total_stages THEN
    RAISE EXCEPTION 'Dispatch Clearance Lock: Order cannot be dispatched. Production run % has completed % of % required pipeline stages. Under factory protocol, all 15 pipeline stages must be complete and quality cleared before dispatch.',
      NEW.production_run_id, v_done_stages, v_total_stages;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_enforce_dispatch_lock ON public.dispatch_records;
CREATE TRIGGER trg_enforce_dispatch_lock
  BEFORE INSERT OR UPDATE ON public.dispatch_records
  FOR EACH ROW EXECUTE FUNCTION public.enforce_dispatch_clearance_lock();

-- ------------------------------------------------------------
-- 6. STRICT ROW LEVEL SECURITY (RLS) ACROSS ALL TABLES
-- ------------------------------------------------------------

-- STYLES (Owner & Manager only. Employees have NO access)
ALTER TABLE public.styles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Styles full access for management" ON public.styles;
DROP POLICY IF EXISTS "Styles select for management" ON public.styles;
DROP POLICY IF EXISTS "Styles management access" ON public.styles;

CREATE POLICY "Styles management access" ON public.styles
  FOR ALL TO authenticated
  USING (public.is_management())
  WITH CHECK (public.is_management());

-- STYLE FABRICS (Owner & Manager only)
ALTER TABLE public.style_fabrics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Style fabrics full access for management" ON public.style_fabrics;
DROP POLICY IF EXISTS "Style fabrics management access" ON public.style_fabrics;

CREATE POLICY "Style fabrics management access" ON public.style_fabrics
  FOR ALL TO authenticated
  USING (public.is_management())
  WITH CHECK (public.is_management());

-- LAB DIPS (Owner & Manager only)
ALTER TABLE public.lab_dips ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Lab dips full access for management" ON public.lab_dips;
DROP POLICY IF EXISTS "Lab dips management access" ON public.lab_dips;

CREATE POLICY "Lab dips management access" ON public.lab_dips
  FOR ALL TO authenticated
  USING (public.is_management())
  WITH CHECK (public.is_management());

-- COSTING SHEETS (Owner & Manager only. Employees have ZERO access)
ALTER TABLE public.costing_sheets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Costing sheets full access for management" ON public.costing_sheets;
DROP POLICY IF EXISTS "Costing sheets management access" ON public.costing_sheets;

CREATE POLICY "Costing sheets management access" ON public.costing_sheets
  FOR ALL TO authenticated
  USING (public.is_management())
  WITH CHECK (public.is_management());

-- PRODUCTION RUNS (Owner & Manager only)
ALTER TABLE public.production_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Production runs full access for management" ON public.production_runs;
DROP POLICY IF EXISTS "Production runs management access" ON public.production_runs;

CREATE POLICY "Production runs management access" ON public.production_runs
  FOR ALL TO authenticated
  USING (public.is_management())
  WITH CHECK (public.is_management());

-- PRODUCTION STAGE LOGS:
-- Employees can ONLY select their own assigned stage logs
-- Management has full access
ALTER TABLE public.production_stage_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Stage logs viewable by management or department employees" ON public.production_stage_logs;
DROP POLICY IF EXISTS "Stage logs manageable by management only" ON public.production_stage_logs;
DROP POLICY IF EXISTS "Stage logs insertable by management only" ON public.production_stage_logs;
DROP POLICY IF EXISTS "Stage logs select policy" ON public.production_stage_logs;
DROP POLICY IF EXISTS "Stage logs update policy" ON public.production_stage_logs;
DROP POLICY IF EXISTS "Stage logs management write" ON public.production_stage_logs;
DROP POLICY IF EXISTS "Stage logs management delete" ON public.production_stage_logs;

CREATE POLICY "Stage logs select policy" ON public.production_stage_logs
  FOR SELECT TO authenticated
  USING (public.is_management() OR assigned_to = auth.uid());

CREATE POLICY "Stage logs update policy" ON public.production_stage_logs
  FOR UPDATE TO authenticated
  USING (public.is_management() OR assigned_to = auth.uid())
  WITH CHECK (public.is_management() OR assigned_to = auth.uid());

CREATE POLICY "Stage logs management write" ON public.production_stage_logs
  FOR INSERT TO authenticated
  WITH CHECK (public.is_management());

CREATE POLICY "Stage logs management delete" ON public.production_stage_logs
  FOR DELETE TO authenticated
  USING (public.is_management());

-- TASKS:
-- Employees can select only their own assigned tasks
-- Management has full access
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tasks viewable by management or assigned employee or dept" ON public.tasks;
DROP POLICY IF EXISTS "Tasks updateable by assigned employee or management" ON public.tasks;
DROP POLICY IF EXISTS "Tasks insertable/deletable by management only" ON public.tasks;
DROP POLICY IF EXISTS "Tasks deletable by management only" ON public.tasks;
DROP POLICY IF EXISTS "Tasks select policy" ON public.tasks;
DROP POLICY IF EXISTS "Tasks update policy" ON public.tasks;
DROP POLICY IF EXISTS "Tasks management insert" ON public.tasks;
DROP POLICY IF EXISTS "Tasks management delete" ON public.tasks;

CREATE POLICY "Tasks select policy" ON public.tasks
  FOR SELECT TO authenticated
  USING (public.is_management() OR assigned_to = auth.uid());

CREATE POLICY "Tasks update policy" ON public.tasks
  FOR UPDATE TO authenticated
  USING (public.is_management() OR assigned_to = auth.uid())
  WITH CHECK (public.is_management() OR assigned_to = auth.uid());

CREATE POLICY "Tasks management insert" ON public.tasks
  FOR INSERT TO authenticated
  WITH CHECK (public.is_management());

CREATE POLICY "Tasks management delete" ON public.tasks
  FOR DELETE TO authenticated
  USING (public.is_management());

-- DISPATCH RECORDS (Owner & Manager only. Employees have ZERO access)
ALTER TABLE public.dispatch_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Dispatch records full access for management" ON public.dispatch_records;
DROP POLICY IF EXISTS "Dispatch records management access" ON public.dispatch_records;

CREATE POLICY "Dispatch records management access" ON public.dispatch_records
  FOR ALL TO authenticated
  USING (public.is_management())
  WITH CHECK (public.is_management());

-- PAYMENT RECORDS (Owner & Manager only. Employees have ZERO access)
ALTER TABLE public.payment_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Payment records full access for management" ON public.payment_records;
DROP POLICY IF EXISTS "Payment records management access" ON public.payment_records;

CREATE POLICY "Payment records management access" ON public.payment_records
  FOR ALL TO authenticated
  USING (public.is_management())
  WITH CHECK (public.is_management());

-- PAYROLL ENTRIES:
-- Owner & Manager can SELECT (Employees have ZERO access)
-- ONLY OWNER can INSERT / UPDATE / DELETE (Managers CANNOT edit payroll!)
ALTER TABLE public.payroll_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Payroll entries full access for management" ON public.payroll_entries;
DROP POLICY IF EXISTS "Payroll entries select management" ON public.payroll_entries;
DROP POLICY IF EXISTS "Payroll entries owner write" ON public.payroll_entries;

CREATE POLICY "Payroll entries select management" ON public.payroll_entries
  FOR SELECT TO authenticated
  USING (public.is_management());

CREATE POLICY "Payroll entries owner write" ON public.payroll_entries
  FOR ALL TO authenticated
  USING (public.get_role() = 'owner')
  WITH CHECK (public.get_role() = 'owner');

-- MONTHLY PAYROLL RUNS:
-- Owner & Manager can SELECT (Employees have ZERO access)
-- ONLY OWNER can INSERT / UPDATE / DELETE (Managers CANNOT edit payroll!)
ALTER TABLE public.monthly_payroll_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Monthly payroll runs full access for management" ON public.monthly_payroll_runs;
DROP POLICY IF EXISTS "Monthly payroll runs select management" ON public.monthly_payroll_runs;
DROP POLICY IF EXISTS "Monthly payroll runs owner write" ON public.monthly_payroll_runs;

CREATE POLICY "Monthly payroll runs select management" ON public.monthly_payroll_runs
  FOR SELECT TO authenticated
  USING (public.is_management());

CREATE POLICY "Monthly payroll runs owner write" ON public.monthly_payroll_runs
  FOR ALL TO authenticated
  USING (public.get_role() = 'owner')
  WITH CHECK (public.get_role() = 'owner');

-- ------------------------------------------------------------
-- 7. CHAT POLICIES BY CHANNEL TYPE & REALTIME FILTERING
-- ------------------------------------------------------------

ALTER TABLE public.chat_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Chat channels access control" ON public.chat_channels;
DROP POLICY IF EXISTS "Chat channels insertable by management" ON public.chat_channels;
DROP POLICY IF EXISTS "Chat channels select policy" ON public.chat_channels;
DROP POLICY IF EXISTS "Chat channels insert policy" ON public.chat_channels;

DROP POLICY IF EXISTS "Chat messages viewable by channel participants" ON public.chat_messages;
DROP POLICY IF EXISTS "Chat messages insertable by authorized participants" ON public.chat_messages;
DROP POLICY IF EXISTS "Chat messages select policy" ON public.chat_messages;
DROP POLICY IF EXISTS "Chat messages insert policy" ON public.chat_messages;

-- Chat Channels Access:
-- 1. common: all authenticated users
-- 2. owner_manager: owner & manager only
-- 3. DMs (owner_employee, manager_employee, direct): participants only
CREATE POLICY "Chat channels select policy" ON public.chat_channels
  FOR SELECT TO authenticated
  USING (
    type = 'common'
    OR (type = 'owner_manager' AND public.is_management())
    OR (participant_a_id = auth.uid()::text OR participant_b_id = auth.uid()::text)
  );

CREATE POLICY "Chat channels insert policy" ON public.chat_channels
  FOR INSERT TO authenticated
  WITH CHECK (public.is_management());

-- Chat Messages Access:
-- Message is viewable ONLY if the channel is accessible to current user
CREATE POLICY "Chat messages select policy" ON public.chat_messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.chat_channels c
      WHERE c.id = chat_messages.channel_id
      AND (
        c.type = 'common'
        OR (c.type = 'owner_manager' AND public.is_management())
        OR (c.participant_a_id = auth.uid()::text OR c.participant_b_id = auth.uid()::text)
      )
    )
  );

CREATE POLICY "Chat messages insert policy" ON public.chat_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()::text
    AND EXISTS (
      SELECT 1 FROM public.chat_channels c
      WHERE c.id = chat_messages.channel_id
      AND (
        c.type = 'common'
        OR (c.type = 'owner_manager' AND public.is_management())
        OR (c.participant_a_id = auth.uid()::text OR c.participant_b_id = auth.uid()::text)
      )
    )
  );

-- ------------------------------------------------------------
-- 8. SEED FIXTURE USERS IN auth.users WITH STANDARD PASSWORDS
-- ------------------------------------------------------------

-- Seed users with password 'Knitnect2026!'
DO $$
DECLARE
  v_enc_pw TEXT;
BEGIN
  v_enc_pw := crypt('Knitnect2026!', gen_salt('bf'));

  -- Owner
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    '30000000-0000-0000-0000-000000000001',
    'authenticated',
    'authenticated',
    'owner@knitnect.com',
    v_enc_pw,
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"R. Senthil Kumar","role":"owner"}'::jsonb,
    now(),
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    encrypted_password = EXCLUDED.encrypted_password,
    raw_user_meta_data = EXCLUDED.raw_user_meta_data;

  -- Manager
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    '30000000-0000-0000-0000-000000000002',
    'authenticated',
    'authenticated',
    'manager@knitnect.com',
    v_enc_pw,
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"K. Vignesh","role":"manager"}'::jsonb,
    now(),
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    encrypted_password = EXCLUDED.encrypted_password,
    raw_user_meta_data = EXCLUDED.raw_user_meta_data;

  -- Employee
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    '30000000-0000-0000-0000-000000000003',
    'authenticated',
    'authenticated',
    'employee@knitnect.com',
    v_enc_pw,
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"M. Murugan","role":"employee"}'::jsonb,
    now(),
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    encrypted_password = EXCLUDED.encrypted_password,
    raw_user_meta_data = EXCLUDED.raw_user_meta_data;

END $$;

-- Ensure profiles exist and match auth users exactly
INSERT INTO public.profiles (
  id, org_id, full_name, email, role, department_id, joined_on, active, base_salary, increment_history
) VALUES
('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'R. Senthil Kumar', 'owner@knitnect.com', 'owner', NULL, '2024-01-01', true, 120000.00, '[]'::jsonb),
('30000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'K. Vignesh', 'manager@knitnect.com', 'manager', NULL, '2024-03-01', true, 65000.00, '[]'::jsonb),
('30000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'M. Murugan', 'employee@knitnect.com', 'employee', '10000000-0000-0000-0000-000000000006', '2024-06-15', true, 28000.00, '[]'::jsonb)
ON CONFLICT (id) DO UPDATE SET
  role = EXCLUDED.role,
  full_name = EXCLUDED.full_name,
  email = EXCLUDED.email,
  department_id = EXCLUDED.department_id,
  base_salary = EXCLUDED.base_salary;
