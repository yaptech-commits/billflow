"use client";

/** BillFlow Cold Store design note: keep telemetry setup honest—show configured inventory signals and clearly distinguish unavailable sensor data. */
import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, Thermometer, Warehouse } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { getBusinessProfile, getProducts } from "@/lib/db";
import { getProductBatchesForBusiness as getPharmacyBatches, getStockAdjustmentsForBusiness as getPharmacyAdjustments } from "@/lib/pharmacy-db";

export default function TemperatureMonitoringPage() {
  const { businessId, role } = useAuth();
  const [businessName, setBusinessName] = useState("Cold Store");
  const [metrics, setMetrics] = useState({ products: 0, batches: 0, freshness: 0, wastage: 0 });

  useEffect(() => {
    if (!businessId) return;
    Promise.all([
      getBusinessProfile(businessId),
      getProducts(businessId),
      getPharmacyBatches(businessId),
      getPharmacyAdjustments(businessId),
    ]).then(([profile, products, batches, adjustments]) => {
      setBusinessName(profile?.businessName || "Cold Store");
      const now = new Date();
      const limit = new Date();
      limit.setDate(now.getDate() + 30);
      const freshness = batches.filter(batch => {
        const expiry = batch.expiryDate && typeof (batch.expiryDate as any).toDate === "function" ? (batch.expiryDate as any).toDate() : new Date(batch.expiryDate as any);
        return expiry >= now && expiry <= limit;
      }).length;
      const wastage = adjustments.filter(item => ["wastage", "damage", "expired"].includes(item.reason)).reduce((sum, item) => sum + Math.abs(item.quantityAdjusted), 0);
      setMetrics({ products: products.length, batches: batches.length, freshness, wastage });
    }).catch(() => undefined);
  }, [businessId]);

  if (role !== "super_admin" && !businessId) return null;

  return <div className="space-y-6 max-w-5xl"><div className="flex items-center gap-3"><Link href="/dashboard" className="text-muted hover:text-gold"><ArrowLeft size={18} /></Link><div><p className="text-xs uppercase tracking-wider text-gold font-bold">Cold Store</p><h1 className="text-2xl font-grotesk font-bold text-white">Temperature Monitoring</h1><p className="text-sm text-muted mt-1">{businessName} · freshness, wastage, and sensor readiness.</p></div></div><div className="grid grid-cols-2 md:grid-cols-4 gap-4"><div className="card"><p className="text-xs text-muted uppercase">Tracked SKUs</p><p className="text-2xl font-grotesk font-bold text-white mt-2">{metrics.products}</p></div><div className="card"><p className="text-xs text-muted uppercase">Batches</p><p className="text-2xl font-grotesk font-bold text-white mt-2">{metrics.batches}</p></div><div className="card"><p className="text-xs text-muted uppercase">Freshness alerts</p><p className="text-2xl font-grotesk font-bold text-gold mt-2">{metrics.freshness}</p></div><div className="card"><p className="text-xs text-muted uppercase">Wastage units</p><p className="text-2xl font-grotesk font-bold text-red mt-2">{metrics.wastage}</p></div></div><div className="card border-gold/30"><div className="flex items-start gap-3"><div className="w-10 h-10 rounded-lg bg-gold/10 text-gold flex items-center justify-center"><Thermometer size={20} /></div><div><h2 className="font-grotesk font-semibold text-white">Sensor integration boundary</h2><p className="text-sm text-muted mt-2 leading-6">Live storage-unit temperatures and excursion alerts require telemetry records or a connected sensor provider. The page is ready as the operational destination, while current metrics are derived from BillFlow’s existing product, batch, and stock-adjustment records.</p></div></div><div className="mt-5 flex gap-3"><Link href="/stock-adjustments" className="btn-primary"><Warehouse size={15} /> Review stock adjustments</Link><Link href="/expiry-alerts" className="btn-ghost"><AlertTriangle size={15} /> Review expiry alerts</Link></div></div></div>;
}
