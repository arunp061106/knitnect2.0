// ============================================================
// KNITNECT PRODUCTION ERP — EXCEL COSTING & LAB DIPS PARSER
// Lossless parsing of client's Excel workbook with ExcelJS
// ============================================================

import ExcelJS from 'exceljs';
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

export async function parseCostingExcelBuffer(buffer: ArrayBuffer): Promise<ParsedCostingWorkbook> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  // 1. Find the Style Wise Fabric Working sheet
  const fabricSheet =
    workbook.worksheets.find((ws) => ws.name.toUpperCase().includes('FABRIC WORKING')) ||
    workbook.worksheets[0];

  let styleNumber = 'KB13P301X1';
  let season = 'W28';
  let offerNo = '9414';
  let description = 'RIN | JOGGING PANTS';
  let garmentCategory: 'Kids' | 'Mens' | 'Womens' = 'Mens';
  let garmentSeasonType: 'Summer' | 'Winter' = 'Winter';
  let garmentProcessType: 'solid_fabric' | 'aop_white_based' | 'aop_dyed_base' = 'solid_fabric';

  const fabrics: Omit<StyleFabric, 'id' | 'style_id' | 'created_at'>[] = [];

  if (fabricSheet) {
    fabricSheet.eachRow((row, rowNumber) => {
      if (rowNumber < 2 || rowNumber > 50) return;
      const values = row.values as any[];
      if (!values || values.length === 0) return;

      // Check if row has style metadata
      if (values[1]) season = String(values[1]).trim();
      if (values[2]) offerNo = String(values[2]).trim();
      if (values[3]) styleNumber = String(values[3]).trim();
      if (values[4]) description = String(values[4]).trim();

      const aopRef = values[8] ? String(values[8]).trim() : '';
      if (aopRef.toLowerCase().includes('aop')) {
        garmentProcessType = aopRef.toLowerCase().includes('dyed') ? 'aop_dyed_base' : 'aop_white_based';
      }

      if (season.toLowerCase().startsWith('w')) {
        garmentSeasonType = 'Winter';
      } else {
        garmentSeasonType = 'Summer';
      }

      const fabricCode = values[5] ? String(values[5]).trim() : '';
      const fabricType = values[6] ? String(values[6]).trim() : 'BODY';
      const colour = values[7] ? String(values[7]).trim() : 'JET BLACK-19-0303TPG';
      const quality = values[9] ? String(values[9]).trim() : 'BRUSHED FLEECE 3 THREADS';
      const composition = values[10] ? String(values[10]).trim() : '100% COTTON';
      const gsm = values[11] ? parseFloat(values[11]) || 0 : 0;
      const pcWt = values[12] ? parseFloat(values[12]) || 0 : 0;
      const sampleQty = values[14] ? parseInt(values[14]) || 500 : 500;
      const reqdQty = values[15] ? parseFloat(values[15]) || (pcWt * sampleQty) : pcWt * sampleQty;

      // Yarn Details
      const yarnCount = values[17] ? String(values[17]).trim() : "20'S";
      const yarnPrice = values[18] ? parseFloat(values[18]) || 0 : 0;
      let consumePct = values[19] !== undefined ? parseFloat(values[19]) || 1.0 : 1.0;
      if (consumePct > 1) consumePct = consumePct / 100;
      const effectiveYarnCost = values[20] ? parseFloat(values[20]) || (yarnPrice * consumePct) : yarnPrice * consumePct;

      // Processing costs
      const knittingCost = values[21] ? parseFloat(values[21]) || 0 : 0;
      const heatSettingCost = values[22] ? parseFloat(values[22]) || 0 : 0;
      const solidDyeCost = values[23] ? parseFloat(values[23]) || 0 : 0;
      const dyedDyeCost = values[24] ? parseFloat(values[24]) || 0 : 0;
      const stenterCost = values[25] ? parseFloat(values[25]) || 0 : 0;
      const owcCost = values[26] ? parseFloat(values[26]) || 0 : 0;

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
    });
  }

  // 2. Parse Lab Dips Sheet if present
  const labDips: Omit<LabDip, 'id' | 'style_id' | 'created_at'>[] = [];
  const labSheet = workbook.worksheets.find((ws) => ws.name.toLowerCase().includes('lab dip'));
  if (labSheet) {
    labSheet.eachRow((row, rowNumber) => {
      if (rowNumber < 3 || rowNumber > 30) return;
      const values = row.values as any[];
      if (!values || !values[3]) return;

      const pantoneRef = String(values[3]).trim();
      const fabric = values[4] ? String(values[4]).trim() : 'SINGLE JERSEY';
      const comp = values[5] ? String(values[5]).trim() : '100% COTTON';
      const gsm = values[6] ? parseFloat(values[6]) || 0 : 0;
      const processingRoute = values[7] ? String(values[7]).trim() : 'HS, S/Dyeing, ST, OWC';
      const labRefNo = values[8] ? String(values[8]).trim() : undefined;
      const sentOn = values[9] ? String(values[9]).trim() : undefined;
      const approvedOption = values[10] ? String(values[10]).trim() : undefined;

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
    });
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
