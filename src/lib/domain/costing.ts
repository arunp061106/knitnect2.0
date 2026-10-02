// ============================================================
// KNITNECT PRODUCTION ERP — COSTING DOMAIN LOGIC
// True Fabric Grouping, Wastage %, and Blended Rate Calculations
// ============================================================

import { StyleFabric } from '../types/erp';

export interface FabricGroupSummary {
  fabricType: string;
  fabricCode: string;
  colour: string;
  pcWt: number; // Net kg per piece
  wastagePct: number; // Wastage %
  grossPcWt: number; // pc_wt * (1 + wastagePct/100)
  netFabricKg: number; // Net bulk kg (pc_wt * targetQty)
  grossFabricKg: number; // Gross bulk kg including wastage
  yarnTotalCost: number;
  processingCostPerKg: number;
  processingTotalCost: number;
  totalCost: number;
  costPerKg: number;
}

export interface BulkProjectionResult {
  bulkTargetQty: number;
  totalFabricReqKg: number; // True bulk fabric kg (body once, rib once, including wastage)
  netFabricReqKg: number; // Net bulk fabric kg without wastage
  totalYarnCost: number;
  totalProcessingCost: number;
  totalFabricCost: number;
  costPerPiece: number;
  blendedCostPerKg: number;
  uniqueFabrics: FabricGroupSummary[];
  fabrics: Array<{
    id?: string;
    fabricCode: string;
    fabricType: string;
    colour: string;
    pcWt: number;
    wastagePct: number;
    bulkFabricKg: number; // True fabric kg allocated to this line
    blendFabricKg: number; // Blend allocation = bulkFabricKg * consumePct
    yarnCount: string;
    yarnPrice: number;
    consumePct: number;
    effectiveYarnCost: number;
    yarnTotalCost: number;
    processingCostPerKg: number;
    processingTotalCost: number;
    fabricTotalCost: number;
    fabricCostPerPiece: number;
  }>;
}

/**
 * Calculates line-item effective yarn cost:
 * Effective Yarn Cost = Yarn Price * (Consume % / 100 or decimal)
 */
export function calculateEffectiveYarnCost(yarnPrice: number, consumePct: number): number {
  const ratio = consumePct > 1 ? consumePct / 100 : consumePct;
  return Number((yarnPrice * (ratio || 1)).toFixed(2));
}

/**
 * Calculates sum of wet & dry processing costs per kg:
 * Knitting + Heat Setting + Solid Dye + Dyed Dye + Stenter + OWC
 */
export function calculateProcessingCostPerKg(fabric: {
  knitting_cost?: number;
  heat_setting_cost?: number;
  solid_dye_cost?: number;
  dyed_dye_cost?: number;
  stenter_cost?: number;
  owc_cost?: number;
}): number {
  return Number(
    (
      (fabric.knitting_cost || 0) +
      (fabric.heat_setting_cost || 0) +
      (fabric.solid_dye_cost || 0) +
      (fabric.dyed_dye_cost || 0) +
      (fabric.stenter_cost || 0) +
      (fabric.owc_cost || 0)
    ).toFixed(2)
  );
}

/**
 * Normalizes fabric identifier for grouping:
 * Groups by physical fabric (e.g. 'BODY' once, 'RIB' once) so blend rows do not double-count weight.
 */
export function getFabricGroupKey(f: StyleFabric): string {
  const typeKey = (f.fabric_type || '').trim().toUpperCase();
  const codeKey = (f.fabric_code || '').trim().toUpperCase();
  // If distinct type is provided (BODY, RIB, etc.), group by type + code
  return typeKey ? `${typeKey}::${codeKey}` : codeKey || 'DEFAULT_FABRIC';
}

/**
 * Calculates Bulk Fabric & Yarn Requirement and Financial Projections:
 * 1. Bulk fabric kg must sum per physical fabric (body once, rib once), not once per yarn-blend row!
 * 2. Incorporates wastage % per fabric line into bulk requirement and costs.
 * 3. Blended ₹/kg = Total Fabric Cost / True Total Fabric kg (~₹432/kg for style KB13P301X1 at 5000 pcs).
 */
export function calculateBulkProjection(
  fabrics: StyleFabric[],
  bulkTargetQty: number
): BulkProjectionResult {
  const targetQty = Math.max(1, bulkTargetQty || 1);

  if (!fabrics || fabrics.length === 0) {
    return {
      bulkTargetQty: targetQty,
      totalFabricReqKg: 0,
      netFabricReqKg: 0,
      totalYarnCost: 0,
      totalProcessingCost: 0,
      totalFabricCost: 0,
      costPerPiece: 0,
      blendedCostPerKg: 0,
      uniqueFabrics: [],
      fabrics: [],
    };
  }

  // 1. Group rows by physical fabric
  const groups = new Map<string, StyleFabric[]>();
  for (const f of fabrics) {
    const key = getFabricGroupKey(f);
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(f);
  }

  let totalGrossFabricKg = 0;
  let totalNetFabricKg = 0;
  let totalYarnCost = 0;
  let totalProcessingCost = 0;
  const uniqueFabrics: FabricGroupSummary[] = [];
  const lineResults: BulkProjectionResult['fabrics'] = [];

  // 2. Process each physical fabric group
  for (const [groupKey, rows] of Array.from(groups.entries())) {
    // Physical fabric piece weight belongs to the fabric (taken from the first row of this fabric)
    const primaryRow = rows[0];
    const pcWt = Number(primaryRow.pc_wt || 0);
    const wastagePct = Number(primaryRow.wastage_pct || 0);

    const netFabricKg = Number((pcWt * targetQty).toFixed(4));
    const grossFabricKg = Number((netFabricKg * (1 + wastagePct / 100)).toFixed(4));

    totalNetFabricKg += netFabricKg;
    totalGrossFabricKg += grossFabricKg;

    // Processing costs on the fabric
    // Sum processing costs defined on rows belonging to this fabric
    let fabricProcessingRate = 0;
    for (const r of rows) {
      fabricProcessingRate += calculateProcessingCostPerKg(r);
    }
    const fabricProcessingTotal = Number((grossFabricKg * fabricProcessingRate).toFixed(2));
    totalProcessingCost += fabricProcessingTotal;

    // Yarn costs across blend rows
    let fabricYarnTotal = 0;
    for (const r of rows) {
      const ratio = r.consume_pct > 1 ? r.consume_pct / 100 : r.consume_pct || 1;
      const blendFabricKg = Number((grossFabricKg * ratio).toFixed(4));
      const effectiveYarnCost = Number(((r.yarn_price || 0) * ratio).toFixed(2));
      const yarnTotalCost = Number((grossFabricKg * effectiveYarnCost).toFixed(2));
      fabricYarnTotal += yarnTotalCost;
      totalYarnCost += yarnTotalCost;

      // Line item processing cost share for display table
      const lineProcRate = calculateProcessingCostPerKg(r);
      const lineProcTotal = Number((grossFabricKg * lineProcRate).toFixed(2));
      const lineTotalCost = Number((yarnTotalCost + lineProcTotal).toFixed(2));

      lineResults.push({
        id: r.id,
        fabricCode: r.fabric_code || 'N/A',
        fabricType: r.fabric_type || 'BODY',
        colour: r.colour || 'N/A',
        pcWt,
        wastagePct,
        bulkFabricKg: grossFabricKg, // True gross fabric kg for this fabric
        blendFabricKg,
        yarnCount: r.yarn_count || 'N/A',
        yarnPrice: Number(r.yarn_price || 0),
        consumePct: ratio,
        effectiveYarnCost,
        yarnTotalCost,
        processingCostPerKg: lineProcRate,
        processingTotalCost: lineProcTotal,
        fabricTotalCost: lineTotalCost,
        fabricCostPerPiece: targetQty > 0 ? Number((lineTotalCost / targetQty).toFixed(2)) : 0,
      });
    }

    const fabricTotalCost = Number((fabricYarnTotal + fabricProcessingTotal).toFixed(2));
    uniqueFabrics.push({
      fabricType: primaryRow.fabric_type || 'BODY',
      fabricCode: primaryRow.fabric_code || 'N/A',
      colour: primaryRow.colour || 'N/A',
      pcWt,
      wastagePct,
      grossPcWt: Number((pcWt * (1 + wastagePct / 100)).toFixed(4)),
      netFabricKg,
      grossFabricKg,
      yarnTotalCost: fabricYarnTotal,
      processingCostPerKg: fabricProcessingRate,
      processingTotalCost: fabricProcessingTotal,
      totalCost: fabricTotalCost,
      costPerKg: grossFabricKg > 0 ? Number((fabricTotalCost / grossFabricKg).toFixed(2)) : 0,
    });
  }

  const totalFabricCost = Number((totalYarnCost + totalProcessingCost).toFixed(2));
  const roundedTotalFabricKg = Number(totalGrossFabricKg.toFixed(4));
  const blendedCostPerKg =
    roundedTotalFabricKg > 0 ? Number((totalFabricCost / roundedTotalFabricKg).toFixed(2)) : 0;
  const costPerPiece = targetQty > 0 ? Number((totalFabricCost / targetQty).toFixed(2)) : 0;

  return {
    bulkTargetQty: targetQty,
    totalFabricReqKg: roundedTotalFabricKg,
    netFabricReqKg: Number(totalNetFabricKg.toFixed(4)),
    totalYarnCost: Number(totalYarnCost.toFixed(2)),
    totalProcessingCost: Number(totalProcessingCost.toFixed(2)),
    totalFabricCost,
    costPerPiece,
    blendedCostPerKg,
    uniqueFabrics,
    fabrics: lineResults,
  };
}

/**
 * Computes the true blended fabric cost per kg for a style:
 * Blended ₹/kg = Total Fabric Cost / True Total Fabric kg
 * Correctly accounts for yarn blends (no double-counting) and fabric line wastage.
 */
export function calculateBlendedCostPerKg(fabrics: StyleFabric[]): number {
  if (!fabrics || fabrics.length === 0) return 0;
  const projection = calculateBulkProjection(fabrics, 5000);
  return projection.blendedCostPerKg;
}
