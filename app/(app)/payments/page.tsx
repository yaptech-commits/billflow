"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { getPayments, createPayment, getClients, Payment, Client, PaymentMethod } from "@/lib/db";
import { formatCedi, formatMoney } from "@/lib/utils";
import { Timestamp } from "firebase/firestore";
import Modal from "@/components/ui/Modal";
import Badge from "@/components/ui/Badge";
import toast from "react-hot-toast";
import { Plus } from "lucide-react";

export default function PaymentsPage() {
  const { user, businessId } = useAuth();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ clientId: "", method: "momo" as PaymentMethod, reference: "", amount: "" });

  const load = async () => {
    if (!user || !businessId) return;
    const [pay, cli] = await Promise.all([getPayments(businessId), getClients(businessId)]);

    // Merge with offline payments
    const offlineSales = typeof window !== "undefined" ? JSON.parse(localStorage.getItem("billflow_offline_sales") || "[]") : [];
    const offlinePayments: Payment[] = offlineSales.map((s: any) => ({
      id: s.id,
      clientId: s.data.clientId || "",
      clientName: s.data.customerName || "Walk-in Customer",
      amount: s.data.amount || s.data.items.reduce((sum: number, l: any) => sum + (l.quantity * l.unitPrice), 0),
      method: s.data.paymentMethod || s.data.method,
      reference: `OFFLINE-${s.id.slice(0, 5)}`,
      status: "success",
      createdAt: Timestamp.fromMillis(s.timestamp),
      businessId: s.data.businessId || businessId,
      userId: user.uid,
      isOffline: true
    }));

    setPayments([...offlinePayments, ...pay]);
    setClients(cli);
    setLoading(false);
  };

  useEffect(() => { load(); }, [user, businessId]);

  const momoTotal = payments.filter(p => p.method === "momo" && p.status === "success").reduce((s, p) => s + p.amount, 0);
  const cardTotal = payments.filter(p => p.method === "card" && p.status === "success").reduce((s, p) => s + p.amount, 0);
  const cashTotal = payments.filter(p => p.method === "cash" && p.status === "success").reduce((s, p) => s + p.amount, 0);

  const handleRecord = async () => {
    if (!user || !businessId || !form.clientId || !form.amount) { toast.error("Fill all required fields"); return; }
    setSaving(true);
    const client = clients.find(c => c.id === form.clientId);
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
    setOpen(false);
    setForm({ clientId: "", method: "momo", reference: "", amount: "" });
    setSaving(false);
    load();
  };

  return (
    <div>
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
              </tr>
            </thead>
            <tbody>
              {payments.map(p => (
                <tr key={p.id} className="border-t border-border hover:bg-white/[0.02]">
                  <td className="py-3 text-muted text-xs">{p.createdAt?.toDate().toLocaleDateString("en-GH")}</td>
                  <td className="py-3 font-medium text-surface">{p.clientName}</td>
                  <td className="py-3 text-sm">{p.method === "momo" ? "📱 MoMo" : p.method === "card" ? "💳 Card" : "💵 Cash"}</td>
                  <td className="py-3 text-muted text-xs font-grotesk">{p.reference}</td>
                  <td className="py-3 font-grotesk font-semibold text-green">+{formatCedi(p.amount)}</td>
                  <td className="py-3"><Badge status={p.status} /></td>
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
