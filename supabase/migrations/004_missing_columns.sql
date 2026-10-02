-- ============================================================
-- KNITNECT PRODUCTION ERP — MIGRATION 004: MISSING COLUMNS & ENTITIES
-- Adds operational floor fields, batch transfers, export incentives,
-- multi-currency FX rates, and splits fabrics into fabric lines and blend yarns.
-- ============================================================

-- 1. EXTEND TASKS TABLE WITH FLOOR OPERATOR MEASUREMENT FIELDS
ALTER TABLE IF EXISTS public.tasks 
  ADD COLUMN IF NOT EXISTS manager_assigned_weight_kg NUMERIC(12,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS employee_measured_output_weight_kg NUMERIC(12,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS employee_waste_scrap_weight_kg NUMERIC(12,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS employee_piece_count INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS machine_scale_id TEXT,
  ADD COLUMN IF NOT EXISTS employee_notes TEXT,
  ADD COLUMN IF NOT EXISTS weight_discrepancy_kg NUMERIC(12,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS weight_discrepancy_pct NUMERIC(6,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discrepancy_status TEXT DEFAULT 'matched' 
    CHECK (discrepancy_status IN ('matched', 'tolerance_warning', 'investigation_required'));

-- 2. EXTEND PRODUCTION STAGE LOGS WITH CROSS-VERIFICATION & DISCREPANCY FIELDS
ALTER TABLE IF EXISTS public.production_stage_logs
  ADD COLUMN IF NOT EXISTS employee_reported_output_kg NUMERIC(12,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS employee_reported_scrap_kg NUMERIC(12,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS employee_reported_pieces INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS scale_id TEXT,
  ADD COLUMN IF NOT EXISTS machine_scale_id TEXT,
  ADD COLUMN IF NOT EXISTS manager_verified_output_kg NUMERIC(12,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS weight_discrepancy_kg NUMERIC(12,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS weight_discrepancy_pct NUMERIC(6,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discrepancy_status TEXT DEFAULT 'matched' 
    CHECK (discrepancy_status IN ('matched', 'tolerance_warning', 'investigation_required'));

-- Refresh floor_stage_logs view to expose non-financial floor fields
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
  employee_reported_output_kg,
  employee_reported_scrap_kg,
  employee_reported_pieces,
  scale_id,
  manager_verified_output_kg,
  weight_discrepancy_kg,
  weight_discrepancy_pct,
  discrepancy_status,
  notes,
  created_at
FROM public.production_stage_logs;

-- 3. BATCH TRANSFERS (Inter-stage progressive batch passing)
CREATE TABLE IF NOT EXISTS public.batch_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  production_run_id UUID NOT NULL REFERENCES public.production_runs(id) ON DELETE RESTRICT,
  from_stage_id UUID NOT NULL REFERENCES public.production_stage_logs(id) ON DELETE RESTRICT,
  to_stage_id UUID NOT NULL REFERENCES public.production_stage_logs(id) ON DELETE RESTRICT,
  batch_number INT NOT NULL,
  weight_kg NUMERIC(12,4) NOT NULL CHECK (weight_kg > 0),
  passed_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  passed_at TIMESTAMPTZ DEFAULT now(),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.batch_transfers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Batch transfers viewable by authenticated users" ON public.batch_transfers
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Batch transfers insertable by management or assigned staff" ON public.batch_transfers
  FOR INSERT TO authenticated WITH CHECK (
    public.is_management() OR passed_by = auth.uid()
  );

-- 4. EXTEND DISPATCH RECORDS WITH EXPORT & CARGO IDENTIFIERS
ALTER TABLE IF EXISTS public.dispatch_records
  ADD COLUMN IF NOT EXISTS order_qty INT DEFAULT 5000 CHECK (order_qty > 0),
  ADD COLUMN IF NOT EXISTS shipped_qty INT DEFAULT 5000 CHECK (shipped_qty > 0),
  ADD COLUMN IF NOT EXISTS is_partial BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS offer_no TEXT,
  ADD COLUMN IF NOT EXISTS shipping_bill_no TEXT,
  ADD COLUMN IF NOT EXISTS container_seal_no TEXT,
  ADD COLUMN IF NOT EXISTS port_of_loading TEXT DEFAULT 'Tuticorin (INTUT1)',
  ADD COLUMN IF NOT EXISTS port_of_discharge TEXT,
  ADD COLUMN IF NOT EXISTS ocean_freight NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'INR',
  ADD COLUMN IF NOT EXISTS fx_rate NUMERIC(10,4) DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS fob_value_fc NUMERIC(14,2) DEFAULT 0;

-- Ensure dispatch status CHECK includes 'partial'
ALTER TABLE IF EXISTS public.dispatch_records 
  DROP CONSTRAINT IF EXISTS dispatch_records_status_check;
ALTER TABLE IF EXISTS public.dispatch_records 
  ADD CONSTRAINT dispatch_records_status_check 
  CHECK (status IN ('pending', 'partial', 'dispatched', 'delivered'));

-- 5. DUTY DRAWBACK & RODTEP EXPORT INCENTIVES LEDGER
CREATE TABLE IF NOT EXISTS public.export_incentives_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  dispatch_id UUID REFERENCES public.dispatch_records(id) ON DELETE RESTRICT,
  style_id UUID REFERENCES public.styles(id) ON DELETE RESTRICT,
  shipping_bill_no TEXT NOT NULL,
  fob_value_inr NUMERIC(14,2) NOT NULL CHECK (fob_value_inr >= 0),
  drawback_rate_pct NUMERIC(6,2) NOT NULL DEFAULT 1.50,
  drawback_amount_inr NUMERIC(12,2) GENERATED ALWAYS AS (fob_value_inr * drawback_rate_pct / 100) STORED,
  rodtep_rate_pct NUMERIC(6,2) NOT NULL DEFAULT 4.10,
  rodtep_amount_inr NUMERIC(12,2) GENERATED ALWAYS AS (fob_value_inr * rodtep_rate_pct / 100) STORED,
  status TEXT NOT NULL DEFAULT 'claim_filed' 
    CHECK (status IN ('claim_filed', 'scroll_generated', 'credited', 'rejected')),
  credited_date DATE,
  bank_reference TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.export_incentives_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Export incentives full access for management" ON public.export_incentives_ledger
  FOR ALL TO authenticated 
  USING (public.is_management() AND org_id = public.current_user_org_id())
  WITH CHECK (public.is_management() AND org_id = public.current_user_org_id());

-- 6. MULTI-CURRENCY & FX RATES ON FINANCIAL TABLES
ALTER TABLE IF EXISTS public.costing_sheets
  ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'INR',
  ADD COLUMN IF NOT EXISTS fx_rate NUMERIC(10,4) DEFAULT 1.0;

ALTER TABLE IF EXISTS public.payment_records
  ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'INR',
  ADD COLUMN IF NOT EXISTS fx_rate NUMERIC(10,4) DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS amount_transferred_fc NUMERIC(14,2) DEFAULT 0;

-- 7. EXTEND STYLES STATUS DOMAIN TO INCLUDE 'dispatched'
ALTER TABLE IF EXISTS public.styles 
  DROP CONSTRAINT IF EXISTS styles_status_check;
ALTER TABLE IF EXISTS public.styles 
  ADD CONSTRAINT styles_status_check 
  CHECK (status IN ('costing', 'sample_production', 'bulk_production', 'dispatch_ready', 'dispatched', 'completed'));

-- 8. FABRIC & YARN ARCHITECTURE REFACTOR (True Physical Fabric Lines & Yarn Blend Children)
-- Add wastage_pct to style_fabrics
ALTER TABLE IF EXISTS public.style_fabrics
  ADD COLUMN IF NOT EXISTS wastage_pct NUMERIC(5,2) DEFAULT 0.0 CHECK (wastage_pct >= 0 AND wastage_pct <= 100);

-- Create style_fabric_yarns child table
CREATE TABLE IF NOT EXISTS public.style_fabric_yarns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  style_fabric_id UUID NOT NULL REFERENCES public.style_fabrics(id) ON DELETE CASCADE,
  yarn_count TEXT NOT NULL,
  yarn_price NUMERIC(10,2) NOT NULL CHECK (yarn_price >= 0),
  share_pct NUMERIC(6,2) NOT NULL CHECK (share_pct > 0 AND share_pct <= 100), -- Blend share percentage (e.g. 70 for 70%)
  effective_cost NUMERIC(10,2) GENERATED ALWAYS AS (yarn_price * share_pct / 100) STORED,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.style_fabric_yarns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Style fabric yarns full access for management" ON public.style_fabric_yarns
  FOR ALL TO authenticated USING (public.is_management());

-- Trigger to validate that yarn blend shares do not exceed 100%
CREATE OR REPLACE FUNCTION public.validate_fabric_yarn_shares()
RETURNS TRIGGER AS $$
DECLARE
  v_total_share NUMERIC(6,2);
BEGIN
  SELECT COALESCE(SUM(share_pct), 0)
  INTO v_total_share
  FROM public.style_fabric_yarns
  WHERE style_fabric_id = NEW.style_fabric_id
    AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);

  IF (v_total_share + NEW.share_pct) > 100.01 THEN
    RAISE EXCEPTION 'Fabric Yarn Error: Total yarn blend share percentage (% + %) exceeds 100%% for this fabric.',
      v_total_share, NEW.share_pct;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_validate_fabric_yarn_shares ON public.style_fabric_yarns;
CREATE TRIGGER trg_validate_fabric_yarn_shares
  BEFORE INSERT OR UPDATE ON public.style_fabric_yarns
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_fabric_yarn_shares();
