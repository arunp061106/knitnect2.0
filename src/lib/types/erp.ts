// ============================================================
// KNITNECT PRODUCTION ERP — DOMAIN TYPES
// ============================================================

export type UserRole = 'owner' | 'manager' | 'employee';

export type GarmentCategory = 'Kids' | 'Mens' | 'Womens';
export type GarmentSeasonType = 'Summer' | 'Winter';
export type GarmentProcessType = 'solid_fabric' | 'aop_white_based' | 'aop_dyed_base';

export type StyleStatus =
  | 'costing'
  | 'sample_production'
  | 'bulk_production'
  | 'dispatch_ready'
  | 'completed';

export type LabDipStatus = 'pending' | 'approved' | 'rejected';
export type TaskStatus = 'pending' | 'in_progress' | 'completed';
export type StageStatus = 'pending' | 'in_progress' | 'done';
export type DispatchStatus = 'pending' | 'dispatched' | 'delivered';
export type PaymentStatus = 'pending' | 'received' | 'reconciled';
export type PayrollRunStatus = 'draft' | 'approved' | 'disbursed';

export type ChatChannelType =
  | 'owner_manager'
  | 'owner_employee'
  | 'manager_employee'
  | 'common';

export interface Profile {
  id: string;
  org_id: string;
  full_name: string;
  email: string;
  role: UserRole;
  department_id: string | null;
  department_name?: string;
  joined_on: string;
  active: boolean;
  base_salary: number;
  increment_history: Array<{
    date: string;
    new_salary: number;
    note?: string;
  }>;
  created_at: string;
}

export interface Department {
  id: string;
  org_id: string;
  name: string;
  stage_type: string;
  created_at: string;
  member_count?: number;
}

export interface DepartmentMember {
  id: string;
  department_id: string;
  user_id: string;
  created_at: string;
}

export interface PipelineTemplate {
  id: string;
  org_id: string;
  garment_process_type: GarmentProcessType;
  name: string;
  description?: string;
  created_at: string;
}

export interface PipelineStageDef {
  id: string;
  template_id: string;
  stage_name: string;
  stage_order: number;
  default_department_name?: string;
  is_winter_only: boolean;
  branch_type: 'shared' | GarmentProcessType;
}

export interface Style {
  id: string;
  org_id: string;
  style_number: string;
  season: string;
  offer_no: string;
  description: string;
  garment_category: GarmentCategory;
  garment_season_type: GarmentSeasonType;
  garment_process_type: GarmentProcessType;
  status: StyleStatus;
  created_by?: string;
  created_at: string;
  fabrics?: StyleFabric[];
  lab_dips?: LabDip[];
  costing?: CostingSheet;
  current_run?: ProductionRun;
}

export interface StyleFabric {
  id: string;
  style_id: string;
  s_no: number;
  fabric_code: string;
  fabric_type: 'BODY' | 'RIB' | 'Lining' | 'Application' | string;
  colour: string; // Pantone TPG
  aop_ref: 'Gar.dye' | 'Solid' | 'AOP' | string;
  quality: string;
  composition: string;
  gsm: number;
  pc_wt: number; // kg
  sample_qty: number;
  reqd_qty: number; // bulk fabric requirement in kg = pc_wt * sample_qty
  yarn_count: string;
  yarn_price: number;
  consume_pct: number; // 0.7 = 70%
  effective_yarn_cost: number; // yarn_price * consume_pct
  knitting_cost: number;
  heat_setting_cost: number;
  solid_dye_cost: number;
  dyed_dye_cost: number;
  stenter_cost: number;
  owc_cost: number;
  created_at: string;
}

export interface LabDip {
  id: string;
  style_id: string;
  pantone_ref: string;
  fabric: string;
  composition: string;
  gsm: number;
  processing_route?: string;
  lab_ref_no?: string;
  sent_on?: string;
  approved_option?: string;
  approved_on?: string;
  rev_lab_no?: string;
  approval_status: LabDipStatus;
  notes?: string;
  created_at: string;
}

export interface CostingSheet {
  id: string;
  style_id: string;
  sample_qty: number;
  bulk_target_qty: number;
  calculated_bulk_fabric_req_kg: number;
  calculated_bulk_yarn_cost: number;
  calculated_processing_cost: number;
  calculated_total_garment_cost: number;
  quoted_price: number;
  final_price_approved_by?: string;
  approved_at?: string;
  approved_price?: number;
  approval_notes?: string;
  file_path?: string;
  created_at: string;
}

export interface ProductionRun {
  id: string;
  style_id: string;
  style_number?: string;
  description?: string;
  org_id: string;
  run_type: 'sample' | 'bulk';
  current_stage_order: number;
  current_stage_name: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  target_qty: number;
  blended_cost_per_kg: number;
  start_date: string;
  target_completion_date?: string;
  completed_at?: string;
  stages?: ProductionStageLog[];
  created_at: string;
}

export interface BatchTransfer {
  id: string;
  production_run_id: string;
  batch_number: number;
  from_stage_id: string;
  from_stage_name: string;
  from_stage_order: number;
  to_stage_id: string;
  to_stage_name: string;
  to_stage_order: number;
  weight_kg: number;
  moved_at: string;
  moved_at_time: string;
  moved_by_id: string;
  moved_by_name: string;
  notes?: string;
}

export interface ProductionStageLog {
  id: string;
  production_run_id: string;
  stage_name: string;
  stage_order: number;
  department_id?: string;
  department_name?: string;
  input_weight_kg: number;
  output_weight_kg: number;
  loss_kg: number;
  loss_pct: number;
  loss_value: number;
  assigned_to?: string;
  assigned_to_name?: string;
  // Cross-verification fields (Employee vs Manager)
  employee_reported_output_kg?: number;
  employee_reported_scrap_kg?: number;
  employee_waste_scrap_weight_kg?: number;
  employee_reported_pieces?: number;
  scale_id?: string;
  machine_scale_id?: string;
  manager_verified_output_kg?: number;
  weight_discrepancy_kg?: number;
  weight_discrepancy_pct?: number;
  discrepancy_status?: 'matched' | 'minor_variance' | 'critical_mismatch' | 'investigation_required';
  status: StageStatus;
  started_at?: string;
  completed_at?: string;
  completed_by?: string;
  notes?: string;
  batches_passed?: BatchTransfer[];
  batches_received?: BatchTransfer[];
  tasks?: Task[];
  created_at: string;
}

export interface Task {
  id: string;
  production_stage_log_id: string;
  stage_name?: string;
  style_number?: string;
  department_id: string;
  department_name?: string;
  assigned_to: string;
  assigned_to_name?: string;
  created_by: string;
  specification: string;
  status: TaskStatus;
  expected_completion_date: string;
  actual_completion_date?: string;
  actual_days_taken?: number;
  notes?: string;
  // Floor measurement entries by employee
  employee_measured_output_weight_kg?: number;
  employee_waste_scrap_weight_kg?: number;
  employee_piece_count?: number;
  machine_scale_id?: string;
  employee_notes?: string;
  // Manager cross-verification
  manager_assigned_weight_kg?: number;
  manager_verified_weight_kg?: number;
  weight_discrepancy_kg?: number;
  weight_discrepancy_pct?: number;
  discrepancy_status?: 'matched' | 'minor_variance' | 'critical_mismatch';
  created_at: string;
}

export interface ChatChannel {
  id: string;
  org_id: string;
  type: ChatChannelType;
  name?: string;
  participant_a_id?: string;
  participant_b_id?: string;
  participant_b_name?: string;
  last_message?: string;
  last_message_at?: string;
  created_at: string;
}

export interface ChatMessage {
  id: string;
  channel_id: string;
  sender_id: string;
  sender_name?: string;
  sender_role?: UserRole;
  body: string;
  tagged_style_id?: string;
  tagged_style_number?: string;
  tagged_user_id?: string;
  tagged_user_name?: string;
  created_at: string;
}

export interface DispatchRecord {
  id: string;
  production_run_id: string;
  style_id: string;
  style_number?: string;
  offer_no?: string;
  transport_cost: number;
  fob_value: number;
  forwarding_cost: number;
  dispatch_date: string;
  status: DispatchStatus;
  notes?: string;
  payment?: PaymentRecord;
  created_at: string;
}

export interface PaymentRecord {
  id: string;
  dispatch_id: string;
  style_id: string;
  style_number?: string;
  bank_name: string;
  transaction_id: string;
  amount_transferred: number;
  bank_charges: number;
  net_received: number; // amount_transferred - bank_charges
  payment_date: string;
  status: PaymentStatus;
  notes?: string;
  created_at: string;
}

export interface PayrollEntry {
  id: string;
  user_id: string;
  user_name?: string;
  user_email?: string;
  department_name?: string;
  role?: UserRole;
  joined_on: string;
  base_salary: number;
  increment_history: Array<{
    date: string;
    new_salary: number;
    note?: string;
  }>;
  updated_at: string;
}

export interface MonthlyPayrollRun {
  id: string;
  org_id: string;
  month_year: string; // 'YYYY-MM'
  total_payroll_amount: number;
  employee_snapshots: Array<{
    user_id: string;
    full_name: string;
    department_name: string;
    role: string;
    salary: number;
  }>;
  status: PayrollRunStatus;
  approved_by?: string;
  approved_at?: string;
  created_at: string;
}

export interface ActivityLog {
  id: string;
  org_id: string;
  user_id?: string;
  user_name?: string;
  action: string;
  entity_type: string;
  entity_id?: string;
  details: Record<string, any>;
  created_at: string;
}
