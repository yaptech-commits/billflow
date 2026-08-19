"use client";
import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { getReturnsForBusiness, updateReturnStatus, createReturn } from "@/lib/pharmacy-db";
import { Return } from "@/lib/db";
import { formatMoney } from "@/lib/utils";
import { Plus, Search, Filter, Check, Clock, AlertCircle, Eye } from "lucide-react";
import toast from "react-hot-toast";
import Modal from "@/components/ui/Modal";

export default function ReturnsPage() {
  const { businessId } = useAuth();
  const [returns, setReturns] = useState<Return[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [showNewReturnModal, setShowNewReturnModal] = useState(false);
  const [selectedReturn, setSelectedReturn] = useState<Return | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);

  useEffect(() => {
    if (businessId) {
      fetchReturns();
    }
  }, [businessId]);

  const fetchReturns = async () => {
    if (!businessId) return;
    setLoading(true);
    try {
      const data = await getReturnsForBusiness(businessId);
      setReturns(data);
    } catch (err) {
      toast.error("Failed to fetch returns");
    } finally {
      setLoading(false);
    }
  };

  const filteredReturns = returns.filter(r => {
    const matchesSearch = r.referenceNumber?.toString().includes(search);
    const matchesType = filterType === "all" || r.returnType === filterType;
    const matchesStatus = filterStatus === "all" || r.status === filterStatus;
    return matchesSearch && matchesType && matchesStatus;
  });

  const handleStatusChange = async (returnId: string, newStatus: string) => {
    const t = toast.loading("Updating return status...");
    try {
      await updateReturnStatus(returnId, newStatus);
      toast.success("Return status updated", { id: t });
      fetchReturns();
    } catch (err) {
      toast.error("Failed to update return", { id: t });
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending": return "bg-yellow/20 text-yellow";
      case "approved": return "bg-green/20 text-green";
      case "rejected": return "bg-red/20 text-red";
      case "completed": return "bg-blue/20 text-blue";
      default: return "bg-gray/20 text-gray";
    }
  };

  const getTypeLabel = (type: string) => {
    return type === "customer_return" ? "Customer Return" : "Supplier Return";
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Returns & Refunds</h1>
          <p className="text-muted text-sm mt-1">Manage customer and supplier returns</p>
        </div>
        <button
          onClick={() => setShowNewReturnModal(true)}
          className="btn-primary flex items-center gap-2"
        >
          <Plus size={18} /> New Return
        </button>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            className="input pl-10 w-full"
            placeholder="Search by reference number..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="input"
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
        >
          <option value="all">All Types</option>
          <option value="customer_return">Customer Returns</option>
          <option value="supplier_return">Supplier Returns</option>
        </select>
        <select
          className="input"
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
        >
          <option value="all">All Status</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="completed">Completed</option>
        </select>
      </div>

      <div className="space-y-3">
        {loading ? (
          <div className="text-center py-10 text-muted animate-pulse">Loading returns...</div>
        ) : filteredReturns.length === 0 ? (
          <div className="text-center py-10 text-muted">No returns found</div>
        ) : (
          filteredReturns.map(ret => (
            <div key={ret.id} className="card p-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h3 className="font-bold text-surface">#{ret.referenceNumber}</h3>
                  <p className="text-xs text-muted">{getTypeLabel(ret.returnType)}</p>
                </div>
                <div className="flex gap-2 items-center">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(ret.status)}`}>
                    {ret.status.charAt(0).toUpperCase() + ret.status.slice(1)}
                  </span>
                  <button
                    onClick={() => {
                      setSelectedReturn(ret);
                      setShowDetailsModal(true);
                    }}
                    className="p-2 bg-white/5 text-muted hover:text-gold rounded-lg transition-colors"
                    title="View Details"
                  >
                    <Eye size={18} />
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-muted text-xs">Items</p>
                  <p className="font-medium text-surface">{ret.lineItems?.length || 0}</p>
                </div>
                <div>
                  <p className="text-muted text-xs">Total Amount</p>
                  <p className="font-medium text-gold">GHS {formatMoney(ret.totalAmount)}</p>
                </div>
                <div>
                  <p className="text-muted text-xs">Refund Amount</p>
                  <p className="font-medium text-surface">GHS {formatMoney(ret.refundAmount || 0)}</p>
                </div>
                <div>
                  <p className="text-muted text-xs">Reason</p>
                  <p className="font-medium text-surface text-ellipsis overflow-hidden">{ret.reason}</p>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* New Return Modal */}
      <Modal open={showNewReturnModal} onClose={() => setShowNewReturnModal(false)} title="Create Return">
        {businessId ? (
          <NewReturnForm businessId={businessId} onSuccess={() => { setShowNewReturnModal(false); fetchReturns(); }} />
        ) : (
          <p className="text-sm text-muted">Your business context is still loading. Please try again in a moment.</p>
        )}
      </Modal>

      {/* Return Details Modal */}
      <Modal open={showDetailsModal} onClose={() => setShowDetailsModal(false)} title="Return Details">
        {selectedReturn && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white/5 p-3 rounded-lg">
                <p className="text-xs text-muted">Reference #</p>
                <p className="font-bold text-surface">{selectedReturn.referenceNumber}</p>
              </div>
              <div className="bg-white/5 p-3 rounded-lg">
                <p className="text-xs text-muted">Type</p>
                <p className="font-bold text-surface">{getTypeLabel(selectedReturn.returnType)}</p>
              </div>
              <div className="bg-white/5 p-3 rounded-lg">
                <p className="text-xs text-muted">Status</p>
                <p className="font-bold text-surface capitalize">{selectedReturn.status}</p>
              </div>
              <div className="bg-white/5 p-3 rounded-lg">
                <p className="text-xs text-muted">Reason</p>
                <p className="font-bold text-surface">{selectedReturn.reason}</p>
              </div>
            </div>

            <div className="bg-white/5 p-3 rounded-lg">
              <p className="text-xs text-muted mb-2">Line Items</p>
              <div className="space-y-2">
                {selectedReturn.lineItems?.map((item, idx) => (
                  <div key={idx} className="flex justify-between text-sm">
                    <span className="text-surface">{item.productName} x{item.quantity}</span>
                    <span className="text-gold">GHS {formatMoney(item.quantity * item.unitPrice)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white/5 p-3 rounded-lg">
                <p className="text-xs text-muted">Total Amount</p>
                <p className="font-bold text-gold">GHS {formatMoney(selectedReturn.totalAmount)}</p>
              </div>
              <div className="bg-white/5 p-3 rounded-lg">
                <p className="text-xs text-muted">Refund Amount</p>
                <p className="font-bold text-surface">GHS {formatMoney(selectedReturn.refundAmount || 0)}</p>
              </div>
            </div>

            <div className="flex gap-2 pt-4">
              <button className="btn-ghost flex-1" onClick={() => setShowDetailsModal(false)}>Close</button>
              <select
                className="input flex-1"
                value={selectedReturn.status}
                onChange={(e) => handleStatusChange(selectedReturn.id!, e.target.value)}
              >
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
                <option value="completed">Completed</option>
              </select>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function NewReturnForm({ businessId, onSuccess }: { businessId: string; onSuccess: () => void }) {
  const [form, setForm] = useState({
    returnType: "customer_return" as "customer_return" | "supplier_return",
    referenceNumber: "",
    reason: "",
    totalAmount: 0,
    refundAmount: 0,
    refundMethod: "cash" as any,
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await createReturn({
        businessId,
        returnType: form.returnType,
        referenceId: form.referenceNumber,
        referenceNumber: form.referenceNumber,
        lineItems: [],
        totalAmount: form.totalAmount,
        refundAmount: form.refundAmount,
        reason: form.reason,
        status: "pending",
        refundMethod: form.refundMethod,
      });
      toast.success("Return created");
      onSuccess();
    } catch (err) {
      toast.error("Failed to create return");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Return Type</label>
          <select
            className="input"
            value={form.returnType}
            onChange={(e) => setForm({ ...form, returnType: e.target.value as any })}
          >
            <option value="customer_return">Customer Return</option>
            <option value="supplier_return">Supplier Return</option>
          </select>
        </div>

        <div>
          <label className="label">Reference Number</label>
          <input
            className="input"
            type="text"
            placeholder="INV-001 or PO-001"
            value={form.referenceNumber}
            onChange={(e) => setForm({ ...form, referenceNumber: e.target.value })}
            required
          />
        </div>
      </div>

      <div>
        <label className="label">Reason for Return</label>
        <textarea
          className="input"
          placeholder="Describe the reason for this return..."
          value={form.reason}
          onChange={(e) => setForm({ ...form, reason: e.target.value })}
          rows={3}
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Total Amount</label>
          <input
            className="input"
            type="number"
            step="0.01"
            placeholder="0.00"
            value={form.totalAmount}
            onChange={(e) => setForm({ ...form, totalAmount: parseFloat(e.target.value) || 0 })}
            required
          />
        </div>

        <div>
          <label className="label">Refund Amount</label>
          <input
            className="input"
            type="number"
            step="0.01"
            placeholder="0.00"
            value={form.refundAmount}
            onChange={(e) => setForm({ ...form, refundAmount: parseFloat(e.target.value) || 0 })}
          />
        </div>
      </div>

      <div className="flex gap-3 pt-4">
        <button type="submit" className="btn-primary flex-1" disabled={loading}>
          {loading ? "Creating..." : "Create Return"}
        </button>
      </div>
    </form>
  );
}
