"use client";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  getProducts, createProduct, updateProduct, deleteProduct, adjustProductStock,
  getStockMovements, isLowStock, DEFAULT_REORDER_LEVEL, Product, StockMovement,
  getCategories, createCategory, updateCategory, deleteCategory, Category,
} from "@/lib/db";
import { formatCedi } from "@/lib/utils";
import Modal from "@/components/ui/Modal";
import toast from "react-hot-toast";
import { Plus, Trash2, Pencil, PackagePlus, PackageMinus, AlertTriangle, History, ArrowUp, ArrowDown, Barcode as BarcodeIcon, Search } from "lucide-react";
import Barcode from "@/components/Barcode";
import { generateSKU } from "@/lib/sku-generator";

const SOURCE_LABEL: Record<StockMovement["source"], string> = {
  sale: "Sale",
  purchase_order: "Purchase Order",
  manual: "Manual Adjustment",
  credit_note: "Credit Note",
};

export default function ProductsPage() {
  const { user, businessId } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [form, setForm] = useState({ name: "", sku: "", categoryId: "", unit: "", price: "", wholesalePrice: "", stockQty: "", reorderLevel: "" });
  const [catOpen, setCatOpen] = useState(false);
  const [catName, setCatName] = useState("");
  const [catSaving, setCatSaving] = useState(false);
  const [search, setSearch] = useState("");

  const filteredProducts = useMemo(() => {
    if (!search) return products;
    return products.filter(p =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.sku ?? "").toLowerCase().includes(search.toLowerCase())
    );
  }, [products, search]);

  // Movement history modal
  const [historyProduct, setHistoryProduct] = useState<Product | null>(null);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Barcode modal
  const [barcodeProduct, setBarcodeProduct] = useState<Product | null>(null);

  const load = async () => {
    if (!businessId) return;
    const [pData, cData] = await Promise.all([
      getProducts(businessId),
      getCategories(businessId)
    ]);
    setProducts(pData);
    setCategories(cData);
    setLoading(false);
  };

  useEffect(() => { load(); }, [businessId]);

  const resetForm = () => setForm({ name: "", sku: "", categoryId: "", unit: "", price: "", wholesalePrice: "", stockQty: "", reorderLevel: "" });

  const openAdd = () => {
    setEditing(null);
    resetForm();
    setOpen(true);
  };

  const openEdit = (p: Product) => {
    setEditing(p);
    setForm({
      name: p.name,
      sku: p.sku ?? "",
      categoryId: p.categoryId ?? "",
      unit: p.unit ?? "",
      price: String(p.price),
      wholesalePrice: p.wholesalePrice != null ? String(p.wholesalePrice) : "",
      stockQty: String(p.stockQty),
      reorderLevel: p.reorderLevel != null ? String(p.reorderLevel) : "",
    });
    setOpen(true);
  };

  const handleSave = async () => {
    if (!user || !businessId || !form.name || !form.price) {
      toast.error("Name and price are required");
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await updateProduct(editing.id!, {
          name: form.name,
          sku: form.sku,
          categoryId: form.categoryId || undefined,
          unit: form.unit,
          price: parseFloat(form.price),
          wholesalePrice: form.wholesalePrice ? parseFloat(form.wholesalePrice) : undefined,
          stockQty: parseInt(form.stockQty || "0", 10),
          reorderLevel: form.reorderLevel ? parseInt(form.reorderLevel, 10) : DEFAULT_REORDER_LEVEL,
        });
        toast.success(`${form.name} updated`);
      } else {
        const sku = form.sku || generateSKU(form.name);
        await createProduct({
          userId: user.uid,
          businessId,
          name: form.name,
          sku,
          categoryId: form.categoryId || undefined,
          unit: form.unit,
          price: parseFloat(form.price),
          wholesalePrice: form.wholesalePrice ? parseFloat(form.wholesalePrice) : undefined,
          stockQty: parseInt(form.stockQty || "0", 10),
          reorderLevel: form.reorderLevel ? parseInt(form.reorderLevel, 10) : DEFAULT_REORDER_LEVEL,
        });
        toast.success(`${form.name} added!`);
      }
      setOpen(false);
      resetForm();
      load();
    } catch (err: any) {
      toast.error(err.message ?? "Could not save product");
    } finally {
      setSaving(false);
    }
  };

  const handleAddCategory = async () => {
    if (!businessId || !catName) return;
    setCatSaving(true);
    try {
      await createCategory({ businessId, name: catName });
      toast.success("Category added");
      setCatName("");
      load();
    } catch (err: any) {
      toast.error("Could not add category");
    } finally {
      setCatSaving(false);
    }
  };

  const handleDeleteCategory = async (id: string) => {
    if (!confirm("Delete this category? Products in this category will not be deleted.")) return;
    try {
      await deleteCategory(id);
      toast.success("Category deleted");
      load();
    } catch (err: any) {
      toast.error("Could not delete category");
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Remove ${name} from products?`)) return;
    await deleteProduct(id);
    toast.success("Product removed");
    load();
  };

  const handleAdjust = async (p: Product, delta: number) => {
    if (!businessId || !user) return;
    try {
      await adjustProductStock(p.id!, delta, { businessId, userId: user.uid });
      load();
    } catch (err: any) {
      toast.error(err.message ?? "Could not adjust stock");
    }
  };

  const openHistory = async (p: Product) => {
    if (!businessId) return;
    setHistoryProduct(p);
    setHistoryLoading(true);
    try {
      const data = await getStockMovements(businessId, { productId: p.id! });
      setMovements(data);
    } catch {
      toast.error("Could not load stock history");
    } finally {
      setHistoryLoading(false);
    }
  };

  return (
    <div>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div className="relative w-full md:w-96">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
          <input
            className="input pl-10"
            placeholder="Search products by name or SKU..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-3 w-full md:w-auto">
          <button className="btn-ghost flex-1 md:flex-none" onClick={() => setCatOpen(true)}>Manage Categories</button>
          <button className="btn-primary flex-1 md:flex-none" onClick={openAdd}><Plus size={15} /> Add Product</button>
        </div>
      </div>

      <div className="card">
        {loading ? (
          <p className="text-muted text-sm py-10 text-center">Loading products...</p>
        ) : filteredProducts.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-muted mb-3">No products match your search.</p>
            <button className="btn-primary inline-flex" onClick={openAdd}><Plus size={15} /> Add Product</button>
          </div>
        ) : products.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-muted mb-3">No products yet</p>
            <button className="btn-primary inline-flex" onClick={openAdd}><Plus size={15} /> Add first product</button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] text-muted uppercase tracking-wide">
                <th className="text-left pb-3">Product</th>
                <th className="text-left pb-3">SKU</th>
                <th className="text-left pb-3">Price</th>
                <th className="text-left pb-3">Stock</th>
                <th className="text-left pb-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map(p => (
                <tr key={p.id} className="border-t border-border hover:bg-white/[0.02]">
                  <td className="py-3 font-medium text-surface">{p.name}</td>
                  <td className="py-3 text-muted text-xs">{p.sku || "—"}</td>
                  <td className="py-3 font-grotesk font-semibold">{formatCedi(p.price)}</td>
                  <td className="py-3">
                    <span className={isLowStock(p) ? "text-red font-semibold inline-flex items-center gap-1" : "text-surface"}>
                      {isLowStock(p) && <AlertTriangle size={12} />}
                      {p.stockQty}
                    </span>
                    <span className="text-muted text-xs ml-1">{p.unit || "units"}</span>
                  </td>
                  <td className="py-3">
                    <div className="flex items-center gap-2">
                      <button onClick={() => handleAdjust(p, 1)} className="text-muted hover:text-green transition-colors" title="Add 1 stock">
                        <PackagePlus size={15} />
                      </button>
                      <button onClick={() => handleAdjust(p, -1)} className="text-muted hover:text-red transition-colors" title="Remove 1 stock">
                        <PackageMinus size={15} />
                      </button>
                      <button onClick={() => openHistory(p)} className="text-muted hover:text-surface transition-colors" title="Stock history">
                        <History size={15} />
                      </button>
                      <button onClick={() => setBarcodeProduct(p)} className="text-muted hover:text-surface transition-colors" title="View barcode">
                        <BarcodeIcon size={15} />
                      </button>
                      <button onClick={() => openEdit(p)} className="text-muted hover:text-gold transition-colors" title="Edit">
                        <Pencil size={15} />
                      </button>
                      <button onClick={() => handleDelete(p.id!, p.name)} className="text-muted hover:text-red transition-colors" title="Delete">
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

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? "Edit Product" : "Add Product"}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Product Name *</label>
              <input className="input" placeholder="e.g. MikroTik hAP ac2" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <label className="label">Category</label>
              <select className="input" value={form.categoryId} onChange={e => setForm(f => ({ ...f, categoryId: e.target.value }))}>
                <option value="">No Category</option>
                {categories.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="label">SKU</label>
            <input className="input" placeholder="Optional" value={form.sku} onChange={e => setForm(f => ({ ...f, sku: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Retail Price (GH₵) *</label>
              <input className="input" type="number" placeholder="0.00" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} />
            </div>
            <div>
              <label className="label">Wholesale Price (GH₵)</label>
              <input className="input" type="number" placeholder="Optional" value={form.wholesalePrice} onChange={e => setForm(f => ({ ...f, wholesalePrice: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Stock Qty</label>
              <input className="input" type="number" placeholder="0" value={form.stockQty} onChange={e => setForm(f => ({ ...f, stockQty: e.target.value }))} />
            </div>
            <div>
              <label className="label">Unit</label>
              <input className="input" placeholder="e.g. pcs" value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="label">Low Stock Alert Level</label>
            <input className="input" type="number" placeholder={`Default: ${DEFAULT_REORDER_LEVEL}`} value={form.reorderLevel} onChange={e => setForm(f => ({ ...f, reorderLevel: e.target.value }))} />
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : editing ? "Save Changes" : "Add Product"}
            </button>
          </div>
        </div>
      </Modal>

      {/* Barcode Modal */}
      <Modal open={!!barcodeProduct} onClose={() => setBarcodeProduct(null)} title={barcodeProduct ? `Barcode · ${barcodeProduct.name}` : "Barcode"} width="max-w-sm">
        {barcodeProduct && (
          <div className="flex flex-col items-center gap-4 py-4">
            <Barcode value={barcodeProduct.sku || "NO-SKU"} height={60} width={2} />
            <p className="text-xs text-muted">SKU: {barcodeProduct.sku || "No SKU assigned"}</p>
            <button
              className="btn-ghost text-xs"
              onClick={() => {
                const svg = document.querySelector("#branded-doc svg, .modal svg") as SVGElement;
                if (!svg) return;
                const svgData = new XMLSerializer().serializeToString(svg);
                const blob = new Blob([svgData], { type: "image/svg+xml" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `barcode-${barcodeProduct.sku || barcodeProduct.name}.svg`;
                a.click();
                URL.revokeObjectURL(url);
              }}
            >
              Download SVG
            </button>
          </div>
        )}
      </Modal>

      {/* Stock History Modal */}
      <Modal open={!!historyProduct} onClose={() => setHistoryProduct(null)} title={historyProduct ? `Stock History · ${historyProduct.name}` : "Stock History"} width="max-w-xl">
        {historyLoading ? (
          <p className="text-muted text-sm py-8 text-center">Loading history...</p>
        ) : movements.length === 0 ? (
          <p className="text-muted text-sm py-8 text-center">No stock movements recorded yet</p>
        ) : (
          <div className="space-y-1 max-h-[60vh] overflow-y-auto">
            {movements.map(m => (
              <div key={m.id} className="flex items-center justify-between py-2.5 border-b border-border last:border-0">
                <div className="flex items-center gap-2.5">
                  {m.delta >= 0 ? (
                    <ArrowUp size={14} className="text-green flex-shrink-0" />
                  ) : (
                    <ArrowDown size={14} className="text-red flex-shrink-0" />
                  )}
                  <div>
                    <p className="text-sm text-surface">{SOURCE_LABEL[m.source]}</p>
                    {m.referenceLabel && <p className="text-xs text-muted">{m.referenceLabel}</p>}
                    {m.note && <p className="text-xs text-muted">{m.note}</p>}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className={`text-sm font-grotesk font-semibold ${m.delta >= 0 ? "text-green" : "text-red"}`}>
                    {m.delta >= 0 ? "+" : ""}{m.delta}
                  </p>
                  <p className="text-[11px] text-muted">→ {m.resultingQty}</p>
                  <p className="text-[10px] text-muted">{m.createdAt?.toDate().toLocaleString("en-GH")}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* Categories Modal */}
      <Modal open={catOpen} onClose={() => setCatOpen(false)} title="Manage Categories" width="max-w-md">
        <div className="space-y-4">
          <div className="flex gap-2">
            <input
              className="input"
              placeholder="New category name"
              value={catName}
              onChange={e => setCatName(e.target.value)}
            />
            <button className="btn-primary" onClick={handleAddCategory} disabled={catSaving}>
              {catSaving ? "Adding..." : "Add"}
            </button>
          </div>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {categories.map(c => (
              <div key={c.id} className="flex items-center justify-between p-2 rounded border border-border">
                <span className="text-sm text-surface">{c.name}</span>
                <button onClick={() => handleDeleteCategory(c.id!)} className="text-muted hover:text-red">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </Modal>
    </div>
  );
}
