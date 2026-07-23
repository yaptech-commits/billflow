"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  getInvoices, createInvoice, updateInvoice, deleteInvoice, recordPayment, createCreditNote, getBusinessProfile,
  getClients, getProducts, Invoice, Client, Product, InvoiceStatus, InvoiceLineItem, PaymentMethod, BusinessProfile,
} from "@/lib/db";
import { formatMoney } from "@/lib/utils";
import { Timestamp } from "firebase/firestore";
import Modal from "@/components/ui/Modal";
import Badge from "@/components/ui/Badge";
import BrandedDocument from "@/components/BrandedDocument";
import toast from "react-hot-toast";
import { Plus, Trash2, X, Wallet, Undo2, Eye, Printer } from "lucide-react";

interface DraftLine {
  productId: string;
  quantity: string;
}

const emptyLine = (): DraftLine => ({ productId: "", quantity: "1" });

const TABS: { label: string; value: InvoiceStatus | "all" }[] = [
  { label: "All", value: "all" },
  { label: "Paid", value: "paid" },
  { label: "Pending", value: "pending" },
  { label: "Overdue", value: "overdue" },
  { label: "Draft", value: "draft" },
];

export default function InvoicesPage() {
  const { user, businessId, role } = useAuth();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [tab, setTab] = useState<InvoiceStatus | "all">("all");
  const currencyCode = profile?.currency;
  const [open, setOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    clientId: "", dueDate: "", notes: "", paymentMethod: "momo" as PaymentMethod, discountAmount: "",
  });
  const [lines, setLines] = useState<DraftLine[]>([emptyLine()]);

  // Record payment modal
  const [payTarget, setPayTarget] = useState<Invoice | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState<PaymentMethod>("momo");
  const [payReference, setPayReference] = useState("");
  const [paySaving, setPaySaving] = useState(false);

  // Credit note modal
  const [creditTarget, setCreditTarget] = useState<Invoice | null>(null);
  const [creditAmount, setCreditAmount] = useState("");
  const [creditReason, setCreditReason] = useState<"return" | "refund" | "adjustment">("adjustment");
  const [creditRestock, setCreditRestock] = useState(false);
  const [creditNotes, setCreditNotes] = useState("");
  const [creditSaving, setCreditSaving] = useState(false);

  // View / print invoice
  const [viewTarget, setViewTarget] = useState<Invoice | null>(null);

  const load = async () => {
    if (!user || !businessId) return;
    const invoiceOpts = role === "salesperson" ? { onlyUserId: user.uid } : undefined;
    const [inv, cli, prod, prof] = await Promise.all([
      getInvoices(businessId, invoiceOpts),
      getClients(businessId),
      getProducts(businessId),
      getBusinessProfile(businessId),
    ]);

    // Merge with offline records
    const offlineSales = typeof window !== "undefined" ? JSON.parse(localStorage.getItem("billflow_offline_sales") || "[]") : [];
    const manualOfflineInvoices = typeof window !== "undefined" ? JSON.parse(localStorage.getItem("billflow_offline_invoices") || "[]") : [];
    
    const posOfflineInvoices: Invoice[] = offlineSales.map((s: any) => ({
      id: s.id,
      invoiceNumber: `POS-OFFLINE-${s.id.slice(0, 5)}`,
      clientId: s.data.clientId || "",
      clientName: s.data.customerName || "Walk-in Customer",
      items: s.data.items,
      amount: s.data.amount || s.data.items.reduce((sum: number, l: any) => sum + (l.quantity * l.unitPrice), 0),
      amountPaid: s.data.amount || s.data.items.reduce((sum: number, l: any) => sum + (l.quantity * l.unitPrice), 0),
      status: "paid",
      paymentMethod: s.data.paymentMethod || s.data.method,
      issuedAt: Timestamp.fromMillis(s.timestamp),
      businessId: s.data.businessId || businessId,
      userId: user.uid,
      isOffline: true
    }));

    const manualInvoices: Invoice[] = manualOfflineInvoices.map((s: any) => ({
      id: s.id,
      invoiceNumber: `INV-OFFLINE-${s.id.slice(0, 5)}`,
      ...s.data,
      issuedAt: Timestamp.fromMillis(s.timestamp),
      dueAt: s.data.dueAt ? Timestamp.fromMillis(s.data.dueAt) : null,
      isOffline: true
    }));

    setInvoices([...posOfflineInvoices, ...manualInvoices, ...inv]);
    setClients(cli);
    setProducts(prod);
    setProfile(prof);
    setLoading(false);
  };

  useEffect(() => { load(); }, [user, businessId, role]);

  const filtered = tab === "all" ? invoices : invoices.filter(i => i.status === tab);

  const productById = (id: string) => products.find(p => p.id === id);

  const resolvedLines = lines
    .filter(l => l.productId && Number(l.quantity) > 0)
    .map(l => {
      const p = productById(l.productId)!;
      const quantity = parseInt(l.quantity, 10);
      return {
        productId: p.id!,
        productName: p.name,
        quantity,
        unitPrice: p.price,
        stockQty: p.stockQty,
        overStock: quantity > p.stockQty,
      };
    });

  const lineTotal = resolvedLines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0);
  const discountAmount = parseFloat(form.discountAmount) || 0;
  const total = lineTotal - discountAmount;
  const hasOverStock = resolvedLines.some(l => l.overStock);

  const setLine = (i: number, patch: Partial<DraftLine>) => {
    setLines(ls => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  };
  const addLine = () => setLines(ls => [...ls, emptyLine()]);
  const removeLine = (i: number) => setLines(ls => ls.filter((_, idx) => idx !== i));

  const resetForm = () => {
    setForm({ clientId: "", dueDate: "", notes: "", paymentMethod: "momo", discountAmount: "" });
    setLines([emptyLine()]);
  };

  const openEdit = (invoice: Invoice) => {
    setEditTarget(invoice);
    setForm({
      clientId: invoice.clientId,
      dueDate: invoice.dueAt ? invoice.dueAt.toDate().toISOString().split('T')[0] : "",
      notes: invoice.notes ?? "",
      paymentMethod: invoice.paymentMethod,
      discountAmount: invoice.discountAmount ? String(invoice.discountAmount) : "",
    });
    setLines(invoice.items?.map(li => ({ productId: li.productId, quantity: String(li.quantity) })) ?? [emptyLine()]);
    setOpen(true);
  };

  const handleCreateOrUpdate = async (status: InvoiceStatus) => {
    if (!user || !businessId || !form.clientId || resolvedLines.length === 0) {
      toast.error("Please select a client and at least one product line");
      return;
    }
    if (hasOverStock) {
      toast.error("One or more items exceed available stock");
      return;
    }
    setSaving(true);
    const client = clients.find(c => c.id === form.clientId);
    const items: InvoiceLineItem[] = resolvedLines.map(({ productId, productName, quantity, unitPrice }) => ({
      productId, productName, quantity, unitPrice,
    }));
    try {
      const isOnline = navigator.onLine && localStorage.getItem("billflow_offline_mode") !== "true";
      
      if (!isOnline && !editTarget) {
        const offlineInvoices = JSON.parse(localStorage.getItem("billflow_offline_invoices") || "[]");
        const newOfflineInvoice = {
          id: crypto.randomUUID(),
          data: {
            userId: user.uid,
            businessId,
            clientId: form.clientId,
            clientName: client?.name ?? "Unknown",
            items,
            subtotal: lineTotal,
            discountAmount: discountAmount,
            amount: total,
            notes: form.notes,
            status,
            paymentMethod: form.paymentMethod,
            issuedAt: Date.now(),
            dueAt: form.dueDate ? new Date(form.dueDate).getTime() : null,
          },
          timestamp: Date.now()
        };
        offlineInvoices.push(newOfflineInvoice);
        localStorage.setItem("billflow_offline_invoices", JSON.stringify(offlineInvoices));
        toast.success("Invoice saved offline! Will sync when online.");
      } else if (editTarget) {
        if (!isOnline) throw new Error("Cannot edit invoices while offline");
        await updateInvoice(editTarget.id!, {
          clientId: form.clientId,
          clientName: client?.name ?? "Unknown",
          items,
          subtotal: lineTotal,
          discountAmount: discountAmount,
          amount: total,
          notes: form.notes,
          status,
          paymentMethod: form.paymentMethod,
          dueAt: form.dueDate ? Timestamp.fromDate(new Date(form.dueDate)) : null,
        });
        toast.success("Invoice updated!");
      } else {
        await createInvoice({
          userId: user.uid,
          businessId,
          clientId: form.clientId,
          clientName: client?.name ?? "Unknown",
          items,
          subtotal: lineTotal,
          discountAmount: discountAmount,
          amount: total,
          notes: form.notes,
          status,
          paymentMethod: form.paymentMethod,
          issuedAt: Timestamp.now(),
          dueAt: form.dueDate ? Timestamp.fromDate(new Date(form.dueDate)) : null,
        });
        toast.success(status === "draft" ? "Invoice saved as draft" : "Invoice sent!");
      }
      setOpen(false);
      resetForm();
      load();
    } catch (err: any) {
      toast.error(err.message ?? (editTarget ? "Could not update invoice" : "Could not create invoice"));
    } finally {
      setSaving(false);
    }
  };

  const balanceDue = (inv: Invoice) => inv.amount - (inv.amountPaid ?? 0);

  const openPay = (inv: Invoice) => {
    setPayTarget(inv);
    setPayAmount(balanceDue(inv).toFixed(2));
    setPayMethod(inv.paymentMethod);
    setPayReference("");
  };

  const handleRecordPayment = async () => {
    if (!payTarget) return;
    const amount = parseFloat(payAmount);
    if (!amount || amount <= 0) {
      toast.error("Enter a valid payment amount");
      return;
    }
    setPaySaving(true);
    try {
      await recordPayment(payTarget, amount, payMethod, payReference || `manual-${Date.now()}`);
      toast.success(`Payment of ${formatMoney(amount, currencyCode)} recorded`);
      setPayTarget(null);
      load();
    } catch (err: any) {
      toast.error(err.message ?? "Could not record payment");
    } finally {
      setPaySaving(false);
    }
  };

  const openCredit = (inv: Invoice) => {
    setCreditTarget(inv);
    setCreditAmount("");
    setCreditReason("adjustment");
    setCreditRestock(false);
    setCreditNotes("");
  };

  const handleCreateCreditNote = async () => {
    if (!creditTarget) return;
    const amount = parseFloat(creditAmount);
    if (!amount || amount <= 0) {
      toast.error("Enter a valid credit amount");
      return;
    }
    setCreditSaving(true);
    try {
      await createCreditNote(creditTarget, {
        userId: creditTarget.userId,
        businessId: creditTarget.businessId,
        items: creditTarget.items ?? [],
        restock: creditRestock,
        amount,
        reason: creditReason,
        notes: creditNotes,
      });
      toast.success(`Credit note issued for ${formatMoney(amount, currencyCode)} recorded`);
      setCreditTarget(null);
      load();
    } catch (err: any) {
      toast.error(err.message ?? "Could not create credit note");
    } finally {
      setCreditSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this invoice?")) return;
    await deleteInvoice(id);
    toast.success("Invoice deleted");
    load();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex gap-1 bg-card border border-border rounded-lg p-1">
          {TABS.map(t => (
            <button
              key={t.value}
              onClick={() => setTab(t.value)}
              className={`px-4 py-1.5 rounded-md text-xs font-medium transition-all ${
                tab === t.value ? "bg-border text-surface" : "text-muted hover:text-surface"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button className="btn-primary" onClick={() => {
          setEditTarget(null);
          resetForm();
          setOpen(true);
        }}>
          <Plus size={15} /> New Invoice
        </button>
      </div>

      <div className="card">
        {loading ? (
          <p className="text-muted text-sm py-10 text-center">Loading invoices...</p>
        ) : filtered.length === 0 ? (
          <p className="text-muted text-sm py-10 text-center">No invoices found</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] text-muted uppercase tracking-wide">
                <th className="text-left pb-3">Invoice #</th>
                <th className="text-left pb-3">Client</th>
                <th className="text-left pb-3">Item</th>
                <th className="text-left pb-3">Amount</th>
                <th className="text-left pb-3">Balance</th>
                <th className="text-left pb-3">Method</th>
                <th className="text-left pb-3">Due</th>
                <th className="text-left pb-3">Status</th>
                <th className="text-left pb-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(inv => (
                <tr key={inv.id} className="border-t border-border hover:bg-white/[0.02]">
                  <td className="py-3 font-medium text-surface">{inv.invoiceNumber}</td>
                  <td className="py-3 font-medium text-surface">{inv.clientName}</td>
                  <td className="py-3 text-muted text-xs">
                    {inv.items && inv.items.length > 0
                      ? inv.items.map(li => `${li.productName} ×${li.quantity}`).join(", ")
                      : inv.item || "—"}
                  </td>
                  <td className="py-3 font-grotesk font-semibold">{formatMoney(inv.amount, currencyCode)}</td>
                  <td className="py-3 text-xs">
                    {inv.status === "paid" ? (
                      <span className="text-muted">—</span>
                    ) : (
                      <span className={balanceDue(inv) < inv.amount ? "text-gold font-semibold" : "text-muted"}>
                        {formatMoney(balanceDue(inv), currencyCode)}
                      </span>
                    )}
                  </td>
                  <td className="py-3 text-muted text-xs">{inv.paymentMethod === "momo" ? "📱 MoMo" : inv.paymentMethod === "card" ? "💳 Card" : "💵 Cash"}</td>
                  <td className="py-3 text-muted text-xs">
                    {inv.dueAt ? inv.dueAt.toDate().toLocaleDateString("en-GH") : "—"}
                  </td>
                  <td className="py-3"><Badge status={inv.status} /></td>
                  <td className="py-3">
                    <div className="flex items-center gap-2">
                      <button onClick={() => setViewTarget(inv)} className="text-muted hover:text-surface transition-colors" title="View / print invoice">
                        <Eye size={15} />
                      </button>
                      <button onClick={() => openEdit(inv)} className="text-muted hover:text-blue transition-colors" title="Edit invoice">
                        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" className="lucide lucide-square-pen"><path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.375 2.625a2.121 2.121 0 1 1 3 3L19 8l-3-3Z"/></svg>
                      </button>
                      {inv.status !== "paid" && (
                        <button onClick={() => openPay(inv)} className="text-green hover:text-green/80 transition-colors" title="Record payment">
                          <Wallet size={15} />
                        </button>
                      )}
                      {(inv.items?.length ?? 0) > 0 && (
                        <button onClick={() => openCredit(inv)} className="text-muted hover:text-gold transition-colors" title="Issue refund / credit note">
                          <Undo2 size={15} />
                        </button>
                      )}
                      <button onClick={() => remove(inv.id!)} className="text-muted hover:text-red transition-colors" title="Delete">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Create Modal */}
      <Modal open={open} onClose={() => setOpen(false)} title={editTarget ? "Edit Invoice" : "Create Invoice"}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Client *</label>
              <select className="input" value={form.clientId} onChange={e => setForm(f => ({ ...f, clientId: e.target.value }))}>
                <option value="">Select client</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Due Date</label>
              <input className="input" type="date" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="label">Products *</label>
            <div className="space-y-2">
              {lines.map((line, i) => {
                const p = productById(line.productId);
                const qty = parseInt(line.quantity || "0", 10);
                const over = p ? qty > p.stockQty : false;
                return (
                  <div key={i} className="flex items-center gap-2">
                    <select
                      className="input flex-1"
                      value={line.productId}
                      onChange={e => setLine(i, { productId: e.target.value })}
                    >
                      <option value="">Select product</option>
                      {products.map(p => (
                        <option key={p.id} value={p.id} disabled={p.stockQty <= 0}>
                          {p.name} — {formatMoney(p.price, currencyCode)} ({p.stockQty} in stock)
                        </option>
                      ))}
                    </select>
                    <input
                      className="input w-20"
                      type="number"
                      min={1}
                      placeholder="Qty"
                      value={line.quantity}
                      onChange={e => setLine(i, { quantity: e.target.value })}
                    />
                    <button
                      className="text-muted hover:text-red transition-colors flex-shrink-0"
                      onClick={() => removeLine(i)}
                      title="Remove line"
                    >
                      <X size={15} />
                    </button>
                    {over && (
                      <span className="text-[10px] text-red flex-shrink-0">only {p!.stockQty} left</span>
                    )}
                  </div>
                );
              })}
            </div>
            <button className="btn-ghost mt-2 text-xs" onClick={addLine}>
              <Plus size={13} /> Add line
            </button>
            {products.length === 0 && (
              <p className="text-xs text-muted mt-2">No products yet — add some in the Products page first.</p>
            )}
          </div>
          <div className="space-y-1 px-1 border-t border-dashed border-border pt-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted">Subtotal</span>
              <span className="text-xs text-surface">{formatMoney(lineTotal, currencyCode)}</span>
            </div>
            <div className="flex items-center justify-between">
              <label className="text-xs text-muted">Discount</label>
              <input
                className="input-sm w-24 text-right"
                type="number"
                placeholder="0.00"
                value={form.discountAmount}
                onChange={e => setForm(f => ({ ...f, discountAmount: e.target.value }))}
              />
            </div>
            <div className="flex items-center justify-between pt-1">
              <span className="text-sm font-bold text-surface">Total Due</span>
              <span className="font-grotesk font-bold text-surface">{formatMoney(total, currencyCode)}</span>
            </div>
          </div>
          <div>
            <label className="label">Payment Method</label>
            <div className="grid grid-cols-3 gap-3">
              {(["momo", "card", "cash"] as const).map(m => (
                <button
                  key={m}
                  onClick={() => setForm(f => ({ ...f, paymentMethod: m }))}
                  className={`border-2 rounded-xl p-3 text-center transition-all ${
                    form.paymentMethod === m ? "border-gold bg-gold/5" : "border-border hover:border-muted"
                  }`}
                >
                  <div className="text-2xl mb-1">{m === "momo" ? "📱" : m === "card" ? "💳" : "💵"}</div>
                  <div className="text-xs font-semibold text-surface">{m === "momo" ? "Mobile Money" : m === "card" ? "Card Payment" : "Cash"}</div>
                  <div className="text-[10px] text-muted mt-0.5">{m === "momo" ? "MTN · Vodafone" : m === "card" ? "Paystack" : "Physical Cash"}</div>
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="label">Notes</label>
            <textarea className="input resize-none h-20" placeholder="Optional notes for client..." value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn-primary" onClick={() => handleCreateOrUpdate("pending")} disabled={saving}>
              {saving ? (editTarget ? "Updating..." : "Sending...") : (editTarget ? "Update Invoice" : "Send Invoice")}
            </button>
            <button className="btn-ghost" onClick={() => handleCreateOrUpdate("draft")} disabled={saving}>
              {saving ? (editTarget ? "Saving Draft..." : "Saving Draft...") : "Save as Draft"}
            </button>
          </div>
        </div>
      </Modal>

      {/* Record Payment Modal */}
      <Modal open={!!payTarget} onClose={() => setPayTarget(null)} title="Record Payment">
        {payTarget && (
          <div className="space-y-4">
            <div className="flex items-center justify-between px-1 text-sm">
              <span className="text-muted">Balance due</span>
              <span className="font-grotesk font-semibold text-surface">{formatMoney(balanceDue(payTarget), currencyCode)}</span>
            </div>
            <div>
              <label className="label">Amount Received ({profile?.currency ? profile.currency : 'GH₵'}) *</label>
              <input className="input" type="number" value={payAmount} onChange={e => setPayAmount(e.target.value)} />
            </div>
            <div>
              <label className="label">Method</label>
              <div className="grid grid-cols-3 gap-3">
                {(["momo", "card", "cash"] as const).map(m => (
                  <button
                    key={m}
                    onClick={() => setPayMethod(m)}
                    className={`border-2 rounded-xl p-3 text-center transition-all ${
                      payMethod === m ? "border-gold bg-gold/5" : "border-border hover:border-muted"
                    }`}
                  >
                    <div className="text-2xl mb-1">{m === "momo" ? "📱" : m === "card" ? "💳" : "💵"}</div>
                    <div className="text-xs font-semibold text-surface">{m === "momo" ? "Mobile Money" : m === "card" ? "Card" : "Cash"}</div>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="label">Reference</label>
              <input className="input" placeholder="Transaction ID / reference (optional)" value={payReference} onChange={e => setPayReference(e.target.value)} />
            </div>
            <div className="flex gap-3 justify-end pt-2">
              <button className="btn-ghost" onClick={() => setPayTarget(null)}>Cancel</button>
              <button className="btn-primary" onClick={handleRecordPayment} disabled={paySaving}>
                {paySaving ? "Recording..." : `Record Payment of ${formatMoney(parseFloat(payAmount) || 0, currencyCode)}`}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Credit Note Modal */}
      <Modal open={!!creditTarget} onClose={() => setCreditTarget(null)} title="Issue Credit Note">
        {creditTarget && (
          <div className="space-y-4">
            <div className="flex items-center justify-between px-1 text-sm">
              <span className="text-muted">Invoice total</span>
              <span className="font-grotesk font-semibold text-surface">{formatMoney(creditTarget.amount, currencyCode)}</span>
            </div>
            <div>
              <label className="label">Amount ({profile?.currency ? profile.currency : 'GH₵'}) *</label>
              <input className="input" type="number" value={creditAmount} onChange={e => setCreditAmount(e.target.value)} />
            </div>
            <div>
              <label className="label">Reason</label>
              <select className="input" value={creditReason} onChange={e => setCreditReason(e.target.value as any)}>
                <option value="return">Product Return</option>
                <option value="refund">Refund</option>
                <option value="adjustment">Billing Adjustment</option>
              </select>
            </div>
            {creditReason === "return" && (
              <label className="flex items-center gap-2 text-sm text-surface">
                <input type="checkbox" checked={creditRestock} onChange={e => setCreditRestock(e.target.checked)} />
                Add returned items back to stock
              </label>
            )}
            <div>
              <label className="label">Notes</label>
              <input className="input" placeholder="Optional" value={creditNotes} onChange={e => setCreditNotes(e.target.value)} />
            </div>
            <div className="flex gap-3 justify-end pt-2">
              <button className="btn-ghost" onClick={() => setCreditTarget(null)}>Cancel</button>
              <button className="btn-primary" onClick={handleCreateCreditNote} disabled={creditSaving}>
                {creditSaving ? "Issuing..." : `Issue Credit Note for ${formatMoney(parseFloat(creditAmount) || 0, currencyCode)}`}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* View / Print Invoice Modal */}
      <Modal open={!!viewTarget} onClose={() => setViewTarget(null)} title="Invoice">
        {viewTarget && (
          <div>
            <div className="mb-5">
              <BrandedDocument
                profile={profile}
                docType="INVOICE"
                docNumber={viewTarget.invoiceNumber ? String(viewTarget.invoiceNumber) : viewTarget.id!.slice(0, 8).toUpperCase()}
                currencyCode={currencyCode}
                date={viewTarget.issuedAt ? viewTarget.issuedAt.toDate() : new Date()}
                clientName={viewTarget.clientName}
                items={
                  viewTarget.items?.map(li => ({
                    productName: li.productName, quantity: li.quantity, unitPrice: li.unitPrice,
                  })) ?? (viewTarget.item ? [{ productName: viewTarget.item, quantity: 1, unitPrice: viewTarget.amount }] : [])
                }
                amount={viewTarget.amount}
                amountPaid={viewTarget.amountPaid}
                paymentMethod={viewTarget.paymentMethod}
                meta={viewTarget.dueAt ? `Due: ${viewTarget.dueAt.toDate().toLocaleDateString("en-GH")}` : undefined}
              />
            </div>
            <div className="flex gap-3 justify-end">
              <button className="btn-ghost" onClick={() => setViewTarget(null)}><X size={14} /> Close</button>
              <button className="btn-primary" onClick={() => window.print()}>
                <Printer size={14} /> Print Invoice
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
