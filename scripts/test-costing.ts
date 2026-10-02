import { CLIENT_OFFER_9414_FABRICS } from '../src/lib/db/erpStore';
import {
  calculateBulkProjection,
  calculateBlendedCostPerKg,
} from '../src/lib/domain/costing';
import {
  getUniversalToleranceKg,
  isWithinUniversalTolerance,
} from '../src/lib/domain/loss';
import { StyleFabric } from '../src/lib/types/erp';

console.log('============================================================');
console.log('KNITNECT ERP: COSTING MODULE & SPECIFICATION UNIT TESTS');
console.log('============================================================\n');

function assert(condition: boolean, testName: string, actual?: any, expected?: any) {
  if (!condition) {
    console.error(`❌ FAIL | ${testName}`);
    if (actual !== undefined && expected !== undefined) {
      console.error(`   Expected: ${expected}`);
      console.error(`   Actual:   ${actual}`);
    }
    process.exit(1);
  } else {
    console.log(`✅ PASS | ${testName}`);
    if (actual !== undefined) {
      console.log(`   Value: ${actual}`);
    }
  }
}

// ------------------------------------------------------------
// TEST 1: Bulk fabric kg sums per physical fabric (body once, rib once)
// Style KB13P301X1 at 5000 pcs -> Expect EXACTLY 1750 kg
// ------------------------------------------------------------
const projection5000 = calculateBulkProjection(CLIENT_OFFER_9414_FABRICS, 5000);

assert(
  projection5000.totalFabricReqKg === 1750,
  'Bulk fabric kg must sum per fabric (Body once = 1350kg, Rib once = 400kg, total = 1750kg)',
  projection5000.totalFabricReqKg,
  1750
);

assert(
  projection5000.uniqueFabrics.length === 2,
  'Unique physical fabrics detected correctly (Body and Rib)',
  projection5000.uniqueFabrics.map((u) => `${u.fabricType}: ${u.grossFabricKg}kg`).join(', '),
  '2 fabrics'
);

// ------------------------------------------------------------
// TEST 2: Blended ₹/kg for style KB13P301X1
// Expect ~₹432/kg (approx 431.98)
// ------------------------------------------------------------
const blendedRate = calculateBlendedCostPerKg(CLIENT_OFFER_9414_FABRICS);
const roundedBlended = Math.round(blendedRate);

assert(
  roundedBlended === 432 && Math.abs(blendedRate - 431.98) < 0.1,
  'Blended ₹/kg for style KB13P301X1 is ~₹432/kg (~₹431.98/kg)',
  `₹${blendedRate.toFixed(2)}/kg`,
  '~₹432.00/kg'
);

assert(
  projection5000.totalFabricCost === 755960,
  'Total fabric cost at 5000 pcs is exactly ₹755,960.00',
  `₹${projection5000.totalFabricCost.toFixed(2)}`,
  '₹755,960.00'
);

// ------------------------------------------------------------
// TEST 3: Wastage % per fabric line included in bulk requirement and cost
// ------------------------------------------------------------
const fabricsWithWastage: StyleFabric[] = CLIENT_OFFER_9414_FABRICS.map((f) => ({
  ...f,
  wastage_pct: f.fabric_type === 'BODY' ? 4 : 5, // 4% for Body, 5% for Rib
}));

const projWastage = calculateBulkProjection(fabricsWithWastage, 5000);
// Body gross: 1350 * 1.04 = 1404 kg
// Rib gross: 400 * 1.05 = 420 kg
// Total gross fabric: 1404 + 420 = 1824 kg
assert(
  projWastage.totalFabricReqKg === 1824,
  'Bulk requirement correctly incorporates per-fabric line wastage % (1824 kg)',
  projWastage.totalFabricReqKg,
  1824
);

assert(
  projWastage.totalFabricCost > projection5000.totalFabricCost,
  'Fabric total cost increases proportionally with wastage allowance',
  `₹${projWastage.totalFabricCost} vs baseline ₹${projection5000.totalFabricCost}`,
  'Cost with wastage > baseline'
);

// ------------------------------------------------------------
// TEST 4: Universal Tolerance Rule (smaller of 1 kg or 1%)
// ------------------------------------------------------------
// At 50 kg: 1% is 0.5 kg, smaller is 0.5 kg
const tol50 = getUniversalToleranceKg(50);
assert(tol50 === 0.5, 'Universal tolerance at 50 kg is 0.5 kg (1% < 1kg)', tol50, 0.5);

// At 200 kg: 1% is 2.0 kg, smaller is 1.0 kg
const tol200 = getUniversalToleranceKg(200);
assert(tol200 === 1.0, 'Universal tolerance at 200 kg is 1.0 kg (1kg < 1%)', tol200, 1.0);

// Boundary verification
assert(
  isWithinUniversalTolerance(50.4, 50.0),
  '50.4 kg vs 50.0 kg is within 0.5 kg tolerance',
  'Within tolerance',
  true
);

assert(
  !isWithinUniversalTolerance(50.8, 50.0),
  '50.8 kg vs 50.0 kg exceeds 0.5 kg tolerance',
  'Exceeds tolerance',
  false
);

console.log('\n🎉 ALL COSTING & TOLERANCE UNIT TESTS PASSED WITH 100% ACCURACY!\n');
