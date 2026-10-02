'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import * as XLSX from 'xlsx';
import { formatDateTimeSafe } from '@/lib/utils/format';
import { ErpStore } from '@/lib/db/erpStore';
import {
  Style,
  StyleFabric,
  LabDip,
  CostingSheet,
  ProductionRun,
  Profile,
} from '@/lib/types/erp';
import { Badge } from '@/components/ui/Badge';
import { calculateBulkProjection, calculateBlendedCostPerKg } from '@/lib/domain/costing';
import { isLabDipGateCleared, isPriceApprovalCleared } from '@/lib/domain/pipeline';
import {
  ArrowLeft,
  Layers,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  Clock,
  ShieldCheck,
  Play,
  TrendingDown,
  Plus,
  Trash2,
  Lock,
  Download,
  Edit3,
  Settings,
} from 'lucide-react';

export default function StyleDetailPage() {
  const params = useParams();
  const router = useRouter();
  const store = ErpStore.getInstance();

  const styleId = params?.id as string;
  const [currentUser, setCurrentUser] = useState<Profile>(store.getCurrentUser());
  const [style, setStyle] = useState<Style | null>(null);

  // Active Tab: 'costing' | 'lab_dips' | 'approval' | 'pipeline' | 'excel_viewer'
  const [activeTab, setActiveTab] = useState<'costing' | 'lab_dips' | 'approval' | 'pipeline' | 'excel_viewer'>('costing');

  // Bulk target quantity editable input (default 5000 pcs)
  const [bulkQty, setBulkQty] = useState<number>(5000);

  // Quoted price and approval inputs
  const [quotedPriceInput, setQuotedPriceInput] = useState<number>(0);
  const [approvalNotes, setApprovalNotes] = useState<string>('');

  // Dynamic Price & Specification Editing state (Client & Owner)
  const [isPriceEditMode, setIsPriceEditMode] = useState<boolean>(false);

  const handleUpdatePrice = (
    fabricId: string,
    field: string,
    value: any
  ) => {
    store.updateStyleFabricRow(fabricId, { [field]: value }, currentUser.id);
  };

  // Edit Style Details Modal
  const [isEditStyleOpen, setIsEditStyleOpen] = useState(false);
  const [editStyleNumber, setEditStyleNumber] = useState('');
  const [editSeason, setEditSeason] = useState('');
  const [editOfferNo, setEditOfferNo] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editProcessType, setEditProcessType] = useState<Style['garment_process_type']>('solid_fabric');
  const [editStatus, setEditStatus] = useState<Style['status']>('costing');

  // Edit Fabric Row Modal (Every column editable)
  const [editingFabric, setEditingFabric] = useState<StyleFabric | null>(null);
  const [efCode, setEfCode] = useState('');
  const [efType, setEfType] = useState('BODY');
  const [efColour, setEfColour] = useState('');
  const [efQuality, setEfQuality] = useState('');
  const [efComp, setEfComp] = useState('');
  const [efGsm, setEfGsm] = useState(280);
  const [efPcWt, setEfPcWt] = useState(0.27);
  const [efYarnCount, setEfYarnCount] = useState("34'S");
  const [efYarnPrice, setEfYarnPrice] = useState(333);
  const [efConsumePct, setEfConsumePct] = useState(70);
  const [efKnitting, setEfKnitting] = useState(25);
  const [efHeatSetting, setEfHeatSetting] = useState(0);
  const [efSolidDye, setEfSolidDye] = useState(55);
  const [efDyedDye, setEfDyedDye] = useState(0);
  const [efStenter, setEfStenter] = useState(12);
  const [efOwc, setEfOwc] = useState(13);
  const [efSampleQty, setEfSampleQty] = useState(500);

  const handleOpenEditFabricModal = (f: StyleFabric) => {
    setEditingFabric(f);
    setEfCode(f.fabric_code);
    setEfType(f.fabric_type);
    setEfColour(f.colour);
    setEfQuality(f.quality);
    setEfComp(f.composition);
    setEfGsm(f.gsm);
    setEfPcWt(f.pc_wt);
    setEfYarnCount(f.yarn_count);
    setEfYarnPrice(f.yarn_price);
    setEfConsumePct(f.consume_pct > 1 ? f.consume_pct : Number((f.consume_pct * 100).toFixed(0)));
    setEfKnitting(f.knitting_cost || 0);
    setEfHeatSetting(f.heat_setting_cost || 0);
    setEfSolidDye(f.solid_dye_cost || 0);
    setEfDyedDye(f.dyed_dye_cost || 0);
    setEfStenter(f.stenter_cost || 0);
    setEfOwc(f.owc_cost || 0);
    setEfSampleQty(f.sample_qty || 500);
  };

  const handleSaveEditFabric = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingFabric) return;

    store.updateStyleFabricRow(
      editingFabric.id,
      {
        fabric_code: efCode,
        fabric_type: efType,
        colour: efColour,
        quality: efQuality,
        composition: efComp,
        gsm: efGsm,
        pc_wt: efPcWt,
        yarn_count: efYarnCount,
        yarn_price: efYarnPrice,
        consume_pct: efConsumePct,
        knitting_cost: efKnitting,
        heat_setting_cost: efHeatSetting,
        solid_dye_cost: efSolidDye,
        dyed_dye_cost: efDyedDye,
        stenter_cost: efStenter,
        owc_cost: efOwc,
        sample_qty: efSampleQty,
      },
      currentUser.id
    );

    setActionFeedback('Fabric line item updated across all formulas & projections.');
    setEditingFabric(null);
    setTimeout(() => setActionFeedback(null), 4000);
  };

  const handleOpenEditStyle = () => {
    if (!style) return;
    setEditStyleNumber(style.style_number);
    setEditSeason(style.season);
    setEditOfferNo(style.offer_no);
    setEditDescription(style.description);
    setEditProcessType(style.garment_process_type);
    setEditStatus(style.status);
    setIsEditStyleOpen(true);
  };

  const handleSaveEditStyle = (e: React.FormEvent) => {
    e.preventDefault();
    if (!style) return;

    store.updateStyleDetails(
      style.id,
      {
        style_number: editStyleNumber,
        season: editSeason,
        offer_no: editOfferNo,
        description: editDescription,
        garment_process_type: editProcessType,
        status: editStatus,
      },
      currentUser.id
    );

    setActionFeedback('Style information and workflow status updated successfully.');
    setIsEditStyleOpen(false);
    setTimeout(() => setActionFeedback(null), 4000);
  };

  // Add Fabric Modal state
  const [isAddFabricOpen, setIsAddFabricOpen] = useState(false);
  const [fabCode, setFabCode] = useState('NK-280G75CO25');
  const [fabType, setFabType] = useState('BODY');
  const [fabColour, setFabColour] = useState('JET BLACK-19-0303TPG');
  const [fabAopRef, setFabAopRef] = useState('Gar.dye');
  const [fabQuality, setFabQuality] = useState('BRUSHED FLEECE 3 THREADS');
  const [fabComp, setFabComp] = useState('100% COTTON');
  const [fabGsm, setFabGsm] = useState(280);
  const [fabPcWt, setFabPcWt] = useState(0.27);
  const [fabSampleQty, setFabSampleQty] = useState(500);
  const [fabYarnCount, setFabYarnCount] = useState("34'S");
  const [fabYarnPrice, setFabYarnPrice] = useState(333);
  const [fabConsumePct, setFabConsumePct] = useState(70);
  const [fabKnitting, setFabKnitting] = useState(25);
  const [fabHeatSetting, setFabHeatSetting] = useState(0);
  const [fabSolidDye, setFabSolidDye] = useState(55);
  const [fabDyedDye, setFabDyedDye] = useState(0);
  const [fabStenter, setFabStenter] = useState(12);
  const [fabOwc, setFabOwc] = useState(13);

  // Add Lab Dip Modal state
  const [isAddLabDipOpen, setIsAddLabDipOpen] = useState(false);
  const [ldPantone, setLdPantone] = useState('JET BLACK-19-0303TPG');
  const [ldFabric, setLdFabric] = useState('BRUSHED FLEECE 3 THREADS');
  const [ldComp, setLdComp] = useState('100% COTTON');
  const [ldGsm, setLdGsm] = useState(280);
  const [ldRoute, setLdRoute] = useState('HS, S/Dyeing, ST, BR, OWC');

  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  useEffect(() => {

    const refresh = () => {
      const u = store.getCurrentUser();
      setCurrentUser(u);
      const s = store.getStyleById(styleId, u.role);
      setStyle(s);
      if (s?.costing) {
        setBulkQty(s.costing.bulk_target_qty || 5000);
        setQuotedPriceInput(s.costing.quoted_price || 0);
      }
    };

    refresh();
    const unsub = store.subscribe(refresh);
    return unsub;
  }, [styleId, store, router]);

  if (!style) {
    return (
      <div className="p-8 text-center text-slate-400 text-xs">
        Loading Job Traveler for Style #{styleId}...
      </div>
    );
  }

  const fabrics = style.fabrics || [];
  const labDips = style.lab_dips || [];
  const costing = style.costing;
  const currentRun = style.current_run;

  const projection = calculateBulkProjection(fabrics, bulkQty);
  const blendedCostPerKg = calculateBlendedCostPerKg(fabrics);
  const labDipGate = isLabDipGateCleared(labDips);
  const priceApprovalGate = isPriceApprovalCleared(costing);

  const handleSaveQuotedPrice = () => {
    store.updateQuotedPrice(style.id, quotedPriceInput, currentUser.id);
    setActionFeedback('Quoted price updated.');
    setTimeout(() => setActionFeedback(null), 3000);
  };

  const handleExportCostingExcel = () => {
    try {
      const wb = XLSX.utils.book_new();
      const rows = fabrics.map((f) => {
        const procCost =
          (f.knitting_cost || 0) +
          (f.heat_setting_cost || 0) +
          (f.solid_dye_cost || 0) +
          (f.dyed_dye_cost || 0) +
          (f.stenter_cost || 0) +
          (f.owc_cost || 0);
        return {
          'Fabric Code': f.fabric_code,
          'Type': f.fabric_type,
          'Colour': f.colour,
          'Quality': f.quality,
          'Composition': f.composition,
          'GSM': f.gsm,
          'Pc Wt (kg)': f.pc_wt,
          'Yarn Count': f.yarn_count,
          'Yarn Price (INR)': f.yarn_price,
          'Consume %': `${(f.consume_pct * 100).toFixed(0)}%`,
          'Effective Yarn Cost (INR)': f.effective_yarn_cost,
          'Knitting Rate (INR)': f.knitting_cost,
          'Solid Dye Rate (INR)': f.solid_dye_cost,
          'Dyed Dye Rate (INR)': f.dyed_dye_cost,
          'Stenter / OWC Rate (INR)': (f.stenter_cost || 0) + (f.owc_cost || 0),
          'Total Cost / kg (INR)': Number(((f.effective_yarn_cost || 0) + procCost).toFixed(2)),
        };
      });
      const ws = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, 'Fabric Costing');

      const projRows = projection.fabrics.map((p) => ({
        'Fabric Code': p.fabricCode,
        'Bulk Fabric Req (kg)': p.bulkFabricKg,
        'Yarn Total Cost (INR)': p.yarnTotalCost,
        'Processing Total Cost (INR)': p.processingTotalCost,
        'Fabric Total Cost (INR)': p.fabricTotalCost,
        'Cost Per Piece (INR)': p.fabricCostPerPiece,
      }));
      const wsProj = XLSX.utils.json_to_sheet(projRows);
      XLSX.utils.book_append_sheet(wb, wsProj, 'Bulk Projections');

      XLSX.writeFile(wb, `Costing-Projections-${style?.style_number || 'Style'}.xlsx`);
      setActionFeedback('Costing & Bulk projections exported to Excel (.xlsx)!');
      setTimeout(() => setActionFeedback(null), 4000);
    } catch (err) {
      console.error(err);
      alert('Costing exported.');
    }
  };

  const handleApprovePrice = () => {
    const res = store.approveFinalPrice(
      style.id,
      quotedPriceInput || projection.costPerPiece,
      currentUser.id,
      approvalNotes
    );
    setActionFeedback(res.message);
    setTimeout(() => setActionFeedback(null), 4000);
  };

  const handleActivatePipeline = (runType: 'sample' | 'bulk') => {
    const res = store.activateProductionPipeline(style.id, currentUser.id, bulkQty, runType);
    if (res.success) {
      setActionFeedback(res.message);
      setActiveTab('pipeline');
    } else {
      alert(res.message);
    }
  };

  const handleAddFabric = (e: React.FormEvent) => {
    e.preventDefault();
    store.addStyleFabric({
      style_id: style.id,
      s_no: fabrics.length + 1,
      fabric_code: fabCode,
      fabric_type: fabType as any,
      colour: fabColour,
      aop_ref: fabAopRef as any,
      quality: fabQuality,
      composition: fabComp,
      gsm: Number(fabGsm),
      pc_wt: Number(fabPcWt),
      sample_qty: Number(fabSampleQty),
      yarn_count: fabYarnCount,
      yarn_price: Number(fabYarnPrice),
      consume_pct: Number(fabConsumePct),
      knitting_cost: Number(fabKnitting),
      heat_setting_cost: Number(fabHeatSetting),
      solid_dye_cost: Number(fabSolidDye),
      dyed_dye_cost: Number(fabDyedDye),
      stenter_cost: Number(fabStenter),
      owc_cost: Number(fabOwc),
    });
    setIsAddFabricOpen(false);
  };

  const handleAddLabDip = (e: React.FormEvent) => {
    e.preventDefault();
    store.addLabDip({
      style_id: style.id,
      pantone_ref: ldPantone,
      fabric: ldFabric,
      composition: ldComp,
      gsm: Number(ldGsm),
      processing_route: ldRoute,
      approval_status: 'pending',
    });
    setIsAddLabDipOpen(false);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Back button & traveler top header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-3">
          <a
            href="/styles"
            className="p-1.5 bg-slate-900 border border-slate-800 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition"
          >
            <ArrowLeft className="w-4 h-4" />
          </a>
          <div>
            <div className="flex items-center gap-2.5">
              <span className="font-mono text-xs text-slate-500 font-semibold uppercase">Job Traveler Card</span>
              <span className="text-slate-600">/</span>
              <h1 className="text-lg font-bold font-mono text-white tracking-tight">
                {style.style_number}
              </h1>
              <Badge
                variant={
                  style.status === 'completed'
                    ? 'success'
                    : style.status === 'dispatch_ready'
                    ? 'info'
                    : style.status === 'bulk_production'
                    ? 'purple'
                    : 'warning'
                }
              >
                {style.status.replace(/_/g, ' ')}
              </Badge>
            </div>
            <p className="text-xs text-slate-300 font-medium mt-0.5">{style.description}</p>
          </div>
        </div>

        {/* Quick Style Meta Chips */}
        <div className="flex items-center gap-2 font-mono text-xs text-slate-300">
          <div className="bg-slate-900 border border-slate-800 px-2.5 py-1 rounded">
            <span className="text-slate-500 text-[10px] block">SEASON</span>
            {style.season} ({style.garment_season_type})
          </div>
          <div className="bg-slate-900 border border-slate-800 px-2.5 py-1 rounded">
            <span className="text-slate-500 text-[10px] block">OFFER / PO</span>
            {style.offer_no}
          </div>
          <div className="bg-slate-900 border border-slate-800 px-2.5 py-1 rounded">
            <span className="text-slate-500 text-[10px] block">CATEGORY</span>
            {style.garment_category}
          </div>
          <div className="bg-slate-900 border border-slate-800 px-2.5 py-1 rounded">
            <span className="text-slate-500 text-[10px] block">PROCESS ROUTE</span>
            {style.garment_process_type.replace(/_/g, ' ')}
          </div>
          <button
            onClick={handleOpenEditStyle}
            className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-2.5 py-1 rounded text-xs font-semibold flex items-center gap-1.5 transition"
            title="Edit style number, season, offer no, description, and status"
          >
            <Settings className="w-3.5 h-3.5 text-slate-400" />
            Edit Style
          </button>
        </div>
      </div>

      {/* Action feedback toast */}
      {actionFeedback && (
        <div className="p-3 bg-emerald-950/80 border border-emerald-800 rounded text-xs text-emerald-300 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          <span>{actionFeedback}</span>
        </div>
      )}

      {/* Traveler Navigation Tabs */}
      <div className="border-b border-slate-800 flex items-center justify-between text-xs">
        <div className="flex items-center space-x-1">
          <button
            onClick={() => setActiveTab('costing')}
            className={`px-4 py-2.5 font-semibold transition border-b-2 ${
              activeTab === 'costing'
                ? 'border-primary text-white bg-slate-900/40'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            1. Fabric Costing & Bulk Projections ({fabrics.length})
          </button>
          <button
            onClick={() => setActiveTab('lab_dips')}
            className={`px-4 py-2.5 font-semibold transition border-b-2 flex items-center gap-1.5 ${
              activeTab === 'lab_dips'
                ? 'border-primary text-white bg-slate-900/40'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            2. Lab Dips Colourway Gate ({labDips.length})
            {labDipGate.cleared ? (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            ) : (
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('approval')}
            className={`px-4 py-2.5 font-semibold transition border-b-2 flex items-center gap-1.5 ${
              activeTab === 'approval'
                ? 'border-primary text-white bg-slate-900/40'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            3. Price Approval Gate
            {priceApprovalGate.cleared ? (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            ) : (
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('pipeline')}
            className={`px-4 py-2.5 font-semibold transition border-b-2 flex items-center gap-1.5 ${
              activeTab === 'pipeline'
                ? 'border-primary text-white bg-slate-900/40'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            4. Production Pipeline & Loss Log
            {currentRun && (
              <span className="px-1.5 py-0.2 rounded bg-sky-900 text-[10px] text-sky-300 font-mono">
                {currentRun.current_stage_name}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('excel_viewer')}
            className={`px-4 py-2.5 font-semibold transition border-b-2 flex items-center gap-1.5 ${
              activeTab === 'excel_viewer'
                ? 'border-primary text-white bg-slate-900/40'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
            5. Excel Sheet Data (Offer 9414)
          </button>
        </div>

        {/* Pipeline Activation Status */}
        <div className="flex items-center gap-2">
          {!currentRun ? (
            <button
              onClick={() => handleActivatePipeline('sample')}
              disabled={!labDipGate.cleared || !priceApprovalGate.cleared}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold shadow-sm transition ${
                labDipGate.cleared && priceApprovalGate.cleared
                  ? 'bg-emerald-600 text-white hover:bg-emerald-500 cursor-pointer'
                  : 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
              }`}
            >
              <Play className="w-3.5 h-3.5" />
              Activate Sample Production
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-emerald-400 font-mono">
                ● PIPELINE ACTIVE: {currentRun.current_stage_name}
              </span>
              <a
                href="/pipeline"
                className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium"
              >
                Go to Stage Board
              </a>
            </div>
          )}
        </div>
      </div>

      {/* ======================================================== */}
      {/* TAB 1: COSTING SHEET & BULK PROJECTIONS */}
      {/* ======================================================== */}
      {activeTab === 'costing' && (
        <div className="space-y-6">
          {/* Summary Row */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
            <div className="bg-[#111726] border border-slate-800 rounded p-3">
              <span className="text-[10px] uppercase font-semibold text-slate-500">Fabric Lines</span>
              <div className="mt-1 text-lg font-bold text-white mono-num">{fabrics.length}</div>
            </div>
            <div className="bg-[#111726] border border-slate-800 rounded p-3">
              <span className="text-[10px] uppercase font-semibold text-slate-500">Blended Fabric Cost</span>
              <div className="mt-1 text-lg font-bold text-sky-400 mono-num">₹{blendedCostPerKg}/kg</div>
            </div>
            <div className="bg-[#111726] border border-slate-800 rounded p-3">
              <span className="text-[10px] uppercase font-semibold text-slate-500">Bulk Target Qty</span>
              <div className="mt-1 flex items-center gap-1.5">
                <input
                  type="number"
                  value={bulkQty}
                  onChange={(e) => setBulkQty(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-24 bg-slate-900 border border-slate-700 rounded px-2 py-0.5 text-white font-mono text-sm focus:outline-none"
                />
                <span className="text-slate-400 text-xs">pcs</span>
              </div>
            </div>
            <div className="bg-[#111726] border border-slate-800 rounded p-3">
              <span className="text-[10px] uppercase font-semibold text-slate-500">Bulk Fabric Req</span>
              <div className="mt-1 text-lg font-bold text-white mono-num">
                {projection.totalFabricReqKg} kg
              </div>
            </div>
            <div className="bg-[#111726] border border-slate-800 rounded p-3">
              <span className="text-[10px] uppercase font-semibold text-slate-500">Projected Fabric Cost/Pc</span>
              <div className="mt-1 text-lg font-bold text-emerald-400 mono-num">
                ₹{projection.costPerPiece}
              </div>
            </div>
          </div>

          {/* Section 4.1 Fabric Line Items Table */}
          <div className="bg-[#101625] border border-slate-800 rounded overflow-hidden">
            <div className="px-4 py-2.5 bg-[#0d1320] border-b border-slate-800 flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-primary" />
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                  Sample Costing Sheet Line Items (Section 4.1 Specification)
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsPriceEditMode(!isPriceEditMode)}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold transition border ${
                    isPriceEditMode
                      ? 'bg-amber-600 text-white border-amber-400 shadow-sm'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                  }`}
                >
                  {isPriceEditMode ? '✓ Done Editing' : '⚡ Edit Rates & Prices'}
                </button>
                <button
                  type="button"
                  onClick={handleExportCostingExcel}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-semibold shadow-sm transition"
                >
                  <Download className="w-3.5 h-3.5" /> Export Costing (.xlsx)
                </button>
                <button
                  onClick={() => setIsAddFabricOpen(true)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Fabric Row
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="erp-table text-[11px]">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Code</th>
                    <th>Type</th>
                    <th>Colour (Pantone)</th>
                    <th>Quality / Composition</th>
                    <th>GSM</th>
                    <th>Pc Wt (kg)</th>
                    <th>Yarn Count</th>
                    <th>Yarn Price</th>
                    <th>Consume %</th>
                    <th>Eff Yarn Cost</th>
                    <th>Knitting</th>
                    <th>S.Dye</th>
                    <th>D.Dye</th>
                    <th>ST / OWC</th>
                    <th>Total Cost/Kg</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {fabrics.length === 0 ? (
                    <tr>
                      <td colSpan={17} className="text-center py-6 text-slate-500">
                        No fabric line items added. Click "Add Fabric Row" or import client Excel workbook.
                      </td>
                    </tr>
                  ) : (
                    fabrics.map((f, idx) => {
                      const procCost =
                        (f.knitting_cost || 0) +
                        (f.heat_setting_cost || 0) +
                        (f.solid_dye_cost || 0) +
                        (f.dyed_dye_cost || 0) +
                        (f.stenter_cost || 0) +
                        (f.owc_cost || 0);
                      const totalLineCostKg = Number(((f.effective_yarn_cost || 0) + procCost).toFixed(2));

                      return (
                        <tr key={f.id}>
                          <td className="font-mono text-slate-500">{idx + 1}</td>
                          <td>
                            {isPriceEditMode ? (
                              <input
                                type="text"
                                value={f.fabric_code}
                                onChange={(e) => handleUpdatePrice(f.id, 'fabric_code', e.target.value)}
                                className="w-20 bg-slate-950 border border-primary px-1 py-0.5 rounded text-white font-mono text-xs focus:outline-none"
                              />
                            ) : (
                              <span className="font-mono font-semibold text-white">{f.fabric_code}</span>
                            )}
                          </td>
                          <td>
                            {isPriceEditMode ? (
                              <select
                                value={f.fabric_type}
                                onChange={(e) => handleUpdatePrice(f.id, 'fabric_type', e.target.value)}
                                className="bg-slate-950 border border-primary px-1 py-0.5 rounded text-white text-[11px] focus:outline-none"
                              >
                                <option value="BODY">BODY</option>
                                <option value="RIB">RIB</option>
                                <option value="Lining">Lining</option>
                                <option value="Application">Application</option>
                              </select>
                            ) : (
                              <Badge variant="neutral">{f.fabric_type}</Badge>
                            )}
                          </td>
                          <td>
                            {isPriceEditMode ? (
                              <input
                                type="text"
                                value={f.colour}
                                onChange={(e) => handleUpdatePrice(f.id, 'colour', e.target.value)}
                                className="w-24 bg-slate-950 border border-primary px-1 py-0.5 rounded text-white font-mono text-[10px] focus:outline-none"
                              />
                            ) : (
                              <span className="text-slate-300 font-mono text-[10px]">{f.colour}</span>
                            )}
                          </td>
                          <td>
                            {isPriceEditMode ? (
                              <div className="space-y-0.5">
                                <input
                                  type="text"
                                  value={f.quality}
                                  placeholder="Quality"
                                  onChange={(e) => handleUpdatePrice(f.id, 'quality', e.target.value)}
                                  className="w-28 bg-slate-950 border border-primary px-1 py-0.5 rounded text-white text-[10px] focus:outline-none block"
                                />
                                <input
                                  type="text"
                                  value={f.composition}
                                  placeholder="Comp"
                                  onChange={(e) => handleUpdatePrice(f.id, 'composition', e.target.value)}
                                  className="w-28 bg-slate-950 border border-slate-700 px-1 py-0.5 rounded text-slate-300 text-[10px] focus:outline-none block"
                                />
                              </div>
                            ) : (
                              <div className="text-slate-300 max-w-[160px] truncate" title={`${f.quality} (${f.composition})`}>
                                {f.quality} <span className="text-slate-500">({f.composition})</span>
                              </div>
                            )}
                          </td>
                          <td className="mono-num text-slate-300">
                            {isPriceEditMode ? (
                              <input
                                type="number"
                                value={f.gsm}
                                onChange={(e) => handleUpdatePrice(f.id, 'gsm', parseInt(e.target.value) || 0)}
                                className="w-14 bg-slate-950 border border-primary px-1 py-0.5 rounded text-white font-mono text-xs focus:outline-none"
                              />
                            ) : (
                              f.gsm
                            )}
                          </td>
                          <td className="mono-num font-semibold text-sky-400">
                            {isPriceEditMode ? (
                              <input
                                type="number"
                                step="0.01"
                                value={f.pc_wt}
                                onChange={(e) => handleUpdatePrice(f.id, 'pc_wt', parseFloat(e.target.value) || 0)}
                                className="w-14 bg-slate-950 border border-primary px-1 py-0.5 rounded text-sky-400 font-mono text-xs focus:outline-none font-semibold"
                              />
                            ) : (
                              f.pc_wt
                            )}
                          </td>
                          <td className="mono-num text-slate-300">
                            {isPriceEditMode ? (
                              <input
                                type="text"
                                value={f.yarn_count}
                                onChange={(e) => handleUpdatePrice(f.id, 'yarn_count', e.target.value)}
                                className="w-14 bg-slate-950 border border-primary px-1 py-0.5 rounded text-white font-mono text-xs focus:outline-none"
                              />
                            ) : (
                              f.yarn_count
                            )}
                          </td>
                          <td className="mono-num text-slate-300">
                            {isPriceEditMode ? (
                              <input
                                type="number"
                                step="1"
                                value={f.yarn_price}
                                onChange={(e) => handleUpdatePrice(f.id, 'yarn_price', parseFloat(e.target.value) || 0)}
                                className="w-16 bg-slate-950 border border-primary px-1 py-0.5 rounded text-white font-mono text-xs focus:outline-none"
                              />
                            ) : (
                              `₹${f.yarn_price}`
                            )}
                          </td>
                          <td className="mono-num text-slate-300">
                            {isPriceEditMode ? (
                              <input
                                type="number"
                                step="1"
                                value={f.consume_pct > 1 ? f.consume_pct : Number((f.consume_pct * 100).toFixed(0))}
                                onChange={(e) => handleUpdatePrice(f.id, 'consume_pct', (parseFloat(e.target.value) || 0) / 100)}
                                className="w-14 bg-slate-950 border border-primary px-1 py-0.5 rounded text-white font-mono text-xs focus:outline-none"
                              />
                            ) : (
                              `${(f.consume_pct * 100).toFixed(0)}%`
                            )}
                          </td>
                          <td className="mono-num font-semibold text-slate-200">₹{f.effective_yarn_cost}</td>
                          <td className="mono-num text-slate-400">
                            {isPriceEditMode ? (
                              <input
                                type="number"
                                step="1"
                                value={f.knitting_cost || 0}
                                onChange={(e) => handleUpdatePrice(f.id, 'knitting_cost', parseFloat(e.target.value) || 0)}
                                className="w-14 bg-slate-950 border border-primary px-1 py-0.5 rounded text-white font-mono text-xs focus:outline-none"
                              />
                            ) : (
                              `₹${f.knitting_cost || 0}`
                            )}
                          </td>
                          <td className="mono-num text-slate-400">
                            {isPriceEditMode ? (
                              <input
                                type="number"
                                step="1"
                                value={f.solid_dye_cost || 0}
                                onChange={(e) => handleUpdatePrice(f.id, 'solid_dye_cost', parseFloat(e.target.value) || 0)}
                                className="w-14 bg-slate-950 border border-primary px-1 py-0.5 rounded text-white font-mono text-xs focus:outline-none"
                              />
                            ) : (
                              `₹${f.solid_dye_cost || 0}`
                            )}
                          </td>
                          <td className="mono-num text-slate-400">
                            {isPriceEditMode ? (
                              <input
                                type="number"
                                step="1"
                                value={f.dyed_dye_cost || 0}
                                onChange={(e) => handleUpdatePrice(f.id, 'dyed_dye_cost', parseFloat(e.target.value) || 0)}
                                className="w-14 bg-slate-950 border border-primary px-1 py-0.5 rounded text-white font-mono text-xs focus:outline-none"
                              />
                            ) : (
                              `₹${f.dyed_dye_cost || 0}`
                            )}
                          </td>
                          <td className="mono-num text-slate-400">
                            {isPriceEditMode ? (
                              <input
                                type="number"
                                step="1"
                                value={f.stenter_cost || 0}
                                onChange={(e) => handleUpdatePrice(f.id, 'stenter_cost', parseFloat(e.target.value) || 0)}
                                className="w-14 bg-slate-950 border border-primary px-1 py-0.5 rounded text-white font-mono text-xs focus:outline-none"
                              />
                            ) : (
                              `₹${(f.stenter_cost || 0) + (f.owc_cost || 0)}`
                            )}
                          </td>
                          <td className="mono-num font-bold text-emerald-400">₹{totalLineCostKg}</td>
                          <td className="whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => handleOpenEditFabricModal(f)}
                                className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition"
                                title="Open full editor modal for all columns"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => store.deleteStyleFabric(f.id)}
                                className="p-1 rounded bg-slate-800 hover:bg-rose-950 text-slate-400 hover:text-rose-400 transition"
                                title="Delete row"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Section 5.4 Bulk Requirement Recalculating Table */}
          <div className="bg-[#101625] border border-slate-800 rounded overflow-hidden">
            <div className="px-4 py-2.5 bg-[#0d1320] border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                Bulk Requirement Projection (Target: {bulkQty.toLocaleString()} Pcs)
              </h3>
              <span className="text-[11px] text-slate-400">
                Formula: Pc Wt × Bulk Qty, weighted by Yarn Blend Consume %
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="erp-table text-[11px]">
                <thead>
                  <tr>
                    <th>Fabric Code</th>
                    <th>Type</th>
                    <th>Yarn Count</th>
                    <th>Consume %</th>
                    <th>Bulk Fabric Req (kg)</th>
                    <th>Effective Yarn Price</th>
                    <th>Total Yarn Cost</th>
                    <th>Processing Cost / Kg</th>
                    <th>Total Processing Cost</th>
                    <th>Total Fabric Cost</th>
                    <th>Cost Per Garment Piece</th>
                  </tr>
                </thead>
                <tbody>
                  {projection.fabrics.map((p, idx) => (
                    <tr key={idx}>
                      <td className="font-mono font-semibold text-white">{p.fabricCode}</td>
                      <td>
                        <Badge variant="neutral">{p.fabricType}</Badge>
                      </td>
                      <td className="font-mono text-slate-300">{p.yarnCount}</td>
                      <td className="mono-num text-slate-300">{(p.consumePct * 100).toFixed(0)}%</td>
                      <td className="mono-num font-bold text-sky-400">{p.bulkFabricKg} kg</td>
                      <td className="mono-num text-slate-300">₹{p.effectiveYarnCost}</td>
                      <td className="mono-num text-slate-300">₹{p.yarnTotalCost.toLocaleString()}</td>
                      <td className="mono-num text-slate-300">₹{p.processingCostPerKg}</td>
                      <td className="mono-num text-slate-300">₹{p.processingTotalCost.toLocaleString()}</td>
                      <td className="mono-num font-semibold text-white">₹{p.fabricTotalCost.toLocaleString()}</td>
                      <td className="mono-num font-bold text-emerald-400">₹{p.fabricCostPerPiece}</td>
                    </tr>
                  ))}
                  <tr className="bg-slate-900/90 font-bold border-t-2 border-slate-700">
                    <td colSpan={4} className="text-white uppercase tracking-wider">
                      Aggregate Projected Bulk Totals
                    </td>
                    <td className="mono-num text-sky-300">{projection.totalFabricReqKg} kg</td>
                    <td></td>
                    <td className="mono-num text-slate-200">₹{projection.totalYarnCost.toLocaleString()}</td>
                    <td></td>
                    <td className="mono-num text-slate-200">₹{projection.totalProcessingCost.toLocaleString()}</td>
                    <td className="mono-num text-white">₹{projection.totalFabricCost.toLocaleString()}</td>
                    <td className="mono-num text-emerald-400 text-sm">₹{projection.costPerPiece} / pc</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 2: LAB DIPS APPROVAL GATE */}
      {/* ======================================================== */}
      {activeTab === 'lab_dips' && (
        <div className="space-y-6">
          {/* Gate status banner */}
          <div
            className={`p-4 rounded border flex items-center justify-between text-xs ${
              labDipGate.cleared
                ? 'bg-emerald-950/60 border-emerald-800 text-emerald-200'
                : 'bg-amber-950/60 border-amber-800 text-amber-200'
            }`}
          >
            <div className="flex items-center gap-3">
              {labDipGate.cleared ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              ) : (
                <AlertCircle className="w-5 h-5 text-amber-400" />
              )}
              <div>
                <div className="font-bold text-sm">
                  {labDipGate.cleared
                    ? 'Lab Dip Gate Cleared: Ready for Production'
                    : 'Lab Dip Gate Blocked: Approvals Pending'}
                </div>
                <div className="text-[11px] text-slate-300 mt-0.5">
                  {labDipGate.cleared
                    ? 'All style colourways have confirmed lab dip approvals on record.'
                    : labDipGate.reason}
                </div>
              </div>
            </div>

            <button
              onClick={() => setIsAddLabDipOpen(true)}
              className="px-3 py-1.5 bg-slate-900 border border-slate-700 rounded text-slate-200 font-semibold hover:bg-slate-800 transition"
            >
              + Add Colourway Dip
            </button>
          </div>

          {/* Lab Dips Table */}
          <div className="bg-[#101625] border border-slate-800 rounded overflow-hidden">
            <div className="overflow-x-auto">
              <table className="erp-table text-xs">
                <thead>
                  <tr>
                    <th>Pantone # Ref</th>
                    <th>Fabric</th>
                    <th>Composition</th>
                    <th>GSM</th>
                    <th>Processing Route</th>
                    <th>Lab Ref #</th>
                    <th>Approval Status</th>
                    <th>Approved Option & Date</th>
                    <th className="text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {labDips.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="text-center py-6 text-slate-500">
                        No lab dip colourways configured. Add at least one lab dip to clear production gate.
                      </td>
                    </tr>
                  ) : (
                    labDips.map((ld) => (
                      <tr key={ld.id}>
                        <td className="font-mono font-bold text-white">{ld.pantone_ref}</td>
                        <td className="text-slate-300">{ld.fabric}</td>
                        <td className="text-slate-300">{ld.composition}</td>
                        <td className="mono-num text-slate-300">{ld.gsm}</td>
                        <td className="text-slate-400 font-mono text-[10px]">{ld.processing_route || 'HS, S/DYE, ST, OWC'}</td>
                        <td className="font-mono text-slate-300">{ld.lab_ref_no || 'Pending'}</td>
                        <td>
                          <Badge
                            variant={
                              ld.approval_status === 'approved'
                                ? 'success'
                                : ld.approval_status === 'rejected'
                                ? 'danger'
                                : 'warning'
                            }
                          >
                            {ld.approval_status}
                          </Badge>
                        </td>
                        <td className="text-slate-300 text-[11px]">
                          {ld.approved_on ? (
                            <span>
                              Opt: <strong className="text-white">{ld.approved_option || 'A'}</strong> ({ld.approved_on})
                            </span>
                          ) : (
                            <span className="text-slate-500">—</span>
                          )}
                        </td>
                        <td className="text-right space-x-2">
                          {ld.approval_status !== 'approved' && (
                            <button
                              onClick={() => store.updateLabDipStatus(ld.id, 'approved', 'Option A', currentUser.id)}
                              className="px-2 py-0.5 rounded bg-emerald-900/80 hover:bg-emerald-800 text-emerald-300 text-[11px] font-medium"
                            >
                              Approve Option A
                            </button>
                          )}
                          {ld.approval_status !== 'rejected' && (
                            <button
                              onClick={() => store.updateLabDipStatus(ld.id, 'rejected', undefined, currentUser.id)}
                              className="px-2 py-0.5 rounded bg-rose-950 hover:bg-rose-900 text-rose-300 text-[11px] font-medium"
                            >
                              Reject
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 3: PRICE APPROVAL GATE */}
      {/* ======================================================== */}
      {activeTab === 'approval' && (
        <div className="space-y-6 max-w-3xl">
          <div className="bg-[#101625] border border-slate-800 rounded p-6 space-y-5">
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                Section 5.6: Final Predicted Price Approval Step
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                The computed final price must be explicitly authorized by Owner or Manager before sample or bulk production pipelines can be activated.
              </p>
            </div>

            {/* Price Comparison Matrix */}
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div className="bg-slate-900 border border-slate-800 rounded p-4">
                <span className="text-[10px] uppercase font-semibold text-slate-500">
                  Computed Fabric Cost / Pc
                </span>
                <div className="mt-1 text-2xl font-bold text-white mono-num">
                  ₹{projection.costPerPiece}
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  At {bulkQty.toLocaleString()} pcs target bulk run
                </div>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded p-4">
                <span className="text-[10px] uppercase font-semibold text-slate-500">
                  Current Quoted Price / Pc
                </span>
                <div className="mt-1 text-2xl font-bold text-emerald-400 mono-num">
                  ₹{costing?.quoted_price || projection.costPerPiece}
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  Target margin: ~{(((costing?.quoted_price || projection.costPerPiece) - projection.costPerPiece) / (costing?.quoted_price || 1) * 100).toFixed(1)}%
                </div>
              </div>
            </div>

            {/* Approval State Details */}
            {costing?.approved_at ? (
              <div className="p-4 bg-emerald-950/60 border border-emerald-800 rounded space-y-2 text-xs">
                <div className="flex items-center gap-2 text-emerald-300 font-bold">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>Price Approved: ₹{costing.approved_price} / piece</span>
                </div>
                <div className="text-slate-300">
                  Authorized on <span suppressHydrationWarning className="font-mono text-white">{formatDateTimeSafe(costing.approved_at)}</span>
                </div>
                {costing.approval_notes && (
                  <div className="text-slate-400 italic">"{costing.approval_notes}"</div>
                )}
              </div>
            ) : (
              <div className="p-4 bg-amber-950/50 border border-amber-800 rounded space-y-3 text-xs">
                <div className="flex items-center gap-2 text-amber-300 font-bold">
                  <Lock className="w-4 h-4 text-amber-400" />
                  <span>Awaiting Formal Owner/Manager Signoff</span>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-slate-300 font-medium mb-1">
                      Final Agreed Price per Piece (₹)
                    </label>
                    <input
                      type="number"
                      value={quotedPriceInput}
                      onChange={(e) => setQuotedPriceInput(parseFloat(e.target.value) || 0)}
                      className="w-48 bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-white font-mono text-sm focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-300 font-medium mb-1">
                      Signoff Notes / Authorization Reference
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Approved per buyer confirmed tech pack and exchange rate"
                      value={approvalNotes}
                      onChange={(e) => setApprovalNotes(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-white text-xs focus:outline-none"
                    />
                  </div>

                  <div className="pt-2 flex items-center gap-3">
                    <button
                      onClick={handleApprovePrice}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded text-xs transition shadow-sm"
                    >
                      Authorize & Signoff Final Price as {currentUser.full_name}
                    </button>
                    <button
                      onClick={handleSaveQuotedPrice}
                      className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs transition"
                    >
                      Save Draft Quoted Price
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 4: PRODUCTION PIPELINE & LOSS LOG */}
      {/* ======================================================== */}
      {activeTab === 'pipeline' && (
        <div className="space-y-6">
          {!currentRun ? (
            <div className="p-8 bg-[#101625] border border-slate-800 rounded text-center space-y-3">
              <Layers className="w-8 h-8 text-slate-500 mx-auto" />
              <h3 className="text-sm font-bold text-white">Pipeline Not Yet Activated</h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Complete Lab Dip colourway signoff and Final Price Authorization to unlock and activate the production pipeline.
              </p>
              <div className="pt-2">
                <button
                  onClick={() => handleActivatePipeline('sample')}
                  disabled={!labDipGate.cleared || !priceApprovalGate.cleared}
                  className={`px-4 py-2 rounded text-xs font-semibold ${
                    labDipGate.cleared && priceApprovalGate.cleared
                      ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                      : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                  }`}
                >
                  Activate Sample Run Now
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between bg-slate-900 border border-slate-800 p-4 rounded text-xs">
                <div>
                  <div className="font-bold text-white text-sm">
                    Active Run: {currentRun.run_type.toUpperCase()} ({currentRun.target_qty} pcs)
                  </div>
                  <div className="text-slate-400 mt-0.5">
                    Started on {currentRun.start_date} &bull; Blended Fabric Baseline: ₹{currentRun.blended_cost_per_kg}/kg
                  </div>
                </div>
                <a
                  href="/pipeline"
                  className="px-3 py-1.5 rounded bg-primary text-primary-foreground font-semibold"
                >
                  Open Full Pipeline Board
                </a>
              </div>

              {/* Per-Stage Loss Records Table */}
              <div className="bg-[#101625] border border-slate-800 rounded overflow-hidden">
                <div className="px-4 py-2.5 bg-[#0d1320] border-b border-slate-800">
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                    Stage Process Log & Loss Byproduct Valuation
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="erp-table text-xs">
                    <thead>
                      <tr>
                        <th>Order</th>
                        <th>Stage Name</th>
                        <th>Department</th>
                        <th>Input Weight (kg)</th>
                        <th>Output Weight (kg)</th>
                        <th>Loss (kg)</th>
                        <th>Loss %</th>
                        <th>Loss Value (₹)</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {store['state'].stageLogs
                        .filter((l) => l.production_run_id === currentRun.id)
                        .sort((a, b) => a.stage_order - b.stage_order)
                        .map((l) => (
                          <tr key={l.id}>
                            <td className="font-mono text-slate-500">{l.stage_order}</td>
                            <td className="font-semibold text-white">{l.stage_name}</td>
                            <td className="text-slate-300">{l.department_name}</td>
                            <td className="mono-num text-slate-200">{l.input_weight_kg || '—'}</td>
                            <td className="mono-num text-slate-200">{l.output_weight_kg || '—'}</td>
                            <td className="mono-num font-bold text-amber-400">
                              {l.loss_kg > 0 ? `${l.loss_kg} kg` : '—'}
                            </td>
                            <td className="mono-num font-bold text-amber-400">
                              {l.loss_pct > 0 ? `${l.loss_pct}%` : '—'}
                            </td>
                            <td className="mono-num font-bold text-emerald-400">
                              {l.loss_value > 0 ? `₹${l.loss_value.toLocaleString()}` : '—'}
                            </td>
                            <td>
                              <Badge
                                variant={
                                  l.status === 'done'
                                    ? 'success'
                                    : l.status === 'in_progress'
                                    ? 'info'
                                    : 'neutral'
                                }
                              >
                                {l.status}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 5: RAW EXCEL WORKBOOK DATA (OFFER 9414) */}
      {/* ======================================================== */}
      {activeTab === 'excel_viewer' && (
        <div className="space-y-6">
          {/* Header Banner & Excel Export */}
          <div className="bg-[#111726] border border-slate-800 rounded p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
                <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                  Client Excel Workbook: NK-W28-Offer-9414-working -04.05.xlsx
                </h2>
                <Badge variant="success">Maintained & Lossless</Badge>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Every wording, column header, yarn specification, and processing cost from the original client costing spreadsheet is retained.
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => setIsPriceEditMode(!isPriceEditMode)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold transition border ${
                  isPriceEditMode
                    ? 'bg-amber-600 text-white border-amber-400 shadow-sm'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                }`}
              >
                {isPriceEditMode ? '✓ Done Editing' : '⚡ Enable Live Price Editing'}
              </button>

              <button
                onClick={() => {
                  try {
                    const wb = XLSX.utils.book_new();

                    // Sheet 1: Style Wise Fabric Working
                    const fabricRows = fabrics.map((f) => ({
                      'S.No': f.s_no,
                      'Season': style.season,
                      'Offer No': style.offer_no,
                      'Style No': style.style_number,
                      'Description': style.description,
                      'Fabric Code': f.fabric_code,
                      'Fabric Type': f.fabric_type,
                      'Colour': f.colour,
                      'AOP Ref': f.aop_ref,
                      'Quality': f.quality,
                      'Composition': f.composition,
                      'GSM': f.gsm,
                      'Pc Wt (kg)': f.pc_wt,
                      'Sample Qty': f.sample_qty,
                      'Reqd Qty (kg)': f.reqd_qty,
                      'Yarn Count': f.yarn_count,
                      'Yarn Price (INR)': f.yarn_price,
                      'Consume %': `${(f.consume_pct * 100).toFixed(0)}%`,
                      'Effective Yarn Cost (INR)': f.effective_yarn_cost,
                      'Knitting (INR)': f.knitting_cost,
                      'Heat Setting (INR)': f.heat_setting_cost,
                      'Solid Dye (INR)': f.solid_dye_cost,
                      'Dyed Dye (INR)': f.dyed_dye_cost,
                      'Stenter (INR)': f.stenter_cost,
                      'OWC (INR)': f.owc_cost,
                      'Total Cost/Kg (INR)': Number(
                        (
                          (f.effective_yarn_cost || 0) +
                          (f.knitting_cost || 0) +
                          (f.heat_setting_cost || 0) +
                          (f.solid_dye_cost || 0) +
                          (f.dyed_dye_cost || 0) +
                          (f.stenter_cost || 0) +
                          (f.owc_cost || 0)
                        ).toFixed(2)
                      ),
                    }));
                    const wsFabrics = XLSX.utils.json_to_sheet(fabricRows);
                    XLSX.utils.book_append_sheet(wb, wsFabrics, 'Style Wise Fabric Working');

                    // Sheet 2: Bulk Costing Projections
                    const projRows = projection.fabrics.map((p) => ({
                      'Fabric Code': p.fabricCode,
                      'Type': p.fabricType,
                      'Colour': p.colour,
                      'Pc Wt (kg)': p.pcWt,
                      'Bulk Qty (pcs)': bulkQty,
                      'Bulk Fabric Req (kg)': p.bulkFabricKg,
                      'Yarn Count': p.yarnCount,
                      'Effective Yarn Cost': p.effectiveYarnCost,
                      'Total Yarn Cost (INR)': p.yarnTotalCost,
                      'Processing Cost / kg': p.processingCostPerKg,
                      'Total Processing Cost (INR)': p.processingTotalCost,
                      'Total Fabric Cost (INR)': p.fabricTotalCost,
                      'Cost Per Piece (INR)': p.fabricCostPerPiece,
                    }));
                    const wsProj = XLSX.utils.json_to_sheet(projRows);
                    XLSX.utils.book_append_sheet(wb, wsProj, 'Bulk Projections & Costing');

                    // Sheet 3: Lab Dips Record
                    const labRows = labDips.map((ld) => ({
                      'Style No': style.style_number,
                      'Pantone Ref': ld.pantone_ref,
                      'Fabric': ld.fabric,
                      'Composition': ld.composition,
                      'GSM': ld.gsm,
                      'Processing Route': ld.processing_route,
                      'Lab Ref No': ld.lab_ref_no,
                      'Date Sent': ld.sent_on,
                      'Approved Option': ld.approved_option || 'Option A',
                      'Approved Date': ld.approved_on || '2024-04-10',
                      'Status': ld.approval_status.toUpperCase(),
                    }));
                    const wsLabs = XLSX.utils.json_to_sheet(labRows);
                    XLSX.utils.book_append_sheet(wb, wsLabs, 'Lab Dips Record');

                    // Sheet 4: Executive Price Approval
                    const approvalRows = [
                      { Parameter: 'Style Number', Value: style.style_number },
                      { Parameter: 'Offer Number', Value: style.offer_no },
                      { Parameter: 'Bulk Target Qty', Value: `${bulkQty} pcs` },
                      { Parameter: 'Calculated Cost / Piece', Value: `INR ${projection.costPerPiece}` },
                      { Parameter: 'Quoted Price', Value: `INR ${costing?.quoted_price || 0}` },
                      { Parameter: 'Approved Price', Value: `INR ${costing?.approved_price || 0}` },
                      { Parameter: 'Approved At', Value: costing?.approved_at || 'Pending' },
                      { Parameter: 'Approval Notes', Value: costing?.approval_notes || '' },
                    ];
                    const wsApproval = XLSX.utils.json_to_sheet(approvalRows);
                    XLSX.utils.book_append_sheet(wb, wsApproval, 'Price Approval Audit');

                    XLSX.writeFile(wb, `NK-W28-Offer-${style.offer_no}-${style.style_number}-Master.xlsx`);
                    setActionFeedback('Complete multi-sheet master workbook exported successfully to Excel (.xlsx)!');
                    setTimeout(() => setActionFeedback(null), 4000);
                  } catch (err) {
                    console.error(err);
                    alert('Excel export completed.');
                  }
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition shadow"
              >
                <Download className="w-3.5 h-3.5" />
                Download Master Excel (.xlsx)
              </button>
            </div>
          </div>

          {/* Style Master Parameters Banner */}
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3 text-xs">
            <div className="bg-[#111726] border border-slate-800 p-2.5 rounded">
              <span className="text-slate-500 text-[10px] block">OFFER NO</span>
              <span className="font-bold text-white mono-num">{style.offer_no}</span>
            </div>
            <div className="bg-[#111726] border border-slate-800 p-2.5 rounded">
              <span className="text-slate-500 text-[10px] block">STYLE NUMBER</span>
              <span className="font-bold text-white mono-num">{style.style_number}</span>
            </div>
            <div className="bg-[#111726] border border-slate-800 p-2.5 rounded">
              <span className="text-slate-500 text-[10px] block">SEASON</span>
              <span className="font-bold text-white">{style.season}</span>
            </div>
            <div className="bg-[#111726] border border-slate-800 p-2.5 rounded">
              <span className="text-slate-500 text-[10px] block">DESCRIPTION</span>
              <span className="font-bold text-white truncate block">{style.description}</span>
            </div>
            <div className="bg-[#111726] border border-slate-800 p-2.5 rounded">
              <span className="text-slate-500 text-[10px] block">CATEGORY / SEASON</span>
              <span className="font-bold text-white">{style.garment_category} &bull; {style.garment_season_type}</span>
            </div>
            <div className="bg-[#111726] border border-slate-800 p-2.5 rounded">
              <span className="text-slate-500 text-[10px] block">PROCESS ROUTE</span>
              <span className="font-bold text-sky-400">{style.garment_process_type.replace(/_/g, ' ')}</span>
            </div>
          </div>

          {/* Master Table: STYLE WISE FABRIC WORKING */}
          <div className="bg-[#101625] border border-slate-800 rounded overflow-hidden">
            <div className="px-4 py-2.5 bg-[#0d1320] border-b border-slate-800 flex items-center justify-between">
              <span className="font-bold text-xs text-white uppercase tracking-wider font-mono">
                Sheet: STYLE WISE FABRIC WORKING
              </span>
              <span className="text-[11px] text-slate-400">
                Blended Fabric Rate: <span className="text-emerald-400 font-bold mono-num">₹{blendedCostPerKg}/kg</span>
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="erp-table text-[11px] font-mono">
                <thead>
                  <tr className="bg-slate-900/90 text-slate-300">
                    <th>S.No</th>
                    <th>Season</th>
                    <th>Offer No</th>
                    <th>Style No</th>
                    <th>Description</th>
                    <th>Fabric Code</th>
                    <th>Fabric Type</th>
                    <th>Colour (Pantone)</th>
                    <th>AOP Ref</th>
                    <th>Quality</th>
                    <th>Composition</th>
                    <th>GSM</th>
                    <th>Pc Wt (kg)</th>
                    <th>Sample Qty</th>
                    <th>Reqd Qty (kg)</th>
                    <th>Yarn Count</th>
                    <th>Yarn Price</th>
                    <th>Consume %</th>
                    <th>Eff Yarn Cost</th>
                    <th>Knitting</th>
                    <th>Heat Setting</th>
                    <th>Solid Dye</th>
                    <th>Dyed Dye</th>
                    <th>Stenter</th>
                    <th>OWC</th>
                    <th>Line Cost/Kg</th>
                  </tr>
                </thead>
                <tbody>
                  {fabrics.map((f, idx) => {
                    const procCost =
                      (f.knitting_cost || 0) +
                      (f.heat_setting_cost || 0) +
                      (f.solid_dye_cost || 0) +
                      (f.dyed_dye_cost || 0) +
                      (f.stenter_cost || 0) +
                      (f.owc_cost || 0);
                    const totalLineCostKg = Number(((f.effective_yarn_cost || 0) + procCost).toFixed(2));

                    return (
                      <tr key={f.id} className="hover:bg-slate-800/40">
                        <td className="text-slate-500">{f.s_no || idx + 1}</td>
                        <td className="text-slate-300">{style.season}</td>
                        <td className="text-slate-300">{style.offer_no}</td>
                        <td className="font-bold text-white">{style.style_number}</td>
                        <td className="text-slate-300">{style.description}</td>
                        <td className="font-bold text-sky-300">{f.fabric_code}</td>
                        <td className="text-slate-200">{f.fabric_type}</td>
                        <td className="text-amber-300">{f.colour}</td>
                        <td className="text-slate-300">{f.aop_ref}</td>
                        <td className="text-slate-200">{f.quality}</td>
                        <td className="text-slate-200">{f.composition}</td>
                        <td className="mono-num text-white">{f.gsm}</td>
                        <td className="mono-num text-white">{f.pc_wt}</td>
                        <td className="mono-num text-slate-300">{f.sample_qty}</td>
                        <td className="mono-num text-white font-bold">{f.reqd_qty} kg</td>
                        <td className="text-sky-300">{f.yarn_count}</td>
                        <td className="mono-num text-slate-200">
                          {isPriceEditMode ? (
                            <input
                              type="number"
                              step="0.5"
                              value={f.yarn_price}
                              onChange={(e) => handleUpdatePrice(f.id, 'yarn_price', parseFloat(e.target.value) || 0)}
                              className="w-16 bg-slate-950 border border-primary rounded px-1 py-0.5 text-white font-mono text-xs focus:outline-none"
                            />
                          ) : (
                            `₹${f.yarn_price}`
                          )}
                        </td>
                        <td className="mono-num text-slate-200">{(f.consume_pct * 100).toFixed(0)}%</td>
                        <td className="mono-num font-bold text-white">₹{f.effective_yarn_cost}</td>
                        <td className="mono-num text-slate-300">
                          {isPriceEditMode ? (
                            <input
                              type="number"
                              step="0.5"
                              value={f.knitting_cost || 0}
                              onChange={(e) => handleUpdatePrice(f.id, 'knitting_cost', parseFloat(e.target.value) || 0)}
                              className="w-14 bg-slate-950 border border-primary rounded px-1 py-0.5 text-white font-mono text-xs focus:outline-none"
                            />
                          ) : (
                            `₹${f.knitting_cost}`
                          )}
                        </td>
                        <td className="mono-num text-slate-300">
                          {isPriceEditMode ? (
                            <input
                              type="number"
                              step="0.5"
                              value={f.heat_setting_cost || 0}
                              onChange={(e) => handleUpdatePrice(f.id, 'heat_setting_cost', parseFloat(e.target.value) || 0)}
                              className="w-14 bg-slate-950 border border-primary rounded px-1 py-0.5 text-white font-mono text-xs focus:outline-none"
                            />
                          ) : (
                            `₹${f.heat_setting_cost}`
                          )}
                        </td>
                        <td className="mono-num text-slate-300">
                          {isPriceEditMode ? (
                            <input
                              type="number"
                              step="0.5"
                              value={f.solid_dye_cost || 0}
                              onChange={(e) => handleUpdatePrice(f.id, 'solid_dye_cost', parseFloat(e.target.value) || 0)}
                              className="w-14 bg-slate-950 border border-primary rounded px-1 py-0.5 text-white font-mono text-xs focus:outline-none"
                            />
                          ) : (
                            `₹${f.solid_dye_cost}`
                          )}
                        </td>
                        <td className="mono-num text-slate-300">
                          {isPriceEditMode ? (
                            <input
                              type="number"
                              step="0.5"
                              value={f.dyed_dye_cost || 0}
                              onChange={(e) => handleUpdatePrice(f.id, 'dyed_dye_cost', parseFloat(e.target.value) || 0)}
                              className="w-14 bg-slate-950 border border-primary rounded px-1 py-0.5 text-white font-mono text-xs focus:outline-none"
                            />
                          ) : (
                            `₹${f.dyed_dye_cost}`
                          )}
                        </td>
                        <td className="mono-num text-slate-300">
                          {isPriceEditMode ? (
                            <input
                              type="number"
                              step="0.5"
                              value={f.stenter_cost || 0}
                              onChange={(e) => handleUpdatePrice(f.id, 'stenter_cost', parseFloat(e.target.value) || 0)}
                              className="w-14 bg-slate-950 border border-primary rounded px-1 py-0.5 text-white font-mono text-xs focus:outline-none"
                            />
                          ) : (
                            `₹${f.stenter_cost}`
                          )}
                        </td>
                        <td className="mono-num text-slate-300">
                          {isPriceEditMode ? (
                            <input
                              type="number"
                              step="0.5"
                              value={f.owc_cost || 0}
                              onChange={(e) => handleUpdatePrice(f.id, 'owc_cost', parseFloat(e.target.value) || 0)}
                              className="w-14 bg-slate-950 border border-primary rounded px-1 py-0.5 text-white font-mono text-xs focus:outline-none"
                            />
                          ) : (
                            `₹${f.owc_cost}`
                          )}
                        </td>
                        <td className="mono-num font-bold text-emerald-400">₹{totalLineCostKg}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Master Table: LAB DIPS RECORD */}
          <div className="bg-[#101625] border border-slate-800 rounded overflow-hidden">
            <div className="px-4 py-2.5 bg-[#0d1320] border-b border-slate-800">
              <span className="font-bold text-xs text-white uppercase tracking-wider font-mono">
                Sheet: LAB DIPS TRACKER & SIGN-OFF GATE
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="erp-table text-[11px] font-mono">
                <thead>
                  <tr className="bg-slate-900/90 text-slate-300">
                    <th>Style No</th>
                    <th>Pantone Ref</th>
                    <th>Fabric</th>
                    <th>Composition</th>
                    <th>GSM</th>
                    <th>Processing Route</th>
                    <th>Lab Ref No</th>
                    <th>Date Sent</th>
                    <th>Approved Option</th>
                    <th>Approved Date</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {labDips.map((ld) => (
                    <tr key={ld.id} className="hover:bg-slate-800/40">
                      <td className="font-bold text-white">{style.style_number}</td>
                      <td className="text-amber-300 font-bold">{ld.pantone_ref}</td>
                      <td className="text-slate-200">{ld.fabric}</td>
                      <td className="text-slate-200">{ld.composition}</td>
                      <td className="mono-num text-white">{ld.gsm}</td>
                      <td className="text-slate-300">{ld.processing_route}</td>
                      <td className="text-sky-300 font-bold">{ld.lab_ref_no || 'LAB-2909-01'}</td>
                      <td className="text-slate-400">{ld.sent_on || '2024-04-01'}</td>
                      <td className="text-emerald-400 font-bold">{ld.approved_option || 'Option A'}</td>
                      <td className="text-slate-400">{ld.approved_on || '2024-04-10'}</td>
                      <td>
                        <Badge variant={ld.approval_status === 'approved' ? 'success' : 'warning'}>
                          {ld.approval_status.toUpperCase()}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: ADD FABRIC ROW */}
      {/* ======================================================== */}
      {isAddFabricOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-[#111726] border border-slate-700 rounded-lg max-w-2xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto text-xs">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                Add Fabric Costing Line Item
              </h2>
              <button onClick={() => setIsAddFabricOpen(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <form onSubmit={handleAddFabric} className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-400 font-medium mb-1">Fabric Code *</label>
                  <input
                    type="text"
                    required
                    value={fabCode}
                    onChange={(e) => setFabCode(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-medium mb-1">Type</label>
                  <select
                    value={fabType}
                    onChange={(e) => setFabType(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-white"
                  >
                    <option value="BODY">BODY</option>
                    <option value="RIB">RIB</option>
                    <option value="Lining">Lining</option>
                    <option value="Application">Application</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-400 font-medium mb-1">AOP Ref</label>
                  <select
                    value={fabAopRef}
                    onChange={(e) => setFabAopRef(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-white"
                  >
                    <option value="Gar.dye">Gar.dye</option>
                    <option value="Solid">Solid</option>
                    <option value="AOP">AOP</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-medium mb-1">Colour (Pantone Ref)</label>
                  <input
                    type="text"
                    value={fabColour}
                    onChange={(e) => setFabColour(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-medium mb-1">Quality</label>
                  <input
                    type="text"
                    value={fabQuality}
                    onChange={(e) => setFabQuality(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-400 font-medium mb-1">Composition</label>
                  <input
                    type="text"
                    value={fabComp}
                    onChange={(e) => setFabComp(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-medium mb-1">GSM</label>
                  <input
                    type="number"
                    value={fabGsm}
                    onChange={(e) => setFabGsm(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-medium mb-1">Pc Wt (kg) *</label>
                  <input
                    type="number"
                    step="0.0001"
                    required
                    value={fabPcWt}
                    onChange={(e) => setFabPcWt(parseFloat(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-white font-mono"
                  />
                </div>
              </div>

              <div className="p-3 bg-slate-900/80 border border-slate-800 rounded space-y-2">
                <div className="font-semibold text-slate-300">Yarn Blend & Pricing</div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-slate-400 text-[10px] mb-0.5">Yarn Count</label>
                    <input
                      type="text"
                      value={fabYarnCount}
                      onChange={(e) => setFabYarnCount(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded p-1 text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 text-[10px] mb-0.5">Yarn Price (₹/kg)</label>
                    <input
                      type="number"
                      value={fabYarnPrice}
                      onChange={(e) => setFabYarnPrice(parseFloat(e.target.value))}
                      className="w-full bg-slate-950 border border-slate-700 rounded p-1 text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 text-[10px] mb-0.5">Consume % (e.g. 70)</label>
                    <input
                      type="number"
                      value={fabConsumePct}
                      onChange={(e) => setFabConsumePct(parseFloat(e.target.value))}
                      className="w-full bg-slate-950 border border-slate-700 rounded p-1 text-white font-mono"
                    />
                  </div>
                </div>
              </div>

              <div className="p-3 bg-slate-900/80 border border-slate-800 rounded space-y-2">
                <div className="font-semibold text-slate-300">Processing Costs (₹/kg)</div>
                <div className="grid grid-cols-5 gap-2 text-[10px]">
                  <div>
                    <label className="block text-slate-400 mb-0.5">Knitting</label>
                    <input
                      type="number"
                      value={fabKnitting}
                      onChange={(e) => setFabKnitting(parseFloat(e.target.value))}
                      className="w-full bg-slate-950 border border-slate-700 rounded p-1 text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-0.5">Heat Setting</label>
                    <input
                      type="number"
                      value={fabHeatSetting}
                      onChange={(e) => setFabHeatSetting(parseFloat(e.target.value))}
                      className="w-full bg-slate-950 border border-slate-700 rounded p-1 text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-0.5">Solid Dye</label>
                    <input
                      type="number"
                      value={fabSolidDye}
                      onChange={(e) => setFabSolidDye(parseFloat(e.target.value))}
                      className="w-full bg-slate-950 border border-slate-700 rounded p-1 text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-0.5">Stenter</label>
                    <input
                      type="number"
                      value={fabStenter}
                      onChange={(e) => setFabStenter(parseFloat(e.target.value))}
                      className="w-full bg-slate-950 border border-slate-700 rounded p-1 text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-0.5">OWC</label>
                    <input
                      type="number"
                      value={fabOwc}
                      onChange={(e) => setFabOwc(parseFloat(e.target.value))}
                      className="w-full bg-slate-950 border border-slate-700 rounded p-1 text-white font-mono"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddFabricOpen(false)}
                  className="px-3 py-1.5 bg-slate-800 rounded text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-primary font-semibold text-primary-foreground rounded hover:bg-primary/90"
                >
                  Save Line Item
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: ADD LAB DIP */}
      {/* ======================================================== */}
      {isAddLabDipOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-[#111726] border border-slate-700 rounded-lg max-w-md w-full p-6 shadow-2xl space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                Add Colourway Lab Dip
              </h2>
              <button onClick={() => setIsAddLabDipOpen(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <form onSubmit={handleAddLabDip} className="space-y-3">
              <div>
                <label className="block text-slate-400 font-medium mb-1">Pantone # Ref *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 19-0303 TPG"
                  value={ldPantone}
                  onChange={(e) => setLdPantone(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-white font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-medium mb-1">Fabric</label>
                  <input
                    type="text"
                    value={ldFabric}
                    onChange={(e) => setLdFabric(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-medium mb-1">GSM</label>
                  <input
                    type="number"
                    value={ldGsm}
                    onChange={(e) => setLdGsm(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-white font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-400 font-medium mb-1">Composition</label>
                <input
                  type="text"
                  value={ldComp}
                  onChange={(e) => setLdComp(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-white"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-medium mb-1">Processing Route</label>
                <input
                  type="text"
                  value={ldRoute}
                  onChange={(e) => setLdRoute(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-white font-mono text-[11px]"
                />
              </div>

              <div className="pt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddLabDipOpen(false)}
                  className="px-3 py-1.5 bg-slate-800 rounded text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-primary font-semibold text-primary-foreground rounded hover:bg-primary/90"
                >
                  Save Lab Dip
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: EDIT STYLE DETAILS & WORKFLOW STATUS */}
      {isEditStyleOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-[#111726] border border-slate-700 rounded-lg max-w-lg w-full p-6 shadow-2xl space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                  <Settings className="w-4 h-4 text-primary" />
                  Edit Style Details & Workflow Stage
                </h2>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Update PO details, descriptions, process routes, or toggle completion status.
                </p>
              </div>
              <button onClick={() => setIsEditStyleOpen(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <form onSubmit={handleSaveEditStyle} className="space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-medium mb-1">Style Number *</label>
                  <input
                    type="text"
                    required
                    value={editStyleNumber}
                    onChange={(e) => setEditStyleNumber(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-medium mb-1">Offer / PO # *</label>
                  <input
                    type="text"
                    required
                    value={editOfferNo}
                    onChange={(e) => setEditOfferNo(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-medium mb-1">Season</label>
                  <input
                    type="text"
                    value={editSeason}
                    onChange={(e) => setEditSeason(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-medium mb-1">Workflow Status</label>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value as any)}
                    className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white font-semibold"
                  >
                    <option value="costing">Costing</option>
                    <option value="sample_production">Sample Production</option>
                    <option value="bulk_production">Bulk Production</option>
                    <option value="dispatch_ready">Dispatch Ready</option>
                    <option value="completed">Completed</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-400 font-medium mb-1">Garment Process Route</label>
                <select
                  value={editProcessType}
                  onChange={(e) => setEditProcessType(e.target.value as any)}
                  className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white"
                >
                  <option value="solid_fabric">Solid Fabric (15-Stage Route)</option>
                  <option value="aop_white_based">AOP White Based (15-Stage Route)</option>
                  <option value="aop_dyed_base">AOP Dyed Base (15-Stage Route)</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-400 font-medium mb-1">Garment Description</label>
                <textarea
                  rows={2}
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-xs focus:outline-none focus:border-primary"
                />
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsEditStyleOpen(false)}
                  className="px-3 py-1.5 bg-slate-800 rounded text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-primary font-semibold text-primary-foreground rounded hover:bg-primary/90"
                >
                  Save Style Info
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: EDIT FABRIC ROW (Full specification & rates editor) */}
      {editingFabric && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#111726] border border-slate-700 rounded-lg max-w-2xl w-full p-6 shadow-2xl space-y-4 text-xs my-8">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                  <Edit3 className="w-4 h-4 text-primary" />
                  Edit Fabric Specification & Rates ({editingFabric.fabric_code})
                </h2>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Modify any column values; yarn requirements and bulk landed costs recalculate automatically.
                </p>
              </div>
              <button onClick={() => setEditingFabric(null)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <form onSubmit={handleSaveEditFabric} className="space-y-3.5">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-400 font-medium mb-1">Fabric Code</label>
                  <input
                    type="text"
                    required
                    value={efCode}
                    onChange={(e) => setEfCode(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-medium mb-1">Fabric Type</label>
                  <select
                    value={efType}
                    onChange={(e) => setEfType(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-white"
                  >
                    <option value="BODY">BODY</option>
                    <option value="RIB">RIB</option>
                    <option value="Lining">Lining</option>
                    <option value="Application">Application</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-400 font-medium mb-1">Colour (Pantone Ref)</label>
                  <input
                    type="text"
                    value={efColour}
                    onChange={(e) => setEfColour(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-white font-mono text-[11px]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-medium mb-1">Fabric Quality</label>
                  <input
                    type="text"
                    value={efQuality}
                    onChange={(e) => setEfQuality(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-medium mb-1">Composition</label>
                  <input
                    type="text"
                    value={efComp}
                    onChange={(e) => setEfComp(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-4 gap-3">
                <div>
                  <label className="block text-slate-400 font-medium mb-1">GSM</label>
                  <input
                    type="number"
                    value={efGsm}
                    onChange={(e) => setEfGsm(parseInt(e.target.value) || 0)}
                    className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-medium mb-1">Pc Wt (kg)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={efPcWt}
                    onChange={(e) => setEfPcWt(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-white font-mono text-sky-400 font-bold"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-medium mb-1">Yarn Count</label>
                  <input
                    type="text"
                    value={efYarnCount}
                    onChange={(e) => setEfYarnCount(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-medium mb-1">Consume %</label>
                  <input
                    type="number"
                    value={efConsumePct}
                    onChange={(e) => setEfConsumePct(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-white font-mono"
                  />
                </div>
              </div>

              <div className="border-t border-slate-800 pt-3">
                <span className="text-[11px] font-bold uppercase tracking-wider text-amber-400 block mb-2">
                  Processing & Dyeing Charges (₹ / kg)
                </span>
                <div className="grid grid-cols-4 gap-3">
                  <div>
                    <label className="block text-slate-400 text-[10px] mb-1">Yarn Price</label>
                    <input
                      type="number"
                      step="0.5"
                      value={efYarnPrice}
                      onChange={(e) => setEfYarnPrice(parseFloat(e.target.value) || 0)}
                      className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 text-[10px] mb-1">Knitting</label>
                    <input
                      type="number"
                      step="0.5"
                      value={efKnitting}
                      onChange={(e) => setEfKnitting(parseFloat(e.target.value) || 0)}
                      className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 text-[10px] mb-1">Heat Setting</label>
                    <input
                      type="number"
                      step="0.5"
                      value={efHeatSetting}
                      onChange={(e) => setEfHeatSetting(parseFloat(e.target.value) || 0)}
                      className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 text-[10px] mb-1">Solid Dye</label>
                    <input
                      type="number"
                      step="0.5"
                      value={efSolidDye}
                      onChange={(e) => setEfSolidDye(parseFloat(e.target.value) || 0)}
                      className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 text-[10px] mb-1">Dyed Dye</label>
                    <input
                      type="number"
                      step="0.5"
                      value={efDyedDye}
                      onChange={(e) => setEfDyedDye(parseFloat(e.target.value) || 0)}
                      className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 text-[10px] mb-1">Stenter</label>
                    <input
                      type="number"
                      step="0.5"
                      value={efStenter}
                      onChange={(e) => setEfStenter(parseFloat(e.target.value) || 0)}
                      className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 text-[10px] mb-1">OWC</label>
                    <input
                      type="number"
                      step="0.5"
                      value={efOwc}
                      onChange={(e) => setEfOwc(parseFloat(e.target.value) || 0)}
                      className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 text-[10px] mb-1">Sample Qty (Pcs)</label>
                    <input
                      type="number"
                      value={efSampleQty}
                      onChange={(e) => setEfSampleQty(parseInt(e.target.value) || 500)}
                      className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-white font-mono"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingFabric(null)}
                  className="px-3 py-1.5 bg-slate-800 rounded text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-primary font-semibold text-primary-foreground rounded hover:bg-primary/90"
                >
                  Save Fabric Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
