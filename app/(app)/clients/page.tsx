"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { getClients, createClient, deleteClient, Client } from "@/lib/db";
import { getInitials, getAvatarColor } from "@/lib/utils";
import Modal from "@/components/ui/Modal";
import toast from "react-hot-toast";
import { Plus, Trash2, Mail, Phone } from "lucide-react";

export default function ClientsPage() {
  const { user, businessId } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "", business: "" });

  const load = async () => {
    if (!businessId) return;
    const data = await getClients(businessId);
    setClients(data);
    setLoading(false);
  };

  useEffect(() => { load(); }, [businessId]);

  const handleAdd = async () => {
    if (!user || !businessId || !form.name) { toast.error("Name is required"); return; }
    setSaving(true);
    await createClient({ userId: user.uid, businessId, ...form });
    toast.success(`${form.name} added!`);
    setOpen(false);
    setForm({ name: "", email: "", phone: "", business: "" });
    setSaving(false);
    load();
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Remove ${name}?`)) return;
    await deleteClient(id);
    toast.success("Client removed");
    load();
  };

  return (
    <div>
      <div className="flex justify-end mb-6">
        <button className="btn-primary" onClick={() => setOpen(true)}><Plus size={15} /> Add Client</button>
      </div>

      {loading ? (
        <p className="text-muted text-sm text-center py-12">Loading clients...</p>
      ) : clients.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-muted mb-3">No clients yet</p>
          <button className="btn-primary inline-flex" onClick={() => setOpen(true)}><Plus size={15} /> Add first client</button>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {clients.map(c => (
            <div key={c.id} className="card hover:border-gold/40 transition-colors group">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div
                    className="w-11 h-11 rounded-xl flex items-center justify-center font-grotesk font-bold text-black text-sm flex-shrink-0"
                    style={{ background: getAvatarColor(c.name) }}
                  >
                    {getInitials(c.name)}
                  </div>
                  <div>
                    <p className="font-semibold text-white text-sm">{c.name}</p>
                    {c.business && <p className="text-xs text-muted">{c.business}</p>}
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(c.id!, c.name)}
                  className="text-muted hover:text-red transition-colors opacity-0 group-hover:opacity-100"
                >
                  <Trash2 size={15} />
                </button>
              </div>
              <div className="space-y-1.5">
                {c.email && (
                  <div className="flex items-center gap-2 text-xs text-muted">
                    <Mail size={12} />{c.email}
                  </div>
                )}
                {c.phone && (
                  <div className="flex items-center gap-2 text-xs text-muted">
                    <Phone size={12} />{c.phone}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Add Client">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Full Name *</label>
              <input className="input" placeholder="Kwame Asante" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <label className="label">Phone</label>
              <input className="input" placeholder="+233 XX XXX XXXX" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="label">Email</label>
            <input className="input" type="email" placeholder="client@example.com" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
          </div>
          <div>
            <label className="label">Business / Organization</label>
            <input className="input" placeholder="Optional" value={form.business} onChange={e => setForm(f => ({ ...f, business: e.target.value }))} />
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn-primary" onClick={handleAdd} disabled={saving}>{saving ? "Adding..." : "Add Client"}</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
