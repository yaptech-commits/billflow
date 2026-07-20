"use client";
import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { 
  getDocs, collection, query, orderBy, doc, getDoc, updateDoc, deleteDoc, where
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { BusinessProfile, Staff, Product, Invoice } from "@/lib/db";
import { formatMoney } from "@/lib/utils";
import { 
  Users, Package, FileText, Search, ShieldAlert, 
  Trash2, Edit, ExternalLink, ArrowRight
} from "lucide-react";
import toast from "react-hot-toast";

export default function AdminPage() {
  const { role, user } = useAuth();
  const [businesses, setBusinesses] = useState<BusinessProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (role === "super_admin") {
      fetchBusinesses();
    }
  }, [role]);

  const fetchBusinesses = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, "businessProfiles"), orderBy("businessName")));
      setBusinesses(snap.docs.map(d => ({ ...d.data(), businessId: d.id } as BusinessProfile)));
    } catch (err) {
      toast.error("Failed to fetch businesses");
    } finally {
      setLoading(false);
    }
  };

  if (role !== "super_admin") {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <ShieldAlert size={48} className="text-red mb-4" />
        <h1 className="text-xl font-bold text-white">Access Denied</h1>
        <p className="text-muted text-sm mt-2">Only authorized super admins can access this page.</p>
      </div>
    );
  }

  const filtered = businesses.filter(b => 
    b.businessName.toLowerCase().includes(search.toLowerCase()) ||
    b.email?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">System Administration</h1>
          <p className="text-muted text-sm mt-1">Manage all business accounts and system-wide data</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input 
              className="input pl-10 w-64" 
              placeholder="Search businesses..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button onClick={fetchBusinesses} className="btn-ghost text-xs">Refresh</button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          <div className="col-span-full py-20 text-center text-muted animate-pulse">Loading businesses...</div>
        ) : filtered.length === 0 ? (
          <div className="col-span-full py-20 text-center text-muted">No businesses found</div>
        ) : (
          filtered.map(b => (
            <BusinessCard key={b.businessId} business={b} onUpdate={fetchBusinesses} />
          ))
        )}
      </div>
    </div>
  );
}

function BusinessCard({ business, onUpdate }: { business: BusinessProfile, onUpdate: () => void }) {
  const [stats, setStats] = useState({ products: 0, invoices: 0, staff: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [p, i, s] = await Promise.all([
          getDocs(query(collection(db, "products"), where("businessId", "==", business.businessId))),
          getDocs(query(collection(db, "invoices"), where("businessId", "==", business.businessId))),
          getDocs(query(collection(db, "staff"), where("businessId", "==", business.businessId)))
        ]);
        setStats({ products: p.size, invoices: i.size, staff: s.size });
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, [business.businessId]);

  return (
    <div className="card hover:border-gold transition-all group">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          {business.logoDataUrl ? (
            <img src={business.logoDataUrl} className="w-10 h-10 rounded object-contain bg-white/5" alt="" />
          ) : (
            <div className="w-10 h-10 rounded bg-gold/10 flex items-center justify-center text-gold font-bold">
              {business.businessName.slice(0, 2).toUpperCase()}
            </div>
          )}
          <div>
            <h3 className="font-bold text-surface group-hover:text-gold transition-colors">{business.businessName}</h3>
            <p className="text-[10px] text-muted truncate max-w-[150px]">{business.email || "No email"}</p>
          </div>
        </div>
        <button className="text-muted hover:text-gold p-1 transition-colors" title="Manage Business">
          <ArrowRight size={16} />
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2 py-3 border-y border-border/50 mb-4">
        <div className="text-center">
          <p className="text-[10px] text-muted uppercase font-bold tracking-tighter">Products</p>
          <p className="text-sm font-grotesk text-surface">{loading ? "..." : stats.products}</p>
        </div>
        <div className="text-center border-x border-border/50">
          <p className="text-[10px] text-muted uppercase font-bold tracking-tighter">Invoices</p>
          <p className="text-sm font-grotesk text-surface">{loading ? "..." : stats.invoices}</p>
        </div>
        <div className="text-center">
          <p className="text-[10px] text-muted uppercase font-bold tracking-tighter">Staff</p>
          <p className="text-sm font-grotesk text-surface">{loading ? "..." : stats.staff}</p>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted">ID: {business.businessId.slice(0, 8)}...</span>
        <div className="flex items-center gap-2">
          <button 
            className="p-1.5 text-muted hover:text-red transition-colors" 
            title="Delete Business Data"
            onClick={async () => {
              if (confirm(`Are you sure you want to delete all data for ${business.businessName}? This cannot be undone.`)) {
                toast.loading("Deleting business data...");
                // Note: Implementation of full deletion logic would go here
                toast.success("Feature coming soon");
              }
            }}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
