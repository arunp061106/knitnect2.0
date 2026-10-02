// ============================================================
// KNITNECT PRODUCTION ERP — COSTING DOMAIN LOGIC
// Real formulas against stored numeric fields
// ============================================================

import { StyleFabric } from '../types/erp';

export interface BulkProjectionResult {
  bulkTargetQty: number;
  totalFabricReqKg: number;
  totalYarnCost: number;
  totalProcessingCost: number;
  totalFabricCost: number;
  costPerPiece: number;
  fabrics: Array<{
    fabricCode: string;
    fabricType: string;
    colour: string;
    pcWt: number;
    bulkFabricKg: number;
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
 * Calculates Bulk Fabric & Yarn Requirement and Financial Projections:
 * For each fabric item:
 *   Bulk Fabric Required (kg) = Pc Wt (kg) * Bulk Target Qty
 *   Bulk Yarn Cost = Bulk Fabric (kg) * Effective Yarn Cost
 *   Bulk Processing Cost = Bulk Fabric (kg) * Processing Cost Per Kg
 * Total Fabric Cost = Yarn Cost + Processing Cost
 */
export function calculateBulkProjection(
  fabrics: StyleFabric[],
  bulkTargetQty: number
): BulkProjectionResult {
  const targetQty = Math.max(1, bulkTargetQty || 1);
  let totalFabricReqKg = 0;
  let totalYarnCost = 0;
  let totalProcessingCost = 0;

  const fabricResults = fabrics.map((f) => {
    const pcWt = Number(f.pc_wt || 0);
    const bulkFabricKg = Number((pcWt * targetQty).toFixed(4));
    totalFabricReqKg += bulkFabricKg;

    const ratio = f.consume_pct > 1 ? f.consume_pct / 100 : f.consume_pct || 1;
    const effectiveYarnCost = Number(((f.yarn_price || 0) * ratio).toFixed(2));
    const yarnTotalCost = Number((bulkFabricKg * effectiveYarnCost).toFixed(2));
    totalYarnCost += yarnTotalCost;

    const processingCostPerKg = calculateProcessingCostPerKg(f);
    const processingTotalCost = Number((bulkFabricKg * processingCostPerKg).toFixed(2));
    totalProcessingCost += processingTotalCost;

    const fabricTotalCost = Number((yarnTotalCost + processingTotalCost).toFixed(2));
    const fabricCostPerPiece = targetQty > 0 ? Number((fabricTotalCost / targetQty).toFixed(2)) : 0;

    return {
      fabricCode: f.fabric_code || 'N/A',
      fabricType: f.fabric_type || 'BODY',
      colour: f.colour || 'N/A',
      pcWt,
      bulkFabricKg,
      yarnCount: f.yarn_count || 'N/A',
      yarnPrice: Number(f.yarn_price || 0),
      consumePct: ratio,
      effectiveYarnCost,
      yarnTotalCost,
      processingCostPerKg,
      processingTotalCost,
      fabricTotalCost,
      fabricCostPerPiece,
    };
  });

  const totalFabricCost = Number((totalYarnCost + totalProcessingCost).toFixed(2));
  const costPerPiece = targetQty > 0 ? Number((totalFabricCost / targetQty).toFixed(2)) : 0;

  return {
    bulkTargetQty: targetQty,
    totalFabricReqKg: Number(totalFabricReqKg.toFixed(4)),
    totalYarnCost: Number(totalYarnCost.toFixed(2)),
    totalProcessingCost: Number(totalProcessingCost.toFixed(2)),
    totalFabricCost,
    costPerPiece,
    fabrics: fabricResults,
  };
}

/**
 * Computes the blended fabric cost per kg for a style:
 * Used for stage loss valuation: (Total Fabric Cost / Total Fabric Weight)
 */
export function calculateBlendedCostPerKg(fabrics: StyleFabric[]): number {
  if (!fabrics || fabrics.length === 0) return 0;
  let totalCost = 0;
  let totalWeight = 0;

  for (const f of fabrics) {
    const pcWt = Number(f.pc_wt || 0);
    const effYarn = calculateEffectiveYarnCost(f.yarn_price, f.consume_pct);
    const procCost = calculateProcessingCostPerKg(f);
    const costPerKg = effYarn + procCost;
    totalCost += costPerKg * pcWt;
    totalWeight += pcWt;
  }

  return totalWeight > 0 ? Number((totalCost / totalWeight).toFixed(2)) : 0;
}
