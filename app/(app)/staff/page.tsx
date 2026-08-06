"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { getStaff, inviteSalesperson, removeStaff, updateStaff, Staff } from "@/lib/db";
import toast from "react-hot-toast";
import { Plus, Trash2, Mail, ShieldCheck, Clock, Edit2 } from "lucide-react";
import Modal from "@/components/ui/Modal";

export default function StaffPage() {
  const { businessId, role, loading: authLoading } = useAuth();
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [email, setEmail] = useState("");
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>(["/pos", "/invoices", "/clients", "/products"]);
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);

  const AVAILABLE_PAGES = [
    { path: "/dashboard", label: "Dashboard" },
    { path: "/pos", label: "POS" },
    { path: "/invoices", label: "Invoices" },
    { path: "/clients", label: "Clients" },
    { path: "/products", label: "Products" },
    { path: "/inventory", label: "Inventory" },
    { path: "/suppliers", label: "Suppliers" },
    { path: "/purchase-orders", label: "Purchase Orders" },
    { path: "/reports", label: "Reports" },
  ];

  const togglePermission = (path: string) => {
    setSelectedPermissions(prev =>
      prev.includes(path) ? prev.filter(p => p !== path) : [...prev, path]
    );
  };

  const load = async () => {
    if (!businessId) return;
    setLoading(true);
    try {
      const data = await getStaff(businessId);
      setStaff(data);
    } catch (err: any) {
      console.error("Staff load error:", err);
      toast.error("Failed to load staff list");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [businessId]);

  const handleInvite = async () => {
    if (!businessId || !email) { toast.error("Enter an email address"); return; }
    setSaving(true);
    try {
      await inviteSalesperson(businessId, email.trim().toLowerCase(), selectedPermissions);
      toast.success(`Invited ${email}`);
      setOpen(false);
      setEmail("");
      setSelectedPermissions(["/pos", "/invoices", "/clients", "/products"]);
      load();
    } catch (err: any) {
      toast.error(err.message ?? "Could not send invite");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdatePermissions = async () => {
    if (!editingStaff?.id) return;
    setSaving(true);
    try {
      await updateStaff(editingStaff.id, { permissions: selectedPermissions });
      toast.success("Permissions updated");
      setEditingStaff(null);
      setSelectedPermissions(["/pos", "/invoices", "/clients", "/products"]);
      load();
    } catch (err: any) {
      toast.error(err.message ?? "Could not update permissions");
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (s: Staff) => {
    setEditingStaff(s);
    setSelectedPermissions(s.permissions || []);
  };

  const handleRemove = async (id: string, emailAddr: string) => {
    if (!confirm(`Remove ${emailAddr}'s access?`)) return;
    await removeStaff(id);
    toast.success("Access removed");
    load();
  };

  if (authLoading) return <p className="text-muted text-sm py-10 text-center">Loading...</p>;

  if (role !== "owner") {
    return (
      <div className="card text-center py-16">
        <p className="text-muted">Only the business owner can manage staff.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-end mb-6">
        <button className="btn-primary" onClick={() => setOpen(true)}>
          <Plus size={15} /> Invite Salesperson
        </button>
      </div>

      <div className="card">
        {loading ? (
          <p className="text-muted text-sm py-10 text-center">Loading staff...</p>
        ) : staff.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-muted mb-3">No salespeople added yet</p>
            <button className="btn-primary inline-flex" onClick={() => setOpen(true)}>
              <Plus size={15} /> Invite your first salesperson
            </button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] text-muted uppercase tracking-wide">
                <th className="text-left pb-3">Email</th>
                <th className="text-left pb-3">Role</th>
                <th className="text-left pb-3">Status</th>
                <th className="text-right pb-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {staff.map(s => (
                <tr key={s.id} className="border-t border-border hover:bg-white/[0.02]">
                  <td className="py-3 font-medium text-surface">
                    <div className="flex items-center gap-2">
                      <Mail size={13} className="text-muted" />
                      {s.email}
                    </div>
                  </td>
                  <td className="py-3 text-muted text-xs capitalize">{s.role}</td>
                  <td className="py-3">
                    {s.status === "active" ? (
                      <span className="inline-flex items-center gap-1 text-xs text-green">
                        <ShieldCheck size={13} /> Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-gold">
                        <Clock size={13} /> Pending
                      </span>
                    )}
                  </td>
                  <td className="py-3 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <button
                        onClick={() => openEdit(s)}
                        className="text-muted hover:text-gold transition-colors"
                        title="Edit Permissions"
                      >
                        <Edit2 size={15} />
                      </button>
                      <button
                        onClick={() => handleRemove(s.id!, s.email)}
                        className="text-muted hover:text-red transition-colors"
                        title="Remove access"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Invite Salesperson">
        <div className="space-y-4">
          <div>
            <label className="label">Email Address *</label>
            <input
              className="input"
              type="email"
              placeholder="salesperson@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Allowed Pages</label>
            <div className="grid grid-cols-2 gap-2 mt-2">
              {AVAILABLE_PAGES.map(page => (
                <button
                  key={page.path}
                  onClick={() => togglePermission(page.path)}
                  className={`flex items-center gap-2 p-2 rounded-lg border text-xs transition-all ${
                    selectedPermissions.includes(page.path)
                      ? "border-gold bg-gold/5 text-surface"
                      : "border-border text-muted hover:border-muted"
                  }`}
                >
                  <div className={`w-3 h-3 rounded-full border ${selectedPermissions.includes(page.path) ? "bg-gold border-gold" : "border-muted"}`} />
                  {page.label}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-muted mt-3">
              Staff will only be able to see and access the pages you select here.
            </p>
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn-primary" onClick={handleInvite} disabled={saving}>
              {saving ? "Inviting..." : "Send Invite"}
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={!!editingStaff} onClose={() => setEditingStaff(null)} title="Edit Staff Permissions">
        <div className="space-y-4">
          <div>
            <p className="text-xs text-muted mb-1">Editing access for:</p>
            <p className="text-sm font-medium text-surface">{editingStaff?.email}</p>
          </div>
          <div>
            <label className="label">Allowed Pages</label>
            <div className="grid grid-cols-2 gap-2 mt-2">
              {AVAILABLE_PAGES.map(page => (
                <button
                  key={page.path}
                  onClick={() => togglePermission(page.path)}
                  className={`flex items-center gap-2 p-2 rounded-lg border text-xs transition-all ${
                    selectedPermissions.includes(page.path)
                      ? "border-gold bg-gold/5 text-surface"
                      : "border-border text-muted hover:border-muted"
                  }`}
                >
                  <div className={`w-3 h-3 rounded-full border ${selectedPermissions.includes(page.path) ? "bg-gold border-gold" : "border-muted"}`} />
                  {page.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button className="btn-ghost" onClick={() => setEditingStaff(null)}>Cancel</button>
            <button className="btn-primary" onClick={handleUpdatePermissions} disabled={saving}>
              {saving ? "Saving..." : "Update Permissions"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
