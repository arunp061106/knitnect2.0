import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://chbwrpasfuschpcavxdl.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNoYndycGFzZnVzY2hwY2F2eGRsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA5MjQzMzIsImV4cCI6MjEwNjUwMDMzMn0.zaXbdwlaiu02LC4DfY305_UEuR03kWPUbMITZx0mpUo';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function seed() {
  console.log('1. Authenticating as Owner (owner@knitnect.com)...');
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: 'owner@knitnect.com',
    password: 'Knitnect2026!',
  });

  if (authError || !authData.user) {
    console.error('Auth error:', authError);
    process.exit(1);
  }
  console.log('   Authenticated successfully as', authData.user.email);

  const orgId = '00000000-0000-0000-0000-000000000001';
  const ownerId = authData.user.id;
  const managerId = '30000000-0000-0000-0000-000000000002';
  const employeeId = '30000000-0000-0000-0000-000000000003';
  const styleId = '50000000-0000-0000-0000-000000000001';
  const runId = '60000000-0000-0000-0000-000000000001';
  const dispatchId = '90000000-0000-0000-0000-000000000001';

  console.log('2. Upserting Style: Offer 9414 (KB13P301X1)...');
  const { error: styleErr } = await supabase.from('styles').upsert({
    id: styleId,
    org_id: orgId,
    style_number: 'KB13P301X1',
    season: 'W28',
    offer_no: '9414',
    description: 'RIN | JOGGING PANTS',
    garment_category: 'Mens',
    garment_season_type: 'Winter',
    garment_process_type: 'solid_fabric',
    status: 'sample_production',
    created_by: ownerId,
  });
  if (styleErr) console.error('Style error:', styleErr);
  else console.log('   Style ready.');

  console.log('3. Upserting Style Fabrics...');
  const fabrics = [
    {
      id: 'a0000000-0000-0000-0000-000000000001',
      style_id: styleId,
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
      wastage_pct: 5.0,
    },
    {
      id: 'a0000000-0000-0000-0000-000000000002',
      style_id: styleId,
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
      wastage_pct: 5.0,
    },
    {
      id: 'a0000000-0000-0000-0000-000000000003',
      style_id: styleId,
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
      wastage_pct: 5.0,
    },
  ];
  for (const f of fabrics) {
    const { error: fErr } = await supabase.from('style_fabrics').upsert(f);
    if (fErr) console.error('Fabric error:', fErr);
  }
  console.log('   Fabrics ready.');

  console.log('4. Upserting Lab Dips...');
  const labDips = [
    {
      id: 'b0000000-0000-0000-0000-000000000001',
      style_id: styleId,
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
    },
    {
      id: 'b0000000-0000-0000-0000-000000000002',
      style_id: styleId,
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
    },
  ];
  for (const ld of labDips) {
    const { error: ldErr } = await supabase.from('lab_dips').upsert(ld);
    if (ldErr) console.error('Lab dip error:', ldErr);
  }
  console.log('   Lab dips ready.');

  console.log('5. Upserting Costing Sheet...');
  const { error: costErr } = await supabase.from('costing_sheets').upsert({
    id: 'c0000000-0000-0000-0000-000000000001',
    style_id: styleId,
    sample_qty: 500,
    bulk_target_qty: 5000,
    calculated_bulk_fabric_req_kg: 1750.0,
    calculated_bulk_yarn_cost: 560210.0,
    calculated_processing_cost: 195750.0,
    calculated_total_garment_cost: 755960.0,
    quoted_price: 151.19,
    final_price_approved_by: ownerId,
    approved_at: new Date().toISOString(),
    approved_price: 151.19,
    approval_notes: 'Approved per Offer 9414 confirmed buyer tech pack',
  });
  if (costErr) console.error('Costing error:', costErr);
  else console.log('   Costing sheet ready.');

  console.log('6. Upserting Production Run...');
  const { error: runErr } = await supabase.from('production_runs').upsert({
    id: runId,
    style_id: styleId,
    org_id: orgId,
    run_type: 'sample',
    current_stage_order: 7,
    current_stage_name: 'Cutting',
    status: 'in_progress',
    target_qty: 500,
    blended_cost_per_kg: 431.98,
  });
  if (runErr) console.error('Run error:', runErr);
  else console.log('   Production run ready.');

  console.log('7. Upserting All 15 Production Stage Logs...');
  const stages = [
    { id: '70000000-0000-0000-0000-000000000001', stage_name: 'Yarn Buying', stage_order: 1, department_id: '10000000-0000-0000-0000-000000000001', input_weight_kg: 100.0, output_weight_kg: 99.5, loss_kg: 0.5, loss_pct: 0.5, loss_value: 215.99, assigned_to: ownerId, status: 'done' },
    { id: '70000000-0000-0000-0000-000000000002', stage_name: 'Knitting', stage_order: 2, department_id: '10000000-0000-0000-0000-000000000001', input_weight_kg: 99.5, output_weight_kg: 96.0, loss_kg: 3.5, loss_pct: 3.52, loss_value: 1511.93, assigned_to: managerId, status: 'done' },
    { id: '70000000-0000-0000-0000-000000000003', stage_name: 'Dyeing', stage_order: 3, department_id: '10000000-0000-0000-0000-000000000002', input_weight_kg: 96.0, output_weight_kg: 92.0, loss_kg: 4.0, loss_pct: 4.17, loss_value: 1727.92, assigned_to: managerId, status: 'done' },
    { id: '70000000-0000-0000-0000-000000000004', stage_name: 'Heat Setting', stage_order: 4, department_id: '10000000-0000-0000-0000-000000000002', input_weight_kg: 92.0, output_weight_kg: 90.5, loss_kg: 1.5, loss_pct: 1.63, loss_value: 647.97, assigned_to: managerId, status: 'done' },
    { id: '70000000-0000-0000-0000-000000000005', stage_name: 'Finishing & Compacting / Stenter', stage_order: 5, department_id: '10000000-0000-0000-0000-000000000002', input_weight_kg: 90.5, output_weight_kg: 88.5, loss_kg: 2.0, loss_pct: 2.21, loss_value: 863.96, assigned_to: managerId, status: 'done' },
    { id: '70000000-0000-0000-0000-000000000006', stage_name: 'Brushing & Sueding', stage_order: 6, department_id: '10000000-0000-0000-0000-000000000002', input_weight_kg: 88.5, output_weight_kg: 84.0, loss_kg: 4.5, loss_pct: 5.08, loss_value: 1943.91, assigned_to: managerId, status: 'done' },
    { id: '70000000-0000-0000-0000-000000000007', stage_name: 'Cutting', stage_order: 7, department_id: '10000000-0000-0000-0000-000000000003', input_weight_kg: 84.0, output_weight_kg: 76.0, loss_kg: 8.0, loss_pct: 9.52, loss_value: 3455.84, assigned_to: employeeId, status: 'in_progress', notes: 'Floor measurements confirmed by Murugan; bundle count 500 pcs.' },
    { id: '70000000-0000-0000-0000-000000000008', stage_name: 'Embroidery', stage_order: 8, department_id: '10000000-0000-0000-0000-000000000003', input_weight_kg: 0.0, output_weight_kg: 0.0, loss_kg: 0.0, loss_pct: 0.0, loss_value: 0.0, assigned_to: null, status: 'pending' },
    { id: '70000000-0000-0000-0000-000000000009', stage_name: 'Printing', stage_order: 9, department_id: '10000000-0000-0000-0000-000000000003', input_weight_kg: 0.0, output_weight_kg: 0.0, loss_kg: 0.0, loss_pct: 0.0, loss_value: 0.0, assigned_to: null, status: 'pending' },
    { id: '70000000-0000-0000-0000-000000000010', stage_name: 'Sewing', stage_order: 10, department_id: '10000000-0000-0000-0000-000000000004', input_weight_kg: 0.0, output_weight_kg: 0.0, loss_kg: 0.0, loss_pct: 0.0, loss_value: 0.0, assigned_to: null, status: 'pending' },
    { id: '70000000-0000-0000-0000-000000000011', stage_name: 'Trimming', stage_order: 11, department_id: '10000000-0000-0000-0000-000000000004', input_weight_kg: 0.0, output_weight_kg: 0.0, loss_kg: 0.0, loss_pct: 0.0, loss_value: 0.0, assigned_to: null, status: 'pending' },
    { id: '70000000-0000-0000-0000-000000000012', stage_name: 'Checking', stage_order: 12, department_id: '10000000-0000-0000-0000-000000000005', input_weight_kg: 0.0, output_weight_kg: 0.0, loss_kg: 0.0, loss_pct: 0.0, loss_value: 0.0, assigned_to: null, status: 'pending' },
    { id: '70000000-0000-0000-0000-000000000013', stage_name: 'Finishing', stage_order: 13, department_id: '10000000-0000-0000-0000-000000000006', input_weight_kg: 0.0, output_weight_kg: 0.0, loss_kg: 0.0, loss_pct: 0.0, loss_value: 0.0, assigned_to: null, status: 'pending' },
    { id: '70000000-0000-0000-0000-000000000014', stage_name: 'Ironing', stage_order: 14, department_id: '10000000-0000-0000-0000-000000000006', input_weight_kg: 0.0, output_weight_kg: 0.0, loss_kg: 0.0, loss_pct: 0.0, loss_value: 0.0, assigned_to: null, status: 'pending' },
    { id: '70000000-0000-0000-0000-000000000015', stage_name: 'Packing', stage_order: 15, department_id: '10000000-0000-0000-0000-000000000006', input_weight_kg: 0.0, output_weight_kg: 0.0, loss_kg: 0.0, loss_pct: 0.0, loss_value: 0.0, assigned_to: null, status: 'pending' },
  ];

  for (const stg of stages) {
    const { error: sErr } = await supabase.from('production_stage_logs').upsert({
      ...stg,
      production_run_id: runId,
    });
    if (sErr) console.error(`Stage ${stg.stage_order} error:`, sErr);
  }
  console.log('   All 15 stages ready.');

  console.log('8. Upserting Tasks...');
  const { error: taskErr } = await supabase.from('tasks').upsert({
    id: '80000000-0000-0000-0000-000000000001',
    production_stage_log_id: '70000000-0000-0000-0000-000000000007',
    department_id: '10000000-0000-0000-0000-000000000003',
    assigned_to: employeeId,
    created_by: managerId,
    specification: 'Cut 500 pcs jogger panels per marker. Weigh cut panels and edge scrap on Table Scale #2.',
    status: 'in_progress',
    expected_completion_date: '2026-10-05',
    notes: 'Offer 9414 Black Fleece 280 GSM',
  });
  if (taskErr) console.error('Task error:', taskErr);
  else console.log('   Task ready.');

  console.log('9. Payment Record...');
  const { error: pErr } = await supabase.from('payment_records').upsert({
    id: 'd0000000-0000-0000-0000-000000000001',
    style_id: styleId,
    bank_name: 'State Bank of India - Tirupur SME Branch',
    transaction_id: 'TXN-9414-001',
    amount_transferred: 755960.0,
    bank_charges: 5000.0,
    net_received: 750960.0,
    payment_date: new Date().toISOString().split('T')[0],
    status: 'received',
    notes: 'Advance export LC payment for Offer 9414',
  });
  if (pErr) console.error('Payment error:', pErr);
  else console.log('   Payment record ready.');

  console.log('10. Upserting Chat Messages...');
  const messages = [
    {
      id: 'e0000000-0000-0000-0000-000000000001',
      channel_id: '40000000-0000-0000-0000-000000000001',
      sender_id: ownerId,
      sender_name: 'R. Senthil Kumar',
      sender_role: 'owner',
      body: 'Offer 9414 (KB13P301X1) is currently at Cutting. Murugan please confirm Table Scale #2 calibration.',
      tagged_style_id: styleId,
      tagged_style_number: 'KB13P301X1',
      created_at: new Date(Date.now() - 3600000 * 4).toISOString(),
    },
    {
      id: 'e0000000-0000-0000-0000-000000000002',
      channel_id: '40000000-0000-0000-0000-000000000001',
      sender_id: ownerId,
      sender_name: 'R. Senthil Kumar',
      sender_role: 'owner',
      body: 'Scale calibrated. Initial roll weight 84.0 kg loaded onto cutting table.',
      tagged_style_id: styleId,
      tagged_style_number: 'KB13P301X1',
      created_at: new Date(Date.now() - 3600000 * 2).toISOString(),
    },
  ];
  for (const msg of messages) {
    const { error: mErr } = await supabase.from('chat_messages').upsert(msg);
    if (mErr) console.error('Chat error:', mErr);
  }
  console.log('   Chat messages ready.');

  console.log('\n--- ALL PRODUCTION DATA SEEDED TO SUPABASE SUCCESSFULLY! ---');
}

seed().catch(console.error);
