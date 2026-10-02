import fs from 'fs';
import path from 'path';

console.log('============================================================');
console.log('KNITNECT ERP: PHASE 1 MIGRATIONS VERIFICATION SUITE');
console.log('============================================================\n');

function assert(condition: boolean, testName: string, detail?: string) {
  if (!condition) {
    console.error(`❌ FAIL | ${testName}`);
    if (detail) console.error(`   Details: ${detail}`);
    process.exit(1);
  } else {
    console.log(`✅ PASS | ${testName}`);
    if (detail) console.log(`   ${detail}`);
  }
}

const migrationsDir = path.join(process.cwd(), 'supabase', 'migrations');

// Test 1: File presence
const expectedFiles = [
  '001_knitnect_core_erp.sql',
  '002_reset_chat.sql',
  '003_schema_fixes.sql',
  '004_missing_columns.sql',
  '005_rls_tests.sql',
];

for (const file of expectedFiles) {
  const filePath = path.join(migrationsDir, file);
  assert(fs.existsSync(filePath), `Migration file exists: ${file}`, filePath);
}

// Read contents
const m2 = fs.readFileSync(path.join(migrationsDir, '002_reset_chat.sql'), 'utf-8');
const m3 = fs.readFileSync(path.join(migrationsDir, '003_schema_fixes.sql'), 'utf-8');
const m4 = fs.readFileSync(path.join(migrationsDir, '004_missing_columns.sql'), 'utf-8');
const m5 = fs.readFileSync(path.join(migrationsDir, '005_rls_tests.sql'), 'utf-8');

// Test 2: 002_reset_chat.sql drops chat tables
assert(
  m2.includes('DROP TABLE IF EXISTS public.chat_messages CASCADE') &&
  m2.includes('DROP TABLE IF EXISTS public.chat_channels CASCADE'),
  '002_reset_chat.sql drops insecure chat tables with CASCADE'
);

// Test 3: 003_schema_fixes.sql security functions
assert(
  m3.includes('current_user_role()') &&
  m3.includes('current_user_dept()') &&
  m3.includes('is_management()') &&
  m3.includes('is_owner()') &&
  m3.includes('SET search_path = public'),
  '003_schema_fixes.sql defines hardened security definer helper functions'
);

// Test 4: 003_schema_fixes.sql floor view without loss_value
assert(
  m3.includes('CREATE VIEW public.floor_stage_logs') &&
  !m3.includes('loss_value,') && // ensure loss_value is omitted from floor_stage_logs view
  m3.includes('input_weight_kg,') &&
  m3.includes('output_weight_kg,'),
  '003_schema_fixes.sql creates floor_stage_logs view isolating loss_value/financials from floor workers'
);

// Test 5: 003_schema_fixes.sql triggers (tasks and dispatch gate)
assert(
  m3.includes('enforce_task_update_permissions()') &&
  m3.includes('enforce_dispatch_gate()') &&
  m3.includes('audit_log_trigger()'),
  '003_schema_fixes.sql defines task permissions, dispatch gate, and audit trail triggers'
);

// Test 6: 004_missing_columns.sql entities and fields
assert(
  m4.includes('batch_transfers') &&
  m4.includes('export_incentives_ledger') &&
  m4.includes('style_fabric_yarns') &&
  m4.includes('wastage_pct') &&
  m4.includes('validate_fabric_yarn_shares()'),
  '004_missing_columns.sql defines batch_transfers, export incentives, and style_fabric_yarns child table'
);

// Test 7: 004_missing_columns.sql floor discrepancy and measurement fields
assert(
  m4.includes('manager_assigned_weight_kg') &&
  m4.includes('employee_measured_output_weight_kg') &&
  m4.includes('employee_reported_output_kg') &&
  m4.includes('weight_discrepancy_kg') &&
  m4.includes('discrepancy_status'),
  '004_missing_columns.sql defines all floor measurement, scale, and discrepancy columns'
);

console.log('\n🎉 ALL PHASE 1 DATABASE MIGRATION CHECKS PASSED!\n');
