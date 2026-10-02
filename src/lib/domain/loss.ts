// ============================================================
// KNITNECT PRODUCTION ERP — STAGE LOSS TRACKING & ANALYTICS
// Real process loss formulas + rolling historical comparison
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
  status: 'matched' | 'minor_variance' | 'critical_mismatch';
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

// Default fabric material cost per kg from client's Offer 9414 working file
export const DEFAULT_BLENDED_FABRIC_COST_PER_KG = 486.60;

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

  // Use style's blended fabric cost, or fallback to client's baseline rate ₹486.60/kg
  const effectiveRate = Number(blendedCostPerKg && blendedCostPerKg > 0 ? blendedCostPerKg : DEFAULT_BLENDED_FABRIC_COST_PER_KG);
  const lossValue = Number((lossKg * effectiveRate).toFixed(2));
  const calculationFormula = `${lossKg.toFixed(2)} kg × ₹${effectiveRate.toFixed(2)}/kg = ₹${lossValue.toLocaleString('en-IN')}`;

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
  const isNormal = variancePct <= 1.0; // Within 1% threshold is normal byproduct

  let diagnosticNote = '';
  if (inWt === 0 || outWt === 0) {
    diagnosticNote = 'Awaiting scale weight measurement before and after process.';
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
 * Calculates exact variance kg, variance %, and discrepancy classification.
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
      status: 'matched',
      statusLabel: 'Pending Dual Entry',
      message: 'Both employee floor measurement and manager supervisor weight are required for cross-verification.',
    };
  }

  const discrepancyKg = Number(Math.abs(mgrWt - empWt).toFixed(2));
  const base = Math.max(empWt, mgrWt);
  const discrepancyPct = base > 0 ? Number(((discrepancyKg / base) * 100).toFixed(2)) : 0;

  let status: 'matched' | 'minor_variance' | 'critical_mismatch' = 'matched';
  let statusLabel = 'Verified Match';
  let message = '';

  if (discrepancyPct <= 1.0) {
    status = 'matched';
    statusLabel = 'Verified Match (≤1%)';
    message = `Floor measurement (${empWt}kg) matches supervisor verification (${mgrWt}kg) within ${discrepancyPct}% precision.`;
  } else if (discrepancyPct <= 3.0) {
    status = 'minor_variance';
    statusLabel = 'Minor Variance (1-3%)';
    message = `Minor discrepancy of ${discrepancyKg}kg (${discrepancyPct}%). Acceptable tolerance due to moisture or tare weight.`;
  } else {
    status = 'critical_mismatch';
    statusLabel = 'CRITICAL MISMATCH (>3%)';
    message = `WEIGHT ERROR ALERT: Discrepancy of ${discrepancyKg}kg (${discrepancyPct}%) exceeds quality tolerance. Re-weigh bundle!`;
  }

  return {
    employeeOutputKg: empWt,
    managerVerifiedKg: mgrWt,
    discrepancyKg,
    discrepancyPct,
    status,
    statusLabel,
    message,
  };
}
