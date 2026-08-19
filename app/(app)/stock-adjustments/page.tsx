"use client";
import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { getStockAdjustmentsForBusiness, createStockAdjustment } from "@/lib/pharmacy-db";
import { StockAdjustment } from "@/lib/db";
import { Plus, Search, Filter, Trash2, Eye } from "lucide-react";
import toast from "react-hot-toast";
import Modal from "@/components/ui/Modal";

const ADJUSTMENT_REASONS = [
  { value: "damage", label: "Damage" },
  { value: "wastage", label: "Wastage" },
  { value: "theft", label: "Theft" },
  { value: "expired", label: "Expired Stock" },
  { value: "inventory_correction", label: "Inventory Correction" },
  { value: "other", label: "Other" },
];

export default function StockAdjustmentsPage() {
  const { businessId, user } = useAuth();
  const [adjustments, setAdjustments] = useState<StockAdjustment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterReason, setFilterReason] = useState<string>("all");
  const [showNewAdjustmentModal, setShowNewAdjustmentModal] = useState(false);

  useEffect(() => {
    if (businessId) {
      fetchAdjustments();
    }
  }, [businessId]);

  const fetchAdjustments = async () => {
    if (!businessId) return;
    setLoading(true);
    try {
      const data = await getStockAdjustmentsForBusiness(businessId);
      setAdjustments(data);
    } catch (err) {
      toast.error("Failed to fetch stock adjustments");
    } finally {
      setLoading(false);
    }
  };

  const filteredAdjustments = adjustments.filter(a => {
    const matchesSearch = 
      a.productName.toLowerCase().includes(search.toLowerCase()) ||
      a.staffName.toLowerCase().includes(search.toLowerCase());
    const matchesReason = filterReason === "all" || a.reason === filterReason;
    return matchesSearch && matchesReason;
  });

  const getReasonLabel = (reason: string) => {
    return ADJUSTMENT_REASONS.find(r => r.value === reason)?.label || reason;
  };

  const getReasonColor = (reason: string) => {
    switch (reason) {
      case "damage": return "bg-red/20 text-red";
      case "wastage": return "bg-orange/20 text-orange";
      case "theft": return "bg-red/20 text-red";
      case "expired": return "bg-yellow/20 text-yellow";
      case "inventory_correction": return "bg-blue/20 text-blue";
      default: return "bg-gray/20 text-gray";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Stock Adjustments</h1>
          <p className="text-muted text-sm mt-1">Record manual stock adjustments for damage, wastage, or corrections</p>
        </div>
        <button
          onClick={() => setShowNewAdjustmentModal(true)}
          className="btn-primary flex items-center gap-2"
        >
          <Plus size={18} /> New Adjustment
        </button>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            className="input pl-10 w-full"
            placeholder="Search by product or staff..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="input"
          value={filterReason}
          onChange={(e) => setFilterReason(e.target.value)}
        >
          <option value="all">All Reasons</option>
          {ADJUSTMENT_REASONS.map(r => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </select>
      </div>

      <div className="space-y-3">
        {loading ? (
          <div className="text-center py-10 text-muted animate-pulse">Loading adjustments...</div>
        ) : filteredAdjustments.length === 0 ? (
          <div className="text-center py-10 text-muted">No stock adjustments found</div>
        ) : (
          filteredAdjustments.map(adjustment => (
            <div key={adjustment.id} className="card p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-bold text-surface">{adjustment.productName}</h3>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${getReasonColor(adjustment.reason)}`}>
                  {getReasonLabel(adjustment.reason)}
                </span>
              </div>
              <div className="grid grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-muted text-xs">Quantity</p>
                  <p className={`font-bold ${adjustment.quantityAdjusted < 0 ? "text-red" : "text-green"}`}>
                    {adjustment.quantityAdjusted > 0 ? "+" : ""}{adjustment.quantityAdjusted}
                  </p>
                </div>
                <div>
                  <p className="text-muted text-xs">Staff</p>
                  <p className="font-medium text-surface">{adjustment.staffName}</p>
                </div>
                <div>
                  <p className="text-muted text-xs">Date</p>
                  <p className="font-medium text-surface">
                    {adjustment.createdAt ? new Date(adjustment.createdAt.toDate()).toLocaleDateString() : "N/A"}
                  </p>
                </div>
                <div>
                  <p className="text-muted text-xs">Notes</p>
                  <p className="font-medium text-surface text-ellipsis overflow-hidden">{adjustment.notes || "-"}</p>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* New Adjustment Modal */}
      {businessId && (
        <Modal open={showNewAdjustmentModal} onClose={() => setShowNewAdjustmentModal(false)} title="Create Stock Adjustment">
          <NewAdjustmentForm 
            businessId={businessId} 
            staffName={user?.displayName || "Unknown"} 
            staffId={user?.uid || ""} 
            onSuccess={() => { setShowNewAdjustmentModal(false); fetchAdjustments(); }} 
          />
        </Modal>
      )}
    </div>
  );
}

function NewAdjustmentForm({ businessId, staffName, staffId, onSuccess }: { businessId: string; staffName: string; staffId: string; onSuccess: () => void }) {
  const [form, setForm] = useState({
    productName: "",
    productId: "",
    quantityAdjusted: 0,
    reason: "damage" as any,
    notes: "",
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.quantityAdjusted === 0) {
      toast.error("Quantity must not be zero");
      return;
    }

    setLoading(true);
    try {
      await createStockAdjustment({
        businessId,
        productId: form.productId || "unknown",
        productName: form.productName,
        quantityAdjusted: form.quantityAdjusted,
        reason: form.reason,
        staffId,
        staffName,
        notes: form.notes,
      });
      toast.success("Stock adjustment recorded");
      onSuccess();
    } catch (err) {
      toast.error("Failed to create adjustment");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="label">Product Name</label>
        <input
          className="input"
          type="text"
          placeholder="e.g., Paracetamol 500mg"
          value={form.productName}
          onChange={(e) => setForm({ ...form, productName: e.target.value })}
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Quantity Adjusted</label>
          <input
            className="input"
            type="number"
            placeholder="e.g., -5 (negative for removal)"
            value={form.quantityAdjusted}
            onChange={(e) => setForm({ ...form, quantityAdjusted: parseInt(e.target.value) || 0 })}
            required
          />
        </div>

        <div>
          <label className="label">Reason</label>
          <select
            className="input"
            value={form.reason}
            onChange={(e) => setForm({ ...form, reason: e.target.value })}
          >
            {ADJUSTMENT_REASONS.map(r => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="label">Notes</label>
        <textarea
          className="input"
          placeholder="Add details about this adjustment..."
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          rows={3}
        />
      </div>

      <div className="flex gap-3 pt-4">
        <button type="submit" className="btn-primary flex-1" disabled={loading}>
          {loading ? "Recording..." : "Record Adjustment"}
        </button>
      </div>
    </form>
  );
}
