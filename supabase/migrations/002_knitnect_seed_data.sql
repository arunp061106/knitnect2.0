-- ============================================================
-- KNITNECT PRODUCTION ERP — SEED DATA & PIPELINE TEMPLATES
-- Strict adherence to Section 14 (No fake styles/business data)
-- Only verification fixtures + pipeline template configurations
-- ============================================================

-- 1. BASE ORGANIZATION
INSERT INTO public.organizations (id, name)
VALUES ('00000000-0000-0000-0000-000000000001', 'Knitnect Garments Export Pvt Ltd')
ON CONFLICT (id) DO NOTHING;

-- 2. STANDARD DEPARTMENTS MAPPING TO PRODUCTION STAGES
INSERT INTO public.departments (id, org_id, name, stage_type) VALUES
('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Yarn Sourcing', 'Yarn Buying'),
('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Knitting', 'Knitting'),
('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'Dyeing & Wet Processing', 'Dyeing'),
('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 'Heat Setting', 'Heat Setting'),
('10000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', 'Finishing & Compacting', 'Finishing & Compacting'),
('10000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000001', 'Cutting', 'Cutting'),
('10000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000001', 'Embroidery & Print', 'Embroidery & Printing'),
('10000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000001', 'Sewing & Assembly', 'Sewing'),
('10000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-000000000001', 'Quality Control & Checking', 'Checking'),
('10000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'Ironing & Packing', 'Packing'),
('10000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', 'Dispatch & Logistics', 'Dispatch')
ON CONFLICT (id) DO NOTHING;

-- 3. PIPELINE TEMPLATES (Solid Fabric, AOP White Based, AOP Dyed Base)
INSERT INTO public.pipeline_templates (id, org_id, garment_process_type, name, description) VALUES
('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'solid_fabric', 'Solid Fabric Pipeline', 'Standard solid fabric pipeline with cutting, embroidery, printing, sewing, trimming, checking, finishing, ironing, packing'),
('20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'aop_white_based', 'AOP – White Based Pipeline', 'All-over print on white/water based ground with printing, curing, stenter finish, compacting'),
('20000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'aop_dyed_base', 'AOP – Dyed Base Pipeline', 'All-over discharge print on dyed ground with ageing, curing, washing, compacting')
ON CONFLICT (id) DO NOTHING;

-- 4. PIPELINE STAGE DEFINITIONS
-- Solid Fabric Template Stages
INSERT INTO public.pipeline_stage_defs (template_id, stage_name, stage_order, default_department_name, is_winter_only, branch_type) VALUES
-- Shared Front-End
('20000000-0000-0000-0000-000000000001', 'Yarn Buying', 1, 'Yarn Sourcing', false, 'shared'),
('20000000-0000-0000-0000-000000000001', 'Knitting', 2, 'Knitting', false, 'shared'),
('20000000-0000-0000-0000-000000000001', 'Dyeing', 3, 'Dyeing & Wet Processing', false, 'shared'),
('20000000-0000-0000-0000-000000000001', 'Heat Setting', 4, 'Heat Setting', false, 'shared'),
('20000000-0000-0000-0000-000000000001', 'Finishing & Compacting / Stenter', 5, 'Finishing & Compacting', false, 'shared'),
('20000000-0000-0000-0000-000000000001', 'Brushing & Sueding', 6, 'Finishing & Compacting', true, 'shared'),
-- Branch: Solid Fabric
('20000000-0000-0000-0000-000000000001', 'Cutting', 7, 'Cutting', false, 'solid_fabric'),
('20000000-0000-0000-0000-000000000001', 'Embroidery', 8, 'Embroidery & Print', false, 'solid_fabric'),
('20000000-0000-0000-0000-000000000001', 'Printing', 9, 'Embroidery & Print', false, 'solid_fabric'),
('20000000-0000-0000-0000-000000000001', 'Sewing', 10, 'Sewing & Assembly', false, 'solid_fabric'),
('20000000-0000-0000-0000-000000000001', 'Trimming', 11, 'Sewing & Assembly', false, 'solid_fabric'),
('20000000-0000-0000-0000-000000000001', 'Checking', 12, 'Quality Control & Checking', false, 'solid_fabric'),
('20000000-0000-0000-0000-000000000001', 'Finishing', 13, 'Ironing & Packing', false, 'solid_fabric'),
('20000000-0000-0000-0000-000000000001', 'Ironing', 14, 'Ironing & Packing', false, 'solid_fabric'),
('20000000-0000-0000-0000-000000000001', 'Packing', 15, 'Ironing & Packing', false, 'solid_fabric'),
-- AOP White Based Template Stages
('20000000-0000-0000-0000-000000000002', 'Yarn Buying', 1, 'Yarn Sourcing', false, 'shared'),
('20000000-0000-0000-0000-000000000002', 'Knitting', 2, 'Knitting', false, 'shared'),
('20000000-0000-0000-0000-000000000002', 'Dyeing', 3, 'Dyeing & Wet Processing', false, 'shared'),
('20000000-0000-0000-0000-000000000002', 'Heat Setting', 4, 'Heat Setting', false, 'shared'),
('20000000-0000-0000-0000-000000000002', 'Finishing & Compacting / Stenter', 5, 'Finishing & Compacting', false, 'shared'),
('20000000-0000-0000-0000-000000000002', 'Brushing & Sueding', 6, 'Finishing & Compacting', true, 'shared'),
('20000000-0000-0000-0000-000000000002', 'Printing', 7, 'Embroidery & Print', false, 'aop_white_based'),
('20000000-0000-0000-0000-000000000002', 'Curing', 8, 'Finishing & Compacting', false, 'aop_white_based'),
('20000000-0000-0000-0000-000000000002', 'Stenter finish', 9, 'Finishing & Compacting', false, 'aop_white_based'),
('20000000-0000-0000-0000-000000000002', 'Compacting', 10, 'Finishing & Compacting', false, 'aop_white_based'),
-- AOP Dyed Base Template Stages
('20000000-0000-0000-0000-000000000003', 'Yarn Buying', 1, 'Yarn Sourcing', false, 'shared'),
('20000000-0000-0000-0000-000000000003', 'Knitting', 2, 'Knitting', false, 'shared'),
('20000000-0000-0000-0000-000000000003', 'Dyeing', 3, 'Dyeing & Wet Processing', false, 'shared'),
('20000000-0000-0000-0000-000000000003', 'Heat Setting', 4, 'Heat Setting', false, 'shared'),
('20000000-0000-0000-0000-000000000003', 'Finishing & Compacting / Stenter', 5, 'Finishing & Compacting', false, 'shared'),
('20000000-0000-0000-0000-000000000003', 'Brushing & Sueding', 6, 'Finishing & Compacting', true, 'shared'),
('20000000-0000-0000-0000-000000000003', 'Discharge Printing', 7, 'Embroidery & Print', false, 'aop_dyed_base'),
('20000000-0000-0000-0000-000000000003', 'Ageing', 8, 'Finishing & Compacting', false, 'aop_dyed_base'),
('20000000-0000-0000-0000-000000000003', 'Curing', 9, 'Finishing & Compacting', false, 'aop_dyed_base'),
('20000000-0000-0000-0000-000000000003', 'Washing', 10, 'Dyeing & Wet Processing', false, 'aop_dyed_base'),
('20000000-0000-0000-0000-000000000003', 'Compacting', 11, 'Finishing & Compacting', false, 'aop_dyed_base');

-- 5. VERIFICATION FIXTURE USERS (Section 14: 1 Owner, 1 Manager, 1 Employee in Cutting)
-- User IDs:
-- Owner:    30000000-0000-0000-0000-000000000001
-- Manager:  30000000-0000-0000-0000-000000000002
-- Employee: 30000000-0000-0000-0000-000000000003

INSERT INTO public.profiles (id, org_id, full_name, email, role, department_id, joined_on, active, base_salary, increment_history)
VALUES
('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'R. Senthil Kumar', 'owner@knitnect.com', 'owner', NULL, '2024-01-01', true, 120000.00, '[]'::jsonb),
('30000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'K. Vignesh', 'manager@knitnect.com', 'manager', NULL, '2024-03-01', true, 65000.00, '[]'::jsonb),
('30000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'M. Murugan', 'employee@knitnect.com', 'employee', '10000000-0000-0000-0000-000000000006', '2024-06-15', true, 28000.00, '[]'::jsonb)
ON CONFLICT (id) DO UPDATE SET
  full_name = EXCLUDED.full_name,
  role = EXCLUDED.role,
  department_id = EXCLUDED.department_id,
  base_salary = EXCLUDED.base_salary;

-- Associate Employee with Cutting department
INSERT INTO public.department_members (department_id, user_id)
VALUES ('10000000-0000-0000-0000-000000000006', '30000000-0000-0000-0000-000000000003')
ON CONFLICT (department_id, user_id) DO NOTHING;

-- Initial Payroll Entries
INSERT INTO public.payroll_entries (user_id, joined_on, base_salary, increment_history)
VALUES
('30000000-0000-0000-0000-000000000001', '2024-01-01', 120000.00, '[]'::jsonb),
('30000000-0000-0000-0000-000000000002', '2024-03-01', 65000.00, '[{"date":"2024-09-01","new_salary":65000.00,"note":"Probation confirmed"}]'::jsonb),
('30000000-0000-0000-0000-000000000003', '2024-06-15', 28000.00, '[]'::jsonb)
ON CONFLICT (user_id) DO NOTHING;

-- Chat Channels (Common Group, Owner-Manager, Owner-Employee, Manager-Employee)
INSERT INTO public.chat_channels (id, org_id, type, name, participant_a_id, participant_b_id) VALUES
('40000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'common', 'General / Floor Updates', NULL, NULL),
('40000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'owner_manager', 'Executive: Owner & Manager', '30000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002'),
('40000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'owner_employee', 'Owner DM: Murugan (Cutting)', '30000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000003'),
('40000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 'manager_employee', 'Manager DM: Murugan (Cutting)', '30000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000003')
ON CONFLICT (id) DO NOTHING;

-- VERIFICATION FIXTURE: 1 style and 1 production run with 0/blank business metrics purely to verify the 1 employee task in Cutting
INSERT INTO public.styles (
  id, org_id, style_number, season, offer_no, description,
  garment_category, garment_season_type, garment_process_type,
  status, created_by
) VALUES (
  '50000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  'FIXTURE-TEST-01',
  'W28',
  '9414',
  'Verification Fixture Style',
  'Mens',
  'Winter',
  'solid_fabric',
  'sample_production',
  '30000000-0000-0000-0000-000000000001'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.production_runs (
  id, style_id, org_id, run_type, current_stage_order, current_stage_name, status, target_qty, blended_cost_per_kg
) VALUES (
  '60000000-0000-0000-0000-000000000001',
  '50000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  'sample',
  7,
  'Cutting',
  'in_progress',
  0,
  0
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.production_stage_logs (
  id, production_run_id, stage_name, stage_order, department_id,
  input_weight_kg, output_weight_kg, loss_kg, loss_pct, loss_value,
  assigned_to, status
) VALUES (
  '70000000-0000-0000-0000-000000000001',
  '60000000-0000-0000-0000-000000000001',
  'Cutting',
  7,
  '10000000-0000-0000-0000-000000000006',
  0, 0, 0, 0, 0,
  '30000000-0000-0000-0000-000000000003',
  'in_progress'
) ON CONFLICT (id) DO NOTHING;

-- Verification Fixture Task assigned to Employee in Cutting (Section 14 requirement)
INSERT INTO public.tasks (
  id, production_stage_log_id, department_id, assigned_to, created_by,
  specification, status, expected_completion_date
) VALUES (
  '80000000-0000-0000-0000-000000000001',
  '70000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000006',
  '30000000-0000-0000-0000-000000000003',
  '30000000-0000-0000-0000-000000000002',
  'Verification Fixture: Verify cutting table alignment and bundle count',
  'pending',
  CURRENT_DATE + INTERVAL '2 days'
) ON CONFLICT (id) DO NOTHING;
