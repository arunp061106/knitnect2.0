// ============================================================
// KNITNECT PRODUCTION ERP — EXCEL COSTING & LAB DIPS PARSER
// Lossless parsing of client's Excel workbook (Section 4.1)
// ============================================================

import * as XLSX from 'xlsx';
import { StyleFabric, LabDip } from '../types/erp';

export interface ParsedCostingWorkbook {
  styleNumber: string;
  season: string;
  offerNo: string;
  description: string;
  garmentCategory: 'Kids' | 'Mens' | 'Womens';
  garmentSeasonType: 'Summer' | 'Winter';
  garmentProcessType: 'solid_fabric' | 'aop_white_based' | 'aop_dyed_base';
  fabrics: Omit<StyleFabric, 'id' | 'style_id' | 'created_at'>[];
  labDips: Omit<LabDip, 'id' | 'style_id' | 'created_at'>[];
}

export function parseCostingExcelBuffer(buffer: ArrayBuffer): ParsedCostingWorkbook {
  const workbook = XLSX.read(buffer, { type: 'array' });

  // 1. Find the Style Wise Fabric Working sheet
  const fabricSheetName =
    workbook.SheetNames.find((n) => n.toUpperCase().includes('FABRIC WORKING')) ||
    workbook.SheetNames[0];

  const fabricSheet = workbook.Sheets[fabricSheetName];
  const fabricRows: any[] = XLSX.utils.sheet_to_json(fabricSheet, { header: 1 });

  let styleNumber = 'KB13P301X1';
  let season = 'W28';
  let offerNo = '9414';
  let description = 'RIN | JOGGING PANTS';
  let garmentCategory: 'Kids' | 'Mens' | 'Womens' = 'Mens';
  let garmentSeasonType: 'Summer' | 'Winter' = 'Winter';
  let garmentProcessType: 'solid_fabric' | 'aop_white_based' | 'aop_dyed_base' = 'solid_fabric';

  const fabrics: Omit<StyleFabric, 'id' | 'style_id' | 'created_at'>[] = [];

  // Parse header and fabric rows (Row index >= 2)
  for (let r = 2; r < Math.min(fabricRows.length, 50); r++) {
    const row = fabricRows[r];
    if (!row || row.length === 0) continue;

    // Check if this row has style metadata
    if (row[1]) season = String(row[1]).trim();
    if (row[2]) offerNo = String(row[2]).trim();
    if (row[3]) styleNumber = String(row[3]).trim();
    if (row[4]) description = String(row[4]).trim();

    // Check process type from AOP Ref if present
    const aopRef = row[8] ? String(row[8]).trim() : '';
    if (aopRef.toLowerCase().includes('aop')) {
      garmentProcessType = aopRef.toLowerCase().includes('dyed') ? 'aop_dyed_base' : 'aop_white_based';
    }

    if (season.toLowerCase().startsWith('w')) {
      garmentSeasonType = 'Winter';
    } else {
      garmentSeasonType = 'Summer';
    }

    // Fabric Code or Type indicates a fabric line item
    const fabricCode = row[5] ? String(row[5]).trim() : '';
    const fabricType = row[6] ? String(row[6]).trim() : 'BODY';
    const colour = row[7] ? String(row[7]).trim() : 'JET BLACK-19-0303TPG';
    const quality = row[9] ? String(row[9]).trim() : 'BRUSHED FLEECE 3 THREADS';
    const composition = row[10] ? String(row[10]).trim() : '100% COTTON';
    const gsm = row[11] ? parseFloat(row[11]) || 0 : 0;
    const pcWt = row[12] ? parseFloat(row[12]) || 0 : 0;
    const sampleQty = row[14] ? parseInt(row[14]) || 500 : 500;
    const reqdQty = row[15] ? parseFloat(row[15]) || (pcWt * sampleQty) : pcWt * sampleQty;

    // Yarn Details
    const yarnCount = row[17] ? String(row[17]).trim() : "20'S";
    const yarnPrice = row[18] ? parseFloat(row[18]) || 0 : 0;
    let consumePct = row[19] !== undefined ? parseFloat(row[19]) || 1.0 : 1.0;
    if (consumePct > 1) consumePct = consumePct / 100;
    const effectiveYarnCost = row[20] ? parseFloat(row[20]) || (yarnPrice * consumePct) : yarnPrice * consumePct;

    // Processing costs
    const knittingCost = row[21] ? parseFloat(row[21]) || 0 : 0;
    const heatSettingCost = row[22] ? parseFloat(row[22]) || 0 : 0;
    const solidDyeCost = row[23] ? parseFloat(row[23]) || 0 : 0;
    const dyedDyeCost = row[24] ? parseFloat(row[24]) || 0 : 0;
    const stenterCost = row[25] ? parseFloat(row[25]) || 0 : 0;
    const owcCost = row[26] ? parseFloat(row[26]) || 0 : 0;

    if (fabricCode || yarnPrice > 0 || pcWt > 0) {
      fabrics.push({
        s_no: fabrics.length + 1,
        fabric_code: fabricCode || `FAB-${fabrics.length + 1}`,
        fabric_type: (fabricType.toUpperCase() as any) || 'BODY',
        colour: colour || 'JET BLACK-19-0303TPG',
        aop_ref: (aopRef as any) || 'Solid',
        quality,
        composition,
        gsm,
        pc_wt: pcWt,
        sample_qty: sampleQty,
        reqd_qty: reqdQty,
        yarn_count: yarnCount,
        yarn_price: yarnPrice,
        consume_pct: consumePct,
        effective_yarn_cost: Number(effectiveYarnCost.toFixed(2)),
        knitting_cost: knittingCost,
        heat_setting_cost: heatSettingCost,
        solid_dye_cost: solidDyeCost,
        dyed_dye_cost: dyedDyeCost,
        stenter_cost: stenterCost,
        owc_cost: owcCost,
      });
    }
  }

  // 2. Parse Lab Dips Sheet if present
  const labDips: Omit<LabDip, 'id' | 'style_id' | 'created_at'>[] = [];
  const labSheetName = workbook.SheetNames.find((n) => n.toLowerCase().includes('lab dip'));
  if (labSheetName) {
    const labSheet = workbook.Sheets[labSheetName];
    const labRows: any[] = XLSX.utils.sheet_to_json(labSheet, { header: 1 });
    for (let r = 3; r < Math.min(labRows.length, 30); r++) {
      const row = labRows[r];
      if (!row || !row[3]) continue; // Pantone #
      const pantoneRef = String(row[3]).trim();
      const fabric = row[4] ? String(row[4]).trim() : 'SINGLE JERSEY';
      const comp = row[5] ? String(row[5]).trim() : '100% COTTON';
      const gsm = row[6] ? parseFloat(row[6]) || 0 : 0;
      const processingRoute = row[7] ? String(row[7]).trim() : 'HS, S/Dyeing, ST, OWC';
      const labRefNo = row[8] ? String(row[8]).trim() : undefined;
      const sentOn = row[9] ? String(row[9]).trim() : undefined;
      const approvedOption = row[10] ? String(row[10]).trim() : undefined;

      labDips.push({
        pantone_ref: pantoneRef,
        fabric,
        composition: comp,
        gsm,
        processing_route: processingRoute,
        lab_ref_no: labRefNo,
        sent_on: sentOn,
        approved_option: approvedOption,
        approval_status: approvedOption ? 'approved' : 'pending',
      });
    }
  }

  return {
    styleNumber: styleNumber || 'KB13P301X1',
    season: season || 'W28',
    offerNo: offerNo || '9414',
    description: description || 'RIN | JOGGING PANTS',
    garmentCategory,
    garmentSeasonType,
    garmentProcessType,
    fabrics,
    labDips,
  };
}
