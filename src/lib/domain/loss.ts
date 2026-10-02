// ============================================================
// KNITNECT PRODUCTION ERP — STAGE LOSS TRACKING & ANALYTICS
// Universal Tolerance Rule (smaller of 1 kg or 1%),
// Cutting Yield Validation (BOM kg/pc vs pcs),
// Weight (kg) vs Piece (pcs) Tracking Across 15 Stages
// ============================================================

export interface StageLossMetrics {
  inputWeightKg: number;
  outputWeightKg: number;
  lossKg: number;
  lossPct: number;
  lossValue: number;
  effectiveRatePerKg: number;
  calculationFormula: string;
  isNormal: boolean;
  benchmarkAvgPct: number;
  variancePct: number;
  diagnosticNote: string;
}

export interface WeightCrossVerification {
  employeeOutputKg: number;
  managerVerifiedKg: number;
  discrepancyKg: number;
  discrepancyPct: number;
  toleranceKg: number;
  status: 'matched' | 'critical_mismatch';
  statusLabel: string;
  message: string;
}

// Client / industry standard baseline benchmarks for garment stage loss
export const STAGE_BENCHMARK_LOSS_PCT: Record<string, number> = {
  'Yarn Buying': 0.5,
  'Knitting': 3.5,
  'Dyeing': 4.2,
  'Heat Setting': 1.8,
  'Finishing & Compacting / Stenter': 2.2,
  'Finishing & Compacting': 2.2,
  'Brushing & Sueding': 5.5,
  'Cutting': 8.5,
  'Embroidery': 1.5,
  'Printing': 2.0,
  'Discharge Printing': 3.0,
  'Ageing': 1.0,
  'Curing': 1.0,
  'Washing': 2.5,
  'Stenter finish': 1.8,
  'Compacting': 1.5,
  'Sewing': 2.8,
  'Trimming': 1.2,
  'Checking': 1.0,
  'Finishing': 0.8,
  'Ironing': 0.5,
  'Packing': 0.3,
};

// Re-valued blended fabric cost per kg for style KB13P301X1 (Offer 9414 working file: ~₹432/kg = ₹431.98/kg)
export const DEFAULT_BLENDED_FABRIC_COST_PER_KG = 431.98;

/**
 * Universal Knitnect Tolerance Rule: Smaller of 1 kg or 1%
 * Evaluates tolerance as min(1.0 kg, 1% of base weight)
 */
export function getUniversalToleranceKg(baseWeight: number): number {
  const w = Math.max(0, Number(baseWeight) || 0);
  return Number(Math.min(1.0, w * 0.01).toFixed(4));
}

export function isWithinUniversalTolerance(measuredWeight: number, benchmarkWeight: number): boolean {
  const base = Math.max(measuredWeight, benchmarkWeight);
  const diff = Math.abs(measuredWeight - benchmarkWeight);
  const tolerance = getUniversalToleranceKg(base);
  return diff <= tolerance;
}

/**
 * Returns tracking unit for stage:
 * Weight tracking up to Cutting (Stages 1-7: 'kg')
 * Piece counts after Cutting (Stages 8-15: 'pcs')
 */
export function getStageTrackingUnit(stageOrder: number): 'kg' | 'pcs' {
  return stageOrder <= 7 ? 'kg' : 'pcs';
}

/**
 * Validates Cut kg against BOM kg/pc * pieces with tolerance warning:
 * Variance = |cutFabricKg - (bomKgPerPiece * cutPieces)|
 * Compares variance against universal tolerance: smaller of 1 kg or 1%
 */
export function validateCuttingYield(
  cutFabricKg: number,
  cutPieces: number,
  bomKgPerPiece: number
): {
  expectedKg: number;
  varianceKg: number;
  variancePct: number;
  toleranceKg: number;
  isWithinTolerance: boolean;
  warningMessage?: string;
} {
  const pieces = Math.max(0, Number(cutPieces) || 0);
  const bomRate = Math.max(0, Number(bomKgPerPiece) || 0);
  const actualKg = Math.max(0, Number(cutFabricKg) || 0);

  const expectedKg = Number((pieces * bomRate).toFixed(4));
  const varianceKg = Number(Math.abs(actualKg - expectedKg).toFixed(4));
  const variancePct = expectedKg > 0 ? Number(((varianceKg / expectedKg) * 100).toFixed(2)) : 0;
  const toleranceKg = getUniversalToleranceKg(expectedKg);
  const isWithinTolerance = varianceKg <= toleranceKg;

  let warningMessage: string | undefined;
  if (!isWithinTolerance && actualKg > 0 && pieces > 0) {
    warningMessage = `Cutting Yield Alert: Cut fabric (${actualKg.toFixed(2)} kg) differs from BOM expected requirement (${expectedKg.toFixed(2)} kg for ${pieces} pcs @ ${bomRate.toFixed(3)} kg/pc) by ${varianceKg.toFixed(2)} kg (${variancePct}%). Exceeds allowable tolerance of ${toleranceKg.toFixed(2)} kg.`;
  }

  return {
    expectedKg,
    varianceKg,
    variancePct,
    toleranceKg,
    isWithinTolerance,
    warningMessage,
  };
}

/**
 * Computes exact process byproduct loss metrics:
 * loss_kg = input_weight_kg - output_weight_kg
 * loss_pct = (loss_kg / input_weight_kg) * 100
 * loss_value = loss_kg * blended_cost_per_kg
 */
export function computeStageLoss(
  stageName: string,
  inputWeightKg: number,
  outputWeightKg: number,
  blendedCostPerKg?: number,
  historicalStageLogs: Array<{ stage_name: string; loss_pct: number }> = []
): StageLossMetrics {
  const inWt = Math.max(0, Number(inputWeightKg) || 0);
  const outWt = Math.max(0, Number(outputWeightKg) || 0);

  const lossKg = inWt > 0 && outWt <= inWt ? Number((inWt - outWt).toFixed(4)) : 0;
  const lossPct = inWt > 0 ? Number(((lossKg / inWt) * 100).toFixed(2)) : 0;

  // Re-valued blended fabric cost per kg (Offer 9414 true rate ₹431.98/kg)
  const effectiveRate = Number(
    blendedCostPerKg && blendedCostPerKg > 0 ? blendedCostPerKg : DEFAULT_BLENDED_FABRIC_COST_PER_KG
  );
  const lossValue = Number((lossKg * effectiveRate).toFixed(2));
  const calculationFormula = `${lossKg.toFixed(2)} kg × ₹${effectiveRate.toFixed(2)}/kg = ₹${lossValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // Determine stage benchmark: historical rolling average if available, else standard baseline
  const matchingHistorical = historicalStageLogs.filter(
    (l) => l.stage_name.toLowerCase() === stageName.toLowerCase() && l.loss_pct > 0
  );

  let benchmarkAvgPct = STAGE_BENCHMARK_LOSS_PCT[stageName] ?? 3.0;
  if (matchingHistorical.length > 0) {
    const sum = matchingHistorical.reduce((acc, curr) => acc + curr.loss_pct, 0);
    benchmarkAvgPct = Number((sum / matchingHistorical.length).toFixed(2));
  }

  const variancePct = Number((lossPct - benchmarkAvgPct).toFixed(2));
  const isNormal = variancePct <= 1.0;

  let diagnosticNote = '';
  if (inWt === 0 || outWt === 0) {
    diagnosticNote = 'Awaiting floor measurement before and after stage execution.';
  } else if (variancePct > 2.5) {
    diagnosticNote = `Excess process loss detected (+${variancePct}% vs standard ${benchmarkAvgPct}% benchmark). Potential fabric waste, tension, or moisture loss.`;
  } else if (variancePct > 0.5) {
    diagnosticNote = `Slightly above historical norm (+${variancePct}% vs ${benchmarkAvgPct}%). Within acceptable margin of process variation.`;
  } else if (variancePct < -1.0) {
    diagnosticNote = `High yield efficiency (${Math.abs(variancePct)}% lower loss than ${benchmarkAvgPct}% norm).`;
  } else {
    diagnosticNote = `Process byproduct is strictly within expected textile manufacturing tolerances (${lossPct}% vs ${benchmarkAvgPct}% avg).`;
  }

  return {
    inputWeightKg: inWt,
    outputWeightKg: outWt,
    lossKg,
    lossPct,
    lossValue,
    effectiveRatePerKg: effectiveRate,
    calculationFormula,
    isNormal,
    benchmarkAvgPct,
    variancePct,
    diagnosticNote,
  };
}

/**
 * Cross-Verifies Employee Floor Weight vs Manager Supervisor Weight
 * Uses Universal Tolerance Rule: Smaller of 1 kg or 1%
 */
export function verifyFloorWeights(
  employeeOutputKg: number,
  managerVerifiedKg: number
): WeightCrossVerification {
  const empWt = Number(employeeOutputKg) || 0;
  const mgrWt = Number(managerVerifiedKg) || 0;

  if (empWt <= 0 || mgrWt <= 0) {
    return {
      employeeOutputKg: empWt,
      managerVerifiedKg: mgrWt,
      discrepancyKg: 0,
      discrepancyPct: 0,
      toleranceKg: 0,
      status: 'matched',
      statusLabel: 'Pending Dual Entry',
      message: 'Both employee floor measurement and manager supervisor weight are required for cross-verification.',
    };
  }

  const discrepancyKg = Number(Math.abs(mgrWt - empWt).toFixed(2));
  const base = Math.max(empWt, mgrWt);
  const discrepancyPct = base > 0 ? Number(((discrepancyKg / base) * 100).toFixed(2)) : 0;
  const toleranceKg = getUniversalToleranceKg(base);

  const isMatched = discrepancyKg <= toleranceKg;
  const status: 'matched' | 'critical_mismatch' = isMatched ? 'matched' : 'critical_mismatch';
  const statusLabel = isMatched ? `Verified Match (≤${toleranceKg}kg)` : `CRITICAL MISMATCH (>${toleranceKg}kg)`;
  const message = isMatched
    ? `Floor measurement (${empWt}kg) matches supervisor verification (${mgrWt}kg) within allowable tolerance (diff: ${discrepancyKg}kg, tolerance: ${toleranceKg}kg).`
    : `WEIGHT ERROR ALERT: Discrepancy of ${discrepancyKg}kg exceeds universal tolerance (smaller of 1kg or 1% = ${toleranceKg}kg). Re-weigh required!`;

  return {
    employeeOutputKg: empWt,
    managerVerifiedKg: mgrWt,
    discrepancyKg,
    discrepancyPct,
    toleranceKg,
    status,
    statusLabel,
    message,
  };
}
