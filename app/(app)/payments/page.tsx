"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { getPayments, getInvoices, getBusinessProfile, createPayment, getClients, deletePayment, Payment, Invoice, BusinessProfile, Client, PaymentMethod } from "@/lib/db";
import { deleteOfflinePayment, deleteOfflinePOSSale } from "@/lib/offline-sync";
import { Download, ReceiptText, Trash2 } from "lucide-react";
import { formatCedi, formatMoney } from "@/lib/utils";
import { Timestamp } from "firebase/firestore";
import Modal from "@/components/ui/Modal";
import Badge from "@/components/ui/Badge";
import toast from "react-hot-toast";
import { getManagementPlanDetails, normalizeManagementPlan } from "@/lib/management-plans";
import { downloadReceipt } from "@/lib/print-receipt";
import { Plus } from "lucide-react";

export default function PaymentsPage() {
  const { user, businessId, role } = useAuth();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [onboardingInvoices, setOnboardingInvoices] = useState<Invoice[]>([]);
  const [businessProfile, setBusinessProfile] = useState<BusinessProfile | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ clientId: "", method: "momo" as PaymentMethod, reference: "", amount: "" });

  const load = async () => {
    if (!user || !businessId) return;
    const [pay, cli, invoiceRows, profile] = await Promise.all([
      getPayments(businessId),
      getClients(businessId),
      getInvoices(businessId),
      getBusinessProfile(businessId),
    ]);

    // Merge with offline records
    const offlineSales = typeof window !== "undefined" ? JSON.parse(localStorage.getItem("billflow_offline_sales") || "[]") : [];
    const manualOfflinePayments = typeof window !== "undefined" ? JSON.parse(localStorage.getItem("billflow_offline_payments") || "[]") : [];
    
    const posOfflinePayments: Payment[] = offlineSales.map((s: any) => ({
      id: s.id,
      clientId: s.data.clientId || "",
      clientName: s.data.customerName || "Walk-in Customer",
      amount: s.data.amount || s.data.items.reduce((sum: number, l: any) => sum + (l.quantity * l.unitPrice), 0),
      method: s.data.paymentMethod || s.data.method,
      reference: `POS-OFFLINE-${s.id.slice(0, 5)}`,
      status: "success",
      createdAt: Timestamp.fromMillis(s.timestamp),
      businessId: s.data.businessId || businessId,
      userId: user.uid,
      isOffline: true
    }));

    const manualPayments: Payment[] = manualOfflinePayments.map((s: any) => ({
      id: s.id,
      ...s.data,
      createdAt: Timestamp.fromMillis(s.timestamp),
      isOffline: true
    }));

    setPayments([...posOfflinePayments, ...manualPayments, ...pay]);
    setOnboardingInvoices(invoiceRows.filter(invoice => invoice.invoiceType === "onboarding"));
    setBusinessProfile(profile);
    setClients(cli);
    setLoading(false);
  };

  useEffect(() => { 
    load(); 
    window.addEventListener("billflow_refresh", load);
    return () => window.removeEventListener("billflow_refresh", load);
  }, [user, businessId]);

  const momoTotal = payments.filter(p => p.method === "momo" && p.status === "success").reduce((s, p) => s + p.amount, 0);
  const cardTotal = payments.filter(p => p.method === "card" && p.status === "success").reduce((s, p) => s + p.amount, 0);
  const cashTotal = payments.filter(p => p.method === "cash" && p.status === "success").reduce((s, p) => s + p.amount, 0);
  const canSeeOnboardingBilling = role === "owner" || role === "super_admin";

  const invoiceDate = (value: any) => {
    if (value && typeof value.toDate === "function") return value.toDate();
    const parsed = value ? new Date(value) : new Date();
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  };

  const downloadOnboardingReceipt = (invoice: Invoice) => {
    const plan = normalizeManagementPlan(businessProfile?.managementPlan) || "demo";
    const details = getManagementPlanDetails(plan, businessProfile?.proBusinessScale || "large");
    const amount = Number(invoice.amount || details.startupPrice || 0);
    const isPaid = invoice.status === "paid";
    const documentLabel = isPaid ? "RECEIPT" : "INVOICE";
    const safeInvoiceNumber = String(invoice.invoiceNumber || invoice.id || "onboarding").replace(/[^a-z0-9_-]+/gi, "-");
    downloadReceipt({
      documentTitle: documentLabel,
      invoiceNumber: String(invoice.invoiceNumber || invoice.id || "ONBOARDING"),
      issuedAt: invoiceDate(invoice.issuedAt || (invoice as any).createdAt),
      dueDate: invoiceDate(invoice.dueAt || invoice.issuedAt || (invoice as any).createdAt),
      items: [{ productName: `${details.label} — Startup Activation`, quantity: 1, unitPrice: amount }],
      subtotal: amount,
      taxAmount: 0,
      total: amount,
      paymentMethod: invoice.paymentMethod || "cash",
      amountPaid: isPaid ? Number(invoice.amountPaid || amount) : 0,
      customerName: businessProfile?.businessName || invoice.clientName,
      customerAddress: businessProfile?.email || businessProfile?.ownerEmail || "",
      currencyCode: businessProfile?.currency || "GHS",
      footerNote: `Selected plan: ${details.label}. ${details.recurringDescription || ""}`.trim(),
      logoDataUrl: businessProfile?.logoDataUrl,
      businessName: businessProfile?.businessName || invoice.clientName,
    }, `billflow-${safeInvoiceNumber}-${isPaid ? "receipt" : "invoice"}.html`);
  };

  const handleRecord = async () => {
    if (!user || !businessId || !form.clientId || !form.amount) { toast.error("Fill all required fields"); return; }
    if (businessId === "SUPER_ADMIN") {
      toast.error("Please select a specific business to record payments.");
      return;
    }
    setSaving(true);
    const client = clients.find(c => c.id === form.clientId);
    
    try {
      const isOnline = navigator.onLine && localStorage.getItem("billflow_offline_mode") !== "true";
      
      if (!isOnline) {
        const offlinePayments = JSON.parse(localStorage.getItem("billflow_offline_payments") || "[]");
        const newOfflinePayment = {
          id: crypto.randomUUID(),
          data: {
            userId: user.uid,
            businessId,
            clientId: form.clientId,
            clientName: client?.name ?? "Unknown",
            method: form.method,
            reference: form.reference || `REF-OFFLINE-${Date.now()}`,
            amount: parseFloat(form.amount),
            status: "success",
          },
          timestamp: Date.now()
        };
        offlinePayments.push(newOfflinePayment);
        localStorage.setItem("billflow_offline_payments", JSON.stringify(offlinePayments));
        toast.success("Payment recorded offline! Will sync when online.");
      } else {
        await createPayment({
          userId: user.uid,
          businessId,
          clientId: form.clientId,
          clientName: client?.name ?? "Unknown",
          method: form.method,
          reference: form.reference || `REF-${Date.now()}`,
          amount: parseFloat(form.amount),
          status: "success",
          createdAt: Timestamp.now(),
        });
        toast.success("Payment recorded ✅");
      }
      setOpen(false);
      setForm({ clientId: "", method: "momo", reference: "", amount: "" });
      load();
    } catch (err: any) {
      toast.error(err.message || "Could not record payment");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (p: Payment) => {
    if (!confirm("Delete this payment record?")) return;
    
    if (p.isOffline) {
      if (p.reference?.startsWith("POS")) {
        deleteOfflinePOSSale(p.id!);
      } else {
        deleteOfflinePayment(p.id!);
      }
      toast.success("Offline payment deleted");
    } else {
      await deletePayment(p.id!);
      toast.success("Payment deleted");
    }
    load();
  };

  return (
    <div>
      {canSeeOnboardingBilling && (
        <div className="card mb-7">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <div className="flex items-center gap-2">
                <ReceiptText size={17} className="text-gold" />
                <h2 className="font-grotesk font-semibold text-white">Onboarding billing</h2>
              </div>
              <p className="text-xs text-muted mt-1">Plan activation invoices and verified onboarding payments for this business.</p>
            </div>
            <span className="text-[10px] uppercase tracking-wider text-muted border border-border rounded-full px-2.5 py-1">Owner view</span>
          </div>
          {onboardingInvoices.length === 0 ? (
            <p className="text-muted text-sm py-5 text-center">No onboarding invoice has been created for this business yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[720px]">
                <thead>
                  <tr className="text-[11px] text-muted uppercase tracking-wide">
                    <th className="text-left pb-3">Invoice</th>
                    <th className="text-left pb-3">Issued</th>
                    <th className="text-left pb-3">Plan</th>
                    <th className="text-left pb-3">Amount</th>
                    <th className="text-left pb-3">Status</th>
                    <th className="text-left pb-3">Receipt</th>
                  </tr>
                </thead>
                <tbody>
                  {onboardingInvoices.map(invoice => {
                    const plan = normalizeManagementPlan(businessProfile?.managementPlan) || "demo";
                    const details = getManagementPlanDetails(plan, businessProfile?.proBusinessScale || "large");
                    const relatedPayment = payments.find(payment => payment.invoiceId === invoice.id || payment.reference === (invoice as any).providerReference);
                    const issued = invoiceDate(invoice.issuedAt || (invoice as any).createdAt);
                    const isPaid = invoice.status === "paid";
                    return (
                      <tr key={invoice.id || invoice.invoiceNumber} className="border-t border-border">
                        <td className="py-3 font-grotesk text-surface">{invoice.invoiceNumber || invoice.id}</td>
                        <td className="py-3 text-muted text-xs">{issued.toLocaleDateString("en-GH")}</td>
                        <td className="py-3 text-surface">{details.label}</td>
                        <td className="py-3 font-grotesk font-semibold text-green">{formatCedi(Number(invoice.amount || details.startupPrice))}</td>
                        <td className="py-3"><Badge status={invoice.status} />{relatedPayment?.reference && <span className="block text-[10px] text-muted mt-1">{relatedPayment.reference}</span>}</td>
                        <td className="py-3">
                          <button
                            type="button"
                            onClick={() => downloadOnboardingReceipt(invoice)}
                            className={`inline-flex items-center gap-1.5 text-xs ${isPaid ? "text-gold hover:text-white" : "text-muted hover:text-surface"}`}
                            title={isPaid ? "Download paid receipt" : "Download onboarding invoice"}
                          >
                            <Download size={14} /> {isPaid ? "Download receipt" : "Download invoice"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-5 mb-7">
        <div className="card text-center py-6">
          <p className="text-2xl mb-2">📱</p>
          <p className="font-grotesk text-xl font-bold text-gold">{formatMoney(momoTotal)}</p>
          <p className="text-[10px] text-muted mt-1">Mobile Money</p>
        </div>
        <div className="card text-center py-6">
          <p className="text-2xl mb-2">💳</p>
          <p className="font-grotesk text-xl font-bold text-surface">{formatMoney(cardTotal)}</p>
          <p className="text-[10px] text-muted mt-1">Card Payments</p>
        </div>
        <div className="card text-center py-6">
          <p className="text-2xl mb-2">💵</p>
          <p className="font-grotesk text-xl font-bold text-green">{formatMoney(cashTotal)}</p>
          <p className="text-[10px] text-muted mt-1">Cash Payments</p>
        </div>
      </div>

      <div className="flex justify-end mb-4">
        <button className="btn-primary" onClick={() => setOpen(true)}><Plus size={15} /> Record Payment</button>
      </div>

      <div className="card">
        <h2 className="font-grotesk font-semibold text-white mb-4">Payment History</h2>
        {loading ? (
          <p className="text-muted text-sm py-8 text-center">Loading...</p>
        ) : payments.length === 0 ? (
          <p className="text-muted text-sm py-8 text-center">No payments recorded yet</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] text-muted uppercase tracking-wide">
                <th className="text-left pb-3">Date</th>
                <th className="text-left pb-3">Client</th>
                <th className="text-left pb-3">Method</th>
                <th className="text-left pb-3">Reference</th>
                <th className="text-left pb-3">Amount</th>
                <th className="text-left pb-3">Status</th>
                <th className="text-left pb-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {payments.map(p => (
                <tr key={p.id} className="border-t border-border hover:bg-white/[0.02]">
                  <td className="py-3 text-muted text-xs">{p.createdAt ? (typeof p.createdAt.toDate === 'function' ? p.createdAt.toDate().toLocaleDateString("en-GH") : new Date(p.createdAt as any).toLocaleDateString("en-GH")) : "Recent"}</td>
                  <td className="py-3 font-medium text-surface">{p.clientName}</td>
                  <td className="py-3 text-sm">{p.method === "momo" ? "📱 MoMo" : p.method === "card" ? "💳 Card" : "💵 Cash"}</td>
                  <td className="py-3 text-muted text-xs font-grotesk">{p.reference}</td>
                  <td className="py-3 font-grotesk font-semibold text-green">+{formatCedi(p.amount)}</td>
                  <td className="py-3"><Badge status={p.status} /></td>
                  <td className="py-3">
                    <button onClick={() => remove(p)} className="text-muted hover:text-red transition-colors" title="Delete">
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Record Payment">
        <div className="space-y-4">
          <div>
            <label className="label">Payment Method</label>
            <div className="grid grid-cols-3 gap-3">
              {(["momo", "card", "cash"] as const).map(m => (
                <button key={m} onClick={() => setForm(f => ({ ...f, method: m }))}
                  className={`border-2 rounded-xl p-3 text-center transition-all ${form.method === m ? "border-gold bg-gold/5" : "border-border hover:border-muted"}`}>
                  <div className="text-2xl mb-1">{m === "momo" ? "📱" : m === "card" ? "💳" : "💵"}</div>
                  <div className="text-xs font-semibold text-surface">{m === "momo" ? "MoMo" : m === "card" ? "Card" : "Cash"}</div>
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Client *</label>
              <select className="input" value={form.clientId} onChange={e => setForm(f => ({ ...f, clientId: e.target.value }))}>
                <option value="">Select client</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Amount (GH₵) *</label>
              <input className="input" type="number" placeholder="0.00" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="label">Reference / Transaction ID</label>
            <input className="input" placeholder="e.g. MTN-2026-XXXXXX" value={form.reference} onChange={e => setForm(f => ({ ...f, reference: e.target.value }))} />
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn-primary" onClick={handleRecord} disabled={saving}>{saving ? "Saving..." : "Record Payment"}</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
