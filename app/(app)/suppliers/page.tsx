"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  getSuppliers, createSupplier, updateSupplier, deleteSupplier, Supplier,
} from "@/lib/db";
import Modal from "@/components/ui/Modal";
import toast from "react-hot-toast";
import { Plus, Trash2, Pencil, Truck } from "lucide-react";

export default function SuppliersPage() {
  const { user, businessId } = useAuth();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", contactPerson: "", phone: "", email: "", notes: "" });

  const load = async () => {
    if (!businessId) return;
    const data = await getSuppliers(businessId);
    setSuppliers(data);
    setLoading(false);
  };

  useEffect(() => { load(); }, [businessId]);

  const resetForm = () => setForm({ name: "", contactPerson: "", phone: "", email: "", notes: "" });

  const openAdd = () => {
    setEditing(null);
    resetForm();
    setOpen(true);
  };

  const openEdit = (s: Supplier) => {
    setEditing(s);
    setForm({
      name: s.name,
      contactPerson: s.contactPerson ?? "",
      phone: s.phone ?? "",
      email: s.email ?? "",
      notes: s.notes ?? "",
    });
    setOpen(true);
  };

  const handleSave = async () => {
    if (!user || !businessId || !form.name) {
      toast.error("Supplier name is required");
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await updateSupplier(editing.id!, { ...form });
        toast.success(`${form.name} updated`);
      } else {
        await createSupplier({ userId: user.uid, businessId, ...form });
        toast.success(`${form.name} added!`);
      }
      setOpen(false);
      resetForm();
      load();
    } catch (err: any) {
      toast.error(err.message ?? "Something went wrong");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Remove ${name} from suppliers?`)) return;
    await deleteSupplier(id);
    toast.success("Supplier removed");
    load();
  };

  return (
    <div>
      <div className="flex justify-end mb-6">
        <button className="btn-primary" onClick={openAdd}><Plus size={15} /> Add Supplier</button>
      </div>

      <div className="card">
        {loading ? (
          <p className="text-muted text-sm py-10 text-center">Loading suppliers...</p>
        ) : suppliers.length === 0 ? (
          <div className="text-center py-16">
            <Truck size={28} className="text-muted mx-auto mb-3" />
            <p className="text-muted mb-3">No suppliers yet</p>
            <button className="btn-primary inline-flex" onClick={openAdd}><Plus size={15} /> Add first supplier</button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] text-muted uppercase tracking-wide">
                <th className="text-left pb-3">Supplier</th>
                <th className="text-left pb-3">Contact</th>
                <th className="text-left pb-3">Phone</th>
                <th className="text-left pb-3">Email</th>
                <th className="text-left pb-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {suppliers.map(s => (
                <tr key={s.id} className="border-t border-border hover:bg-white/[0.02]">
                  <td className="py-3 font-medium text-surface">{s.name}</td>
                  <td className="py-3 text-muted text-xs">{s.contactPerson || "—"}</td>
                  <td className="py-3 text-muted text-xs">{s.phone || "—"}</td>
                  <td className="py-3 text-muted text-xs">{s.email || "—"}</td>
                  <td className="py-3">
                    <div className="flex items-center gap-2">
                      <button onClick={() => openEdit(s)} className="text-muted hover:text-gold transition-colors" title="Edit">
                        <Pencil size={15} />
                      </button>
                      <button onClick={() => handleDelete(s.id!, s.name)} className="text-muted hover:text-red transition-colors" title="Delete">
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

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? "Edit Supplier" : "Add Supplier"}>
        <div className="space-y-4">
          <div>
            <label className="label">Supplier Name *</label>
            <input className="input" placeholder="e.g. Accra Networking Supplies" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Contact Person</label>
              <input className="input" placeholder="Optional" value={form.contactPerson} onChange={e => setForm(f => ({ ...f, contactPerson: e.target.value }))} />
            </div>
            <div>
              <label className="label">Phone</label>
              <input className="input" placeholder="Optional" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="label">Email</label>
            <input className="input" placeholder="Optional" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
          </div>
          <div>
            <label className="label">Notes</label>
            <input className="input" placeholder="Optional" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : editing ? "Save Changes" : "Add Supplier"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
