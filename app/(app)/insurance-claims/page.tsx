"use client";
import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { getInsuranceClaimsForBusiness, updateClaimStatus, createInsuranceClaim } from "@/lib/pharmacy-db";
import { InsuranceClaim } from "@/lib/db";
import { formatMoney } from "@/lib/utils";
import { Plus, Search, Filter, Check, Clock, AlertCircle, Trash2, Eye } from "lucide-react";
import toast from "react-hot-toast";
import Modal from "@/components/ui/Modal";

export default function InsuranceClaimsPage() {
  const { businessId } = useAuth();
  const [claims, setClaims] = useState<InsuranceClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [showNewClaimModal, setShowNewClaimModal] = useState(false);
  const [selectedClaim, setSelectedClaim] = useState<InsuranceClaim | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);

  useEffect(() => {
    if (businessId) {
      fetchClaims();
    }
  }, [businessId]);

  const fetchClaims = async () => {
    if (!businessId) return;
    setLoading(true);
    try {
      const data = await getInsuranceClaimsForBusiness(businessId);
      setClaims(data);
    } catch (err) {
      toast.error("Failed to fetch insurance claims");
    } finally {
      setLoading(false);
    }
  };

  const filteredClaims = claims.filter(c => {
    const matchesSearch = 
      c.clientName.toLowerCase().includes(search.toLowerCase()) ||
      c.invoiceNumber?.toString().includes(search) ||
      c.insuranceId.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = filterStatus === "all" || c.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const handleStatusChange = async (claimId: string, newStatus: string) => {
    const t = toast.loading("Updating claim status...");
    try {
      await updateClaimStatus(claimId, newStatus);
      toast.success("Claim status updated", { id: t });
      fetchClaims();
    } catch (err) {
      toast.error("Failed to update claim", { id: t });
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "submitted": return "bg-blue/20 text-blue";
      case "pending": return "bg-yellow/20 text-yellow";
      case "approved": return "bg-green/20 text-green";
      case "rejected": return "bg-red/20 text-red";
      case "paid": return "bg-gold/20 text-gold";
      default: return "bg-gray/20 text-gray";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "submitted": return <Clock size={16} />;
      case "pending": return <AlertCircle size={16} />;
      case "approved": return <Check size={16} />;
      case "rejected": return <AlertCircle size={16} />;
      case "paid": return <Check size={16} />;
      default: return null;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Insurance Claims</h1>
          <p className="text-muted text-sm mt-1">Manage NHIS and private insurance claims</p>
        </div>
        <button
          onClick={() => setShowNewClaimModal(true)}
          className="btn-primary flex items-center gap-2"
        >
          <Plus size={18} /> New Claim
        </button>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            className="input pl-10 w-full"
            placeholder="Search by client, invoice, or insurance ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="input"
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
        >
          <option value="all">All Status</option>
          <option value="submitted">Submitted</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="paid">Paid</option>
        </select>
      </div>

      <div className="space-y-3">
        {loading ? (
          <div className="text-center py-10 text-muted animate-pulse">Loading claims...</div>
        ) : filteredClaims.length === 0 ? (
          <div className="text-center py-10 text-muted">No insurance claims found</div>
        ) : (
          filteredClaims.map(claim => (
            <div key={claim.id} className="card flex items-center justify-between p-4">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="font-bold text-surface">{claim.clientName}</h3>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1 ${getStatusColor(claim.status)}`}>
                    {getStatusIcon(claim.status)}
                    {claim.status.charAt(0).toUpperCase() + claim.status.slice(1)}
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-muted text-xs">Invoice</p>
                    <p className="font-medium text-surface">#{claim.invoiceNumber}</p>
                  </div>
                  <div>
                    <p className="text-muted text-xs">Insurance Type</p>
                    <p className="font-medium text-surface uppercase">{claim.insuranceType}</p>
                  </div>
                  <div>
                    <p className="text-muted text-xs">Claim Amount</p>
                    <p className="font-medium text-gold">GHS {formatMoney(claim.claimAmount)}</p>
                  </div>
                  <div>
                    <p className="text-muted text-xs">Insurer Amount</p>
                    <p className="font-medium text-surface">GHS {formatMoney(claim.insurerAmount)}</p>
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setSelectedClaim(claim);
                    setShowDetailsModal(true);
                  }}
                  className="p-2 bg-white/5 text-muted hover:text-gold rounded-lg transition-colors"
                  title="View Details"
                >
                  <Eye size={18} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* New Claim Modal */}
      <Modal open={showNewClaimModal} onClose={() => setShowNewClaimModal(false)} title="Create New Insurance Claim">
        <NewClaimForm businessId={businessId} onSuccess={() => { setShowNewClaimModal(false); fetchClaims(); }} />
      </Modal>

      {/* Claim Details Modal */}
      <Modal open={showDetailsModal} onClose={() => setShowDetailsModal(false)} title="Claim Details">
        {selectedClaim && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white/5 p-3 rounded-lg">
                <p className="text-xs text-muted">Client</p>
                <p className="font-bold text-surface">{selectedClaim.clientName}</p>
              </div>
              <div className="bg-white/5 p-3 rounded-lg">
                <p className="text-xs text-muted">Insurance Type</p>
                <p className="font-bold text-surface uppercase">{selectedClaim.insuranceType}</p>
              </div>
              <div className="bg-white/5 p-3 rounded-lg">
                <p className="text-xs text-muted">Insurance ID</p>
                <p className="font-bold text-surface">{selectedClaim.insuranceId}</p>
              </div>
              <div className="bg-white/5 p-3 rounded-lg">
                <p className="text-xs text-muted">Status</p>
                <p className="font-bold text-surface capitalize">{selectedClaim.status}</p>
              </div>
              <div className="bg-white/5 p-3 rounded-lg">
                <p className="text-xs text-muted">Claim Amount</p>
                <p className="font-bold text-gold">GHS {formatMoney(selectedClaim.claimAmount)}</p>
              </div>
              <div className="bg-white/5 p-3 rounded-lg">
                <p className="text-xs text-muted">Co-pay</p>
                <p className="font-bold text-surface">GHS {formatMoney(selectedClaim.copayAmount)}</p>
              </div>
              <div className="bg-white/5 p-3 rounded-lg">
                <p className="text-xs text-muted">Insurer Amount</p>
                <p className="font-bold text-gold">GHS {formatMoney(selectedClaim.insurerAmount)}</p>
              </div>
            </div>

            {selectedClaim.notes && (
              <div className="bg-white/5 p-3 rounded-lg">
                <p className="text-xs text-muted mb-1">Notes</p>
                <p className="text-sm text-surface">{selectedClaim.notes}</p>
              </div>
            )}

            <div className="flex gap-2 pt-4">
              <button className="btn-ghost flex-1" onClick={() => setShowDetailsModal(false)}>Close</button>
              <select
                className="input flex-1"
                value={selectedClaim.status}
                onChange={(e) => handleStatusChange(selectedClaim.id!, e.target.value)}
              >
                <option value="submitted">Submitted</option>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
                <option value="paid">Paid</option>
              </select>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function NewClaimForm({ businessId, onSuccess }: { businessId: string; onSuccess: () => void }) {
  const [form, setForm] = useState({
    invoiceNumber: "",
    clientName: "",
    insuranceType: "nhis" as "nhis" | "private",
    insuranceId: "",
    claimAmount: 0,
    copayAmount: 0,
    insurerAmount: 0,
    notes: "",
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await createInsuranceClaim({
        businessId,
        invoiceId: form.invoiceNumber,
        invoiceNumber: form.invoiceNumber,
        clientId: "",
        clientName: form.clientName,
        insuranceType: form.insuranceType,
        insuranceId: form.insuranceId,
        claimAmount: form.claimAmount,
        copayAmount: form.copayAmount,
        insurerAmount: form.insurerAmount,
        status: "submitted",
        notes: form.notes,
      });
      toast.success("Insurance claim created");
      onSuccess();
    } catch (err) {
      toast.error("Failed to create claim");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="label">Invoice Number</label>
        <input
          className="input"
          type="text"
          placeholder="INV-001"
          value={form.invoiceNumber}
          onChange={(e) => setForm({ ...form, invoiceNumber: e.target.value })}
          required
        />
      </div>

      <div>
        <label className="label">Client Name</label>
        <input
          className="input"
          type="text"
          placeholder="John Doe"
          value={form.clientName}
          onChange={(e) => setForm({ ...form, clientName: e.target.value })}
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Insurance Type</label>
          <select
            className="input"
            value={form.insuranceType}
            onChange={(e) => setForm({ ...form, insuranceType: e.target.value as "nhis" | "private" })}
          >
            <option value="nhis">NHIS</option>
            <option value="private">Private</option>
          </select>
        </div>

        <div>
          <label className="label">Insurance ID</label>
          <input
            className="input"
            type="text"
            placeholder="NHIS-123456"
            value={form.insuranceId}
            onChange={(e) => setForm({ ...form, insuranceId: e.target.value })}
            required
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="label">Claim Amount</label>
          <input
            className="input"
            type="number"
            step="0.01"
            placeholder="0.00"
            value={form.claimAmount}
            onChange={(e) => setForm({ ...form, claimAmount: parseFloat(e.target.value) || 0 })}
            required
          />
        </div>

        <div>
          <label className="label">Co-pay</label>
          <input
            className="input"
            type="number"
            step="0.01"
            placeholder="0.00"
            value={form.copayAmount}
            onChange={(e) => setForm({ ...form, copayAmount: parseFloat(e.target.value) || 0 })}
          />
        </div>

        <div>
          <label className="label">Insurer Amount</label>
          <input
            className="input"
            type="number"
            step="0.01"
            placeholder="0.00"
            value={form.insurerAmount}
            onChange={(e) => setForm({ ...form, insurerAmount: parseFloat(e.target.value) || 0 })}
          />
        </div>
      </div>

      <div>
        <label className="label">Notes</label>
        <textarea
          className="input"
          placeholder="Add any notes about this claim..."
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          rows={3}
        />
      </div>

      <div className="flex gap-3 pt-4">
        <button type="submit" className="btn-primary flex-1" disabled={loading}>
          {loading ? "Creating..." : "Create Claim"}
        </button>
      </div>
    </form>
  );
}
