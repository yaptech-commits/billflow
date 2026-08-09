"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { getPrescriptionsByBusiness, Prescription, PrescriptionStatus } from "@/lib/db";
import { Timestamp } from "firebase/firestore";
import { Plus, Eye } from "lucide-react";
import { cn } from "@/lib/utils";

export default function PrescriptionsPage() {
  const { businessId, role } = useAuth();
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<PrescriptionStatus | "all">("all");

  useEffect(() => {
    if (!businessId) return;

    const fetchData = async () => {
      try {
        setLoading(true);
        const presc = await getPrescriptionsByBusiness(
          businessId,
          statusFilter === "all" ? undefined : statusFilter
        );
        setPrescriptions(presc);
      } catch (error) {
        console.error("Failed to load prescriptions:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [businessId, statusFilter]);

  const formatDate = (ts: Timestamp | null) => {
    if (!ts) return "N/A";
    return ts.toDate().toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const getStatusColor = (status: PrescriptionStatus) => {
    switch (status) {
      case "pending":
        return "bg-blue/10 text-blue";
      case "dispensed":
        return "bg-gold/10 text-gold";
      case "completed":
        return "bg-green/10 text-green";
      case "expired":
        return "bg-red/10 text-red";
      case "cancelled":
        return "bg-muted/10 text-muted";
      default:
        return "bg-white/5 text-surface";
    }
  };

  if (!role || (role !== "owner" && role !== "super_admin")) {
    return (
      <div className="p-8 text-center">
        <p className="text-muted">You don't have permission to view prescriptions.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-surface">Prescriptions</h1>
          <p className="text-sm text-muted mt-1">Manage patient prescriptions and refills</p>
        </div>
      </div>

      <div className="card flex items-center gap-4">
        <div>
          <label className="text-xs font-bold text-muted uppercase tracking-tighter block mb-1">
            Filter by Status
          </label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="input text-sm"
          >
            <option value="all">All Prescriptions</option>
            <option value="pending">Pending</option>
            <option value="dispensed">Dispensed</option>
            <option value="completed">Completed</option>
            <option value="expired">Expired</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-muted">Loading prescriptions...</div>
        ) : prescriptions.length === 0 ? (
          <div className="p-8 text-center text-muted">No prescriptions found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-white/5 border-b border-border">
                <tr>
                  <th className="px-4 py-3 text-left font-bold text-muted">Patient</th>
                  <th className="px-4 py-3 text-left font-bold text-muted">Doctor</th>
                  <th className="px-4 py-3 text-left font-bold text-muted">Items</th>
                  <th className="px-4 py-3 text-left font-bold text-muted">Refills</th>
                  <th className="px-4 py-3 text-left font-bold text-muted">Issued</th>
                  <th className="px-4 py-3 text-left font-bold text-muted">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {prescriptions.map((prescription) => (
                  <tr key={prescription.id} className="hover:bg-white/5 transition-colors">
                    <td className="px-4 py-3 text-surface font-medium">{prescription.clientName}</td>
                    <td className="px-4 py-3 text-muted">{prescription.prescribingDoctor}</td>
                    <td className="px-4 py-3 text-muted text-xs">{prescription.items.length} item(s)</td>
                    <td className="px-4 py-3 text-surface font-bold">
                      {prescription.refillsRemaining}/{prescription.refillsAllowed}
                    </td>
                    <td className="px-4 py-3 text-muted">{formatDate(prescription.issuedAt)}</td>
                    <td className="px-4 py-3">
                      <span className={cn("text-xs font-bold uppercase px-2 py-1 rounded-lg", getStatusColor(prescription.status))}>
                        {prescription.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card bg-white/5 border border-border/50">
        <p className="text-xs font-bold text-muted uppercase tracking-tighter mb-3">Info</p>
        <p className="text-sm text-surface">
          Prescription management is fully integrated with the POS system. When a customer purchases a prescription-required product, the system will validate the prescription and deduct refills automatically.
        </p>
      </div>
    </div>
  );
}
