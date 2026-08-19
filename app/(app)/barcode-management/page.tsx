"use client";
import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { getBarcodesForProduct, createProductBarcode, deleteBarcode } from "@/lib/pharmacy-db";
import { ProductBarcode } from "@/lib/db";
import { Plus, Search, Trash2, Copy, QrCode, AlertCircle } from "lucide-react";
import toast from "react-hot-toast";
import Modal from "@/components/ui/Modal";

export default function BarcodeManagementPage() {
  const { businessId } = useAuth();
  const [barcodes, setBarcodes] = useState<ProductBarcode[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showNewBarcodeModal, setShowNewBarcodeModal] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<string>("");

  useEffect(() => {
    if (businessId) {
      fetchBarcodes();
    }
  }, [businessId]);

  const fetchBarcodes = async () => {
    setLoading(true);
    try {
      // In a real implementation, fetch all barcodes for the business
      // For now, we'll show an empty list with instructions
      setBarcodes([]);
    } catch (err) {
      toast.error("Failed to fetch barcodes");
    } finally {
      setLoading(false);
    }
  };

  const filteredBarcodes = barcodes.filter(b => 
    b.barcode.includes(search) || b.productId.includes(search)
  );

  const handleDeleteBarcode = async (barcodeId: string) => {
    if (!confirm("Delete this barcode?")) return;
    const t = toast.loading("Deleting barcode...");
    try {
      await deleteBarcode(barcodeId);
      toast.success("Barcode deleted", { id: t });
      fetchBarcodes();
    } catch (err) {
      toast.error("Failed to delete barcode", { id: t });
    }
  };

  const handleCopyBarcode = (barcode: string) => {
    navigator.clipboard.writeText(barcode);
    toast.success("Barcode copied to clipboard");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Barcode Management</h1>
          <p className="text-muted text-sm mt-1">Manage product barcodes for POS scanning and inventory</p>
        </div>
        <button
          onClick={() => setShowNewBarcodeModal(true)}
          className="btn-primary flex items-center gap-2"
        >
          <Plus size={18} /> Add Barcode
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="card">
          <p className="text-muted text-sm">Total Barcodes</p>
          <p className="text-3xl font-bold text-gold">{barcodes.length}</p>
        </div>
        <div className="card">
          <p className="text-muted text-sm">Unique Products</p>
          <p className="text-3xl font-bold text-gold">{new Set(barcodes.map(b => b.productId)).size}</p>
        </div>
        <div className="card">
          <p className="text-muted text-sm">Barcode Types</p>
          <p className="text-3xl font-bold text-gold">{new Set(barcodes.map(b => b.barcodeType)).size}</p>
        </div>
      </div>

      <div className="bg-blue/10 border border-blue/30 rounded-lg p-4 flex gap-3">
        <AlertCircle size={20} className="text-blue flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-medium text-blue mb-1">Barcode Scanning Features</p>
          <ul className="text-sm text-blue/80 space-y-1">
            <li>• POS: Scan barcodes to quickly add products to cart</li>
            <li>• Purchase Orders: Scan barcodes when receiving goods</li>
            <li>• Inventory: Track stock by barcode</li>
            <li>• Supported formats: EAN-13, EAN-8, UPC-A, Code 128</li>
          </ul>
        </div>
      </div>

      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input
          className="input pl-10 w-full"
          placeholder="Search by barcode or product ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="space-y-3">
        {loading ? (
          <div className="text-center py-10 text-muted animate-pulse">Loading barcodes...</div>
        ) : filteredBarcodes.length === 0 ? (
          <div className="card p-8 text-center">
            <QrCode size={48} className="mx-auto mb-3 text-muted opacity-50" />
            <p className="text-muted">No barcodes added yet</p>
            <p className="text-xs text-muted mt-1">Add barcodes to enable POS scanning and inventory tracking</p>
          </div>
        ) : (
          filteredBarcodes.map(barcode => (
            <div key={barcode.id} className="card p-4 flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <QrCode size={18} className="text-gold" />
                  <p className="font-mono font-bold text-surface">{barcode.barcode}</p>
                </div>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <p className="text-muted text-xs">Product ID</p>
                    <p className="text-surface">{barcode.productId}</p>
                  </div>
                  <div>
                    <p className="text-muted text-xs">Type</p>
                    <p className="text-surface">{barcode.barcodeType || "Standard"}</p>
                  </div>
                  <div>
                    <p className="text-muted text-xs">Created</p>
                    <p className="text-surface">
                      {barcode.createdAt ? new Date(barcode.createdAt.toDate()).toLocaleDateString() : "N/A"}
                    </p>
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleCopyBarcode(barcode.barcode)}
                  className="p-2 bg-white/5 text-muted hover:text-gold rounded-lg transition-colors"
                  title="Copy Barcode"
                >
                  <Copy size={18} />
                </button>
                <button
                  onClick={() => handleDeleteBarcode(barcode.id!)}
                  className="p-2 bg-white/5 text-muted hover:text-red rounded-lg transition-colors"
                  title="Delete Barcode"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* New Barcode Modal */}
      <Modal open={showNewBarcodeModal} onClose={() => setShowNewBarcodeModal(false)} title="Add Product Barcode">
        <NewBarcodeForm businessId={businessId} onSuccess={() => { setShowNewBarcodeModal(false); fetchBarcodes(); }} />
      </Modal>
    </div>
  );
}

function NewBarcodeForm({ businessId, onSuccess }: { businessId: string; onSuccess: () => void }) {
  const [form, setForm] = useState({
    productId: "",
    barcode: "",
    barcodeType: "ean13",
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.barcode.length < 6) {
      toast.error("Barcode must be at least 6 characters");
      return;
    }

    setLoading(true);
    try {
      await createProductBarcode({
        businessId,
        productId: form.productId,
        barcode: form.barcode,
        barcodeType: form.barcodeType,
      });
      toast.success("Barcode added successfully");
      onSuccess();
    } catch (err) {
      toast.error("Failed to add barcode");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="label">Product ID</label>
        <input
          className="input"
          type="text"
          placeholder="e.g., PROD-001"
          value={form.productId}
          onChange={(e) => setForm({ ...form, productId: e.target.value })}
          required
        />
      </div>

      <div>
        <label className="label">Barcode</label>
        <input
          className="input font-mono"
          type="text"
          placeholder="e.g., 5901234123457"
          value={form.barcode}
          onChange={(e) => setForm({ ...form, barcode: e.target.value.replace(/\D/g, "") })}
          required
        />
        <p className="text-xs text-muted mt-1">Numbers only. Minimum 6 digits.</p>
      </div>

      <div>
        <label className="label">Barcode Type</label>
        <select
          className="input"
          value={form.barcodeType}
          onChange={(e) => setForm({ ...form, barcodeType: e.target.value })}
        >
          <option value="ean13">EAN-13 (Standard)</option>
          <option value="ean8">EAN-8</option>
          <option value="upca">UPC-A</option>
          <option value="code128">Code 128</option>
        </select>
      </div>

      <div className="bg-white/5 p-3 rounded-lg">
        <p className="text-xs text-muted mb-2">Preview</p>
        <p className="font-mono text-lg text-gold tracking-widest">{form.barcode || "••••••••••••"}</p>
      </div>

      <div className="flex gap-3 pt-4">
        <button type="submit" className="btn-primary flex-1" disabled={loading}>
          {loading ? "Adding..." : "Add Barcode"}
        </button>
      </div>
    </form>
  );
}
