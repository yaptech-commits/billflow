"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { getBatchesExpiringWithin, ProductBatch } from "@/lib/db";
import { Timestamp } from "firebase/firestore";
import { AlertCircle, Calendar, Package, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface ExpiryBatch extends ProductBatch {
  productName: string;
  daysUntilExpiry: number;
  urgency: "critical" | "warning" | "info";
}

export default function ExpiryAlertsPage() {
  const { businessId, role } = useAuth();
  const [batches, setBatches] = useState<ExpiryBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterWindow, setFilterWindow] = useState(30);
  const [sortBy, setSortBy] = useState<"expiry" | "urgency">("expiry");

  useEffect(() => {
    if (!businessId) return;

    const fetchBatches = async () => {
      try {
        setLoading(true);
        const expiringBatches = await getBatchesExpiringWithin(businessId, filterWindow);
        
        const enriched: ExpiryBatch[] = expiringBatches.map(batch => {
          const now = new Date();
          const expiryDate = batch.expiryDate.toDate();
          const daysUntilExpiry = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          
          let urgency: "critical" | "warning" | "info" = "info";
          if (daysUntilExpiry <= 7) urgency = "critical";
          else if (daysUntilExpiry <= 14) urgency = "warning";

          return {
            ...batch,
            daysUntilExpiry,
            urgency,
          };
        });

        if (sortBy === "urgency") {
          const urgencyOrder = { critical: 0, warning: 1, info: 2 };
          enriched.sort((a, b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency]);
        } else {
          enriched.sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);
        }

        setBatches(enriched);
      } catch (error: any) {
        console.error("Failed to load expiry alerts:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchBatches();
  }, [businessId, filterWindow, sortBy]);

  const stats = {
    critical: batches.filter(b => b.urgency === "critical").length,
    warning: batches.filter(b => b.urgency === "warning").length,
    total: batches.length,
    totalQuantity: batches.reduce((sum, b) => sum + b.quantity, 0),
  };

  const formatDate = (ts: Timestamp) => {
    return ts.toDate().toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  if (!role || (role !== "owner" && role !== "super_admin")) {
    return (
      <div className="p-8 text-center">
        <p className="text-muted">You don't have permission to view expiry alerts.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-surface">Expiry Alerts</h1>
          <p className="text-sm text-muted mt-1">Monitor batches nearing expiration</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted uppercase font-bold tracking-tighter">Critical</p>
              <p className="text-2xl font-bold text-red mt-1">{stats.critical}</p>
            </div>
            <AlertCircle className="text-red" size={32} />
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted uppercase font-bold tracking-tighter">Warning</p>
              <p className="text-2xl font-bold text-gold mt-1">{stats.warning}</p>
            </div>
            <Calendar className="text-gold" size={32} />
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted uppercase font-bold tracking-tighter">Total Batches</p>
              <p className="text-2xl font-bold text-blue mt-1">{stats.total}</p>
            </div>
            <Package className="text-blue" size={32} />
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted uppercase font-bold tracking-tighter">Total Qty</p>
              <p className="text-2xl font-bold text-green mt-1">{stats.totalQuantity}</p>
            </div>
            <TrendingDown className="text-green" size={32} />
          </div>
        </div>
      </div>

      <div className="card flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <div>
            <label className="text-xs font-bold text-muted uppercase tracking-tighter block mb-1">
              Filter Window
            </label>
            <select
              value={filterWindow}
              onChange={(e) => setFilterWindow(parseInt(e.target.value))}
              className="input text-sm"
            >
              <option value={7}>Next 7 days</option>
              <option value={14}>Next 14 days</option>
              <option value={30}>Next 30 days</option>
              <option value={60}>Next 60 days</option>
              <option value={90}>Next 90 days</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-bold text-muted uppercase tracking-tighter block mb-1">
              Sort By
            </label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as "expiry" | "urgency")}
              className="input text-sm"
            >
              <option value="expiry">Expiry Date</option>
              <option value="urgency">Urgency</option>
            </select>
          </div>
        </div>
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-muted">Loading expiry alerts...</div>
        ) : batches.length === 0 ? (
          <div className="p-8 text-center text-muted">No batches expiring within {filterWindow} days</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-white/5 border-b border-border">
                <tr>
                  <th className="px-4 py-3 text-left font-bold text-muted">Product</th>
                  <th className="px-4 py-3 text-left font-bold text-muted">Batch Number</th>
                  <th className="px-4 py-3 text-left font-bold text-muted">Quantity</th>
                  <th className="px-4 py-3 text-left font-bold text-muted">Expiry Date</th>
                  <th className="px-4 py-3 text-left font-bold text-muted">Days Left</th>
                  <th className="px-4 py-3 text-left font-bold text-muted">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {batches.map((batch) => (
                  <tr key={batch.id} className="hover:bg-white/5 transition-colors">
                    <td className="px-4 py-3 text-surface font-medium">{batch.productName}</td>
                    <td className="px-4 py-3 text-muted text-xs font-mono">{batch.batchNumber}</td>
                    <td className="px-4 py-3 text-surface font-bold">{batch.quantity}</td>
                    <td className="px-4 py-3 text-muted">{formatDate(batch.expiryDate)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "text-sm font-bold",
                          batch.daysUntilExpiry <= 0 ? "text-red" : "text-surface"
                        )}
                      >
                        {batch.daysUntilExpiry <= 0 ? "EXPIRED" : `${batch.daysUntilExpiry}d`}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "text-xs font-bold uppercase px-2 py-1 rounded-lg",
                          batch.urgency === "critical"
                            ? "bg-red/10 text-red"
                            : batch.urgency === "warning"
                            ? "bg-gold/10 text-gold"
                            : "bg-blue/10 text-blue"
                        )}
                      >
                        {batch.urgency}
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
        <p className="text-xs font-bold text-muted uppercase tracking-tighter mb-3">Legend</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-red"></div>
            <span className="text-sm text-surface">Critical (≤ 7 days)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-gold"></div>
            <span className="text-sm text-surface">Warning (≤ 14 days)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-blue"></div>
            <span className="text-sm text-surface">Info (&gt; 14 days)</span>
          </div>
        </div>
      </div>
    </div>
  );
}
