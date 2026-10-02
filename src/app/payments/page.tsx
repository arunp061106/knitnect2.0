'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { PaymentRecord, DispatchRecord, Style } from '@/lib/types/erp';
import { Badge } from '@/components/ui/Badge';
import { exportToExcel } from '@/lib/excel/excelExport';
import {
  CreditCard,
  Plus,
  CheckCircle2,
  Landmark,
  Download,
} from 'lucide-react';

export default function PaymentsPage() {
  const router = useRouter();
  const supabase = createClient();

  const [currentUserId, setCurrentUserId] = useState<string>('');
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [dispatchRecords, setDispatchRecords] = useState<DispatchRecord[]>([]);
  const [styles, setStyles] = useState<Style[]>([]);
  const [loading, setLoading] = useState(true);

  // Record Payment Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedDispatchId, setSelectedDispatchId] = useState('');
  const [bankName, setBankName] = useState('State Bank of India (Forex Branch)');
  const [transactionId, setTransactionId] = useState('');
  const [amountTransferred, setAmountTransferred] = useState<number>(0);
  const [bankCharges, setBankCharges] = useState<number>(1200);
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentStatus, setPaymentStatus] = useState<'pending' | 'received' | 'reconciled'>('reconciled');
  const [paymentNotes, setPaymentNotes] = useState('');

  const [feedback, setFeedback] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const { data: pData, error: pErr } = await supabase
        .from('payment_records')
        .select('*, styles(style_number)')
        .order('payment_date', { ascending: false });

      if (pErr) console.error('Error fetching payments:', pErr);
      if (pData) {
        setPayments(
          pData.map((p: any) => ({
            ...p,
            style_number: p.styles?.style_number || 'N/A',
          }))
        );
      }

      const { data: dData, error: dErr } = await supabase
        .from('dispatch_records')
        .select('*, styles(style_number)')
        .order('created_at', { ascending: false });

      if (dErr) console.error('Error fetching dispatches:', dErr);
      if (dData) {
        setDispatchRecords(
          dData.map((d: any) => ({
            ...d,
            style_number: d.styles?.style_number || 'N/A',
          }))
        );
      }

      const { data: sData, error: sErr } = await supabase
        .from('styles')
        .select('*')
        .order('created_at', { ascending: false });

      if (sErr) console.error('Error fetching styles:', sErr);
      if (sData) {
        setStyles(sData as Style[]);
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
        .select('role')
        .eq('id', user.id)
        .single();

      if (!profile || profile.role === 'employee') {
        router.replace('/employee/tasks');
        return;
      }

      await fetchData();
    };

    init();
  }, [supabase, router, fetchData]);

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDispatchId || !transactionId || amountTransferred <= 0) {
      alert('Please fill in transaction ID and amount transferred.');
      return;
    }

    const dispatch = dispatchRecords.find((d) => d.id === selectedDispatchId);
    const netReceived = Number(amountTransferred) - Number(bankCharges);

    const { error } = await supabase.from('payment_records').insert({
      dispatch_id: selectedDispatchId,
      style_id: dispatch?.style_id || '',
      bank_name: bankName.trim(),
      transaction_id: transactionId.trim(),
      amount_transferred: Number(amountTransferred),
      bank_charges: Number(bankCharges),
      net_received: netReceived,
      payment_date: paymentDate,
      status: paymentStatus,
      notes: paymentNotes,
    });

    if (error) {
      alert('Failed to record payment: ' + error.message);
      return;
    }

    // Optional audit log entry
    await supabase.from('audit_log').insert({
      user_id: currentUserId,
      action: 'CREATE',
      table_name: 'payment_records',
      notes: `Recorded remittance of ₹${amountTransferred} (ref: ${transactionId})`,
    });

    setIsModalOpen(false);
    setTransactionId('');
    setPaymentNotes('');
    setFeedback('Payment remittance recorded successfully.');
    setTimeout(() => setFeedback(null), 3000);
    await fetchData();
  };

  const totalTransferred = payments.reduce((sum, p) => sum + (Number(p.amount_transferred) || 0), 0);
  const totalNetReceived = payments.reduce((sum, p) => sum + (Number(p.net_received) || 0), 0);
  const totalBankCharges = payments.reduce((sum, p) => sum + (Number(p.bank_charges) || 0), 0);

  const handleExportPaymentsExcel = async () => {
    try {
      const rows = payments.map((p) => ({
        id: p.id,
        bank_name: p.bank_name,
        transaction_id: p.transaction_id,
        payment_date: p.payment_date,
        gross_amount: Number(p.amount_transferred) || 0,
        bank_charges: Number(p.bank_charges) || 0,
        net_realized: (Number(p.amount_transferred) || 0) - (Number(p.bank_charges) || 0),
        status: (p.status || '').toUpperCase(),
        notes: p.notes || '',
      }));

      await exportToExcel(
        [
          {
            name: 'Banking & Payments',
            columns: [
              { header: 'Payment ID', key: 'id', width: 22 },
              { header: 'Bank Name', key: 'bank_name', width: 20 },
              { header: 'Transaction ID', key: 'transaction_id', width: 22 },
              { header: 'Payment Date', key: 'payment_date', width: 15 },
              { header: 'Gross Amount (INR)', key: 'gross_amount', width: 20 },
              { header: 'Bank Charges (INR)', key: 'bank_charges', width: 18 },
              { header: 'Net Realized (INR)', key: 'net_realized', width: 20 },
              { header: 'Reconciliation Status', key: 'status', width: 20 },
              { header: 'Notes', key: 'notes', width: 25 },
            ],
            rows,
          },
        ],
        'Forex-Payments-Transactions.xlsx'
      );
      setFeedback('Payments register exported successfully to Excel (.xlsx)!');
      setTimeout(() => setFeedback(null), 4000);
    } catch (err) {
      console.error(err);
      alert('Payments exported.');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-slate-400 text-xs">Loading payments & banking records...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-primary" />
            <h1 className="text-xl font-bold tracking-tight text-white">
              Banking Channels & Payment Reconciliation
            </h1>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Section 10: Export inward remittances, bank charges, and effective margin comparison vs quoted costing.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportPaymentsExcel}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-sm transition"
          >
            <Download className="w-3.5 h-3.5" />
            Export Payments (.xlsx)
          </button>

          <button
            onClick={() => setIsModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            Record Inward Remittance
          </button>
        </div>
      </div>

      {feedback && (
        <div className="p-3 bg-emerald-950/80 border border-emerald-800 rounded text-xs text-emerald-300 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          <span>{feedback}</span>
        </div>
      )}

      {/* Financial KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-[#111726] border border-slate-800 rounded p-4">
          <div className="text-[10px] uppercase font-semibold text-slate-500">Gross Foreign Inward</div>
          <div className="mt-1 text-2xl font-bold text-white mono-num">
            ₹{totalTransferred.toLocaleString()}
          </div>
          <div className="text-[10px] text-slate-400 mt-1">Total buyer wire transfers</div>
        </div>

        <div className="bg-[#111726] border border-slate-800 rounded p-4">
          <div className="text-[10px] uppercase font-semibold text-slate-500">Net Realized Value</div>
          <div className="mt-1 text-2xl font-bold text-emerald-400 mono-num">
            ₹{totalNetReceived.toLocaleString()}
          </div>
          <div className="text-[10px] text-slate-400 mt-1">Credited after bank charges</div>
        </div>

        <div className="bg-[#111726] border border-slate-800 rounded p-4">
          <div className="text-[10px] uppercase font-semibold text-slate-500">Bank Forex Deductions</div>
          <div className="mt-1 text-2xl font-bold text-amber-300 mono-num">
            ₹{totalBankCharges.toLocaleString()}
          </div>
          <div className="text-[10px] text-slate-400 mt-1">Correspondent & handling fees</div>
        </div>
      </div>

      {/* Payments Table */}
      <div className="bg-[#101625] border border-slate-800 rounded overflow-hidden">
        <div className="overflow-x-auto">
          <table className="erp-table text-xs">
            <thead>
              <tr>
                <th>Style Number</th>
                <th>Bank Name</th>
                <th>Transaction / UTR #</th>
                <th>Payment Date</th>
                <th>Gross Transferred</th>
                <th>Bank Charges</th>
                <th>Net Credited</th>
                <th>Reconciliation</th>
              </tr>
            </thead>
            <tbody>
              {payments.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-slate-500 text-xs">
                    No inward bank remittances recorded yet. Log remittances received against dispatch consignments.
                  </td>
                </tr>
              ) : (
                payments.map((p) => (
                  <tr key={p.id}>
                    <td className="font-mono font-bold text-white">{p.style_number}</td>
                    <td className="text-slate-300 flex items-center gap-1.5">
                      <Landmark className="w-3.5 h-3.5 text-slate-500" />
                      {p.bank_name}
                    </td>
                    <td className="font-mono text-slate-200">{p.transaction_id}</td>
                    <td className="mono-num text-slate-300">{p.payment_date}</td>
                    <td className="mono-num font-bold text-white">
                      ₹{(Number(p.amount_transferred) || 0).toLocaleString()}
                    </td>
                    <td className="mono-num text-amber-400">
                      ₹{(Number(p.bank_charges) || 0).toLocaleString()}
                    </td>
                    <td className="mono-num font-bold text-emerald-400">
                      ₹{(Number(p.net_received) || 0).toLocaleString()}
                    </td>
                    <td>
                      <Badge
                        variant={
                          p.status === 'reconciled'
                            ? 'success'
                            : p.status === 'received'
                            ? 'info'
                            : 'warning'
                        }
                      >
                        {p.status}
                      </Badge>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL: RECORD INWARD REMITTANCE */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-[#111726] border border-slate-700 rounded-lg max-w-md w-full p-6 shadow-2xl space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                Record Banking Inward Remittance
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <form onSubmit={handleRecordPayment} className="space-y-3.5">
              <div>
                <label className="block text-slate-400 font-medium mb-1">
                  Target Dispatch Shipment *
                </label>
                <select
                  required
                  value={selectedDispatchId}
                  onChange={(e) => {
                    setSelectedDispatchId(e.target.value);
                    const disp = dispatchRecords.find((d) => d.id === e.target.value);
                    if (disp?.fob_value) setAmountTransferred(disp.fob_value);
                  }}
                  className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white font-mono"
                >
                  <option value="">-- Choose dispatch record --</option>
                  {dispatchRecords.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.style_number} (FOB: ₹{d.fob_value?.toLocaleString()})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-400 font-medium mb-1">Bank Name *</label>
                <input
                  type="text"
                  required
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-medium mb-1">
                  Bank Reference / UTR / Transaction ID *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. SBIN2026092700918"
                  value={transactionId}
                  onChange={(e) => setTransactionId(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-medium mb-1">Amount Transferred (₹) *</label>
                  <input
                    type="number"
                    required
                    value={amountTransferred}
                    onChange={(e) => setAmountTransferred(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 font-medium mb-1">Bank Charges (₹)</label>
                  <input
                    type="number"
                    value={bankCharges}
                    onChange={(e) => setBankCharges(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-medium mb-1">Payment Date</label>
                  <input
                    type="date"
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 font-medium mb-1">Status</label>
                  <select
                    value={paymentStatus}
                    onChange={(e) => setPaymentStatus(e.target.value as any)}
                    className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white"
                  >
                    <option value="received">Received</option>
                    <option value="reconciled">Reconciled</option>
                    <option value="pending">Pending</option>
                  </select>
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-3 py-1.5 bg-slate-800 rounded text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-primary font-semibold text-primary-foreground rounded hover:bg-primary/90"
                >
                  Record Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
