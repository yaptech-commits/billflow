"use client";
import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { 
  getDocs, collection, query, orderBy, doc, getDoc, updateDoc, deleteDoc, where, writeBatch
} from "firebase/firestore";
import { sendPasswordResetEmail } from "firebase/auth";
import { db, auth } from "@/lib/firebase";
import { BusinessProfile, Staff, Product, Invoice } from "@/lib/db";
import { formatMoney, cn } from "@/lib/utils";
import { 
  Users, Package, FileText, Search, ShieldAlert, 
  Trash2, Edit, ExternalLink, ArrowRight, X, Check, Shield, Ban, RotateCcw, UserMinus
} from "lucide-react";
import Modal from "@/components/ui/Modal";
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
  const [stats, setStats] = useState({ products: 0, invoices: 0, staff: 0, payments: 0, totalRevenue: 0 });
  const [loading, setLoading] = useState(true);
  const [showStaff, setShowStaff] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);
  const [editForm, setEditForm] = useState<Partial<BusinessProfile>>({});

  const ALL_PAGES = [
    { id: "/pos", label: "POS" },
    { id: "/dashboard", label: "Dashboard" },
    { id: "/invoices", label: "Invoices" },
    { id: "/clients", label: "Clients" },
    { id: "/products", label: "Products" },
    { id: "/vouchers", label: "Vouchers" },
    { id: "/payments", label: "Payments" },
    { id: "/suppliers", label: "Suppliers" },
    { id: "/purchase-orders", label: "Purchase Orders" },
    { id: "/reports", label: "Reports" },
    { id: "/settings", label: "Settings" },
  ];

  const fetchStats = async () => {
    try {
      const [p, i, s, pay] = await Promise.all([
        getDocs(query(collection(db, "products"), where("businessId", "==", business.businessId))),
        getDocs(query(collection(db, "invoices"), where("businessId", "==", business.businessId))),
        getDocs(query(collection(db, "staff"), where("businessId", "==", business.businessId))),
        getDocs(query(collection(db, "payments"), where("businessId", "==", business.businessId)))
      ]);
      
      const totalRevenue = pay.docs.reduce((acc, doc) => acc + (doc.data().amount || 0), 0);
      
      setStats({ 
        products: p.size, 
        invoices: i.size, 
        staff: s.size, 
        payments: pay.size,
        totalRevenue 
      });
      setStaffList(s.docs.map(d => ({ ...d.data(), id: d.id } as Staff)));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, [business.businessId]);

  const handleUpdatePermissions = async () => {
    if (!editingStaff) return;
    const t = toast.loading("Updating permissions...");
    try {
      await updateDoc(doc(db, "staff", editingStaff.id!), {
        permissions: editingStaff.permissions || []
      });
      // Also update staffIndex for real-time rules enforcement
      if (editingStaff.staffUid) {
        await updateDoc(doc(db, "staffIndex", editingStaff.staffUid), {
          permissions: editingStaff.permissions || []
        });
      }
      toast.success("Permissions updated", { id: t });
      setEditingStaff(null);
      fetchStats();
    } catch (e) {
      toast.error("Update failed", { id: t });
    }
  };

  const handleToggleStaffStatus = async (staff: Staff) => {
    const newStatus = staff.status === "active" ? "pending" : "active";
    const t = toast.loading(`${newStatus === "pending" ? "Suspending" : "Activating"} staff...`);
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, "staff", staff.id!), { status: newStatus });
      if (staff.staffUid) {
        batch.update(doc(db, "staffIndex", staff.staffUid), { status: newStatus });
      }
      await batch.commit();
      toast.success(`Staff ${newStatus === "pending" ? "suspended" : "activated"}`, { id: t });
      fetchStats();
    } catch (e) {
      toast.error("Action failed", { id: t });
    }
  };

  const handleDeleteStaff = async (staff: Staff) => {
    if (!confirm(`Are you sure you want to delete ${staff.email}? This will revoke all their access.`)) return;
    const t = toast.loading("Deleting staff...");
    try {
      const batch = writeBatch(db);
      batch.delete(doc(db, "staff", staff.id!));
      if (staff.staffUid) {
        batch.delete(doc(db, "staffIndex", staff.staffUid));
      }
      await batch.commit();
      toast.success("Staff deleted", { id: t });
      fetchStats();
    } catch (e) {
      toast.error("Deletion failed", { id: t });
    }
  };

  const handleResetPassword = async (email: string) => {
    if (!confirm(`Send password reset email to ${email}?`)) return;
    const t = toast.loading("Sending reset email...");
    try {
      await sendPasswordResetEmail(auth, email);
      toast.success("Reset email sent", { id: t });
    } catch (e: any) {
      toast.error(e.message || "Failed to send reset email", { id: t });
    }
  };

  const handleUpdateBusiness = async () => {
    const t = toast.loading("Updating business profile...");
    try {
      await updateDoc(doc(db, "businessProfiles", business.businessId), editForm);
      toast.success("Business profile updated", { id: t });
      setShowEdit(false);
      onUpdate();
    } catch (e) {
      toast.error("Update failed", { id: t });
    }
  };

  return (
    <>
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
          <button 
            onClick={() => setShowStaff(true)}
            className="text-muted hover:text-gold p-1 transition-colors" 
            title="Manage Staff"
          >
            <Users size={16} />
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
              onClick={() => {
                setEditForm({ ...business });
                setShowEdit(true);
              }}
              className="p-1.5 text-muted hover:text-gold transition-colors" 
              title="Edit Business"
            >
              <Edit size={14} />
            </button>
            <button 
              onClick={() => setShowDetails(true)}
              className="p-1.5 text-muted hover:text-gold transition-colors" 
              title="View Full Details"
            >
              <ExternalLink size={14} />
            </button>
            <button 
              className="p-1.5 text-muted hover:text-red transition-colors" 
              title="Delete Business Data"
              onClick={async () => {
                if (confirm(`Are you sure you want to delete all data for ${business.businessName}? This cannot be undone.`)) {
                  toast.loading("Deleting business data...");
                  // Full deletion logic implementation
                  toast.success("Feature coming soon");
                }
              }}
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Business Details Modal */}
      <Modal open={showDetails} onClose={() => setShowDetails(false)} title={`Business Details - ${business.businessName}`}>
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-white/5 rounded-lg border border-border">
              <p className="text-[10px] text-muted uppercase font-bold mb-1">Total Revenue</p>
              <p className="text-xl font-grotesk text-gold">{formatMoney(stats.totalRevenue, business.currency || "GHS")}</p>
            </div>
            <div className="p-4 bg-white/5 rounded-lg border border-border">
              <p className="text-[10px] text-muted uppercase font-bold mb-1">Total Payments</p>
              <p className="text-xl font-grotesk text-surface">{stats.payments}</p>
            </div>
          </div>

          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase text-muted">Business Information</h4>
            <div className="grid grid-cols-1 gap-3">
              <div className="flex justify-between py-2 border-b border-border/30">
                <span className="text-xs text-muted">Email</span>
                <span className="text-xs text-surface">{business.email || "N/A"}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-border/30">
                <span className="text-xs text-muted">Phone</span>
                <span className="text-xs text-surface">{business.phone || "N/A"}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-border/30">
                <span className="text-xs text-muted">Address</span>
                <span className="text-xs text-surface">{business.address || "N/A"}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-border/30">
                <span className="text-xs text-muted">Currency</span>
                <span className="text-xs text-surface">{business.currency || "GHS"}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-border/30">
                <span className="text-xs text-muted">Tax Settings</span>
                <span className="text-xs text-surface">{business.taxLabel || "Tax"}: {business.taxRate || 0}% ({business.taxInclusive ? "Inclusive" : "Exclusive"})</span>
              </div>
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <button className="btn-primary w-full justify-center" onClick={() => setShowDetails(false)}>Close</button>
          </div>
        </div>
      </Modal>

      {/* Edit Business Modal */}
      <Modal open={showEdit} onClose={() => setShowEdit(false)} title={`Edit Business - ${business.businessName}`}>
        <div className="space-y-4">
          <div>
            <label className="label">Business Name</label>
            <input 
              className="input" 
              value={editForm.businessName || ""} 
              onChange={e => setEditForm({ ...editForm, businessName: e.target.value })} 
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Email</label>
              <input 
                className="input" 
                value={editForm.email || ""} 
                onChange={e => setEditForm({ ...editForm, email: e.target.value })} 
              />
            </div>
            <div>
              <label className="label">Phone</label>
              <input 
                className="input" 
                value={editForm.phone || ""} 
                onChange={e => setEditForm({ ...editForm, phone: e.target.value })} 
              />
            </div>
          </div>
          <div>
            <label className="label">Address</label>
            <input 
              className="input" 
              value={editForm.address || ""} 
              onChange={e => setEditForm({ ...editForm, address: e.target.value })} 
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Tax Rate (%)</label>
              <input 
                className="input" 
                type="number"
                value={editForm.taxRate || 0} 
                onChange={e => setEditForm({ ...editForm, taxRate: parseFloat(e.target.value) || 0 })} 
              />
            </div>
            <div>
              <label className="label">Tax Label</label>
              <input 
                className="input" 
                value={editForm.taxLabel || "VAT"} 
                onChange={e => setEditForm({ ...editForm, taxLabel: e.target.value })} 
              />
            </div>
          </div>
          <div className="flex gap-3 pt-4">
            <button className="btn-ghost flex-1 justify-center" onClick={() => setShowEdit(false)}>Cancel</button>
            <button className="btn-primary flex-1 justify-center" onClick={handleUpdateBusiness}>Save Changes</button>
          </div>
        </div>
      </Modal>

      {/* Staff Management Modal */}
      <Modal open={showStaff} onClose={() => setShowStaff(false)} title={`${business.businessName} - Staff`}>
        <div className="space-y-4">
          {staffList.length === 0 ? (
            <p className="text-center text-muted py-10">No staff members found for this business.</p>
          ) : (
            <div className="space-y-3">
              {staffList.map(s => (
                <div key={s.id} className="flex items-center justify-between p-3 bg-white/5 rounded-lg border border-border">
                  <div>
                    <p className="text-sm font-medium text-surface">{s.email}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={cn(
                        "text-[10px] font-bold uppercase px-1.5 py-0.5 rounded",
                        s.role === "owner" ? "bg-gold/10 text-gold" : "bg-blue/10 text-blue"
                      )}>
                        {s.role}
                      </span>
                      <span className={cn(
                        "text-[10px] font-bold uppercase px-1.5 py-0.5 rounded",
                        s.status === "active" ? "bg-green/10 text-green" : "bg-muted/10 text-muted"
                      )}>
                        {s.status}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button 
                      onClick={() => handleResetPassword(s.email)}
                      className="p-2 text-muted hover:text-gold transition-colors"
                      title="Send Password Reset"
                    >
                      <RotateCcw size={14} />
                    </button>
                    <button 
                      onClick={() => handleToggleStaffStatus(s)}
                      className={cn(
                        "p-2 transition-colors",
                        s.status === "active" ? "text-muted hover:text-red" : "text-muted hover:text-green"
                      )}
                      title={s.status === "active" ? "Suspend Staff" : "Activate Staff"}
                    >
                      {s.status === "active" ? <Ban size={14} /> : <Check size={14} />}
                    </button>
                    <button 
                      onClick={() => setEditingStaff(s)}
                      className="p-2 text-muted hover:text-gold transition-colors"
                      title="Edit Permissions"
                    >
                      <Shield size={14} />
                    </button>
                    <button 
                      onClick={() => handleDeleteStaff(s)}
                      className="p-2 text-muted hover:text-red transition-colors"
                      title="Delete Staff"
                    >
                      <UserMinus size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>

      {/* Permissions Edit Modal */}
      <Modal open={!!editingStaff} onClose={() => setEditingStaff(null)} title="Edit Staff Permissions">
        {editingStaff && (
          <div className="space-y-6">
            <div>
              <p className="text-sm font-medium text-surface">{editingStaff.email}</p>
              <p className="text-xs text-muted mt-1">Select the pages this user can access</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {ALL_PAGES.map(page => {
                const checked = (editingStaff.permissions || []).includes(page.id);
                return (
                  <button
                    key={page.id}
                    onClick={() => {
                      const current = editingStaff.permissions || [];
                      const next = checked ? current.filter(p => p !== page.id) : [...current, page.id];
                      setEditingStaff({ ...editingStaff, permissions: next });
                    }}
                    className={cn(
                      "flex items-center justify-between p-3 rounded-lg border text-xs font-medium transition-all",
                      checked ? "bg-gold/10 border-gold text-gold" : "bg-white/5 border-border text-muted"
                    )}
                  >
                    {page.label}
                    {checked ? <Check size={14} /> : <div className="w-3.5 h-3.5 border border-muted rounded" />}
                  </button>
                );
              })}
            </div>

            <div className="flex gap-3 pt-4">
              <button className="btn-ghost flex-1 justify-center" onClick={() => setEditingStaff(null)}>Cancel</button>
              <button className="btn-primary flex-1 justify-center" onClick={handleUpdatePermissions}>Save Permissions</button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
