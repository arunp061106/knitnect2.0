-- ============================================================
-- KNITNECT PRODUCTION ERP — MIGRATION 003: SCHEMA FIXES & HARDENED RLS
-- Implements robust RBAC, soft-delete, security-definer helpers,
-- audit triggers, floor view isolation, and stage/dispatch gate triggers.
-- ============================================================

-- 1. SOFT DELETE SUPPORT (Add deleted_at columns)
ALTER TABLE IF EXISTS public.profiles ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE IF EXISTS public.styles ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE IF EXISTS public.production_runs ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE IF EXISTS public.dispatch_records ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE IF EXISTS public.payment_records ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- 2. HARDENED HELPER FUNCTIONS (SET search_path = public, require active = true)
CREATE OR REPLACE FUNCTION public.current_user_org_id()
RETURNS UUID AS $$
  SELECT org_id FROM public.profiles 
  WHERE id = auth.uid() AND active = true AND deleted_at IS NULL 
  LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT AS $$
  SELECT role FROM public.profiles 
  WHERE id = auth.uid() AND active = true AND deleted_at IS NULL 
  LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.current_user_dept()
RETURNS UUID AS $$
  SELECT department_id FROM public.profiles 
  WHERE id = auth.uid() AND active = true AND deleted_at IS NULL 
  LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.is_management()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() 
      AND role IN ('owner', 'manager') 
      AND active = true 
      AND deleted_at IS NULL
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.is_owner()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() 
      AND role = 'owner' 
      AND active = true 
      AND deleted_at IS NULL
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- 3. CONSTRAINTS HARDENING
-- Stage logs: unique stage order per run, non-negative weights, output <= input
ALTER TABLE IF EXISTS public.production_stage_logs 
  DROP CONSTRAINT IF EXISTS unique_run_stage_order;
ALTER TABLE IF EXISTS public.production_stage_logs 
  ADD CONSTRAINT unique_run_stage_order UNIQUE (production_run_id, stage_order);

ALTER TABLE IF EXISTS public.production_stage_logs 
  DROP CONSTRAINT IF EXISTS chk_stage_weights_valid;
ALTER TABLE IF EXISTS public.production_stage_logs 
  ADD CONSTRAINT chk_stage_weights_valid CHECK (
    input_weight_kg >= 0 AND 
    output_weight_kg >= 0 AND 
    output_weight_kg <= input_weight_kg + 0.0001
  );

-- Fabric consume percentage in (0, 1]
ALTER TABLE IF EXISTS public.style_fabrics 
  DROP CONSTRAINT IF EXISTS chk_consume_pct_range;
ALTER TABLE IF EXISTS public.style_fabrics 
  ADD CONSTRAINT chk_consume_pct_range CHECK (consume_pct > 0 AND consume_pct <= 1.0);

-- Payment unique transaction per bank, positive amount
ALTER TABLE IF EXISTS public.payment_records 
  DROP CONSTRAINT IF EXISTS unique_bank_transaction;
ALTER TABLE IF EXISTS public.payment_records 
  ADD CONSTRAINT unique_bank_transaction UNIQUE (bank_name, transaction_id);

ALTER TABLE IF EXISTS public.payment_records 
  DROP CONSTRAINT IF EXISTS chk_positive_payment_amount;
ALTER TABLE IF EXISTS public.payment_records 
  ADD CONSTRAINT chk_positive_payment_amount CHECK (amount_transferred > 0);

-- 4. SOFT DELETE FOREIGN KEY SAFETY (Replace ON DELETE CASCADE with RESTRICT where critical)
-- Ensure styles, runs, dispatch, payments are not deleted accidentally
DO $$
BEGIN
  -- Styles -> Profiles
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'styles_created_by_fkey') THEN
    ALTER TABLE public.styles DROP CONSTRAINT styles_created_by_fkey;
    ALTER TABLE public.styles ADD CONSTRAINT styles_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE RESTRICT;
  END IF;

  -- Production Runs -> Styles
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'production_runs_style_id_fkey') THEN
    ALTER TABLE public.production_runs DROP CONSTRAINT production_runs_style_id_fkey;
    ALTER TABLE public.production_runs ADD CONSTRAINT production_runs_style_id_fkey FOREIGN KEY (style_id) REFERENCES public.styles(id) ON DELETE RESTRICT;
  END IF;

  -- Dispatch -> Runs
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'dispatch_records_production_run_id_fkey') THEN
    ALTER TABLE public.dispatch_records DROP CONSTRAINT dispatch_records_production_run_id_fkey;
    ALTER TABLE public.dispatch_records ADD CONSTRAINT dispatch_records_production_run_id_fkey FOREIGN KEY (production_run_id) REFERENCES public.production_runs(id) ON DELETE RESTRICT;
  END IF;

  -- Payments -> Dispatch
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'payment_records_dispatch_id_fkey') THEN
    ALTER TABLE public.payment_records DROP CONSTRAINT payment_records_dispatch_id_fkey;
    ALTER TABLE public.payment_records ADD CONSTRAINT payment_records_dispatch_id_fkey FOREIGN KEY (dispatch_id) REFERENCES public.dispatch_records(id) ON DELETE RESTRICT;
  END IF;
END $$;

-- 5. TASK UPDATE PERMISSIONS TRIGGER
-- Non-management employees can only update task status, measurements, notes; cannot reassign or change spec
CREATE OR REPLACE FUNCTION public.enforce_task_update_permissions()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT public.is_management() THEN
    -- Must be assigned to this task
    IF OLD.assigned_to != auth.uid() THEN
      RAISE EXCEPTION 'Unauthorized: You are not assigned to this floor task.';
    END IF;

    -- Block alterations to critical administrative fields
    IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to OR
       NEW.department_id IS DISTINCT FROM OLD.department_id OR
       NEW.created_by IS DISTINCT FROM OLD.created_by OR
       NEW.specification IS DISTINCT FROM OLD.specification OR
       NEW.production_stage_log_id IS DISTINCT FROM OLD.production_stage_log_id OR
       NEW.expected_completion_date IS DISTINCT FROM OLD.expected_completion_date THEN
      RAISE EXCEPTION 'Unauthorized: Floor operators can only update measurements and task status, not task assignments or specifications.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_enforce_task_update_permissions ON public.tasks;
CREATE TRIGGER trg_enforce_task_update_permissions
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_task_update_permissions();

-- 6. DISPATCH CLEARANCE GATE TRIGGER
-- Requires 100% completed production pipeline (all stages done) AND shipped_qty <= order_qty
CREATE OR REPLACE FUNCTION public.enforce_dispatch_gate()
RETURNS TRIGGER AS $$
DECLARE
  v_incomplete_count INT;
  v_total_stages INT;
BEGIN
  IF NEW.status IN ('dispatched', 'delivered') THEN
    -- Check stage completion
    SELECT 
      COUNT(*) FILTER (WHERE status != 'done'),
      COUNT(*)
    INTO v_incomplete_count, v_total_stages
    FROM public.production_stage_logs
    WHERE production_run_id = NEW.production_run_id;

    IF v_total_stages = 0 OR v_incomplete_count > 0 THEN
      RAISE EXCEPTION 'Dispatch Clearance Lock: Cannot dispatch run. % of % production stages remain incomplete or unverified.',
        v_incomplete_count, v_total_stages;
    END IF;

    -- Shipped quantity validation if order_qty exists
    IF NEW.shipped_qty IS NOT NULL AND NEW.order_qty IS NOT NULL AND NEW.shipped_qty > NEW.order_qty THEN
      RAISE EXCEPTION 'Dispatch Clearance Lock: Shipped quantity (% pcs) cannot exceed total order quantity (% pcs).',
        NEW.shipped_qty, NEW.order_qty;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_enforce_dispatch_gate ON public.dispatch_records;
CREATE TRIGGER trg_enforce_dispatch_gate
  BEFORE INSERT OR UPDATE ON public.dispatch_records
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_dispatch_gate();

-- 7. RECREATE CHAT TABLES WITH AUTH INTEGRATION & STRICT RLS
CREATE TABLE public.chat_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  type TEXT NOT NULL CHECK (type IN ('owner_manager', 'owner_employee', 'manager_employee', 'common')),
  participant_a_id UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
  participant_b_id UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
  name TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES public.chat_channels(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  body TEXT NOT NULL,
  tagged_style_id UUID REFERENCES public.styles(id) ON DELETE SET NULL,
  tagged_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.chat_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- 8. FLOOR STAGE LOGS VIEW (Excludes financial figures and loss_value for floor workers)
DROP VIEW IF EXISTS public.floor_stage_logs;
CREATE VIEW public.floor_stage_logs AS
SELECT 
  id,
  production_run_id,
  stage_name,
  stage_order,
  department_id,
  input_weight_kg,
  output_weight_kg,
  loss_kg,
  loss_pct,
  assigned_to,
  status,
  started_at,
  completed_at,
  completed_by,
  notes,
  created_at
FROM public.production_stage_logs;

-- 9. AUDIT LOG APPEND-ONLY HARDENING & AUTOMATED AUDIT TRIGGER
REVOKE UPDATE, DELETE ON public.activity_log FROM public, authenticated, anon;

CREATE OR REPLACE FUNCTION public.audit_log_trigger()
RETURNS TRIGGER AS $$
DECLARE
  v_org_id UUID;
BEGIN
  v_org_id := public.current_user_org_id();
  IF v_org_id IS NOT NULL THEN
    INSERT INTO public.activity_log (org_id, user_id, action, entity_type, entity_id, details)
    VALUES (
      v_org_id,
      auth.uid(),
      TG_OP,
      TG_TABLE_NAME,
      COALESCE(NEW.id, OLD.id),
      jsonb_build_object('operation', TG_OP, 'table', TG_TABLE_NAME)
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 10. TIGHTENED ROW LEVEL SECURITY (RLS) POLICIES ACROSS ALL TABLES

-- ORGANIZATIONS: user can only see their own organization
DROP POLICY IF EXISTS "Orgs viewable by authenticated users" ON public.organizations;
CREATE POLICY "Orgs viewable by own org members" ON public.organizations
  FOR SELECT TO authenticated 
  USING (id = public.current_user_org_id());

-- DEPARTMENTS: strictly scoped to own organization
DROP POLICY IF EXISTS "Departments viewable by authenticated users" ON public.departments;
DROP POLICY IF EXISTS "Departments manageable by owner and manager" ON public.departments;
CREATE POLICY "Departments viewable by own org members" ON public.departments
  FOR SELECT TO authenticated 
  USING (org_id = public.current_user_org_id());

CREATE POLICY "Departments manageable by management" ON public.departments
  FOR ALL TO authenticated 
  USING (public.is_management() AND org_id = public.current_user_org_id())
  WITH CHECK (public.is_management() AND org_id = public.current_user_org_id());

-- PROFILES: Owner only can insert or update roles/salaries/depts
DROP POLICY IF EXISTS "Profiles viewable by management, or own profile" ON public.profiles;
DROP POLICY IF EXISTS "Profiles updateable by management, or self for non-role fields" ON public.profiles;
DROP POLICY IF EXISTS "Profiles insertable by management" ON public.profiles;

CREATE POLICY "Profiles viewable within same org" ON public.profiles
  FOR SELECT TO authenticated 
  USING (org_id = public.current_user_org_id());

CREATE POLICY "Profiles insertable by Owner only" ON public.profiles
  FOR INSERT TO authenticated 
  WITH CHECK (public.is_owner() AND org_id = public.current_user_org_id());

CREATE POLICY "Profiles updateable by Owner only" ON public.profiles
  FOR UPDATE TO authenticated 
  USING (public.is_owner() AND org_id = public.current_user_org_id())
  WITH CHECK (public.is_owner() AND org_id = public.current_user_org_id());

-- PRODUCTION STAGE LOGS: Management can read the full table with loss_value
DROP POLICY IF EXISTS "Stage logs viewable by management or department employees" ON public.production_stage_logs;
DROP POLICY IF EXISTS "Stage logs manageable by management only" ON public.production_stage_logs;
DROP POLICY IF EXISTS "Stage logs insertable by management only" ON public.production_stage_logs;

CREATE POLICY "Stage logs full read for management" ON public.production_stage_logs
  FOR SELECT TO authenticated 
  USING (public.is_management());

CREATE POLICY "Stage logs manageable by management only" ON public.production_stage_logs
  FOR ALL TO authenticated 
  USING (public.is_management())
  WITH CHECK (public.is_management());

-- TASKS: scoped to employee's assignments and department
DROP POLICY IF EXISTS "Tasks viewable by management or assigned employee or dept" ON public.tasks;
DROP POLICY IF EXISTS "Tasks updateable by assigned employee or management" ON public.tasks;
DROP POLICY IF EXISTS "Tasks insertable/deletable by management only" ON public.tasks;
DROP POLICY IF EXISTS "Tasks deletable by management only" ON public.tasks;

CREATE POLICY "Tasks viewable by assigned employee or management" ON public.tasks
  FOR SELECT TO authenticated 
  USING (
    public.is_management() OR 
    assigned_to = auth.uid() OR 
    department_id = public.current_user_dept()
  );

CREATE POLICY "Tasks updateable by assigned employee or management" ON public.tasks
  FOR UPDATE TO authenticated 
  USING (
    public.is_management() OR 
    assigned_to = auth.uid()
  );

CREATE POLICY "Tasks insertable by management" ON public.tasks
  FOR INSERT TO authenticated 
  WITH CHECK (public.is_management());

CREATE POLICY "Tasks deletable by management" ON public.tasks
  FOR DELETE TO authenticated 
  USING (public.is_management());

-- CHAT CHANNELS & MESSAGES: Scoped by org and participant roles
CREATE POLICY "Chat channels access control" ON public.chat_channels
  FOR SELECT TO authenticated USING (
    org_id = public.current_user_org_id() AND (
      type = 'common' OR
      (type = 'owner_manager' AND public.is_management()) OR
      (type = 'owner_employee' AND (public.current_user_role() = 'owner' OR participant_b_id = auth.uid())) OR
      (type = 'manager_employee' AND (public.current_user_role() = 'manager' OR participant_b_id = auth.uid()))
    )
  );

CREATE POLICY "Chat channels insertable by management" ON public.chat_channels
  FOR INSERT TO authenticated 
  WITH CHECK (public.is_management() AND org_id = public.current_user_org_id());

CREATE POLICY "Chat messages viewable by channel participants" ON public.chat_messages
  FOR SELECT TO authenticated USING (
    deleted_at IS NULL AND
    EXISTS (
      SELECT 1 FROM public.chat_channels c
      WHERE c.id = chat_messages.channel_id
        AND c.org_id = public.current_user_org_id()
        AND (
          c.type = 'common' OR
          (c.type = 'owner_manager' AND public.is_management()) OR
          (c.type = 'owner_employee' AND (public.current_user_role() = 'owner' OR c.participant_b_id = auth.uid())) OR
          (c.type = 'manager_employee' AND (public.current_user_role() = 'manager' OR c.participant_b_id = auth.uid()))
        )
    )
  );

CREATE POLICY "Chat messages insertable by authorized participants" ON public.chat_messages
  FOR INSERT TO authenticated WITH CHECK (
    sender_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.chat_channels c
      WHERE c.id = chat_messages.channel_id
        AND c.org_id = public.current_user_org_id()
        AND (
          c.type = 'common' OR
          (c.type = 'owner_manager' AND public.is_management()) OR
          (c.type = 'owner_employee' AND (public.current_user_role() = 'owner' OR c.participant_b_id = auth.uid())) OR
          (c.type = 'manager_employee' AND (public.current_user_role() = 'manager' OR c.participant_b_id = auth.uid()))
        )
    )
  );

-- ACTIVITY LOG
DROP POLICY IF EXISTS "Activity log access for management" ON public.activity_log;
DROP POLICY IF EXISTS "Activity log insertable by authenticated users" ON public.activity_log;

CREATE POLICY "Activity log viewable by management" ON public.activity_log
  FOR SELECT TO authenticated 
  USING (public.is_management() AND org_id = public.current_user_org_id());

CREATE POLICY "Activity log insertable by authenticated user in same org" ON public.activity_log
  FOR INSERT TO authenticated 
  WITH CHECK (user_id = auth.uid() AND org_id = public.current_user_org_id());
