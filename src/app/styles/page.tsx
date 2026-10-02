'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Style, GarmentCategory, GarmentSeasonType, GarmentProcessType } from '@/lib/types/erp';
import { Badge } from '@/components/ui/Badge';
import { parseCostingExcelBuffer } from '@/lib/domain/excelParser';
import { exportToExcel } from '@/lib/excel/excelExport';
import {
  Layers,
  Plus,
  Upload,
  ArrowRight,
  Filter,
  FileSpreadsheet,
  Download,
} from 'lucide-react';

export default function StylesListPage() {
  const router = useRouter();
  const supabase = createClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [currentUserId, setCurrentUserId] = useState<string>('');
  const [orgId, setOrgId] = useState<string>('');
  const [styles, setStyles] = useState<Style[]>([]);
  const [loading, setLoading] = useState(true);
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

  const fetchStyles = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('styles')
        .select(`
          *,
          style_fabrics (
            id
          ),
          costing_sheets (
            quoted_price,
            approved_price
          )
        `)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching styles:', error);
        return;
      }

      if (data) {
        const mapped: Style[] = data.map((s: any) => ({
          ...s,
          fabrics: s.style_fabrics || [],
          costing: s.costing_sheets?.[0] || undefined,
        }));
        setStyles(mapped);
      }
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    const init = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace('/login');
        return;
      }

      setCurrentUserId(user.id);

      const { data: profile } = await supabase
        .from('profiles')
        .select('role, org_id')
        .eq('id', user.id)
        .single();

      if (!profile) {
        router.replace('/login');
        return;
      }

      if (profile.role === 'employee') {
        router.replace('/employee/tasks');
        return;
      }

      setOrgId(profile.org_id);
      await fetchStyles();
    };

    init();
  }, [supabase, router, fetchStyles]);

  const handleCreateStyle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStyleNumber || !newDescription) {
      alert('Please fill in Style Number and Garment Description.');
      return;
    }

    if (!orgId) {
      alert('Organization ID not found.');
      return;
    }

    const { data: created, error } = await supabase
      .from('styles')
      .insert({
        org_id: orgId,
        style_number: newStyleNumber.trim().toUpperCase(),
        season: newSeason.trim(),
        offer_no: newOfferNo.trim(),
        description: newDescription.trim(),
        garment_category: newCategory,
        garment_season_type: newSeasonType,
        garment_process_type: newProcessType,
        status: 'costing',
        created_by: currentUserId,
      })
      .select()
      .single();

    if (error) {
      alert('Failed to create style: ' + error.message);
      return;
    }

    if (created) {
      await supabase.from('costing_sheets').insert({
        style_id: created.id,
        sample_qty: 1,
        bulk_target_qty: 5000,
      });

      await supabase.from('audit_log').insert({
        user_id: currentUserId,
        action: 'CREATE',
        table_name: 'styles',
        record_id: created.id,
        notes: `Created style ${created.style_number}`,
      });

      setIsModalOpen(false);
      router.push(`/styles/${created.id}`);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadStatus('Parsing costing sheet and lab dips from Excel...');
    try {
      const arrayBuffer = await file.arrayBuffer();
      const parsed = await parseCostingExcelBuffer(arrayBuffer);

      if (!orgId) throw new Error('Organization context not resolved.');

      // Create style in Supabase
      const { data: style, error: sErr } = await supabase
        .from('styles')
        .insert({
          org_id: orgId,
          style_number: parsed.styleNumber,
          season: parsed.season,
          offer_no: parsed.offerNo,
          description: parsed.description,
          garment_category: parsed.garmentCategory,
          garment_season_type: parsed.garmentSeasonType,
          garment_process_type: parsed.garmentProcessType,
          status: 'costing',
          created_by: currentUserId,
        })
        .select()
        .single();

      if (sErr || !style) throw sErr || new Error('Could not insert style.');

      // Populate fabrics
      if (parsed.fabrics.length > 0) {
        await supabase.from('style_fabrics').insert(
          parsed.fabrics.map((f) => ({
            style_id: style.id,
            ...f,
          }))
        );
      }

      // Populate lab dips
      if (parsed.labDips.length > 0) {
        await supabase.from('lab_dips').insert(
          parsed.labDips.map((ld) => ({
            style_id: style.id,
            ...ld,
          }))
        );
      }

      // Populate initial costing sheet
      await supabase.from('costing_sheets').insert({
        style_id: style.id,
        sample_qty: 1,
        bulk_target_qty: 5000,
      });

      await supabase.from('audit_log').insert({
        user_id: currentUserId,
        action: 'CREATE',
        table_name: 'styles',
        record_id: style.id,
        notes: `Imported style ${style.style_number} from Excel costing workbook`,
      });

      setUploadStatus(
        `Successfully imported Style ${style.style_number} with ${parsed.fabrics.length} fabric lines and ${parsed.labDips.length} lab dips!`
      );
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
      const rows = styles.map((s) => ({
        style_number: s.style_number,
        offer_no: s.offer_no,
        season: s.season,
        description: s.description,
        category: s.garment_category,
        season_type: s.garment_season_type,
        process_route: s.garment_process_type,
        fabric_lines: s.fabrics?.length || 0,
        status: s.status.toUpperCase(),
        quoted_price: s.costing?.quoted_price || 0,
        approved_price: s.costing?.approved_price || 0,
      }));

      exportToExcel(
        [
          {
            name: 'Styles Catalog',
            columns: [
              { header: 'Style Number', key: 'style_number', width: 16 },
              { header: 'Offer No', key: 'offer_no', width: 12 },
              { header: 'Season', key: 'season', width: 12 },
              { header: 'Description', key: 'description', width: 25 },
              { header: 'Category', key: 'category', width: 14 },
              { header: 'Season Type', key: 'season_type', width: 14 },
              { header: 'Process Route', key: 'process_route', width: 18 },
              { header: 'Fabric Lines Count', key: 'fabric_lines', width: 18 },
              { header: 'Status', key: 'status', width: 14 },
              { header: 'Quoted Price (INR)', key: 'quoted_price', width: 18 },
              { header: 'Approved Price (INR)', key: 'approved_price', width: 18 },
            ],
            rows,
          },
        ],
        'Knitnect-Styles-Catalog.xlsx'
      );

      setUploadStatus('Styles catalog exported successfully to Excel (.xlsx)!');
      setTimeout(() => setUploadStatus(null), 4000);
    } catch (err) {
      console.error(err);
      alert('Styles catalog exported.');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-slate-400 text-xs">Loading styles and costing portfolio...</div>
      </div>
    );
  }

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

        <div className="flex items-center gap-4 flex-wrap w-full sm:w-auto">
          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-400">Category:</span>
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200 focus:outline-none focus:border-primary"
            >
              <option value="ALL">All Categories</option>
              <option value="Mens">Mens</option>
              <option value="Kids">Kids</option>
              <option value="Womens">Womens</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-slate-400">Process Route:</span>
            <select
              value={filterProcess}
              onChange={(e) => setFilterProcess(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200 focus:outline-none focus:border-primary"
            >
              <option value="ALL">All Routes</option>
              <option value="solid_fabric">Solid Fabric (15 Stages)</option>
              <option value="aop_white_based">AOP White Based (15 Stages)</option>
              <option value="aop_dyed_base">AOP Dyed Base (16 Stages)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Styles Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredStyles.length === 0 ? (
          <div className="col-span-full py-12 text-center text-slate-500 text-xs">
            No styles found matching criteria. Click &quot;New Style&quot; or import an Excel costing workbook (.xlsx).
          </div>
        ) : (
          filteredStyles.map((style) => (
            <div
              key={style.id}
              onClick={() => router.push(`/styles/${style.id}`)}
              className="bg-[#101625] border border-slate-800 hover:border-slate-600 rounded p-4 cursor-pointer transition flex flex-col justify-between space-y-4 hover:shadow-md"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="font-mono text-xs font-bold text-white tracking-wider">
                      {style.style_number}
                    </span>
                    <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                      Season: {style.season} • Offer #{style.offer_no}
                    </div>
                  </div>
                  <Badge
                    variant={
                      style.status === 'completed'
                        ? 'success'
                        : style.status === 'bulk_production'
                        ? 'info'
                        : 'neutral'
                    }
                  >
                    {style.status}
                  </Badge>
                </div>

                <p className="text-xs text-slate-300 mt-2 line-clamp-2">{style.description}</p>

                <div className="flex items-center gap-2 mt-3 flex-wrap">
                  <span className="px-2 py-0.5 rounded bg-slate-800 text-[10px] text-slate-300 font-medium">
                    {style.garment_category}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-slate-800 text-[10px] text-slate-300 font-medium">
                    {style.garment_season_type}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-primary/20 text-primary text-[10px] font-semibold">
                    {style.garment_process_type.replace(/_/g, ' ')}
                  </span>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs">
                <div className="text-slate-400 text-[11px]">
                  Fabrics: <span className="text-white font-mono">{style.fabrics?.length || 0}</span>
                </div>
                <div className="flex items-center gap-1 text-primary font-semibold text-[11px]">
                  <span>Open Costing & Pipeline</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* CREATE STYLE MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-[#111726] border border-slate-700 rounded-lg max-w-md w-full p-6 shadow-2xl space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                Create New Export Garment Style
              </h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateStyle} className="space-y-3.5">
              <div>
                <label className="block text-slate-400 font-medium mb-1">
                  Style Number / Code *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 56003299"
                  value={newStyleNumber}
                  onChange={(e) => setNewStyleNumber(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white font-mono focus:outline-none focus:border-primary uppercase"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-medium mb-1">Season *</label>
                  <input
                    type="text"
                    required
                    value={newSeason}
                    onChange={(e) => setNewSeason(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white font-mono focus:outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-medium mb-1">Offer Number *</label>
                  <input
                    type="text"
                    required
                    value={newOfferNo}
                    onChange={(e) => setNewOfferNo(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white font-mono focus:outline-none focus:border-primary"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-400 font-medium mb-1">
                  Garment Description *
                </label>
                <textarea
                  required
                  rows={2}
                  placeholder="e.g. Mens brushed fleece overhead hooded sweatshirt with rib cuffs"
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white focus:outline-none focus:border-primary"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-medium mb-1">Category</label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value as GarmentCategory)}
                    className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white"
                  >
                    <option value="Mens">Mens</option>
                    <option value="Kids">Kids</option>
                    <option value="Womens">Womens</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-400 font-medium mb-1">Season Type</label>
                  <select
                    value={newSeasonType}
                    onChange={(e) => setNewSeasonType(e.target.value as GarmentSeasonType)}
                    className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white"
                  >
                    <option value="Winter">Winter (With Heat-Set & Stenter)</option>
                    <option value="Summer">Summer (Standard)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-400 font-medium mb-1">
                  Garment Process Pipeline Route *
                </label>
                <select
                  value={newProcessType}
                  onChange={(e) => setNewProcessType(e.target.value as GarmentProcessType)}
                  className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white"
                >
                  <option value="solid_fabric">Solid Fabric Route (15 Production Stages)</option>
                  <option value="aop_white_based">All Over Print (AOP) White Base (15 Stages)</option>
                  <option value="aop_dyed_base">All Over Print (AOP) Dyed Base (16 Stages)</option>
                </select>
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-3 py-1.5 bg-slate-800 rounded text-slate-300 hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-primary font-semibold text-primary-foreground rounded hover:bg-primary/90"
                >
                  Create & Launch Costing
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
