import { z } from 'zod';

// ============================================================
// KNITNECT PRODUCTION ERP — SERVER-SIDE ZOD VALIDATION SCHEMAS
// Enforces Section 3 RBAC, Textile Process Constraints & Upload Limits
// ============================================================

// 1. Auth Schemas
export const loginSchema = z.object({
  email: z.string().trim().email('Invalid email address format'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

// 2. Stage Weights & Floor Measurement Schemas
export const stageWeightSchema = z.object({
  stage_log_id: z.string().uuid('Invalid stage log UUID'),
  input_weight_kg: z.number().min(0, 'Input weight must be non-negative'),
  output_weight_kg: z.number().min(0, 'Output weight must be non-negative'),
  notes: z.string().optional(),
});

// 3. Manager Override Schema
export const managerOverrideSchema = z.object({
  stage_log_id: z.string().uuid('Invalid stage log UUID'),
  input_weight_kg: z.number().min(0, 'Input weight must be non-negative'),
  output_weight_kg: z.number().min(0, 'Output weight must be non-negative'),
  override_reason: z
    .string()
    .trim()
    .min(5, 'A clear justification of at least 5 characters is required for manager override'),
  general_notes: z.string().optional(),
});

// 4. Dispatch Record Creation Schema (Gate: shipped_qty <= order_qty, flag partial)
export const dispatchCreateSchema = z
  .object({
    production_run_id: z.string().uuid('Invalid production run UUID'),
    style_id: z.string().uuid('Invalid style UUID'),
    order_qty: z.number().min(1, 'Order quantity must be at least 1 piece'),
    shipped_qty: z.number().min(1, 'Shipped quantity must be at least 1 piece'),
    transport_cost: z.number().min(0, 'Transport cost cannot be negative'),
    fob_value: z.number().min(0, 'FOB value cannot be negative'),
    forwarding_cost: z.number().min(0, 'Forwarding cost cannot be negative'),
    dispatch_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Dispatch date must be in YYYY-MM-DD format'),
    notes: z.string().optional(),
    is_partial: z.boolean().optional(),
  })
  .refine((d) => d.shipped_qty <= d.order_qty, {
    message: 'Dispatch gate blocked: Shipped quantity cannot exceed total order quantity',
    path: ['shipped_qty'],
  });

// 5. Tasks Creation & Update Schemas
export const taskUpdateSchema = z.object({
  task_id: z.string().uuid('Invalid task UUID'),
  status: z.enum(['pending', 'in_progress', 'completed']),
  notes: z.string().optional(),
  actual_completion_date: z.string().optional(),
});

export const taskCreateSchema = z.object({
  department_id: z.string().uuid('Invalid department UUID'),
  assigned_to: z.string().uuid('Invalid assigned user UUID'),
  specification: z.string().trim().min(3, 'Task specification is required'),
  expected_completion_date: z.string().optional(),
  production_stage_log_id: z.string().uuid().optional(),
  notes: z.string().optional(),
});

// 6. Payroll Schemas (Owner only)
export const payrollEntryUpdateSchema = z.object({
  user_id: z.string().uuid('Invalid user UUID'),
  base_salary: z.number().min(0, 'Salary must be non-negative'),
  new_increment_date: z.string().optional(),
  new_salary: z.number().optional(),
  increment_note: z.string().optional(),
});

export const monthlyPayrollRunSchema = z.object({
  month_year: z.string().regex(/^\d{4}-\d{2}$/, 'Billing month must be in YYYY-MM format'),
  total_payroll_amount: z.number().min(0, 'Total payroll amount must be non-negative'),
  employee_snapshots: z.array(z.record(z.any())),
});

// 7. Chat Message Schema
export const chatMessageSchema = z.object({
  channel_id: z.string().min(1, 'Channel ID is required'),
  body: z.string().trim().min(1, 'Message body cannot be empty').max(2000, 'Message cannot exceed 2000 characters'),
  tagged_style_id: z.string().optional().nullable(),
  tagged_style_number: z.string().optional().nullable(),
  tagged_user_id: z.string().optional().nullable(),
  tagged_user_name: z.string().optional().nullable(),
});

// 8. Excel Upload Size & MIME Type Validation Schema
export const MAX_UPLOAD_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
export const ALLOWED_EXCEL_EXTENSIONS = ['.xlsx', '.xls'];

export const excelUploadValidationSchema = z.object({
  filename: z.string().refine(
    (name) => ALLOWED_EXCEL_EXTENSIONS.some((ext) => name.toLowerCase().endsWith(ext)),
    'Only Excel spreadsheets (.xlsx, .xls) are permitted'
  ),
  sizeBytes: z.number().max(MAX_UPLOAD_FILE_SIZE, 'Uploaded file size exceeds maximum allowable limit of 5MB'),
});
