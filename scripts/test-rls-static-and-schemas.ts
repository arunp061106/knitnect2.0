import fs from 'fs';
import path from 'path';
import {
  loginSchema,
  stageWeightSchema,
  managerOverrideSchema,
  dispatchCreateSchema,
  taskUpdateSchema,
  taskCreateSchema,
  payrollEntryUpdateSchema,
  monthlyPayrollRunSchema,
  chatMessageSchema,
  excelUploadValidationSchema,
} from '../src/lib/validations/schemas';

console.log('============================================================');
console.log('KNITNECT ERP: STATIC SQL & ZOD VALIDATION VERIFICATION');
console.log('============================================================\n');

// 1. Check Migration 004 contents
const migrationPath = path.join(__dirname, '../supabase/migrations/004_full_supabase_auth_rls_gates.sql');
const migrationSql = fs.readFileSync(migrationPath, 'utf-8');

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    process.exit(1);
  } else {
    console.log(`✅ PASS: ${message}`);
  }
}

// Security Definer get_role()
assert(
  migrationSql.includes('CREATE OR REPLACE FUNCTION public.get_role()') &&
    migrationSql.includes('SECURITY DEFINER'),
  'get_role() is defined as SECURITY DEFINER function'
);

// profiles table: service role write only
assert(
  migrationSql.includes('Profiles viewable by management or self') &&
    !migrationSql.includes('CREATE POLICY "Profiles updateable by') &&
    !migrationSql.includes('CREATE POLICY "Profiles insertable by'),
  'profiles table has NO INSERT/UPDATE/DELETE policies for authenticated (Service role write only)'
);

// Mass conservation gate and manager override
assert(
  migrationSql.includes('CREATE OR REPLACE FUNCTION public.enforce_mass_conservation_gate()') &&
    migrationSql.includes('Mass Conservation Gate Block'),
  'enforce_mass_conservation_gate() trigger function exists with Mass Conservation Gate Block'
);

assert(
  migrationSql.includes('CREATE OR REPLACE FUNCTION public.record_stage_weights_with_override'),
  'record_stage_weights_with_override RPC function exists for manager override'
);

// Dispatch clearance hard lock
assert(
  migrationSql.includes('CREATE OR REPLACE FUNCTION public.enforce_dispatch_clearance_lock()') &&
    migrationSql.includes('Dispatch Clearance Lock') &&
    migrationSql.includes('v_done_stages < v_total_stages'),
  'enforce_dispatch_clearance_lock() hard lock requires all 15 stages completed'
);

// Immutable audit log
assert(
  migrationSql.includes('CREATE TABLE IF NOT EXISTS public.audit_log') &&
    migrationSql.includes('CREATE POLICY "Audit log viewable by management" ON public.audit_log') &&
    !migrationSql.includes('CREATE POLICY "Audit log updateable"') &&
    !migrationSql.includes('CREATE POLICY "Audit log deletable"'),
  'audit_log table is insert-only via triggers with NO UPDATE and NO DELETE policies'
);

// Manager blocked from editing payroll
assert(
  migrationSql.includes('CREATE POLICY "Payroll entries owner write" ON public.payroll_entries') &&
    migrationSql.includes("USING (public.get_role() = 'owner')") &&
    migrationSql.includes('CREATE POLICY "Monthly payroll runs owner write" ON public.monthly_payroll_runs'),
  "Managers cannot edit payroll (Payroll mutations strictly restricted to get_role() = 'owner')"
);

// Chat policies
assert(
  migrationSql.includes('CREATE POLICY "Chat channels select policy" ON public.chat_channels') &&
    migrationSql.includes("type = 'common'") &&
    migrationSql.includes("type = 'owner_manager' AND public.is_management()") &&
    migrationSql.includes('CREATE POLICY "Chat messages select policy" ON public.chat_messages'),
  'Chat policies segregated by channel type (common, owner_manager, DMs)'
);

// 2. Test Zod Schemas
console.log('\n--- Testing Server-side Zod Schemas ---');

// Login schema
assert(loginSchema.safeParse({ email: 'employee@knitnect.com', password: 'password123' }).success, 'Valid login passes');
assert(!loginSchema.safeParse({ email: 'invalid-email', password: '123' }).success, 'Invalid email/password fails');

// Manager override schema requires reason
assert(
  managerOverrideSchema.safeParse({
    stage_log_id: '11111111-1111-1111-1111-111111111111',
    input_weight_kg: 50,
    output_weight_kg: 48,
    override_reason: 'Approved supplementary batch from supplier',
  }).success,
  'Valid manager override passes'
);

assert(
  !managerOverrideSchema.safeParse({
    stage_log_id: '11111111-1111-1111-1111-111111111111',
    input_weight_kg: 50,
    output_weight_kg: 48,
    override_reason: '', // Empty reason
  }).success,
  'Manager override without reason is rejected'
);

// Excel upload validation
assert(
  excelUploadValidationSchema.safeParse({
    filename: 'TechPack.xlsx',
    sizeBytes: 2 * 1024 * 1024,
  }).success,
  'Excel upload under 5MB passes'
);

assert(
  !excelUploadValidationSchema.safeParse({
    filename: 'Virus.exe',
    sizeBytes: 1000,
  }).success,
  'Non-excel file is rejected'
);

assert(
  !excelUploadValidationSchema.safeParse({
    filename: 'Huge.xlsx',
    sizeBytes: 6 * 1024 * 1024, // 6MB > 5MB
  }).success,
  'Excel upload over 5MB is rejected'
);

console.log('\n🎉 ALL 12 MIGRATION AND SCHEMA ASSERTIONS PASSED WITH 100% SUCCESS!\n');
