"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { getVouchers, createVouchers, markVoucherUsed, Voucher } from "@/lib/db";
import { generateVoucherCode } from "@/lib/utils";
import Modal from "@/components/ui/Modal";
import Badge from "@/components/ui/Badge";
import toast from "react-hot-toast";
import { Plus, Printer } from "lucide-react";

export default function VouchersPage() {
  const { user, businessId } = useAuth();
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ data: "2 GB", validity: "7 Days", price: "", qty: "6" });

  const load = async () => {
    if (!user || !businessId) return;
    const data = await getVouchers(businessId);
    setVouchers(data);
    setLoading(false);
  };

  useEffect(() => { load(); }, [user, businessId]);

  const handleGenerate = async () => {
    if (!user || !businessId || !form.price) { toast.error("Enter a price"); return; }
    setSaving(true);
    const qty = parseInt(form.qty) || 6;
    const batch: Omit<Voucher, "id">[] = Array.from({ length: qty }, () => ({
      userId: user.uid,
      businessId,
      code: generateVoucherCode(),
      data: form.data,
      validity: form.validity,
      price: parseFloat(form.price),
      used: false,
    }));
    await createVouchers(batch);
    toast.success(`${qty} vouchers generated!`);
    setOpen(false);
    setForm({ data: "2 GB", validity: "7 Days", price: "", qty: "6" });
    setSaving(false);
    load();
  };

  const handleMarkUsed = async (id: string) => {
    await markVoucherUsed(id);
    toast.success("Voucher marked as used");
    load();
  };

  const active = vouchers.filter(v => !v.used).length;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex gap-4 text-sm text-muted">
          <span><span className="text-white font-semibold">{vouchers.length}</span> total</span>
          <span><span className="text-green font-semibold">{active}</span> active</span>
          <span><span className="text-muted font-semibold">{vouchers.length - active}</span> used</span>
        </div>
        <div className="flex gap-2">
          <button className="btn-ghost" onClick={() => window.print()}><Printer size={15} /> Print All</button>
          <button className="btn-primary" onClick={() => setOpen(true)}><Plus size={15} /> Generate Vouchers</button>
        </div>
      </div>

      {loading ? (
        <p className="text-muted text-sm text-center py-12">Loading vouchers...</p>
      ) : vouchers.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-muted mb-3">No vouchers yet</p>
          <button className="btn-primary inline-flex" onClick={() => setOpen(true)}><Plus size={15} /> Generate first batch</button>
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-4">
          {vouchers.map(v => (
            <div key={v.id} className={`card text-center relative ${v.used ? "opacity-50" : ""}`}>
              <div className="absolute top-3 right-3">
                <Badge status={v.used ? "overdue" : "paid"} />
              </div>
              <p className="font-grotesk text-xl font-bold text-gold tracking-widest mb-2">{v.code}</p>
              <p className="text-sm text-muted mb-1">{v.data} · {v.validity}</p>
              <p className="text-base font-semibold text-green mb-3">GH₵ {v.price}</p>
              {!v.used && (
                <button
                  onClick={() => handleMarkUsed(v.id!)}
                  className="text-[11px] text-muted hover:text-surface border border-border rounded-lg px-3 py-1 transition-colors"
                >
                  Mark Used
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Generate WiFi Vouchers">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Data Bundle</label>
              <select className="input" value={form.data} onChange={e => setForm(f => ({ ...f, data: e.target.value }))}>
                <option>1 GB</option><option>2 GB</option><option>5 GB</option><option>10 GB</option><option>Unlimited Day</option>
              </select>
            </div>
            <div>
              <label className="label">Validity</label>
              <select className="input" value={form.validity} onChange={e => setForm(f => ({ ...f, validity: e.target.value }))}>
                <option>1 Day</option><option>3 Days</option><option>7 Days</option><option>30 Days</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Price (GH₵) *</label>
              <input className="input" type="number" placeholder="5.00" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} />
            </div>
            <div>
              <label className="label">Quantity</label>
              <input className="input" type="number" placeholder="6" value={form.qty} onChange={e => setForm(f => ({ ...f, qty: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn-primary" onClick={handleGenerate} disabled={saving}>{saving ? "Generating..." : "Generate"}</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
