// ============================================================
// KNITNECT PRODUCTION ERP — PIPELINE DOMAIN ENGINE
// Stage branching, ordering, gate checks & transition logic
// ============================================================

import { GarmentProcessType, GarmentSeasonType } from '../types/erp';

export interface StageDefinition {
  order: number;
  name: string;
  departmentName: string;
  branch: 'shared' | GarmentProcessType;
  isWinterOnly?: boolean;
}

// 1. Shared Front-of-Pipeline (Common to all garment types)
export const SHARED_FRONT_STAGES: StageDefinition[] = [
  { order: 1, name: 'Yarn Buying', departmentName: 'Yarn Sourcing', branch: 'shared' },
  { order: 2, name: 'Knitting', departmentName: 'Knitting', branch: 'shared' },
  { order: 3, name: 'Dyeing', departmentName: 'Dyeing & Wet Processing', branch: 'shared' },
  { order: 4, name: 'Heat Setting', departmentName: 'Heat Setting', branch: 'shared' },
  { order: 5, name: 'Finishing & Compacting / Stenter', departmentName: 'Finishing & Compacting', branch: 'shared' },
  { order: 6, name: 'Brushing & Sueding', departmentName: 'Finishing & Compacting', branch: 'shared', isWinterOnly: true },
];

// 2. Branch: Solid Fabric
export const SOLID_FABRIC_STAGES: StageDefinition[] = [
  { order: 7, name: 'Cutting', departmentName: 'Cutting', branch: 'solid_fabric' },
  { order: 8, name: 'Embroidery', departmentName: 'Embroidery & Print', branch: 'solid_fabric' },
  { order: 9, name: 'Printing', departmentName: 'Embroidery & Print', branch: 'solid_fabric' },
  { order: 10, name: 'Sewing', departmentName: 'Sewing & Assembly', branch: 'solid_fabric' },
  { order: 11, name: 'Trimming', departmentName: 'Sewing & Assembly', branch: 'solid_fabric' },
  { order: 12, name: 'Checking', departmentName: 'Quality Control & Checking', branch: 'solid_fabric' },
  { order: 13, name: 'Finishing', departmentName: 'Ironing & Packing', branch: 'solid_fabric' },
  { order: 14, name: 'Ironing', departmentName: 'Ironing & Packing', branch: 'solid_fabric' },
  { order: 15, name: 'Packing', departmentName: 'Ironing & Packing', branch: 'solid_fabric' },
];

// 3. Branch: AOP – White Based
export const AOP_WHITE_BASED_STAGES: StageDefinition[] = [
  { order: 7, name: 'Printing', departmentName: 'Embroidery & Print', branch: 'aop_white_based' },
  { order: 8, name: 'Curing', departmentName: 'Finishing & Compacting', branch: 'aop_white_based' },
  { order: 9, name: 'Stenter finish', departmentName: 'Finishing & Compacting', branch: 'aop_white_based' },
  { order: 10, name: 'Compacting', departmentName: 'Finishing & Compacting', branch: 'aop_white_based' },
];

// 4. Branch: AOP – Dyed Base
export const AOP_DYED_BASE_STAGES: StageDefinition[] = [
  { order: 7, name: 'Discharge Printing', departmentName: 'Embroidery & Print', branch: 'aop_dyed_base' },
  { order: 8, name: 'Ageing', departmentName: 'Finishing & Compacting', branch: 'aop_dyed_base' },
  { order: 9, name: 'Curing', departmentName: 'Finishing & Compacting', branch: 'aop_dyed_base' },
  { order: 10, name: 'Washing', departmentName: 'Dyeing & Wet Processing', branch: 'aop_dyed_base' },
  { order: 11, name: 'Compacting', departmentName: 'Finishing & Compacting', branch: 'aop_dyed_base' },
];

/**
 * Builds the complete ordered list of pipeline stages for a given style's
 * garment_process_type and garment_season_type.
 */
export function getPipelineStagesForStyle(
  processType: GarmentProcessType,
  seasonType: GarmentSeasonType
): StageDefinition[] {
  // Filter shared front end (Brushing & Sueding only applies to Winter)
  const shared = SHARED_FRONT_STAGES.filter(
    (s) => !s.isWinterOnly || (s.isWinterOnly && seasonType === 'Winter')
  );

  let branchStages: StageDefinition[] = [];
  if (processType === 'aop_white_based') {
    branchStages = AOP_WHITE_BASED_STAGES;
  } else if (processType === 'aop_dyed_base') {
    branchStages = AOP_DYED_BASE_STAGES;
  } else {
    branchStages = SOLID_FABRIC_STAGES;
  }

  // Combine and re-index orders sequentially
  const allStages = [...shared, ...branchStages];
  return allStages.map((stage, idx) => ({
    ...stage,
    order: idx + 1,
  }));
}

/**
 * Lab Dip Gate: Production cannot proceed on a style until all lab dips are approved.
 */
export function isLabDipGateCleared(labDips?: Array<{ approval_status: string }>): {
  cleared: boolean;
  reason?: string;
} {
  if (!labDips || labDips.length === 0) {
    return {
      cleared: false,
      reason: 'No Lab Dip colourway entries exist. Production requires at least one lab dip approval.',
    };
  }

  const unapproved = labDips.filter((ld) => ld.approval_status !== 'approved');
  if (unapproved.length > 0) {
    return {
      cleared: false,
      reason: `${unapproved.length} Lab Dip(s) are pending approval. Production cannot proceed until all colourways are approved.`,
    };
  }

  return { cleared: true };
}

/**
 * Price Approval Gate: Final predicted price must be explicitly approved by Owner or Manager.
 */
export function isPriceApprovalCleared(costing?: {
  final_price_approved_by?: string | null;
  approved_at?: string | null;
}): { cleared: boolean; reason?: string } {
  if (!costing || !costing.final_price_approved_by || !costing.approved_at) {
    return {
      cleared: false,
      reason: 'Final price has not been approved by Owner or Manager. Pipeline cannot be activated.',
    };
  }
  return { cleared: true };
}
