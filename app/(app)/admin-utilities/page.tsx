"use client";
import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { ShieldAlert, RefreshCw, CheckCircle, AlertCircle } from "lucide-react";
import toast from "react-hot-toast";

export default function AdminUtilitiesPage() {
  const { role } = useAuth();
  const [loading, setLoading] = useState(false);
  const [migrationResult, setMigrationResult] = useState<{ updated: number; skipped: number } | null>(null);

  if (role !== "super_admin") {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <ShieldAlert size={48} className="text-red mb-4" />
        <h1 className="text-xl font-bold text-white">Access Denied</h1>
        <p className="text-muted text-sm mt-2">Only super admins can access this page.</p>
      </div>
    );
  }

  const handleMigration = async () => {
    setLoading(true);
    const t = toast.loading("Running migration...");
    try {
      const response = await fetch("/api/admin/migrate-business-pages", {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Migration failed");
      }

      const result = await response.json();
      setMigrationResult(result);
      toast.success(`Migration complete: ${result.updated} updated, ${result.skipped} skipped`, { id: t });
    } catch (err) {
      toast.error("Migration failed", { id: t });
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Admin Utilities</h1>
        <p className="text-muted text-sm mt-1">System administration and migration tools</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Business Type Pages Migration */}
        <div className="card space-y-4">
          <div className="flex items-start gap-3">
            <RefreshCw size={24} className="text-gold mt-1" />
            <div>
              <h2 className="font-bold text-lg text-white">Business Type Pages Migration</h2>
              <p className="text-muted text-sm mt-1">
                Automatically assign pages to existing businesses based on their business type
              </p>
            </div>
          </div>

          <div className="bg-white/5 p-3 rounded-lg">
            <p className="text-xs text-muted mb-2">What this does:</p>
            <ul className="text-sm text-surface space-y-1">
              <li>✓ Scans all businesses without assigned pages</li>
              <li>✓ Assigns pages based on business type (pharmacy, hotel, etc.)</li>
              <li>✓ Skips businesses that already have pages assigned</li>
              <li>✓ Non-destructive operation (only adds missing pages)</li>
            </ul>
          </div>

          {migrationResult && (
            <div className="bg-green/10 border border-green/30 p-3 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle size={18} className="text-green" />
                <p className="font-medium text-green">Migration Complete</p>
              </div>
              <p className="text-sm text-green/80">
                Updated: {migrationResult.updated} | Skipped: {migrationResult.skipped}
              </p>
            </div>
          )}

          <button
            onClick={handleMigration}
            disabled={loading}
            className="btn-primary w-full flex items-center justify-center gap-2"
          >
            <RefreshCw size={18} />
            {loading ? "Running..." : "Run Migration"}
          </button>
        </div>

        {/* Business Type Reference */}
        <div className="card space-y-4">
          <div className="flex items-start gap-3">
            <AlertCircle size={24} className="text-blue mt-1" />
            <div>
              <h2 className="font-bold text-lg text-white">Business Type Reference</h2>
              <p className="text-muted text-sm mt-1">
                Pages and features assigned to each business type
              </p>
            </div>
          </div>

          <div className="space-y-3 max-h-96 overflow-y-auto">
            <BusinessTypeReference />
          </div>
        </div>
      </div>
    </div>
  );
}

function BusinessTypeReference() {
  const businessTypes = [
    {
      name: "General Business",
      pages: 12,
      features: ["POS", "Invoicing", "Inventory", "Clients", "Payments", "Suppliers"],
    },
    {
      name: "Pharmacy",
      pages: 19,
      features: [
        "Batch Tracking",
        "Expiry Alerts",
        "Prescriptions",
        "Insurance Claims",
        "Stock Adjustments",
        "Controlled Substances",
      ],
    },
    {
      name: "Hotel",
      pages: 8,
      features: ["Room Management", "POS", "Invoicing", "Clients", "Payments"],
    },
    {
      name: "Coldstore",
      pages: 13,
      features: [
        "Batch Tracking",
        "Expiry Alerts",
        "Temperature Monitoring",
        "Stock Adjustments",
        "Barcode Scanning",
      ],
    },
    {
      name: "School",
      pages: 10,
      features: ["Student Management", "Parents & Directory", "Announcements", "Fee Collection", "Attendance", "Report Cards"],
    },
  ];

  return (
    <>
      {businessTypes.map((type, idx) => (
        <div key={idx} className="bg-white/5 p-3 rounded-lg border border-border">
          <p className="font-medium text-surface mb-2">{type.name}</p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <p className="text-muted">Pages</p>
              <p className="text-gold font-bold">{type.pages}</p>
            </div>
            <div>
              <p className="text-muted">Key Features</p>
              <p className="text-surface text-ellipsis overflow-hidden">{type.features.slice(0, 2).join(", ")}...</p>
            </div>
          </div>
        </div>
      ))}
    </>
  );
}
