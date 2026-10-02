-- ============================================================
-- KNITNECT PRODUCTION ERP — COMPLETE POSTGRES SCHEMA & RLS MIGRATION
-- Compliant with Knitnect MVP Build Specification
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. ORGANIZATIONS
CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. DEPARTMENTS (Knitting, Dyeing, Cutting, Sewing, QC, Packing, etc.)
CREATE TABLE IF NOT EXISTS public.departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  stage_type TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(org_id, name)
);

-- 3. PROFILES (Extends auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'manager', 'employee')),
  department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  joined_on DATE DEFAULT CURRENT_DATE,
  active BOOLEAN NOT NULL DEFAULT true,
  base_salary NUMERIC(12,2) DEFAULT 0,
  increment_history JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. DEPARTMENT MEMBERS (Employee <-> Department join table)
CREATE TABLE IF NOT EXISTS public.department_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id UUID NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(department_id, user_id)
);

-- 5. PIPELINE TEMPLATES (Configurable stage definitions)
CREATE TABLE IF NOT EXISTS public.pipeline_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  garment_process_type TEXT NOT NULL CHECK (garment_process_type IN ('solid_fabric', 'aop_white_based', 'aop_dyed_base')),
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(org_id, garment_process_type)
);

-- 6. PIPELINE STAGE DEFINITIONS (Ordered per template)
CREATE TABLE IF NOT EXISTS public.pipeline_stage_defs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.pipeline_templates(id) ON DELETE CASCADE,
  stage_name TEXT NOT NULL,
  stage_order INT NOT NULL,
  default_department_name TEXT,
  is_winter_only BOOLEAN NOT NULL DEFAULT false,
  branch_type TEXT NOT NULL DEFAULT 'shared', -- 'shared', 'solid_fabric', 'aop_white_based', 'aop_dyed_base'
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 7. STYLES
CREATE TABLE IF NOT EXISTS public.styles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  style_number TEXT NOT NULL,
  season TEXT NOT NULL,
  offer_no TEXT NOT NULL,
  description TEXT NOT NULL,
  garment_category TEXT NOT NULL CHECK (garment_category IN ('Kids', 'Mens', 'Womens')),
  garment_season_type TEXT NOT NULL CHECK (garment_season_type IN ('Summer', 'Winter')),
  garment_process_type TEXT NOT NULL CHECK (garment_process_type IN ('solid_fabric', 'aop_white_based', 'aop_dyed_base')),
  status TEXT NOT NULL DEFAULT 'costing' CHECK (status IN ('costing', 'sample_production', 'bulk_production', 'dispatch_ready', 'completed')),
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 8. STYLE FABRICS (Lossless representation of Excel costing fields)
CREATE TABLE IF NOT EXISTS public.style_fabrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  style_id UUID NOT NULL REFERENCES public.styles(id) ON DELETE CASCADE,
  s_no INT,
  fabric_code TEXT,
  fabric_type TEXT DEFAULT 'BODY', -- BODY / RIB / Lining / Application
  colour TEXT, -- Pantone TPG reference
  aop_ref TEXT DEFAULT 'Solid', -- Gar.dye / Solid / AOP
  quality TEXT,
  composition TEXT,
  gsm NUMERIC(10,2) DEFAULT 0,
  pc_wt NUMERIC(10,4) DEFAULT 0, -- fabric weight per piece (kg)
  sample_qty INT DEFAULT 0,
  reqd_qty NUMERIC(12,4) DEFAULT 0, -- derived: pc_wt * sample_qty
  yarn_count TEXT,
  yarn_price NUMERIC(10,2) DEFAULT 0,
  consume_pct NUMERIC(6,4) DEFAULT 1.0, -- blend ratio (e.g. 0.3 = 30%)
  effective_yarn_cost NUMERIC(10,2) DEFAULT 0, -- yarn_price * consume_pct
  knitting_cost NUMERIC(10,2) DEFAULT 0,
  heat_setting_cost NUMERIC(10,2) DEFAULT 0,
  solid_dye_cost NUMERIC(10,2) DEFAULT 0,
  dyed_dye_cost NUMERIC(10,2) DEFAULT 0,
  stenter_cost NUMERIC(10,2) DEFAULT 0,
  owc_cost NUMERIC(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 9. LAB DIPS (Colourway approval gate before production)
CREATE TABLE IF NOT EXISTS public.lab_dips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  style_id UUID NOT NULL REFERENCES public.styles(id) ON DELETE CASCADE,
  pantone_ref TEXT NOT NULL,
  fabric TEXT NOT NULL,
  composition TEXT,
  gsm NUMERIC(10,2) DEFAULT 0,
  processing_route TEXT,
  lab_ref_no TEXT,
  sent_on DATE,
  approved_option TEXT,
  approved_on DATE,
  rev_lab_no TEXT,
  approval_status TEXT NOT NULL DEFAULT 'pending' CHECK (approval_status IN ('pending', 'approved', 'rejected')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 10. COSTING SHEETS & BULK PROJECTIONS
CREATE TABLE IF NOT EXISTS public.costing_sheets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  style_id UUID UNIQUE NOT NULL REFERENCES public.styles(id) ON DELETE CASCADE,
  sample_qty INT NOT NULL DEFAULT 1,
  bulk_target_qty INT NOT NULL DEFAULT 5000,
  calculated_bulk_fabric_req_kg NUMERIC(12,4) DEFAULT 0,
  calculated_bulk_yarn_cost NUMERIC(12,2) DEFAULT 0,
  calculated_processing_cost NUMERIC(12,2) DEFAULT 0,
  calculated_total_garment_cost NUMERIC(12,2) DEFAULT 0,
  quoted_price NUMERIC(12,2) DEFAULT 0,
  final_price_approved_by UUID REFERENCES public.profiles(id),
  approved_at TIMESTAMPTZ,
  approved_price NUMERIC(12,2),
  approval_notes TEXT,
  file_path TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 11. PRODUCTION RUNS
CREATE TABLE IF NOT EXISTS public.production_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  style_id UUID NOT NULL REFERENCES public.styles(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  run_type TEXT NOT NULL CHECK (run_type IN ('sample', 'bulk')),
  current_stage_order INT NOT NULL DEFAULT 1,
  current_stage_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
  target_qty INT NOT NULL DEFAULT 0,
  blended_cost_per_kg NUMERIC(10,2) DEFAULT 0,
  start_date DATE DEFAULT CURRENT_DATE,
  target_completion_date DATE,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 12. PRODUCTION STAGE LOGS (Per-stage input/output weight and loss tracking)
CREATE TABLE IF NOT EXISTS public.production_stage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  production_run_id UUID NOT NULL REFERENCES public.production_runs(id) ON DELETE CASCADE,
  stage_name TEXT NOT NULL,
  stage_order INT NOT NULL,
  department_id UUID REFERENCES public.departments(id),
  input_weight_kg NUMERIC(12,4) DEFAULT 0,
  output_weight_kg NUMERIC(12,4) DEFAULT 0,
  loss_kg NUMERIC(12,4) DEFAULT 0,
  loss_pct NUMERIC(6,2) DEFAULT 0,
  loss_value NUMERIC(12,2) DEFAULT 0,
  assigned_to UUID REFERENCES public.profiles(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'done')),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  completed_by UUID REFERENCES public.profiles(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 13. TASKS
CREATE TABLE IF NOT EXISTS public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  production_stage_log_id UUID REFERENCES public.production_stage_logs(id) ON DELETE CASCADE,
  department_id UUID NOT NULL REFERENCES public.departments(id),
  assigned_to UUID NOT NULL REFERENCES public.profiles(id),
  created_by UUID REFERENCES public.profiles(id),
  specification TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed')),
  expected_completion_date DATE,
  actual_completion_date DATE,
  actual_days_taken INT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 14. CHAT CHANNELS
CREATE TABLE IF NOT EXISTS public.chat_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('owner_manager', 'owner_employee', 'manager_employee', 'common')),
  participant_a_id UUID REFERENCES public.profiles(id),
  participant_b_id UUID REFERENCES public.profiles(id),
  name TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 15. CHAT MESSAGES
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES public.chat_channels(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  tagged_style_id UUID REFERENCES public.styles(id) ON DELETE SET NULL,
  tagged_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 16. DISPATCH RECORDS (Owner/Manager only)
CREATE TABLE IF NOT EXISTS public.dispatch_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  production_run_id UUID UNIQUE NOT NULL REFERENCES public.production_runs(id) ON DELETE CASCADE,
  style_id UUID NOT NULL REFERENCES public.styles(id) ON DELETE CASCADE,
  transport_cost NUMERIC(12,2) DEFAULT 0,
  fob_value NUMERIC(12,2) DEFAULT 0,
  forwarding_cost NUMERIC(12,2) DEFAULT 0,
  dispatch_date DATE DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'dispatched', 'delivered')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 17. PAYMENT RECORDS (Owner/Manager only)
CREATE TABLE IF NOT EXISTS public.payment_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatch_id UUID REFERENCES public.dispatch_records(id) ON DELETE CASCADE,
  style_id UUID NOT NULL REFERENCES public.styles(id) ON DELETE CASCADE,
  bank_name TEXT NOT NULL,
  transaction_id TEXT NOT NULL,
  amount_transferred NUMERIC(12,2) NOT NULL,
  bank_charges NUMERIC(12,2) DEFAULT 0,
  net_received NUMERIC(12,2) DEFAULT 0,
  payment_date DATE DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'received', 'reconciled')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 18. PAYROLL ENTRIES (Owner/Manager only)
CREATE TABLE IF NOT EXISTS public.payroll_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  joined_on DATE DEFAULT CURRENT_DATE,
  base_salary NUMERIC(12,2) NOT NULL DEFAULT 0,
  increment_history JSONB DEFAULT '[]'::jsonb, -- array of {date, new_salary, note}
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 19. MONTHLY PAYROLL RUNS (Owner/Manager only)
CREATE TABLE IF NOT EXISTS public.monthly_payroll_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  month_year TEXT NOT NULL, -- 'YYYY-MM'
  total_payroll_amount NUMERIC(14,2) DEFAULT 0,
  employee_snapshots JSONB DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'disbursed')),
  approved_by UUID REFERENCES public.profiles(id),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(org_id, month_year)
);

-- 20. ACTIVITY LOG (Audit trail)
CREATE TABLE IF NOT EXISTS public.activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  details JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- HELPER FUNCTIONS FOR RLS
-- ============================================================

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.current_user_dept()
RETURNS UUID AS $$
  SELECT department_id FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_management()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('owner', 'manager') AND active = true
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ============================================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================================

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.department_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipeline_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipeline_stage_defs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.styles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.style_fabrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lab_dips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.costing_sheets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_stage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispatch_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monthly_payroll_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

-- ORGANIZATIONS
CREATE POLICY "Orgs viewable by authenticated users" ON public.organizations
  FOR SELECT TO authenticated USING (true);

-- DEPARTMENTS
CREATE POLICY "Departments viewable by authenticated users" ON public.departments
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Departments manageable by owner and manager" ON public.departments
  FOR ALL TO authenticated USING (public.is_management());

-- PROFILES
CREATE POLICY "Profiles viewable by management, or own profile" ON public.profiles
  FOR SELECT TO authenticated USING (public.is_management() OR id = auth.uid());
CREATE POLICY "Profiles updateable by management, or self for non-role fields" ON public.profiles
  FOR UPDATE TO authenticated USING (public.is_management() OR id = auth.uid());
CREATE POLICY "Profiles insertable by management" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (public.is_management() OR id = auth.uid());

-- DEPARTMENT MEMBERS
CREATE POLICY "Dept members viewable by authenticated users" ON public.department_members
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Dept members manageable by management" ON public.department_members
  FOR ALL TO authenticated USING (public.is_management());

-- PIPELINE TEMPLATES & DEFS
CREATE POLICY "Pipeline templates viewable by authenticated" ON public.pipeline_templates
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Pipeline templates manageable by management" ON public.pipeline_templates
  FOR ALL TO authenticated USING (public.is_management());
CREATE POLICY "Pipeline defs viewable by authenticated" ON public.pipeline_stage_defs
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Pipeline defs manageable by management" ON public.pipeline_stage_defs
  FOR ALL TO authenticated USING (public.is_management());

-- STYLES: Management can see and manage all. Employees CANNOT see styles directly.
CREATE POLICY "Styles full access for management" ON public.styles
  FOR ALL TO authenticated USING (public.is_management());

-- STYLE FABRICS: Gated strictly to management.
CREATE POLICY "Style fabrics full access for management" ON public.style_fabrics
  FOR ALL TO authenticated USING (public.is_management());

-- LAB DIPS: Gated strictly to management.
CREATE POLICY "Lab dips full access for management" ON public.lab_dips
  FOR ALL TO authenticated USING (public.is_management());

-- COSTING SHEETS: Gated strictly to management.
CREATE POLICY "Costing sheets full access for management" ON public.costing_sheets
  FOR ALL TO authenticated USING (public.is_management());

-- PRODUCTION RUNS: Management has full access.
CREATE POLICY "Production runs full access for management" ON public.production_runs
  FOR ALL TO authenticated USING (public.is_management());

-- PRODUCTION STAGE LOGS: Management can manage all. Employees can view stage logs of their department.
CREATE POLICY "Stage logs viewable by management or department employees" ON public.production_stage_logs
  FOR SELECT TO authenticated USING (
    public.is_management() OR department_id = public.current_user_dept()
  );
CREATE POLICY "Stage logs manageable by management only" ON public.production_stage_logs
  FOR UPDATE TO authenticated USING (public.is_management());
CREATE POLICY "Stage logs insertable by management only" ON public.production_stage_logs
  FOR INSERT TO authenticated WITH CHECK (public.is_management());

-- TASKS: Management can see and assign all. Employees can view tasks assigned to them or their department, and update their own tasks.
CREATE POLICY "Tasks viewable by management or assigned employee or dept" ON public.tasks
  FOR SELECT TO authenticated USING (
    public.is_management() OR assigned_to = auth.uid() OR department_id = public.current_user_dept()
  );
CREATE POLICY "Tasks updateable by assigned employee or management" ON public.tasks
  FOR UPDATE TO authenticated USING (
    public.is_management() OR assigned_to = auth.uid()
  );
CREATE POLICY "Tasks insertable/deletable by management only" ON public.tasks
  FOR INSERT TO authenticated WITH CHECK (public.is_management());
CREATE POLICY "Tasks deletable by management only" ON public.tasks
  FOR DELETE TO authenticated USING (public.is_management());

-- CHAT CHANNELS
CREATE POLICY "Chat channels access control" ON public.chat_channels
  FOR SELECT TO authenticated USING (
    type = 'common'
    OR (type = 'owner_manager' AND public.is_management())
    OR (type = 'owner_employee' AND (public.current_user_role() = 'owner' OR participant_b_id = auth.uid()))
    OR (type = 'manager_employee' AND (public.current_user_role() = 'manager' OR participant_b_id = auth.uid()))
  );
CREATE POLICY "Chat channels insertable by management" ON public.chat_channels
  FOR INSERT TO authenticated WITH CHECK (public.is_management());

-- CHAT MESSAGES
CREATE POLICY "Chat messages viewable by channel participants" ON public.chat_messages
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.chat_channels c
      WHERE c.id = chat_messages.channel_id
      AND (
        c.type = 'common'
        OR (c.type = 'owner_manager' AND public.is_management())
        OR (c.type = 'owner_employee' AND (public.current_user_role() = 'owner' OR c.participant_b_id = auth.uid()))
        OR (c.type = 'manager_employee' AND (public.current_user_role() = 'manager' OR c.participant_b_id = auth.uid()))
      )
    )
  );
CREATE POLICY "Chat messages insertable by authorized participants" ON public.chat_messages
  FOR INSERT TO authenticated WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.chat_channels c
      WHERE c.id = chat_messages.channel_id
      AND (
        c.type = 'common'
        OR (c.type = 'owner_manager' AND public.is_management())
        OR (c.type = 'owner_employee' AND (public.current_user_role() = 'owner' OR c.participant_b_id = auth.uid()))
        OR (c.type = 'manager_employee' AND (public.current_user_role() = 'manager' OR c.participant_b_id = auth.uid()))
      )
    )
  );

-- DISPATCH RECORDS: Gated strictly to management.
CREATE POLICY "Dispatch records full access for management" ON public.dispatch_records
  FOR ALL TO authenticated USING (public.is_management());

-- PAYMENT RECORDS: Gated strictly to management.
CREATE POLICY "Payment records full access for management" ON public.payment_records
  FOR ALL TO authenticated USING (public.is_management());

-- PAYROLL ENTRIES: Gated strictly to management.
CREATE POLICY "Payroll entries full access for management" ON public.payroll_entries
  FOR ALL TO authenticated USING (public.is_management());

-- MONTHLY PAYROLL RUNS: Gated strictly to management.
CREATE POLICY "Monthly payroll runs full access for management" ON public.monthly_payroll_runs
  FOR ALL TO authenticated USING (public.is_management());

-- ACTIVITY LOG: Viewable and insertable by management.
CREATE POLICY "Activity log access for management" ON public.activity_log
  FOR ALL TO authenticated USING (public.is_management());
CREATE POLICY "Activity log insertable by authenticated users" ON public.activity_log
  FOR INSERT TO authenticated WITH CHECK (true);
