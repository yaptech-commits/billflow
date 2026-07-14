"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  getPurchaseOrders, createPurchaseOrder, deletePurchaseOrder, receivePurchaseOrder,
  nextPoNumber, getSuppliers, getProducts,
  PurchaseOrder, PurchaseOrderLineItem, Supplier, Product,
} from "@/lib/db";
import { formatCedi } from "@/lib/utils";
import Modal from "@/components/ui/Modal";
import Badge from "@/components/ui/Badge";
import toast from "react-hot-toast";
import { Plus, Trash2, PackageCheck, ClipboardList } from "lucide-react";

interface DraftLine {
  productId: string;
  quantity: string;
  unitCost: string;
}

export default function PurchaseOrdersPage() {
  const { user, businessId } = useAuth();
  const [pos, setPos] = useState<PurchaseOrder[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [receivingId, setReceivingId] = useState<string | null>(null);

  const [supplierId, setSupplierId] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([{ productId: "", quantity: "", unitCost: "" }]);

  const load = async () => {
    if (!businessId) return;
    const [poData, supplierData, productData] = await Promise.all([
      getPurchaseOrders(businessId),
      getSuppliers(businessId),
      getProducts(businessId),
    ]);
    setPos(poData);
    setSuppliers(supplierData);
    setProducts(productData);
    setLoading(false);
  };

  useEffect(() => { load(); }, [businessId]);

  const resetForm = () => {
    setSupplierId("");
    setNotes("");
    setLines([{ productId: "", quantity: "", unitCost: "" }]);
  };

  const openAdd = () => {
    resetForm();
    setOpen(true);
  };

  const addLine = () => setLines(ls => [...ls, { productId: "", quantity: "", unitCost: "" }]);
  const removeLine = (i: number) => setLines(ls => ls.filter((_, idx) => idx !== i));
  const updateLine = (i: number, patch: Partial<DraftLine>) =>
    setLines(ls => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  const total = lines.reduce((sum, l) => {
    const q = parseFloat(l.quantity || "0");
    const c = parseFloat(l.unitCost || "0");
    return sum + (isNaN(q) || isNaN(c) ? 0 : q * c);
  }, 0);

  const handleSave = async () => {
    if (!user || !businessId || !supplierId) {
      toast.error("Please select a supplier");
      return;
    }
    const validLines = lines.filter(l => l.productId && l.quantity && l.unitCost);
    if (validLines.length === 0) {
      toast.error("Add at least one line item");
      return;
    }
    setSaving(true);
    try {
      const supplier = suppliers.find(s => s.id === supplierId)!;
      const items: PurchaseOrderLineItem[] = validLines.map(l => {
        const product = products.find(p => p.id === l.productId)!;
        return {
          productId: l.productId,
          productName: product.name,
          quantity: parseInt(l.quantity, 10),
          unitCost: parseFloat(l.unitCost),
        };
      });
      const poNumber = await nextPoNumber(businessId);
      await createPurchaseOrder({
        userId: user.uid,
        businessId,
        supplierId,
        supplierName: supplier.name,
        poNumber,
        items,
        totalCost: items.reduce((s, li) => s + li.quantity * li.unitCost, 0),
        status: "ordered",
        notes,
        orderedAt: null,
        receivedAt: null,
      });
      toast.success(`${poNumber} created`);
      setOpen(false);
      resetForm();
      load();
    } catch (err: any) {
      toast.error(err.message ?? "Something went wrong");
    } finally {
      setSaving(false);
    }
  };

  const handleReceive = async (po: PurchaseOrder) => {
    if (!confirm(`Mark ${po.poNumber} as received? This will add the ordered quantities to your stock.`)) return;
    setReceivingId(po.id!);
    try {
      await receivePurchaseOrder(po.id!);
      toast.success(`${po.poNumber} received — stock updated`);
      load();
    } catch (err: any) {
      toast.error(err.message ?? "Could not receive purchase order");
    } finally {
      setReceivingId(null);
    }
  };

  const handleDelete = async (id: string, poNumber: string) => {
    if (!confirm(`Delete ${poNumber}? This cannot be undone.`)) return;
    await deletePurchaseOrder(id);
    toast.success("Purchase order deleted");
    load();
  };

  return (
    <div>
      <div className="flex justify-end mb-6">
        <button className="btn-primary" onClick={openAdd} disabled={suppliers.length === 0 || products.length === 0}>
          <Plus size={15} /> New Purchase Order
        </button>
      </div>

      {(suppliers.length === 0 || products.length === 0) && (
        <div className="card mb-6 text-sm text-muted">
          {suppliers.length === 0 && <p>Add a supplier first before creating a purchase order.</p>}
          {products.length === 0 && <p>Add a product first before creating a purchase order.</p>}
        </div>
      )}

      <div className="card">
        {loading ? (
          <p className="text-muted text-sm py-10 text-center">Loading purchase orders...</p>
        ) : pos.length === 0 ? (
          <div className="text-center py-16">
            <ClipboardList size={28} className="text-muted mx-auto mb-3" />
            <p className="text-muted mb-3">No purchase orders yet</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] text-muted uppercase tracking-wide">
                <th className="text-left pb-3">PO #</th>
                <th className="text-left pb-3">Supplier</th>
                <th className="text-left pb-3">Items</th>
                <th className="text-left pb-3">Total Cost</th>
                <th className="text-left pb-3">Status</th>
                <th className="text-left pb-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pos.map(po => (
                <tr key={po.id} className="border-t border-border hover:bg-white/[0.02]">
                  <td className="py-3 font-medium text-surface">{po.poNumber}</td>
                  <td className="py-3 text-muted text-xs">{po.supplierName}</td>
                  <td className="py-3 text-muted text-xs">{po.items.length} item{po.items.length !== 1 ? "s" : ""}</td>
                  <td className="py-3 font-grotesk font-semibold">{formatCedi(po.totalCost)}</td>
                  <td className="py-3">
                    <Badge status={po.status === "received" ? "paid" : po.status === "cancelled" ? "overdue" : "pending"} />
                  </td>
                  <td className="py-3">
                    <div className="flex items-center gap-2">
                      {po.status === "ordered" && (
                        <button
                          onClick={() => handleReceive(po)}
                          disabled={receivingId === po.id}
                          className="text-muted hover:text-green transition-colors"
                          title="Mark as received (adds stock)"
                        >
                          <PackageCheck size={15} />
                        </button>
                      )}
                      <button onClick={() => handleDelete(po.id!, po.poNumber)} className="text-muted hover:text-red transition-colors" title="Delete">
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

      <Modal open={open} onClose={() => setOpen(false)} title="New Purchase Order" width="max-w-2xl">
        <div className="space-y-4">
          <div>
            <label className="label">Supplier *</label>
            <select className="input" value={supplierId} onChange={e => setSupplierId(e.target.value)}>
              <option value="">Select supplier...</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>

          <div>
            <label className="label">Line Items *</label>
            <div className="space-y-2">
              {lines.map((line, i) => (
                <div key={i} className="grid grid-cols-[1fr_90px_110px_auto] gap-2 items-center">
                  <select
                    className="input"
                    value={line.productId}
                    onChange={e => updateLine(i, { productId: e.target.value })}
                  >
                    <option value="">Select product...</option>
                    {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <input
                    className="input"
                    type="number"
                    placeholder="Qty"
                    value={line.quantity}
                    onChange={e => updateLine(i, { quantity: e.target.value })}
                  />
                  <input
                    className="input"
                    type="number"
                    placeholder="Unit cost"
                    value={line.unitCost}
                    onChange={e => updateLine(i, { unitCost: e.target.value })}
                  />
                  <button
                    onClick={() => removeLine(i)}
                    disabled={lines.length === 1}
                    className="text-muted hover:text-red transition-colors disabled:opacity-30"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
            <button onClick={addLine} className="btn-ghost mt-2 text-xs"><Plus size={13} /> Add line</button>
          </div>

          <div>
            <label className="label">Notes</label>
            <input className="input" placeholder="Optional" value={notes} onChange={e => setNotes(e.target.value)} />
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-border">
            <p className="text-sm text-muted">Total: <span className="text-surface font-grotesk font-semibold">{formatCedi(total)}</span></p>
            <div className="flex gap-3">
              <button className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
              <button className="btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? "Creating..." : "Create Purchase Order"}
              </button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
