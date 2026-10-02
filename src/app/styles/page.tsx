'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ErpStore } from '@/lib/db/erpStore';
import { Style, Profile, GarmentCategory, GarmentSeasonType, GarmentProcessType } from '@/lib/types/erp';
import { Badge } from '@/components/ui/Badge';
import { parseCostingExcelBuffer } from '@/lib/domain/excelParser';
import * as XLSX from 'xlsx';
import {
  Layers,
  Plus,
  Upload,
  ArrowRight,
  Filter,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  Download,
} from 'lucide-react';

export default function StylesListPage() {
  const router = useRouter();
  const store = ErpStore.getInstance();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [currentUser, setCurrentUser] = useState<Profile>(store.getCurrentUser());
  const [styles, setStyles] = useState<Style[]>([]);
  const [filterCategory, setFilterCategory] = useState<string>('ALL');
  const [filterProcess, setFilterProcess] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  // Create Style Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newStyleNumber, setNewStyleNumber] = useState('');
  const [newSeason, setNewSeason] = useState('W28');
  const [newOfferNo, setNewOfferNo] = useState('9414');
  const [newDescription, setNewDescription] = useState('');
  const [newCategory, setNewCategory] = useState<GarmentCategory>('Mens');
  const [newSeasonType, setNewSeasonType] = useState<GarmentSeasonType>('Winter');
  const [newProcessType, setNewProcessType] = useState<GarmentProcessType>('solid_fabric');

  // Excel upload feedback
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);

  useEffect(() => {
    const refresh = () => {
      const u = store.getCurrentUser();
      setCurrentUser(u);
      if (u.role === 'employee') {
        router.replace('/employee/tasks');
        return;
      }
      setStyles(store.getStyles(u.role));
    };

    refresh();
    const unsub = store.subscribe(refresh);
    return unsub;
  }, [store, router]);

  const handleCreateStyle = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStyleNumber || !newDescription) {
      alert('Please fill in Style Number and Garment Description.');
      return;
    }

    const created = store.createStyle(
      {
        style_number: newStyleNumber.trim().toUpperCase(),
        season: newSeason.trim(),
        offer_no: newOfferNo.trim(),
        description: newDescription.trim(),
        garment_category: newCategory,
        garment_season_type: newSeasonType,
        garment_process_type: newProcessType,
      },
      currentUser.id
    );

    setIsModalOpen(false);
    router.push(`/styles/${created.id}`);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadStatus('Parsing costing sheet and lab dips from Excel...');
    try {
      const arrayBuffer = await file.arrayBuffer();
      const parsed = parseCostingExcelBuffer(arrayBuffer);

      // Create style in store
      const style = store.createStyle(
        {
          style_number: parsed.styleNumber,
          season: parsed.season,
          offer_no: parsed.offerNo,
          description: parsed.description,
          garment_category: parsed.garmentCategory,
          garment_season_type: parsed.garmentSeasonType,
          garment_process_type: parsed.garmentProcessType,
        },
        currentUser.id
      );

      // Populate fabrics
      parsed.fabrics.forEach((f) => {
        store.addStyleFabric({
          style_id: style.id,
          ...f,
        });
      });

      // Populate lab dips
      parsed.labDips.forEach((ld) => {
        store.addLabDip({
          style_id: style.id,
          ...ld,
        });
      });

      setUploadStatus(`Successfully imported Style ${style.style_number} with ${parsed.fabrics.length} fabric line items and ${parsed.labDips.length} lab dips!`);
      setTimeout(() => {
        router.push(`/styles/${style.id}`);
      }, 1200);
    } catch (err: any) {
      console.error(err);
      setUploadStatus(`Import failed: ${err.message || 'Invalid Excel format'}`);
    }
  };

  // Filtered styles
  const filteredStyles = styles.filter((s) => {
    const matchesSearch =
      s.style_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.offer_no.includes(searchTerm);
    const matchesCategory = filterCategory === 'ALL' || s.garment_category === filterCategory;
    const matchesProcess = filterProcess === 'ALL' || s.garment_process_type === filterProcess;
    return matchesSearch && matchesCategory && matchesProcess;
  });

  const handleExportStylesCatalog = () => {
    try {
      const wb = XLSX.utils.book_new();
      const rows = styles.map((s) => ({
        'Style Number': s.style_number,
        'Offer No': s.offer_no,
        'Season': s.season,
        'Description': s.description,
        'Category': s.garment_category,
        'Season Type': s.garment_season_type,
        'Process Route': s.garment_process_type,
        'Fabric Lines Count': s.fabrics?.length || 0,
        'Status': s.status.toUpperCase(),
        'Quoted Price (INR)': s.costing?.quoted_price || 0,
        'Approved Price (INR)': s.costing?.approved_price || 0,
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, 'Styles Catalog');
      XLSX.writeFile(wb, `Knitnect-Styles-Catalog.xlsx`);
      setUploadStatus('Styles catalog exported successfully to Excel (.xlsx)!');
      setTimeout(() => setUploadStatus(null), 4000);
    } catch (err) {
      console.error(err);
      alert('Styles catalog exported.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-primary" />
            <h1 className="text-xl font-bold tracking-tight text-white">Style Registry & Costing Sheets</h1>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Section 5: Style master, sample fabric costing, lab dip colourway gating, and bulk requirement projection.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={handleExportStylesCatalog}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-sm transition"
          >
            <Download className="w-3.5 h-3.5" />
            Export Catalog (.xlsx)
          </button>

          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept=".xlsx, .xls, .csv"
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-slate-800 border border-slate-700 text-slate-200 text-xs font-semibold hover:bg-slate-700 transition"
          >
            <Upload className="w-3.5 h-3.5 text-slate-400" />
            Import Excel Workbook (.xlsx)
          </button>

          <button
            onClick={() => setIsModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            New Style
          </button>
        </div>
      </div>

      {/* Upload Status Banner */}
      {uploadStatus && (
        <div className="p-3 bg-sky-950/70 border border-sky-800 rounded text-xs text-sky-200 flex items-center gap-2">
          <FileSpreadsheet className="w-4 h-4 text-sky-400 flex-shrink-0" />
          <span>{uploadStatus}</span>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-[#111726] border border-slate-800 rounded p-3 text-xs">
        <div className="w-full sm:w-72">
          <input
            type="text"
            placeholder="Search style#, offer, description..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-primary"
          />
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400 font-medium">Category:</span>
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200 text-xs focus:outline-none"
            >
              <option value="ALL">All Categories</option>
              <option value="Mens">Mens</option>
              <option value="Womens">Womens</option>
              <option value="Kids">Kids</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-slate-400 font-medium">Branch:</span>
            <select
              value={filterProcess}
              onChange={(e) => setFilterProcess(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200 text-xs focus:outline-none"
            >
              <option value="ALL">All Processes</option>
              <option value="solid_fabric">Solid Fabric</option>
              <option value="aop_white_based">AOP – White Based</option>
              <option value="aop_dyed_base">AOP – Dyed Base</option>
            </select>
          </div>
        </div>
      </div>

      {/* Styles Data Table */}
      {/* Styles Data Table */}
      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="erp-table min-w-[1200px]">
            <thead>
              <tr>
                <th className="w-[140px] whitespace-nowrap">Style Number</th>
                <th className="w-[100px] whitespace-nowrap">Offer / PO</th>
                <th className="w-[130px] whitespace-nowrap">Season</th>
                <th className="w-[110px] whitespace-nowrap">Category</th>
                <th className="min-w-[200px] max-w-[280px]">Garment Description</th>
                <th className="w-[130px] whitespace-nowrap">Process Route</th>
                <th className="w-[130px] whitespace-nowrap">Status</th>
                <th className="w-[100px] whitespace-nowrap">Fabric Lines</th>
                <th className="w-[110px] whitespace-nowrap">Lab Dips</th>
                <th className="w-[120px] whitespace-nowrap">Bulk Costing</th>
                <th className="w-[110px] text-right whitespace-nowrap">Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredStyles.length === 0 ? (
                <tr>
                  <td colSpan={11} className="text-center py-12 text-slate-500 text-xs">
                    No styles match the selected criteria. Create a style or import Offer 9414 Excel workbook.
                  </td>
                </tr>
              ) : (
                filteredStyles.map((style) => {
                  const fabrics = style.fabrics || [];
                  const labDips = style.lab_dips || [];
                  const costing = style.costing;
                  const allDipsApproved = labDips.length > 0 && labDips.every((ld) => ld.approval_status === 'approved');

                  return (
                    <tr key={style.id}>
                      <td className="font-mono font-bold text-white whitespace-nowrap">
                        <button
                          onClick={() => router.push(`/styles/${style.id}`)}
                          className="hover:text-primary transition font-bold text-left cursor-pointer"
                        >
                          {style.style_number}
                        </button>
                      </td>
                      <td className="font-mono text-slate-300 whitespace-nowrap">{style.offer_no}</td>
                      <td className="font-mono text-slate-300 whitespace-nowrap">{style.season} ({style.garment_season_type})</td>
                      <td className="text-slate-300 whitespace-nowrap">{style.garment_category}</td>
                      <td className="text-slate-300 font-medium max-w-[280px] whitespace-normal break-words" title={style.description}>
                        {style.description}
                      </td>
                      <td className="whitespace-nowrap">
                        <Badge variant="neutral">
                          {style.garment_process_type.replace(/_/g, ' ')}
                        </Badge>
                      </td>
                      <td className="whitespace-nowrap">
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
                          dot
                        >
                          {style.status.replace(/_/g, ' ')}
                        </Badge>
                      </td>
                      <td className="mono-num text-slate-300 whitespace-nowrap">
                        {fabrics.length} line{fabrics.length === 1 ? '' : 's'}
                      </td>
                      <td className="whitespace-nowrap">
                        {labDips.length === 0 ? (
                          <span className="text-slate-500 text-[11px]">—</span>
                        ) : allDipsApproved ? (
                          <Badge variant="success">Cleared ({labDips.length})</Badge>
                        ) : (
                          <Badge variant="warning">
                            {labDips.filter((ld) => ld.approval_status === 'pending').length} Pending
                          </Badge>
                        )}
                      </td>
                      <td className="mono-num text-slate-200 whitespace-nowrap">
                        {costing?.approved_price ? (
                          <span className="text-emerald-400 font-semibold">
                            ₹{costing.approved_price}
                          </span>
                        ) : costing?.calculated_total_garment_cost ? (
                          <span>₹{(costing.calculated_total_garment_cost / (costing.bulk_target_qty || 5000)).toFixed(2)}/pc</span>
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </td>
                      <td className="text-right whitespace-nowrap">
                        <button
                          onClick={() => router.push(`/styles/${style.id}`)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-200 font-medium transition cursor-pointer"
                        >
                          Job Card <ArrowRight className="w-3 h-3" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Manual Style Creation Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-[#111726] border border-slate-700 rounded-lg max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                Create New Style / Offer Order
              </h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white text-xs font-mono"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateStyle} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-medium mb-1">Style Number *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. KB13P301X1"
                    value={newStyleNumber}
                    onChange={(e) => setNewStyleNumber(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-white font-mono uppercase focus:outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-medium mb-1">Offer / PO # *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 9414"
                    value={newOfferNo}
                    onChange={(e) => setNewOfferNo(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-white font-mono focus:outline-none focus:border-primary"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-400 font-medium mb-1">Garment Description *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. RIN | JOGGING PANTS"
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-white focus:outline-none focus:border-primary"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-400 font-medium mb-1">Season</label>
                  <input
                    type="text"
                    value={newSeason}
                    onChange={(e) => setNewSeason(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 font-medium mb-1">Season Type</label>
                  <select
                    value={newSeasonType}
                    onChange={(e) => setNewSeasonType(e.target.value as any)}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-white"
                  >
                    <option value="Summer">Summer</option>
                    <option value="Winter">Winter (Adds Brushing)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 font-medium mb-1">Category</label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value as any)}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-white"
                  >
                    <option value="Mens">Mens</option>
                    <option value="Womens">Womens</option>
                    <option value="Kids">Kids</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-400 font-medium mb-1">
                  Garment Process Type (Selects Pipeline Template)
                </label>
                <select
                  value={newProcessType}
                  onChange={(e) => setNewProcessType(e.target.value as any)}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-white"
                >
                  <option value="solid_fabric">Solid Fabric (Cutting → Embroidery → Sewing → Packing)</option>
                  <option value="aop_white_based">AOP – White Based (Printing → Curing → Stenter → Compacting)</option>
                  <option value="aop_dyed_base">AOP – Dyed Base (Discharge Print → Ageing → Washing → Compacting)</option>
                </select>
              </div>

              <div className="pt-3 border-t border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-3 py-1.5 bg-slate-800 text-slate-300 rounded hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-primary text-primary-foreground font-semibold rounded hover:bg-primary/90"
                >
                  Save & Open Costing
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
