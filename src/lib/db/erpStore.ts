// ============================================================
// KNITNECT PRODUCTION ERP — CENTRAL DATA ENGINE
// Implements strict Section 3 RBAC, Section 14 Verification Fixtures,
// Full 15-Stage Production Pipeline & Cross-Verification Weight Engine
// ============================================================

import {
  Profile,
  Department,
  Style,
  StyleFabric,
  LabDip,
  CostingSheet,
  ProductionRun,
  ProductionStageLog,
  Task,
  ChatChannel,
  ChatMessage,
  DispatchRecord,
  PaymentRecord,
  PayrollEntry,
  MonthlyPayrollRun,
  ActivityLog,
  UserRole,
  BatchTransfer,
} from '../types/erp';
import { calculateBlendedCostPerKg, calculateBulkProjection } from '../domain/costing';
import { computeStageLoss, verifyFloorWeights, DEFAULT_BLENDED_FABRIC_COST_PER_KG } from '../domain/loss';
import { getPipelineStagesForStyle, isLabDipGateCleared, isPriceApprovalCleared } from '../domain/pipeline';

// SECTION 14 VERIFICATION FIXTURES: Exactly 1 Owner, 1 Manager, 1 Employee in Cutting
export const FIXTURE_USERS: Profile[] = [
  {
    id: '30000000-0000-0000-0000-000000000001',
    org_id: '00000000-0000-0000-0000-000000000001',
    full_name: 'R. Senthil Kumar',
    email: 'owner@knitnect.com',
    role: 'owner',
    department_id: null,
    joined_on: '2024-01-01',
    active: true,
    base_salary: 120000,
    increment_history: [],
    created_at: '2024-01-01T00:00:00Z',
  },
  {
    id: '30000000-0000-0000-0000-000000000002',
    org_id: '00000000-0000-0000-0000-000000000001',
    full_name: 'K. Vignesh',
    email: 'manager@knitnect.com',
    role: 'manager',
    department_id: null,
    joined_on: '2024-03-01',
    active: true,
    base_salary: 65000,
    increment_history: [
      { date: '2024-09-01', new_salary: 65000, note: 'Probation confirmed' },
    ],
    created_at: '2024-03-01T00:00:00Z',
  },
  {
    id: '30000000-0000-0000-0000-000000000003',
    org_id: '00000000-0000-0000-0000-000000000001',
    full_name: 'M. Murugan',
    email: 'employee@knitnect.com',
    role: 'employee',
    department_id: '10000000-0000-0000-0000-000000000006', // Cutting department
    department_name: 'Cutting',
    joined_on: '2024-06-15',
    active: true,
    base_salary: 28000,
    increment_history: [],
    created_at: '2024-06-15T00:00:00Z',
  },
];

export const INITIAL_DEPARTMENTS: Department[] = [
  { id: '10000000-0000-0000-0000-000000000001', org_id: '00000000-0000-0000-0000-000000000001', name: 'Yarn Sourcing', stage_type: 'Yarn Buying', created_at: '2024-01-01T00:00:00Z' },
  { id: '10000000-0000-0000-0000-000000000002', org_id: '00000000-0000-0000-0000-000000000001', name: 'Knitting', stage_type: 'Knitting', created_at: '2024-01-01T00:00:00Z' },
  { id: '10000000-0000-0000-0000-000000000003', org_id: '00000000-0000-0000-0000-000000000001', name: 'Dyeing & Wet Processing', stage_type: 'Dyeing', created_at: '2024-01-01T00:00:00Z' },
  { id: '10000000-0000-0000-0000-000000000004', org_id: '00000000-0000-0000-0000-000000000001', name: 'Heat Setting', stage_type: 'Heat Setting', created_at: '2024-01-01T00:00:00Z' },
  { id: '10000000-0000-0000-0000-000000000005', org_id: '00000000-0000-0000-0000-000000000001', name: 'Finishing & Compacting', stage_type: 'Finishing & Compacting', created_at: '2024-01-01T00:00:00Z' },
  { id: '10000000-0000-0000-0000-000000000006', org_id: '00000000-0000-0000-0000-000000000001', name: 'Cutting', stage_type: 'Cutting', created_at: '2024-01-01T00:00:00Z' },
  { id: '10000000-0000-0000-0000-000000000007', org_id: '00000000-0000-0000-0000-000000000001', name: 'Embroidery & Print', stage_type: 'Embroidery & Printing', created_at: '2024-01-01T00:00:00Z' },
  { id: '10000000-0000-0000-0000-000000000008', org_id: '00000000-0000-0000-0000-000000000001', name: 'Sewing & Assembly', stage_type: 'Sewing', created_at: '2024-01-01T00:00:00Z' },
  { id: '10000000-0000-0000-0000-000000000009', org_id: '00000000-0000-0000-0000-000000000001', name: 'Quality Control & Checking', stage_type: 'Checking', created_at: '2024-01-01T00:00:00Z' },
  { id: '10000000-0000-0000-0000-000000000010', org_id: '00000000-0000-0000-0000-000000000001', name: 'Ironing & Packing', stage_type: 'Packing', created_at: '2024-01-01T00:00:00Z' },
  { id: '10000000-0000-0000-0000-000000000011', org_id: '00000000-0000-0000-0000-000000000001', name: 'Dispatch & Logistics', stage_type: 'Dispatch', created_at: '2024-01-01T00:00:00Z' },
];

export const INITIAL_CHANNELS: ChatChannel[] = [
  {
    id: '40000000-0000-0000-0000-000000000001',
    org_id: '00000000-0000-0000-0000-000000000001',
    type: 'common',
    name: 'General / Floor Updates',
    last_message: 'ERP System active. Shift reports are synchronized.',
    last_message_at: '2026-09-27T08:00:00Z',
    created_at: '2024-01-01T00:00:00Z',
  },
  {
    id: '40000000-0000-0000-0000-000000000002',
    org_id: '00000000-0000-0000-0000-000000000001',
    type: 'owner_manager',
    name: 'Executive: Owner & Manager',
    participant_a_id: '30000000-0000-0000-0000-000000000001',
    participant_b_id: '30000000-0000-0000-0000-000000000002',
    participant_b_name: 'K. Vignesh (Manager)',
    last_message: 'Reviewed Offer 9414 yarn rates. Awaiting lab dip signoff.',
    last_message_at: '2026-09-27T08:30:00Z',
    created_at: '2024-01-01T00:00:00Z',
  },
  {
    id: '40000000-0000-0000-0000-000000000003',
    org_id: '00000000-0000-0000-0000-000000000001',
    type: 'owner_employee',
    name: 'Owner DM: Murugan (Cutting)',
    participant_a_id: '30000000-0000-0000-0000-000000000001',
    participant_b_id: '30000000-0000-0000-0000-000000000003',
    participant_b_name: 'M. Murugan (Cutting)',
    last_message: 'Please confirm scale calibration on table 2.',
    last_message_at: '2026-09-27T09:00:00Z',
    created_at: '2024-01-01T00:00:00Z',
  },
  {
    id: '40000000-0000-0000-0000-000000000004',
    org_id: '00000000-0000-0000-0000-000000000001',
    type: 'manager_employee',
    name: 'Manager DM: Murugan (Cutting)',
    participant_a_id: '30000000-0000-0000-0000-000000000002',
    participant_b_id: '30000000-0000-0000-0000-000000000003',
    participant_b_name: 'M. Murugan (Cutting)',
    last_message: 'Verification fixture task assigned for inspection.',
    last_message_at: '2026-09-27T09:15:00Z',
    created_at: '2024-01-01T00:00:00Z',
  },
];

// REAL CLIENT STYLE FROM EXCEL: Offer 9414 (KB13P301X1 - RIN | JOGGING PANTS)
export const CLIENT_OFFER_9414_STYLE: Style = {
  id: '50000000-0000-0000-0000-000000000001',
  org_id: '00000000-0000-0000-0000-000000000001',
  style_number: 'KB13P301X1',
  season: 'W28',
  offer_no: '9414',
  description: 'RIN | JOGGING PANTS',
  garment_category: 'Mens',
  garment_season_type: 'Winter',
  garment_process_type: 'solid_fabric',
  status: 'sample_production',
  created_by: '30000000-0000-0000-0000-000000000001',
  created_at: '2024-01-01T00:00:00Z',
};

// Fabric rows for Offer 9414 from Excel workbook
export const CLIENT_OFFER_9414_FABRICS: StyleFabric[] = [
  {
    id: 'fab-9414-01',
    style_id: '50000000-0000-0000-0000-000000000001',
    s_no: 1,
    fabric_code: 'NK-280G75CO25',
    fabric_type: 'BODY',
    colour: 'JET BLACK-19-0303TPG',
    aop_ref: 'Gar.dye',
    quality: 'BRUSHED FLEECE 3 THREADS',
    composition: '100% COTTON',
    gsm: 280,
    pc_wt: 0.27,
    sample_qty: 500,
    reqd_qty: 135.0,
    yarn_count: "34'S",
    yarn_price: 333.0,
    consume_pct: 0.7,
    effective_yarn_cost: 233.1,
    knitting_cost: 25.0,
    heat_setting_cost: 0.0,
    solid_dye_cost: 55.0,
    dyed_dye_cost: 0.0,
    stenter_cost: 12.0,
    owc_cost: 13.0,
    created_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 'fab-9414-02',
    style_id: '50000000-0000-0000-0000-000000000001',
    s_no: 2,
    fabric_code: 'NK-280G75CO25',
    fabric_type: 'BODY',
    colour: 'JET BLACK-19-0303TPG',
    aop_ref: 'Gar.dye',
    quality: 'BRUSHED FLEECE 3 THREADS',
    composition: '100% COTTON',
    gsm: 280,
    pc_wt: 0.27,
    sample_qty: 500,
    reqd_qty: 135.0,
    yarn_count: "20'S",
    yarn_price: 305.0,
    consume_pct: 0.3,
    effective_yarn_cost: 91.5,
    knitting_cost: 0.0,
    heat_setting_cost: 0.0,
    solid_dye_cost: 0.0,
    dyed_dye_cost: 0.0,
    stenter_cost: 0.0,
    owc_cost: 0.0,
    created_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 'fab-9414-03',
    style_id: '50000000-0000-0000-0000-000000000001',
    s_no: 3,
    fabric_code: 'NK-FBRCGR370',
    fabric_type: 'RIB',
    colour: 'JET BLACK-19-0303TPG',
    aop_ref: 'Gar.dye',
    quality: 'BRUSHED FLEECE 3 THREADS',
    composition: '97% COTTON 3% EA',
    gsm: 370,
    pc_wt: 0.08,
    sample_qty: 500,
    reqd_qty: 40.0,
    yarn_count: "20'S",
    yarn_price: 305.0,
    consume_pct: 1.0,
    effective_yarn_cost: 305.0,
    knitting_cost: 70.0,
    heat_setting_cost: 0.0,
    solid_dye_cost: 55.0,
    dyed_dye_cost: 0.0,
    stenter_cost: 10.0,
    owc_cost: 0.0,
    created_at: '2024-01-01T00:00:00Z',
  },
];

// Real Lab Dips from Excel
export const CLIENT_OFFER_9414_LAB_DIPS: LabDip[] = [
  {
    id: 'ld-9414-01',
    style_id: '50000000-0000-0000-0000-000000000001',
    pantone_ref: 'JET BLACK-19-0303TPG',
    fabric: 'SINGLE JERSEY',
    composition: '100% COTTON',
    gsm: 140,
    processing_route: 'HS, S/Dyeing, ST and OWC',
    lab_ref_no: 'LAB-2909-01',
    sent_on: '2024-04-01',
    approved_option: 'Option A',
    approved_on: '2024-04-10',
    approval_status: 'approved',
    notes: 'Bulk approved for Offer 9414',
    created_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 'ld-9414-02',
    style_id: '50000000-0000-0000-0000-000000000001',
    pantone_ref: '19-1521 TPG',
    fabric: 'BRUSHED FLEECE 3 THREADS',
    composition: '75%CO, 25%POLYESTER',
    gsm: 280,
    processing_route: 'D/Dyeing, ST, BR and OWC',
    lab_ref_no: 'LAB-2909-02',
    sent_on: '2024-04-01',
    approved_option: 'Option A',
    approved_on: '2024-04-10',
    approval_status: 'approved',
    notes: 'Shade OK under D65 illuminant',
    created_at: '2024-01-01T00:00:00Z',
  },
];

export const CLIENT_OFFER_9414_COSTING: CostingSheet = {
  id: 'cost-50000000-0000-0000-0000-000000000001',
  style_id: '50000000-0000-0000-0000-000000000001',
  sample_qty: 500,
  bulk_target_qty: 5000,
  calculated_bulk_fabric_req_kg: 1750.0,
  calculated_bulk_yarn_cost: 650000.0,
  calculated_processing_cost: 201500.0,
  calculated_total_garment_cost: 851500.0,
  quoted_price: 430.40,
  final_price_approved_by: '30000000-0000-0000-0000-000000000001',
  approved_at: '2024-04-12T10:00:00Z',
  approved_price: 430.40,
  approval_notes: 'Approved per Offer 9414 confirmed buyer tech pack',
  created_at: '2024-01-01T00:00:00Z',
};

export const FIXTURE_RUN: ProductionRun = {
  id: '60000000-0000-0000-0000-000000000001',
  style_id: '50000000-0000-0000-0000-000000000001',
  style_number: 'KB13P301X1',
  description: 'RIN | JOGGING PANTS',
  org_id: '00000000-0000-0000-0000-000000000001',
  run_type: 'sample',
  current_stage_order: 7, // Currently at Stage 7: Cutting!
  current_stage_name: 'Cutting',
  status: 'in_progress',
  target_qty: 500,
  blended_cost_per_kg: 486.60, // Real blended fabric rate from Excel (₹486.60/kg)
  start_date: '2026-09-20',
  created_at: '2026-09-20T00:00:00Z',
};

// FULL 15-STAGE PIPELINE LOGS (Winter Solid Fabric Process)
export const INITIAL_STAGE_LOGS: ProductionStageLog[] = [
  {
    id: 'stg-6000-1',
    production_run_id: '60000000-0000-0000-0000-000000000001',
    stage_name: 'Yarn Buying',
    stage_order: 1,
    department_id: '10000000-0000-0000-0000-000000000001',
    department_name: 'Yarn Sourcing',
    input_weight_kg: 100.0,
    output_weight_kg: 99.5,
    loss_kg: 0.5,
    loss_pct: 0.5,
    loss_value: 243.30,
    status: 'done',
    started_at: '2026-09-20T08:00:00Z',
    completed_at: '2026-09-20T17:00:00Z',
    created_at: '2026-09-20T00:00:00Z',
  },
  {
    id: 'stg-6000-2',
    production_run_id: '60000000-0000-0000-0000-000000000001',
    stage_name: 'Knitting',
    stage_order: 2,
    department_id: '10000000-0000-0000-0000-000000000002',
    department_name: 'Knitting',
    input_weight_kg: 99.5,
    output_weight_kg: 96.0,
    loss_kg: 3.5,
    loss_pct: 3.52,
    loss_value: 1703.10,
    status: 'done',
    started_at: '2026-09-21T08:00:00Z',
    completed_at: '2026-09-21T18:00:00Z',
    created_at: '2026-09-20T00:00:00Z',
  },
  {
    id: 'stg-6000-3',
    production_run_id: '60000000-0000-0000-0000-000000000001',
    stage_name: 'Dyeing',
    stage_order: 3,
    department_id: '10000000-0000-0000-0000-000000000003',
    department_name: 'Dyeing & Wet Processing',
    input_weight_kg: 96.0,
    output_weight_kg: 92.0,
    loss_kg: 4.0,
    loss_pct: 4.17,
    loss_value: 1946.40,
    status: 'done',
    started_at: '2026-09-22T08:00:00Z',
    completed_at: '2026-09-22T19:00:00Z',
    created_at: '2026-09-20T00:00:00Z',
  },
  {
    id: 'stg-6000-4',
    production_run_id: '60000000-0000-0000-0000-000000000001',
    stage_name: 'Heat Setting',
    stage_order: 4,
    department_id: '10000000-0000-0000-0000-000000000004',
    department_name: 'Heat Setting',
    input_weight_kg: 92.0,
    output_weight_kg: 90.5,
    loss_kg: 1.5,
    loss_pct: 1.63,
    loss_value: 729.90,
    status: 'done',
    started_at: '2026-09-23T08:00:00Z',
    completed_at: '2026-09-23T15:00:00Z',
    created_at: '2026-09-20T00:00:00Z',
  },
  {
    id: 'stg-6000-5',
    production_run_id: '60000000-0000-0000-0000-000000000001',
    stage_name: 'Finishing & Compacting / Stenter',
    stage_order: 5,
    department_id: '10000000-0000-0000-0000-000000000005',
    department_name: 'Finishing & Compacting',
    input_weight_kg: 90.5,
    output_weight_kg: 88.5,
    loss_kg: 2.0,
    loss_pct: 2.21,
    loss_value: 973.20,
    status: 'done',
    started_at: '2026-09-24T08:00:00Z',
    completed_at: '2026-09-24T16:00:00Z',
    created_at: '2026-09-20T00:00:00Z',
  },
  {
    id: 'stg-6000-6',
    production_run_id: '60000000-0000-0000-0000-000000000001',
    stage_name: 'Brushing & Sueding',
    stage_order: 6,
    department_id: '10000000-0000-0000-0000-000000000005',
    department_name: 'Finishing & Compacting',
    input_weight_kg: 88.5,
    output_weight_kg: 84.0,
    loss_kg: 4.5,
    loss_pct: 5.08,
    loss_value: 2189.70,
    status: 'done',
    started_at: '2026-09-25T08:00:00Z',
    completed_at: '2026-09-25T18:00:00Z',
    created_at: '2026-09-20T00:00:00Z',
  },
  {
    // ACTIVE CURRENT STAGE: Stage 7 Cutting!
    id: 'stg-6000-7',
    production_run_id: '60000000-0000-0000-0000-000000000001',
    stage_name: 'Cutting',
    stage_order: 7,
    department_id: '10000000-0000-0000-0000-000000000006',
    department_name: 'Cutting',
    input_weight_kg: 90.0,
    output_weight_kg: 80.0,
    loss_kg: 10.0,
    loss_pct: 11.11,
    loss_value: 4866.0, // 10 kg * ₹486.60 = ₹4,866.00 (NOT ZERO!)
    assigned_to: '30000000-0000-0000-0000-000000000003',
    assigned_to_name: 'M. Murugan',
    employee_reported_output_kg: 80.0,
    employee_reported_scrap_kg: 10.0,
    employee_reported_pieces: 500,
    scale_id: 'Scale #2 - Table A',
    weight_discrepancy_kg: 0.0,
    weight_discrepancy_pct: 0.0,
    discrepancy_status: 'matched',
    status: 'in_progress',
    started_at: '2026-09-27T08:00:00Z',
    created_at: '2026-09-20T00:00:00Z',
    notes: 'Floor measurements confirmed by Murugan; bundle count 500 pcs.',
  },
  {
    id: 'stg-6000-8',
    production_run_id: '60000000-0000-0000-0000-000000000001',
    stage_name: 'Embroidery',
    stage_order: 8,
    department_id: '10000000-0000-0000-0000-000000000007',
    department_name: 'Embroidery & Print',
    input_weight_kg: 0,
    output_weight_kg: 0,
    loss_kg: 0,
    loss_pct: 0,
    loss_value: 0,
    status: 'pending',
    created_at: '2026-09-20T00:00:00Z',
  },
  {
    id: 'stg-6000-9',
    production_run_id: '60000000-0000-0000-0000-000000000001',
    stage_name: 'Printing',
    stage_order: 9,
    department_id: '10000000-0000-0000-0000-000000000007',
    department_name: 'Embroidery & Print',
    input_weight_kg: 0,
    output_weight_kg: 0,
    loss_kg: 0,
    loss_pct: 0,
    loss_value: 0,
    status: 'pending',
    created_at: '2026-09-20T00:00:00Z',
  },
  {
    id: 'stg-6000-10',
    production_run_id: '60000000-0000-0000-0000-000000000001',
    stage_name: 'Sewing',
    stage_order: 10,
    department_id: '10000000-0000-0000-0000-000000000008',
    department_name: 'Sewing & Assembly',
    input_weight_kg: 0,
    output_weight_kg: 0,
    loss_kg: 0,
    loss_pct: 0,
    loss_value: 0,
    status: 'pending',
    created_at: '2026-09-20T00:00:00Z',
  },
  {
    id: 'stg-6000-11',
    production_run_id: '60000000-0000-0000-0000-000000000001',
    stage_name: 'Trimming',
    stage_order: 11,
    department_id: '10000000-0000-0000-0000-000000000008',
    department_name: 'Sewing & Assembly',
    input_weight_kg: 0,
    output_weight_kg: 0,
    loss_kg: 0,
    loss_pct: 0,
    loss_value: 0,
    status: 'pending',
    created_at: '2026-09-20T00:00:00Z',
  },
  {
    id: 'stg-6000-12',
    production_run_id: '60000000-0000-0000-0000-000000000001',
    stage_name: 'Checking',
    stage_order: 12,
    department_id: '10000000-0000-0000-0000-000000000009',
    department_name: 'Quality Control & Checking',
    input_weight_kg: 0,
    output_weight_kg: 0,
    loss_kg: 0,
    loss_pct: 0,
    loss_value: 0,
    status: 'pending',
    created_at: '2026-09-20T00:00:00Z',
  },
  {
    id: 'stg-6000-13',
    production_run_id: '60000000-0000-0000-0000-000000000001',
    stage_name: 'Finishing',
    stage_order: 13,
    department_id: '10000000-0000-0000-0000-000000000010',
    department_name: 'Ironing & Packing',
    input_weight_kg: 0,
    output_weight_kg: 0,
    loss_kg: 0,
    loss_pct: 0,
    loss_value: 0,
    status: 'pending',
    created_at: '2026-09-20T00:00:00Z',
  },
  {
    id: 'stg-6000-14',
    production_run_id: '60000000-0000-0000-0000-000000000001',
    stage_name: 'Ironing',
    stage_order: 14,
    department_id: '10000000-0000-0000-0000-000000000010',
    department_name: 'Ironing & Packing',
    input_weight_kg: 0,
    output_weight_kg: 0,
    loss_kg: 0,
    loss_pct: 0,
    loss_value: 0,
    status: 'pending',
    created_at: '2026-09-20T00:00:00Z',
  },
  {
    id: 'stg-6000-15',
    production_run_id: '60000000-0000-0000-0000-000000000001',
    stage_name: 'Packing',
    stage_order: 15,
    department_id: '10000000-0000-0000-0000-000000000010',
    department_name: 'Ironing & Packing',
    input_weight_kg: 0,
    output_weight_kg: 0,
    loss_kg: 0,
    loss_pct: 0,
    loss_value: 0,
    status: 'pending',
    created_at: '2026-09-20T00:00:00Z',
  },
];

// Employee Task with Floor Measurement Fields
export const FIXTURE_TASK: Task = {
  id: '80000000-0000-0000-0000-000000000001',
  production_stage_log_id: 'stg-6000-7',
  stage_name: 'Cutting',
  style_number: 'KB13P301X1',
  department_id: '10000000-0000-0000-0000-000000000006',
  department_name: 'Cutting',
  assigned_to: '30000000-0000-0000-0000-000000000003',
  assigned_to_name: 'M. Murugan',
  created_by: '30000000-0000-0000-0000-000000000002',
  specification: 'Cut 500 pcs jogger panels per marker. Weigh cut panels and edge scrap on Table Scale #2.',
  status: 'in_progress',
  expected_completion_date: '2026-09-29',
  notes: 'Offer 9414 Black Fleece 280 GSM',
  manager_assigned_weight_kg: 90.0,
  employee_measured_output_weight_kg: 80.0,
  employee_waste_scrap_weight_kg: 10.0,
  employee_piece_count: 500,
  machine_scale_id: 'Scale #2 - Table A',
  employee_notes: 'Marker lay 10 plies. Selvage scrap bundled.',
  weight_discrepancy_kg: 0.0,
  weight_discrepancy_pct: 0.0,
  discrepancy_status: 'matched',
  created_at: '2026-09-27T00:00:00Z',
};

export interface ErpState {
  currentUserId: string;
  users: Profile[];
  departments: Department[];
  styles: Style[];
  fabrics: StyleFabric[];
  labDips: LabDip[];
  costingSheets: CostingSheet[];
  productionRuns: ProductionRun[];
  stageLogs: ProductionStageLog[];
  tasks: Task[];
  channels: ChatChannel[];
  messages: ChatMessage[];
  dispatchRecords: DispatchRecord[];
  paymentRecords: PaymentRecord[];
  payrollEntries: PayrollEntry[];
  monthlyPayrollRuns: MonthlyPayrollRun[];
  activityLogs: ActivityLog[];
  batchTransfers: BatchTransfer[];
}

const STORAGE_KEY = 'knitnect_erp_state_v2'; // Bumped storage key for fresh load

export class ErpStore {
  private static instance: ErpStore;
  private state: ErpState;
  private subscribers: Array<() => void> = [];

  private constructor() {
    this.state = this.loadInitialState();
    this.syncAllProductionRuns();
  }

  public static getInstance(): ErpStore {
    if (!ErpStore.instance) {
      ErpStore.instance = new ErpStore();
    }
    return ErpStore.instance;
  }

  private loadInitialState(): ErpState {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          parsed.batchTransfers = parsed.batchTransfers || [];
          return parsed;
        }
      } catch (err) {
        console.error('Failed to load ERP state from localStorage:', err);
      }
    }

    return {
      currentUserId: FIXTURE_USERS[0].id, // Default to Owner
      users: [...FIXTURE_USERS],
      departments: [...INITIAL_DEPARTMENTS],
      styles: [CLIENT_OFFER_9414_STYLE],
      fabrics: [...CLIENT_OFFER_9414_FABRICS],
      labDips: [...CLIENT_OFFER_9414_LAB_DIPS],
      costingSheets: [CLIENT_OFFER_9414_COSTING],
      productionRuns: [FIXTURE_RUN],
      stageLogs: [...INITIAL_STAGE_LOGS],
      tasks: [FIXTURE_TASK],
      channels: [...INITIAL_CHANNELS],
      messages: [
        {
          id: 'msg-01',
          channel_id: '40000000-0000-0000-0000-000000000001',
          sender_id: FIXTURE_USERS[0].id,
          sender_name: FIXTURE_USERS[0].full_name,
          sender_role: FIXTURE_USERS[0].role,
          body: 'System launched. Offer 9414 (RIN Jogging Pants) cutting phase in progress on floor.',
          created_at: '2026-09-27T08:00:00Z',
        },
      ],
      dispatchRecords: [],
      paymentRecords: [],
      payrollEntries: FIXTURE_USERS.map((u) => ({
        id: `pay-${u.id}`,
        user_id: u.id,
        user_name: u.full_name,
        user_email: u.email,
        department_name: u.department_name || (u.role === 'owner' ? 'Executive' : 'Operations'),
        role: u.role,
        joined_on: u.joined_on,
        base_salary: u.base_salary,
        increment_history: u.increment_history,
        updated_at: new Date().toISOString(),
      })),
      monthlyPayrollRuns: [],
      activityLogs: [
        {
          id: 'act-01',
          org_id: '00000000-0000-0000-0000-000000000001',
          user_id: FIXTURE_USERS[0].id,
          user_name: FIXTURE_USERS[0].full_name,
          action: 'SYSTEM_INITIALIZED',
          entity_type: 'SYSTEM',
          details: { note: 'ERP initialized with Offer 9414 working file & 15 production stages' },
          created_at: '2026-09-27T08:00:00Z',
        },
      ],
      batchTransfers: [],
    };
  }

  private saveState() {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
      } catch (err) {
        console.error('Failed to save ERP state:', err);
      }
    }
    this.subscribers.forEach((cb) => cb());
  }

  public subscribe(cb: () => void): () => void {
    this.subscribers.push(cb);
    return () => {
      this.subscribers = this.subscribers.filter((s) => s !== cb);
    };
  }

  // Auth / Current User
  public getCurrentUser(): Profile {
    const user = this.state.users.find((u) => u.id === this.state.currentUserId);
    return user || this.state.users[0];
  }

  public setCurrentUser(userId: string) {
    if (this.state.users.some((u) => u.id === userId)) {
      this.state.currentUserId = userId;
      this.saveState();
    }
  }

  public getUsers(): Profile[] {
    return this.state.users;
  }

  public deactivateUser(userId: string, deactivatedBy: string): { success: boolean; message: string } {
    const user = this.state.users.find((u) => u.id === userId);
    if (!user) return { success: false, message: 'User not found' };
    user.active = false;
    this.logActivity(deactivatedBy, 'USER_DEACTIVATED', 'PROFILE', userId, {
      deactivated_user: user.full_name,
    });
    this.saveState();
    return { success: true, message: `${user.full_name} deactivated successfully.` };
  }

  // Activity Log
  public logActivity(
    userId: string,
    action: string,
    entityType: string,
    entityId?: string,
    details: Record<string, any> = {}
  ) {
    const user = this.state.users.find((u) => u.id === userId);
    const log: ActivityLog = {
      id: `act-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      org_id: '00000000-0000-0000-0000-000000000001',
      user_id: userId,
      user_name: user?.full_name || 'System',
      action,
      entity_type: entityType,
      entity_id: entityId,
      details,
      created_at: new Date().toISOString(),
    };
    this.state.activityLogs.unshift(log);
  }

  public getActivityLogs(): ActivityLog[] {
    return this.state.activityLogs;
  }

  // Departments
  public getDepartments(): Department[] {
    return this.state.departments.map((dept) => {
      const memberCount = this.state.users.filter(
        (u) => u.department_id === dept.id && u.active
      ).length;
      return { ...dept, member_count: memberCount };
    });
  }

  public createDepartment(name: string, stageType: string, createdBy: string): Department {
    const dept: Department = {
      id: `dept-${Date.now()}`,
      org_id: '00000000-0000-0000-0000-000000000001',
      name,
      stage_type: stageType,
      created_at: new Date().toISOString(),
    };
    this.state.departments.push(dept);
    this.logActivity(createdBy, 'CREATE_DEPARTMENT', 'DEPARTMENT', dept.id, { name, stageType });
    this.saveState();
    return dept;
  }

  public assignEmployeeToDepartment(userId: string, departmentId: string, assignedBy: string) {
    const user = this.state.users.find((u) => u.id === userId);
    const dept = this.state.departments.find((d) => d.id === departmentId);
    if (user && dept) {
      user.department_id = dept.id;
      user.department_name = dept.name;
      this.logActivity(assignedBy, 'ASSIGN_EMPLOYEE_DEPT', 'PROFILE', userId, {
        employee: user.full_name,
        department: dept.name,
      });
      this.saveState();
    }
  }

  // Styles & Status (Accessible across all roles for real-time order visibility)
  public getStyles(userRole: UserRole): Style[] {
    return this.state.styles.map((s) => {
      const fabrics = this.state.fabrics.filter((f) => f.style_id === s.id);
      const labDips = this.state.labDips.filter((ld) => ld.style_id === s.id);
      const costing = this.state.costingSheets.find((c) => c.style_id === s.id);
      const currentRun = this.state.productionRuns.find((r) => r.style_id === s.id);
      return { ...s, fabrics, lab_dips: labDips, costing, current_run: currentRun };
    });
  }

  public getStyleById(id: string, userRole: UserRole): Style | null {
    const style = this.state.styles.find((s) => s.id === id);
    if (!style) return null;
    const fabrics = this.state.fabrics.filter((f) => f.style_id === style.id);
    const labDips = this.state.labDips.filter((ld) => ld.style_id === style.id);
    const costing = this.state.costingSheets.find((c) => c.style_id === style.id);
    const currentRun = this.state.productionRuns.find((r) => r.style_id === style.id);
    return { ...style, fabrics, lab_dips: labDips, costing, current_run: currentRun };
  }

  public createStyle(
    styleData: Omit<Style, 'id' | 'org_id' | 'status' | 'created_at'>,
    createdBy: string
  ): Style {
    const newStyle: Style = {
      id: `style-${Date.now()}`,
      org_id: '00000000-0000-0000-0000-000000000001',
      ...styleData,
      status: 'costing',
      created_by: createdBy,
      created_at: new Date().toISOString(),
    };
    this.state.styles.unshift(newStyle);

    // Initial costing sheet
    const costing: CostingSheet = {
      id: `cost-${newStyle.id}`,
      style_id: newStyle.id,
      sample_qty: 500,
      bulk_target_qty: 5000,
      calculated_bulk_fabric_req_kg: 0,
      calculated_bulk_yarn_cost: 0,
      calculated_processing_cost: 0,
      calculated_total_garment_cost: 0,
      quoted_price: 0,
      created_at: new Date().toISOString(),
    };
    this.state.costingSheets.push(costing);

    this.logActivity(createdBy, 'CREATE_STYLE', 'STYLE', newStyle.id, {
      style_number: newStyle.style_number,
      season: newStyle.season,
      process: newStyle.garment_process_type,
    });

    this.saveState();
    return newStyle;
  }

  // Style Fabrics (Costing rows)
  public addStyleFabric(fabric: Omit<StyleFabric, 'id' | 'created_at' | 'effective_yarn_cost' | 'reqd_qty'>): StyleFabric {
    const consumeRatio = fabric.consume_pct > 1 ? fabric.consume_pct / 100 : fabric.consume_pct || 1;
    const effectiveYarnCost = Number(((fabric.yarn_price || 0) * consumeRatio).toFixed(2));
    const reqdQty = Number(((fabric.pc_wt || 0) * (fabric.sample_qty || 1)).toFixed(4));

    const newFabric: StyleFabric = {
      id: `fab-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      ...fabric,
      consume_pct: consumeRatio,
      effective_yarn_cost: effectiveYarnCost,
      reqd_qty: reqdQty,
      created_at: new Date().toISOString(),
    };

    this.state.fabrics.push(newFabric);
    this.recalculateStyleCosting(fabric.style_id);
    this.saveState();
    return newFabric;
  }

  public updateStyleFabric(id: string, updates: Partial<StyleFabric>): StyleFabric | null {
    const fab = this.state.fabrics.find((f) => f.id === id);
    if (!fab) return null;
    Object.assign(fab, updates);

    const ratio = fab.consume_pct > 1 ? fab.consume_pct / 100 : fab.consume_pct || 1;
    fab.consume_pct = ratio;
    fab.effective_yarn_cost = Number(((fab.yarn_price || 0) * ratio).toFixed(2));
    fab.reqd_qty = Number(((fab.pc_wt || 0) * (fab.sample_qty || 1)).toFixed(4));

    this.recalculateStyleCosting(fab.style_id);
    this.saveState();
    return fab;
  }

  public deleteStyleFabric(id: string) {
    const fab = this.state.fabrics.find((f) => f.id === id);
    if (fab) {
      const styleId = fab.style_id;
      this.state.fabrics = this.state.fabrics.filter((f) => f.id !== id);
      this.recalculateStyleCosting(styleId);
      this.saveState();
    }
  }

  // Lab Dips
  public addLabDip(dip: Omit<LabDip, 'id' | 'created_at'>): LabDip {
    const newDip: LabDip = {
      id: `ld-${Date.now()}`,
      ...dip,
      created_at: new Date().toISOString(),
    };
    this.state.labDips.push(newDip);
    this.saveState();
    return newDip;
  }

  public updateLabDipStatus(
    id: string,
    status: 'pending' | 'approved' | 'rejected',
    approvedOption?: string,
    updatedBy?: string
  ): LabDip | null {
    const dip = this.state.labDips.find((ld) => ld.id === id);
    if (!dip) return null;
    dip.approval_status = status;
    if (status === 'approved') {
      dip.approved_on = new Date().toISOString().split('T')[0];
      if (approvedOption) dip.approved_option = approvedOption;
    }
    if (updatedBy) {
      this.logActivity(updatedBy, 'LAB_DIP_STATUS_UPDATED', 'LAB_DIP', id, {
        pantone: dip.pantone_ref,
        status,
      });
    }
    this.saveState();
    return dip;
  }

  // Costing & Bulk Projections
  public recalculateStyleCosting(styleId: string, bulkTargetQty?: number) {
    const costing = this.state.costingSheets.find((c) => c.style_id === styleId);
    if (!costing) return;
    const fabrics = this.state.fabrics.filter((f) => f.style_id === styleId);
    const targetQty = bulkTargetQty ?? costing.bulk_target_qty;

    const projection = calculateBulkProjection(fabrics, targetQty);
    costing.bulk_target_qty = targetQty;
    costing.calculated_bulk_fabric_req_kg = projection.totalFabricReqKg;
    costing.calculated_bulk_yarn_cost = projection.totalYarnCost;
    costing.calculated_processing_cost = projection.totalProcessingCost;
    costing.calculated_total_garment_cost = projection.totalFabricCost;

    // Synchronize newly calculated blended fabric cost to production runs and stage losses
    const newBlendedCost = calculateBlendedCostPerKg(fabrics);
    const runs = this.state.productionRuns.filter((r) => r.style_id === styleId);
    for (const r of runs) {
      r.blended_cost_per_kg = newBlendedCost;
      const runStages = this.state.stageLogs.filter((s) => s.production_run_id === r.id);
      for (const stg of runStages) {
        if (stg.loss_kg > 0) {
          stg.loss_value = Number((stg.loss_kg * newBlendedCost).toFixed(2));
        }
      }
    }
  }

  // Dynamic price editing by Client / Owner
  public updateFabricPrices(
    fabricId: string,
    prices: {
      yarn_price?: number;
      knitting_cost?: number;
      heat_setting_cost?: number;
      solid_dye_cost?: number;
      dyed_dye_cost?: number;
      stenter_cost?: number;
      owc_cost?: number;
      pc_wt?: number;
    },
    updatedBy: string
  ): { success: boolean; fabric?: StyleFabric } {
    const fab = this.state.fabrics.find((f) => f.id === fabricId);
    if (!fab) return { success: false };

    if (prices.yarn_price !== undefined) fab.yarn_price = Number(prices.yarn_price);
    if (prices.knitting_cost !== undefined) fab.knitting_cost = Number(prices.knitting_cost);
    if (prices.heat_setting_cost !== undefined) fab.heat_setting_cost = Number(prices.heat_setting_cost);
    if (prices.solid_dye_cost !== undefined) fab.solid_dye_cost = Number(prices.solid_dye_cost);
    if (prices.dyed_dye_cost !== undefined) fab.dyed_dye_cost = Number(prices.dyed_dye_cost);
    if (prices.stenter_cost !== undefined) fab.stenter_cost = Number(prices.stenter_cost);
    if (prices.owc_cost !== undefined) fab.owc_cost = Number(prices.owc_cost);
    if (prices.pc_wt !== undefined) fab.pc_wt = Number(prices.pc_wt);

    const ratio = fab.consume_pct > 1 ? fab.consume_pct / 100 : fab.consume_pct || 1;
    fab.effective_yarn_cost = Number(((fab.yarn_price || 0) * ratio).toFixed(2));

    this.recalculateStyleCosting(fab.style_id);
    this.logActivity(updatedBy, 'UPDATE_FABRIC_PRICES', 'FABRIC', fabricId, prices);
    this.saveState();
    return { success: true, fabric: fab };
  }

  // Universal Fabric Row Editor: Allows updating every column even when style/costing is completed
  public updateStyleFabricRow(
    fabricId: string,
    updates: Partial<StyleFabric>,
    updatedBy: string
  ): { success: boolean; fabric?: StyleFabric } {
    const fab = this.state.fabrics.find((f) => f.id === fabricId);
    if (!fab) return { success: false };

    if (updates.fabric_code !== undefined) fab.fabric_code = String(updates.fabric_code);
    if (updates.fabric_type !== undefined) fab.fabric_type = String(updates.fabric_type);
    if (updates.colour !== undefined) fab.colour = String(updates.colour);
    if (updates.aop_ref !== undefined) fab.aop_ref = String(updates.aop_ref);
    if (updates.quality !== undefined) fab.quality = String(updates.quality);
    if (updates.composition !== undefined) fab.composition = String(updates.composition);
    if (updates.gsm !== undefined) fab.gsm = Number(updates.gsm);
    if (updates.pc_wt !== undefined) fab.pc_wt = Number(updates.pc_wt);
    if (updates.sample_qty !== undefined) fab.sample_qty = Number(updates.sample_qty);
    if (updates.yarn_count !== undefined) fab.yarn_count = String(updates.yarn_count);
    if (updates.yarn_price !== undefined) fab.yarn_price = Number(updates.yarn_price);
    if (updates.consume_pct !== undefined) {
      const c = Number(updates.consume_pct);
      fab.consume_pct = c > 1 ? c / 100 : c;
    }
    if (updates.knitting_cost !== undefined) fab.knitting_cost = Number(updates.knitting_cost);
    if (updates.heat_setting_cost !== undefined) fab.heat_setting_cost = Number(updates.heat_setting_cost);
    if (updates.solid_dye_cost !== undefined) fab.solid_dye_cost = Number(updates.solid_dye_cost);
    if (updates.dyed_dye_cost !== undefined) fab.dyed_dye_cost = Number(updates.dyed_dye_cost);
    if (updates.stenter_cost !== undefined) fab.stenter_cost = Number(updates.stenter_cost);
    if (updates.owc_cost !== undefined) fab.owc_cost = Number(updates.owc_cost);

    fab.reqd_qty = Number(((fab.pc_wt || 0) * (fab.sample_qty || 500)).toFixed(2));
    const ratio = fab.consume_pct > 1 ? fab.consume_pct / 100 : fab.consume_pct || 1;
    fab.effective_yarn_cost = Number(((fab.yarn_price || 0) * ratio).toFixed(2));

    this.recalculateStyleCosting(fab.style_id);
    this.logActivity(updatedBy, 'UPDATE_FABRIC_ROW', 'FABRIC', fabricId, updates);
    this.saveState();
    return { success: true, fabric: fab };
  }

  // Universal Style Editor: Allows updating style metadata and status at any point
  public updateStyleDetails(
    styleId: string,
    updates: Partial<Style>,
    updatedBy: string
  ): { success: boolean; style?: Style } {
    const style = this.state.styles.find((s) => s.id === styleId);
    if (!style) return { success: false };

    if (updates.style_number !== undefined) style.style_number = String(updates.style_number);
    if (updates.season !== undefined) style.season = String(updates.season);
    if (updates.offer_no !== undefined) style.offer_no = String(updates.offer_no);
    if (updates.description !== undefined) style.description = String(updates.description);
    if (updates.garment_category !== undefined) style.garment_category = updates.garment_category;
    if (updates.garment_season_type !== undefined) style.garment_season_type = updates.garment_season_type;
    if (updates.garment_process_type !== undefined) style.garment_process_type = updates.garment_process_type;
    if (updates.status !== undefined) style.status = updates.status;

    this.logActivity(updatedBy, 'UPDATE_STYLE_DETAILS', 'STYLE', styleId, updates);
    this.saveState();
    return { success: true, style };
  }

  public updateQuotedPrice(styleId: string, quotedPrice: number, updatedBy: string) {
    const costing = this.state.costingSheets.find((c) => c.style_id === styleId);
    if (costing) {
      costing.quoted_price = Number(quotedPrice);
      this.logActivity(updatedBy, 'UPDATE_QUOTED_PRICE', 'COSTING', costing.id, { quotedPrice });
      this.saveState();
    }
  }

  // Section 5.6: Price Approval Step (Enforced before pipeline can be activated)
  public approveFinalPrice(
    styleId: string,
    approvedPrice: number,
    approvedBy: string,
    notes?: string
  ): { success: boolean; message: string } {
    const user = this.state.users.find((u) => u.id === approvedBy);
    if (!user || (user.role !== 'owner' && user.role !== 'manager')) {
      return { success: false, message: 'Only Owner or Manager can approve the final price.' };
    }

    const costing = this.state.costingSheets.find((c) => c.style_id === styleId);
    if (!costing) return { success: false, message: 'Costing sheet not found.' };

    costing.final_price_approved_by = approvedBy;
    costing.approved_at = new Date().toISOString();
    costing.approved_price = Number(approvedPrice);
    if (notes) costing.approval_notes = notes;

    this.logActivity(approvedBy, 'PRICE_APPROVED', 'COSTING', costing.id, {
      approved_price: approvedPrice,
      approved_by_name: user.full_name,
    });

    this.saveState();
    return { success: true, message: `Final price of ₹${approvedPrice} approved by ${user.full_name}.` };
  }

  // Section 6: Activate Production Pipeline (Builds ALL 15 STAGES in order)
  public activateProductionPipeline(
    styleId: string,
    activatedBy: string,
    targetQty: number = 5000,
    runType: 'sample' | 'bulk' = 'sample'
  ): { success: boolean; message: string; run?: ProductionRun } {
    const user = this.state.users.find((u) => u.id === activatedBy);
    if (!user || (user.role !== 'owner' && user.role !== 'manager')) {
      return { success: false, message: 'Unauthorized: Only Owner or Manager can activate production.' };
    }

    const style = this.state.styles.find((s) => s.id === styleId);
    if (!style) return { success: false, message: 'Style not found.' };

    const labDips = this.state.labDips.filter((ld) => ld.style_id === styleId);
    const labDipCheck = isLabDipGateCleared(labDips);
    if (!labDipCheck.cleared) {
      return { success: false, message: `Lab Dip Gate Blocked: ${labDipCheck.reason}` };
    }

    const costing = this.state.costingSheets.find((c) => c.style_id === styleId);
    const priceCheck = isPriceApprovalCleared(costing);
    if (!priceCheck.cleared) {
      return { success: false, message: `Price Approval Gate Blocked: ${priceCheck.reason}` };
    }

    // Generate ordered stage sequence from pipeline templates engine
    const stages = getPipelineStagesForStyle(style.garment_process_type, style.garment_season_type);
    const fabrics = this.state.fabrics.filter((f) => f.style_id === styleId);
    const calculatedBlended = calculateBlendedCostPerKg(fabrics);
    const blendedCost = calculatedBlended > 0 ? calculatedBlended : DEFAULT_BLENDED_FABRIC_COST_PER_KG;

    const runId = `run-${Date.now()}`;
    const newRun: ProductionRun = {
      id: runId,
      style_id: styleId,
      style_number: style.style_number,
      description: style.description,
      org_id: '00000000-0000-0000-0000-000000000001',
      run_type: runType,
      current_stage_order: 1,
      current_stage_name: stages[0].name,
      status: 'in_progress',
      target_qty: targetQty,
      blended_cost_per_kg: blendedCost,
      start_date: new Date().toISOString().split('T')[0],
      created_at: new Date().toISOString(),
    };

    // Create all stages from Stage 1 to the final packing stage
    const stageLogs: ProductionStageLog[] = stages.map((s, idx) => {
      const dept = this.state.departments.find((d) => d.name === s.departmentName);
      return {
        id: `stg-${runId}-${idx + 1}`,
        production_run_id: runId,
        stage_name: s.name,
        stage_order: s.order,
        department_id: dept?.id,
        department_name: dept?.name || s.departmentName,
        input_weight_kg: 0,
        output_weight_kg: 0,
        loss_kg: 0,
        loss_pct: 0,
        loss_value: 0,
        status: idx === 0 ? 'in_progress' : 'pending',
        started_at: idx === 0 ? new Date().toISOString() : undefined,
        created_at: new Date().toISOString(),
      };
    });

    this.state.productionRuns.unshift(newRun);
    this.state.stageLogs.push(...stageLogs);
    style.status = runType === 'bulk' ? 'bulk_production' : 'sample_production';

    this.logActivity(activatedBy, 'ACTIVATE_PIPELINE', 'PRODUCTION_RUN', runId, {
      style_number: style.style_number,
      run_type: runType,
      total_stages: stages.length,
    });

    this.saveState();
    return {
      success: true,
      message: `Production run activated for ${style.style_number} with ${stages.length} ordered stages starting at "${stages[0].name}".`,
      run: newRun,
    };
  }

  // Section 6.2: Stage progression & loss tracking
  public updateStageWeightAndLoss(
    stageLogId: string,
    inputWeightKg: number,
    outputWeightKg: number,
    notes?: string,
    managerVerifiedKg?: number,
    employeeFloorData?: {
      reportedOutputKg?: number;
      wasteScrapKg?: number;
      scaleId?: string;
    }
  ): { success: boolean; stageLog?: ProductionStageLog; errorCode?: string; maxInputKg?: number } {
    const stage = this.state.stageLogs.find((s) => s.id === stageLogId);
    if (!stage) return { success: false };

    // ─── RULE: Input weight cannot exceed previous stage's output ───
    const allRunLogs = this.state.stageLogs
      .filter((s) => s.production_run_id === stage.production_run_id)
      .sort((a, b) => a.stage_order - b.stage_order);
    const prevStage = allRunLogs.find((s) => s.stage_order === stage.stage_order - 1);
    if (prevStage && prevStage.output_weight_kg > 0 && inputWeightKg > prevStage.output_weight_kg) {
      return {
        success: false,
        errorCode: 'EXCEEDS_PREVIOUS_OUTPUT',
        maxInputKg: prevStage.output_weight_kg,
      };
    }
    // ────────────────────────────────────────────────────────────────

    const run = this.state.productionRuns.find((r) => r.id === stage.production_run_id);
    const blendedCost = run?.blended_cost_per_kg && run.blended_cost_per_kg > 0
      ? run.blended_cost_per_kg
      : DEFAULT_BLENDED_FABRIC_COST_PER_KG;

    const historicalLogs = this.state.stageLogs.filter((l) => l.status === 'done');
    const metrics = computeStageLoss(
      stage.stage_name,
      inputWeightKg,
      outputWeightKg,
      blendedCost,
      historicalLogs
    );

    stage.input_weight_kg = metrics.inputWeightKg;
    stage.output_weight_kg = metrics.outputWeightKg;
    stage.loss_kg = metrics.lossKg;
    stage.loss_pct = metrics.lossPct;
    stage.loss_value = metrics.lossValue;
    if (notes !== undefined) stage.notes = notes;

    if (employeeFloorData) {
      if (employeeFloorData.reportedOutputKg !== undefined) {
        stage.employee_reported_output_kg = employeeFloorData.reportedOutputKg;
      }
      if (employeeFloorData.wasteScrapKg !== undefined) {
        stage.employee_waste_scrap_weight_kg = employeeFloorData.wasteScrapKg;
      }
      if (employeeFloorData.scaleId !== undefined) {
        stage.machine_scale_id = employeeFloorData.scaleId;
      }
    }

    // Cross verification with employee reported output weight
    const mgrWeight = managerVerifiedKg ?? outputWeightKg;
    stage.manager_verified_output_kg = mgrWeight;

    if (stage.employee_reported_output_kg !== undefined && stage.employee_reported_output_kg > 0) {
      const cross = verifyFloorWeights(stage.employee_reported_output_kg, mgrWeight);
      stage.weight_discrepancy_kg = cross.discrepancyKg;
      stage.weight_discrepancy_pct = cross.discrepancyPct;
      stage.discrepancy_status = cross.status;
    }

    this.saveState();
    return { success: true, stageLog: stage };
  }

  // Universal Stage Details Editor: Update stage weights, scrap, scale, status, and notes anytime
  public updateStageDetails(
    stageLogId: string,
    updates: Partial<ProductionStageLog>,
    updatedBy: string
  ): { success: boolean; stageLog?: ProductionStageLog } {
    const stage = this.state.stageLogs.find((s) => s.id === stageLogId);
    if (!stage) return { success: false };

    if (updates.input_weight_kg !== undefined) stage.input_weight_kg = Number(updates.input_weight_kg);
    if (updates.output_weight_kg !== undefined) stage.output_weight_kg = Number(updates.output_weight_kg);
    if (updates.employee_reported_output_kg !== undefined) {
      stage.employee_reported_output_kg = Number(updates.employee_reported_output_kg);
    }
    if (updates.employee_waste_scrap_weight_kg !== undefined) {
      stage.employee_waste_scrap_weight_kg = Number(updates.employee_waste_scrap_weight_kg);
    }
    if (updates.employee_reported_scrap_kg !== undefined) {
      stage.employee_reported_scrap_kg = Number(updates.employee_reported_scrap_kg);
    }
    if (updates.employee_reported_pieces !== undefined) {
      stage.employee_reported_pieces = Number(updates.employee_reported_pieces);
    }
    if (updates.scale_id !== undefined) stage.scale_id = updates.scale_id;
    if (updates.machine_scale_id !== undefined) stage.machine_scale_id = updates.machine_scale_id;
    if (updates.notes !== undefined) stage.notes = updates.notes;
    if (updates.status !== undefined) stage.status = updates.status;

    if (stage.input_weight_kg > 0 && stage.output_weight_kg > 0) {
      const run = this.state.productionRuns.find((r) => r.id === stage.production_run_id);
      const blendedCost = run?.blended_cost_per_kg && run.blended_cost_per_kg > 0
        ? run.blended_cost_per_kg
        : DEFAULT_BLENDED_FABRIC_COST_PER_KG;
      const historicalLogs = this.state.stageLogs.filter((l) => l.status === 'done' && l.id !== stage.id);
      const metrics = computeStageLoss(
        stage.stage_name,
        stage.input_weight_kg,
        stage.output_weight_kg,
        blendedCost,
        historicalLogs
      );
      stage.loss_kg = metrics.lossKg;
      stage.loss_pct = metrics.lossPct;
      stage.loss_value = metrics.lossValue;
    }

    const mgrWeight = stage.manager_verified_output_kg || stage.output_weight_kg;
    if (stage.employee_reported_output_kg && stage.employee_reported_output_kg > 0 && mgrWeight > 0) {
      const cross = verifyFloorWeights(stage.employee_reported_output_kg, mgrWeight);
      stage.weight_discrepancy_kg = cross.discrepancyKg;
      stage.weight_discrepancy_pct = cross.discrepancyPct;
      stage.discrepancy_status = cross.status;
    }

    this.logActivity(updatedBy, 'UPDATE_STAGE_DETAILS', 'STAGE', stageLogId, updates);
    this.saveState();
    return { success: true, stageLog: stage };
  }

  // Employee Floor Measurement Entry & Cross-Verification
  public submitEmployeeFloorMeasurement(
    taskId: string,
    data: {
      measuredOutputWeightKg: number;
      wasteScrapWeightKg?: number;
      pieceCount?: number;
      scaleId?: string;
      employeeNotes?: string;
      userId: string;
    }
  ): { success: boolean; message: string; task?: Task } {
    const task = this.state.tasks.find((t) => t.id === taskId);
    if (!task) return { success: false, message: 'Task not found.' };

    task.employee_measured_output_weight_kg = Number(data.measuredOutputWeightKg);
    task.employee_waste_scrap_weight_kg = Number(data.wasteScrapWeightKg || 0);
    task.employee_piece_count = Number(data.pieceCount || 0);
    task.machine_scale_id = data.scaleId || 'Scale #1';
    task.employee_notes = data.employeeNotes || '';
    task.status = 'completed';

    const today = new Date();
    task.actual_completion_date = today.toISOString().split('T')[0];
    const createdDate = new Date(task.created_at);
    const diffTime = Math.abs(today.getTime() - createdDate.getTime());
    task.actual_days_taken = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));

    // Link to production stage log
    const stage = this.state.stageLogs.find((s) => s.id === task.production_stage_log_id);
    if (stage) {
      stage.employee_reported_output_kg = Number(data.measuredOutputWeightKg);
      stage.employee_reported_scrap_kg = Number(data.wasteScrapWeightKg || 0);
      stage.employee_reported_pieces = Number(data.pieceCount || 0);
      stage.scale_id = data.scaleId || 'Scale #1';

      // If output weight was already verified by manager, compute cross discrepancy immediately
      const mgrWeight = stage.output_weight_kg || task.manager_verified_weight_kg || 0;
      if (mgrWeight > 0) {
        const cross = verifyFloorWeights(data.measuredOutputWeightKg, mgrWeight);
        task.weight_discrepancy_kg = cross.discrepancyKg;
        task.weight_discrepancy_pct = cross.discrepancyPct;
        task.discrepancy_status = cross.status;

        stage.weight_discrepancy_kg = cross.discrepancyKg;
        stage.weight_discrepancy_pct = cross.discrepancyPct;
        stage.discrepancy_status = cross.status;
      } else {
        stage.output_weight_kg = Number(data.measuredOutputWeightKg);
      }
    }

    this.logActivity(data.userId, 'EMPLOYEE_FLOOR_MEASUREMENT', 'TASK', taskId, {
      measured_weight: data.measuredOutputWeightKg,
      scrap_weight: data.wasteScrapWeightKg,
      scale: data.scaleId,
    });

    // Auto-advance stage and generate downstream department task so process does not lag
    let advanceMsg = '';
    if (task.production_stage_log_id) {
      const adv = this.autoAdvanceStageAndCreateNextTask(
        task.production_stage_log_id,
        data.userId,
        Number(data.measuredOutputWeightKg)
      );
      if (adv.success) {
        advanceMsg = ` ${adv.message}`;
      }
    }

    this.saveState();
    return {
      success: true,
      message: `Floor measurement of ${data.measuredOutputWeightKg} kg recorded on ${data.scaleId || 'Scale'}. Task completed!${advanceMsg}`,
      task,
    };
  }

  // Universal Task Details Editor: Edit all fields and completed tasks anytime
  public updateTaskDetails(
    taskId: string,
    updates: Partial<Task>,
    updatedBy: string
  ): { success: boolean; message: string; task?: Task } {
    const task = this.state.tasks.find((t) => t.id === taskId);
    if (!task) return { success: false, message: 'Task not found.' };

    if (updates.specification !== undefined) task.specification = updates.specification.trim();
    if (updates.assigned_to !== undefined) {
      task.assigned_to = updates.assigned_to;
      const emp = this.state.users.find((u) => u.id === updates.assigned_to);
      if (emp) task.assigned_to_name = emp.full_name;
    }
    if (updates.department_id !== undefined) {
      task.department_id = updates.department_id;
      const dept = this.state.departments.find((d) => d.id === updates.department_id);
      if (dept) task.department_name = dept.name;
    }
    if (updates.expected_completion_date !== undefined) task.expected_completion_date = updates.expected_completion_date;
    if (updates.notes !== undefined) task.notes = updates.notes;
    if (updates.employee_notes !== undefined) task.employee_notes = updates.employee_notes;
    if (updates.status !== undefined) task.status = updates.status;
    if (updates.manager_assigned_weight_kg !== undefined) {
      task.manager_assigned_weight_kg = Number(updates.manager_assigned_weight_kg);
    }
    if (updates.employee_measured_output_weight_kg !== undefined) {
      task.employee_measured_output_weight_kg = Number(updates.employee_measured_output_weight_kg);
    }
    if (updates.employee_waste_scrap_weight_kg !== undefined) {
      task.employee_waste_scrap_weight_kg = Number(updates.employee_waste_scrap_weight_kg);
    }
    if (updates.employee_piece_count !== undefined) {
      task.employee_piece_count = Number(updates.employee_piece_count);
    }
    if (updates.machine_scale_id !== undefined) {
      task.machine_scale_id = updates.machine_scale_id;
    }

    // Recompute discrepancy if target & actual exist
    const targetW = task.manager_assigned_weight_kg || 0;
    const actualW = task.employee_measured_output_weight_kg || 0;
    if (targetW > 0 && actualW > 0) {
      const cross = verifyFloorWeights(actualW, targetW);
      task.weight_discrepancy_kg = cross.discrepancyKg;
      task.weight_discrepancy_pct = cross.discrepancyPct;
      task.discrepancy_status = cross.status;
    }

    this.logActivity(updatedBy, 'UPDATE_TASK_DETAILS', 'TASK', taskId, updates);
    this.saveState();
    return { success: true, message: 'Task updated successfully.', task };
  }

  // Automated Stage Progression & Next-Department Task Generator
  public autoAdvanceStageAndCreateNextTask(
    completedStageLogId: string,
    performedByUserId: string,
    outputWeightKg?: number
  ): { success: boolean; message: string; nextTask?: Task } {
    const stage = this.state.stageLogs.find((s) => s.id === completedStageLogId);
    if (!stage) return { success: false, message: 'Stage log not found.' };

    if (outputWeightKg !== undefined && outputWeightKg > 0) {
      stage.output_weight_kg = Number(outputWeightKg);
      if (stage.input_weight_kg > 0) {
        const loss = computeStageLoss(
          stage.stage_name,
          stage.input_weight_kg,
          stage.output_weight_kg,
          DEFAULT_BLENDED_FABRIC_COST_PER_KG
        );
        stage.loss_kg = loss.lossKg;
        stage.loss_pct = loss.lossPct;
        stage.loss_value = loss.lossValue;
      }
    }

    stage.status = 'done';
    stage.completed_at = new Date().toISOString();
    stage.completed_by = performedByUserId;

    const run = this.state.productionRuns.find((r) => r.id === stage.production_run_id);
    if (!run) return { success: true, message: 'Stage marked complete.' };

    const stageLogs = this.state.stageLogs
      .filter((s) => s.production_run_id === run.id)
      .sort((a, b) => a.stage_order - b.stage_order);

    const currIdx = stageLogs.findIndex((s) => s.id === stage.id);
    if (currIdx !== -1 && currIdx + 1 < stageLogs.length) {
      const nextStage = stageLogs[currIdx + 1];
      nextStage.status = 'in_progress';
      nextStage.started_at = new Date().toISOString();
      if (nextStage.input_weight_kg === 0) {
        nextStage.input_weight_kg = stage.output_weight_kg || 80;
      }
      run.current_stage_order = nextStage.stage_order;
      run.current_stage_name = nextStage.stage_name;

      // Find department for nextStage safely
      const nextDeptName = nextStage.department_name || '';
      const nextDept =
        this.state.departments.find(
          (d) =>
            (nextDeptName && d.name.toLowerCase() === nextDeptName.toLowerCase()) ||
            d.stage_type.toLowerCase() === nextStage.stage_name.toLowerCase() ||
            (nextDeptName && nextDeptName.toLowerCase().includes(d.name.toLowerCase()))
        ) || this.state.departments[0];

      let nextTask = this.state.tasks.find((t) => t.production_stage_log_id === nextStage.id);
      if (!nextTask) {
        const userObj = this.state.users.find((u) => u.id === performedByUserId);
        nextTask = {
          id: `task-${Date.now()}-${nextStage.stage_order}`,
          production_stage_log_id: nextStage.id,
          stage_name: nextStage.stage_name,
          style_number: run.style_number,
          department_id: nextDept.id,
          department_name: nextDept.name,
          assigned_to: performedByUserId,
          assigned_to_name: userObj?.full_name || 'Floor Staff',
          created_by: performedByUserId,
          specification: `Stage ${nextStage.stage_order}: Process ${nextStage.input_weight_kg || 80} kg in ${nextStage.stage_name} for Style #${run.style_number}. Floor handoff verified.`,
          status: 'in_progress',
          expected_completion_date: new Date(Date.now() + 2 * 86400000).toISOString().split('T')[0],
          manager_assigned_weight_kg: nextStage.input_weight_kg || 80,
          created_at: new Date().toISOString(),
        };
        this.state.tasks.unshift(nextTask);
      }

      this.logActivity(performedByUserId, 'STAGE_ADVANCED', 'PRODUCTION_RUN', run.id, {
        completed_stage: stage.stage_name,
        next_stage: nextStage.stage_name,
        stage_order: `${nextStage.stage_order} of ${stageLogs.length}`,
      });

      this.saveState();
      return {
        success: true,
        message: `Advanced from Stage ${stage.stage_order} ("${stage.stage_name}") to Stage ${nextStage.stage_order} ("${nextStage.stage_name}"). Next task assigned to ${nextDept.name}!`,
        nextTask,
      };
    } else {
      // Reached the very end of ALL stages -> Dispatch Ready
      run.status = 'completed';
      run.completed_at = new Date().toISOString();

      const style = this.state.styles.find((s) => s.id === run.style_id);
      if (style) style.status = 'dispatch_ready';

      const existingDispatch = this.state.dispatchRecords.find((d) => d.production_run_id === run.id);
      if (!existingDispatch) {
        this.state.dispatchRecords.unshift({
          id: `disp-${Date.now()}`,
          production_run_id: run.id,
          style_id: run.style_id,
          style_number: run.style_number,
          offer_no: style?.offer_no,
          transport_cost: 0,
          fob_value: 0,
          forwarding_cost: 0,
          dispatch_date: new Date().toISOString().split('T')[0],
          status: 'pending',
          created_at: new Date().toISOString(),
        });
      }

      this.logActivity(performedByUserId, 'PIPELINE_COMPLETED', 'PRODUCTION_RUN', run.id, {
        style_number: run.style_number,
        total_stages: stageLogs.length,
      });

      this.saveState();
      return {
        success: true,
        message: `All ${stageLogs.length} pipeline stages completed! Style ${run.style_number} is now DISPATCH READY.`,
      };
    }
  }

  // Section 6.2: Stage Advancement (Allowed for Owner, Manager, or Floor Operations)
  public advanceStage(
    runId: string,
    completedStageLogId: string,
    advancedBy: string
  ): { success: boolean; message: string } {
    const user = this.state.users.find((u) => u.id === advancedBy);
    if (!user) {
      return { success: false, message: 'User profile not found.' };
    }

    const run = this.state.productionRuns.find((r) => r.id === runId);
    if (!run) return { success: false, message: 'Production run not found.' };

    const stage = this.state.stageLogs.find((s) => s.id === completedStageLogId);
    if (!stage) return { success: false, message: 'Stage log not found.' };

    const outputWeight = stage.output_weight_kg > 0 ? stage.output_weight_kg : stage.input_weight_kg || 80;
    return this.autoAdvanceStageAndCreateNextTask(completedStageLogId, advancedBy, outputWeight);
  }

  // Synchronize Production Run & Style Status based on 15 Pipeline Stages
  public syncProductionRunStatus(runId: string): {
    run: ProductionRun;
    allDone: boolean;
    completedStages: number;
    totalStages: number;
    currentStageName: string;
    canDispatch: boolean;
  } | null {
    const run = this.state.productionRuns.find((r) => r.id === runId);
    if (!run) return null;

    const runStages = this.state.stageLogs
      .filter((s) => s.production_run_id === runId)
      .sort((a, b) => a.stage_order - b.stage_order);

    if (runStages.length === 0) return null;

    const completedStages = runStages.filter((s) => s.status === 'done').length;
    const totalStages = runStages.length;
    const allDone = completedStages === totalStages;

    const activeOrFirstPending =
      runStages.find((s) => s.status === 'in_progress') ||
      runStages.find((s) => s.status === 'pending') ||
      runStages[runStages.length - 1];

    run.current_stage_order = activeOrFirstPending.stage_order;
    run.current_stage_name = activeOrFirstPending.stage_name;

    const style = this.state.styles.find((s) => s.id === run.style_id);
    const existingDispatch = this.state.dispatchRecords.find(
      (d) => d.production_run_id === run.id || (run.style_number && d.style_number === run.style_number)
    );

    if (allDone) {
      run.status = 'completed';
      if (!run.completed_at) run.completed_at = new Date().toISOString();
      if (style) {
        if (existingDispatch?.status === 'delivered') {
          style.status = 'completed';
        } else if (existingDispatch?.status === 'dispatched') {
          style.status = 'dispatched' as any;
        } else {
          style.status = 'dispatch_ready';
        }
      }
    } else {
      run.status = 'in_progress';
      if (style && style.status !== 'completed' && style.status !== 'dispatch_ready') {
        style.status = 'bulk_production';
      }
    }

    return {
      run,
      allDone,
      completedStages,
      totalStages,
      currentStageName: activeOrFirstPending.stage_name,
      canDispatch: allDone && (!existingDispatch || existingDispatch.status === 'pending'),
    };
  }

  public syncAllProductionRuns() {
    this.state.productionRuns.forEach((r) => {
      this.syncProductionRunStatus(r.id);
    });
  }

  // Section 6.2 Enhancement: Parallel & Batch Stage Progression
  // Allows any stage to be set to in_progress or done independently for parallel operations
  public setStageStatus(
    stageLogId: string,
    status: 'pending' | 'in_progress' | 'done',
    updatedBy: string
  ): { success: boolean; message: string; stageLog?: ProductionStageLog } {
    const stage = this.state.stageLogs.find((s) => s.id === stageLogId);
    if (!stage) return { success: false, message: 'Stage log not found.' };

    stage.status = status;
    if (status === 'in_progress' && !stage.started_at) {
      stage.started_at = new Date().toISOString();
    }
    if (status === 'done') {
      stage.completed_at = new Date().toISOString();
      stage.completed_by = updatedBy;
    }

    // Auto-sync run & style status when stages change
    this.syncProductionRunStatus(stage.production_run_id);

    this.logActivity(updatedBy, 'STAGE_STATUS_UPDATED', 'STAGE_LOG', stageLogId, {
      stage_name: stage.stage_name,
      new_status: status,
    });
    this.saveState();
    return {
      success: true,
      message: `Stage #${stage.stage_order} ("${stage.stage_name}") status set to ${status.toUpperCase()}.`,
      stageLog: stage,
    };
  }

  // Pass Batch to Downstream Stage with complete Batch Traveler & Timestamp tracking
  public passBatchToNextStage(
    currentStageLogId: string,
    batchWeightKg: number,
    passedBy: string,
    batchNotes?: string
  ): { success: boolean; message: string; nextStageName?: string; batch?: BatchTransfer } {
    const stage = this.state.stageLogs.find((s) => s.id === currentStageLogId);
    if (!stage) return { success: false, message: 'Current stage not found.' };

    const runStages = this.state.stageLogs
      .filter((s) => s.production_run_id === stage.production_run_id)
      .sort((a, b) => a.stage_order - b.stage_order);

    const currentIdx = runStages.findIndex((s) => s.id === currentStageLogId);
    if (currentIdx === -1 || currentIdx + 1 >= runStages.length) {
      return { success: false, message: 'No downstream stage available to pass batch to.' };
    }

    const nextStage = runStages[currentIdx + 1];

    if (!this.state.batchTransfers) this.state.batchTransfers = [];
    if (!stage.batches_passed) stage.batches_passed = [];
    if (!nextStage.batches_received) nextStage.batches_received = [];

    const batchNumber = stage.batches_passed.length + 1;
    const now = new Date();
    const movedAtIso = now.toISOString();
    const movedAtTime = now.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    const userObj = this.state.users.find((u) => u.id === passedBy);
    const movedByName = userObj?.full_name || 'Production Operator';

    const batchTransfer: BatchTransfer = {
      id: `batch-${Date.now()}-${batchNumber}`,
      production_run_id: stage.production_run_id,
      batch_number: batchNumber,
      from_stage_id: stage.id,
      from_stage_name: stage.stage_name,
      from_stage_order: stage.stage_order,
      to_stage_id: nextStage.id,
      to_stage_name: nextStage.stage_name,
      to_stage_order: nextStage.stage_order,
      weight_kg: Number(batchWeightKg.toFixed(2)),
      moved_at: movedAtIso,
      moved_at_time: movedAtTime,
      moved_by_id: passedBy,
      moved_by_name: movedByName,
      notes: batchNotes || `Batch #${batchNumber} parallel routing`,
    };

    this.state.batchTransfers.push(batchTransfer);
    stage.batches_passed.push(batchTransfer);
    nextStage.batches_received.push(batchTransfer);

    // Downstream stage becomes active in parallel!
    nextStage.status = 'in_progress';
    if (!nextStage.started_at) nextStage.started_at = movedAtIso;

    // Accumulate or set input weight in downstream stage
    nextStage.input_weight_kg = Number(((nextStage.input_weight_kg || 0) + batchWeightKg).toFixed(2));

    // Current stage remains IN_PROGRESS for continuous parallel batch processing
    stage.status = 'in_progress';
    const noteEntry = `Batch #${batchNumber} (${batchWeightKg}kg) moved to Stage ${nextStage.stage_order} (${nextStage.stage_name}) at ${movedAtTime}.`;
    stage.notes = stage.notes ? `${stage.notes} | ${noteEntry}` : noteEntry;

    const totalBatchesPassed = stage.batches_passed.length;
    const totalWeightPassed = stage.batches_passed.reduce((sum, b) => sum + b.weight_kg, 0);

    this.syncProductionRunStatus(stage.production_run_id);

    this.logActivity(passedBy, 'BATCH_PASSED_PARALLEL', 'STAGE_LOG', currentStageLogId, {
      batch_number: batchNumber,
      from_stage: stage.stage_name,
      to_stage: nextStage.stage_name,
      batch_weight_kg: batchWeightKg,
      moved_at_time: movedAtTime,
      total_batches_moved: totalBatchesPassed,
      total_weight_moved_kg: totalWeightPassed,
    });

    this.saveState();
    return {
      success: true,
      message: `Batch #${batchNumber} (${batchWeightKg} kg) moved to Stage ${nextStage.stage_order} ("${nextStage.stage_name}") at ${movedAtTime}. Total batches moved: ${totalBatchesPassed} (${totalWeightPassed.toFixed(1)} kg). Both stages active in parallel!`,
      nextStageName: nextStage.stage_name,
      batch: batchTransfer,
    };
  }

  // Get Batch Transfers Ledger (Filtered by run or stage)
  public getBatchTransfers(runId?: string, stageLogId?: string): BatchTransfer[] {
    let list = this.state.batchTransfers || [];
    if (runId) list = list.filter((b) => b.production_run_id === runId);
    if (stageLogId) {
      list = list.filter((b) => b.from_stage_id === stageLogId || b.to_stage_id === stageLogId);
    }
    return list;
  }

  // Tasks & Bottlenecks (Accessible across all departments for collaborative floor operations)
  public getTasks(user: Profile): Task[] {
    return this.state.tasks;
  }

  public createTask(
    taskData: {
      production_stage_log_id: string;
      department_id: string;
      assigned_to: string;
      specification: string;
      expected_completion_date: string;
      manager_assigned_weight_kg?: number;
      notes?: string;
    },
    createdBy: string
  ): Task {
    const stage = this.state.stageLogs.find((s) => s.id === taskData.production_stage_log_id);
    const run = this.state.productionRuns.find((r) => r.id === stage?.production_run_id);
    const dept = this.state.departments.find((d) => d.id === taskData.department_id);
    const employee = this.state.users.find((u) => u.id === taskData.assigned_to);

    const newTask: Task = {
      id: `task-${Date.now()}`,
      production_stage_log_id: taskData.production_stage_log_id,
      stage_name: stage?.stage_name || 'Production',
      style_number: run?.style_number,
      department_id: taskData.department_id,
      department_name: dept?.name || 'Department',
      assigned_to: taskData.assigned_to,
      assigned_to_name: employee?.full_name || 'Staff',
      created_by: createdBy,
      specification: taskData.specification,
      status: 'pending',
      expected_completion_date: taskData.expected_completion_date,
      manager_assigned_weight_kg: taskData.manager_assigned_weight_kg || stage?.input_weight_kg || 0,
      notes: taskData.notes,
      created_at: new Date().toISOString(),
    };

    this.state.tasks.unshift(newTask);
    this.logActivity(createdBy, 'CREATE_TASK', 'TASK', newTask.id, {
      assigned_to: employee?.full_name,
      dept: dept?.name,
    });

    this.saveState();
    return newTask;
  }

  public updateTaskStatus(
    taskId: string,
    status: 'pending' | 'in_progress' | 'completed',
    updatedBy: string
  ): { success: boolean; task?: Task } {
    const task = this.state.tasks.find((t) => t.id === taskId);
    if (!task) return { success: false };

    task.status = status;
    if (status === 'completed') {
      const today = new Date();
      task.actual_completion_date = today.toISOString().split('T')[0];
      const createdDate = new Date(task.created_at);
      const diffTime = Math.abs(today.getTime() - createdDate.getTime());
      task.actual_days_taken = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));

      // Auto-advance stage and cascade to next department task
      if (task.production_stage_log_id) {
        this.autoAdvanceStageAndCreateNextTask(
          task.production_stage_log_id,
          updatedBy,
          task.employee_measured_output_weight_kg || task.manager_assigned_weight_kg || 80
        );
      }
    }

    this.logActivity(updatedBy, 'TASK_STATUS_UPDATED', 'TASK', taskId, {
      status,
      actual_days_taken: task.actual_days_taken,
    });

    this.saveState();
    return { success: true, task };
  }

  // Chat & Structured Mentions
  public getChannelsForUser(user: Profile): ChatChannel[] {
    return this.state.channels.filter((c) => {
      if (c.type === 'common') return true;
      if (c.type === 'owner_manager') return user.role === 'owner' || user.role === 'manager';
      if (c.type === 'owner_employee') {
        return user.role === 'owner' || c.participant_b_id === user.id;
      }
      if (c.type === 'manager_employee') {
        return user.role === 'manager' || c.participant_b_id === user.id;
      }
      return false;
    });
  }

  public getMessagesForChannel(channelId: string): ChatMessage[] {
    return this.state.messages.filter((m) => m.channel_id === channelId);
  }

  public sendChatMessage(
    channelId: string,
    senderId: string,
    body: string,
    taggedStyleId?: string,
    taggedUserId?: string
  ): ChatMessage {
    const sender = this.state.users.find((u) => u.id === senderId);
    const style = taggedStyleId ? this.state.styles.find((s) => s.id === taggedStyleId) : undefined;
    const taggedUser = taggedUserId ? this.state.users.find((u) => u.id === taggedUserId) : undefined;

    const newMsg: ChatMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      channel_id: channelId,
      sender_id: senderId,
      sender_name: sender?.full_name || 'User',
      sender_role: sender?.role || 'employee',
      body,
      tagged_style_id: taggedStyleId,
      tagged_style_number: style?.style_number,
      tagged_user_id: taggedUserId,
      tagged_user_name: taggedUser?.full_name,
      created_at: new Date().toISOString(),
    };

    this.state.messages.push(newMsg);

    const channel = this.state.channels.find((c) => c.id === channelId);
    if (channel) {
      channel.last_message = body;
      channel.last_message_at = newMsg.created_at;
    }

    this.saveState();
    return newMsg;
  }

  // Dispatch
  public getDispatchRecords(userRole: UserRole): DispatchRecord[] {
    if (userRole === 'employee') return [];
    return this.state.dispatchRecords.map((d) => {
      const payment = this.state.paymentRecords.find((p) => p.dispatch_id === d.id);
      return { ...d, payment };
    });
  }

  public saveDispatchRecord(
    record: Omit<DispatchRecord, 'id' | 'created_at'>,
    savedBy: string
  ): DispatchRecord {
    // Check if dispatch already exists for this production run to prevent confusing duplicate rows
    const existing = this.state.dispatchRecords.find(
      (d) => d.production_run_id === record.production_run_id
    );
    if (existing) {
      Object.assign(existing, record);
      if (record.production_run_id) {
        this.syncProductionRunStatus(record.production_run_id);
      }
      this.saveState();
      return existing;
    }

    const newRecord: DispatchRecord = {
      id: `disp-${Date.now()}`,
      ...record,
      created_at: new Date().toISOString(),
    };
    this.state.dispatchRecords.unshift(newRecord);

    const style = this.state.styles.find((s) => s.id === record.style_id);
    if (style) {
      style.status = record.status === 'delivered' ? 'completed' : 'dispatch_ready';
    }
    if (record.production_run_id) {
      this.syncProductionRunStatus(record.production_run_id);
    }

    this.logActivity(savedBy, 'CREATE_DISPATCH', 'DISPATCH', newRecord.id, {
      style_number: record.style_number,
      fob_value: record.fob_value,
    });
    this.saveState();
    return newRecord;
  }

  public updateDispatchRecord(id: string, updates: Partial<DispatchRecord>): DispatchRecord | null {
    const disp = this.state.dispatchRecords.find((d) => d.id === id);
    if (!disp) return null;
    Object.assign(disp, updates);

    // Update style status when dispatch moves to dispatched or delivered
    const style = this.state.styles.find((s) => s.id === disp.style_id);
    if (style) {
      if (updates.status === 'delivered') {
        style.status = 'completed';
      } else if (updates.status === 'dispatched') {
        style.status = 'dispatched' as any;
      }
    }

    if (disp.production_run_id) {
      this.syncProductionRunStatus(disp.production_run_id);
    }

    this.saveState();
    return disp;
  }

  // Payments
  public getPaymentRecords(userRole: UserRole): PaymentRecord[] {
    if (userRole === 'employee') return [];
    return this.state.paymentRecords;
  }

  public recordPayment(
    data: {
      dispatch_id: string;
      style_id: string;
      bank_name: string;
      transaction_id: string;
      amount_transferred: number;
      bank_charges: number;
      payment_date: string;
      status: 'pending' | 'received' | 'reconciled';
      notes?: string;
    },
    recordedBy: string
  ): PaymentRecord {
    const netReceived = Number((data.amount_transferred - (data.bank_charges || 0)).toFixed(2));
    const style = this.state.styles.find((s) => s.id === data.style_id);

    const payment: PaymentRecord = {
      id: `payrec-${Date.now()}`,
      ...data,
      style_number: style?.style_number,
      net_received: netReceived,
      created_at: new Date().toISOString(),
    };

    this.state.paymentRecords.unshift(payment);
    this.logActivity(recordedBy, 'RECORD_PAYMENT', 'PAYMENT', payment.id, {
      amount: data.amount_transferred,
      transaction_id: data.transaction_id,
    });

    this.saveState();
    return payment;
  }

  public updatePaymentRecord(
    id: string,
    updates: Partial<PaymentRecord>,
    updatedBy: string
  ): PaymentRecord | null {
    const pay = this.state.paymentRecords.find((p) => p.id === id);
    if (!pay) return null;
    Object.assign(pay, updates);
    if (pay.amount_transferred !== undefined && pay.bank_charges !== undefined) {
      pay.net_received = Number((pay.amount_transferred - (pay.bank_charges || 0)).toFixed(2));
    }
    this.logActivity(updatedBy, 'UPDATE_PAYMENT', 'PAYMENT', id, updates);
    this.saveState();
    return pay;
  }

  // Payroll
  public getPayrollEntries(userRole: UserRole): PayrollEntry[] {
    if (userRole === 'employee') return [];
    return this.state.payrollEntries;
  }

  public updateEmployeeSalary(
    userId: string,
    newSalary: number,
    incrementNote: string,
    updatedBy: string
  ): { success: boolean; message: string } {
    const entry = this.state.payrollEntries.find((p) => p.user_id === userId);
    const profile = this.state.users.find((u) => u.id === userId);
    if (!entry || !profile) return { success: false, message: 'Employee payroll record not found.' };

    const increment = {
      date: new Date().toISOString().split('T')[0],
      new_salary: Number(newSalary),
      note: incrementNote || 'Annual increment',
    };

    entry.base_salary = Number(newSalary);
    entry.increment_history.push(increment);
    entry.updated_at = new Date().toISOString();

    profile.base_salary = Number(newSalary);
    profile.increment_history.push(increment);

    this.logActivity(updatedBy, 'PAYROLL_INCREMENT', 'PAYROLL', entry.id, {
      employee: profile.full_name,
      newSalary,
      incrementNote,
    });

    this.saveState();
    return { success: true, message: `Salary updated to ₹${newSalary} for ${profile.full_name}.` };
  }

  public generateMonthlyPayrollRun(monthYear: string, generatedBy: string): MonthlyPayrollRun {
    const activeStaff = this.state.users.filter((u) => u.active);
    const snapshots = activeStaff.map((u) => ({
      user_id: u.id,
      full_name: u.full_name,
      department_name: u.department_name || (u.role === 'owner' ? 'Executive' : 'Operations'),
      role: u.role,
      salary: u.base_salary,
    }));

    const totalAmount = snapshots.reduce((sum, s) => sum + s.salary, 0);

    const existingIdx = this.state.monthlyPayrollRuns.findIndex((r) => r.month_year === monthYear);
    const run: MonthlyPayrollRun = {
      id: existingIdx !== -1 ? this.state.monthlyPayrollRuns[existingIdx].id : `mrun-${Date.now()}`,
      org_id: '00000000-0000-0000-0000-000000000001',
      month_year: monthYear,
      total_payroll_amount: totalAmount,
      employee_snapshots: snapshots,
      status: 'approved',
      approved_by: generatedBy,
      approved_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    };

    if (existingIdx !== -1) {
      this.state.monthlyPayrollRuns[existingIdx] = run;
    } else {
      this.state.monthlyPayrollRuns.unshift(run);
    }

    this.logActivity(generatedBy, 'GENERATE_MONTHLY_PAYROLL', 'PAYROLL_RUN', run.id, {
      monthYear,
      totalAmount,
    });

    this.saveState();
    return run;
  }

  public getMonthlyPayrollRuns(userRole: UserRole): MonthlyPayrollRun[] {
    if (userRole === 'employee') return [];
    return this.state.monthlyPayrollRuns;
  }
}
