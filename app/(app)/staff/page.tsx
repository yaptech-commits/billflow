"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { getStaff, inviteSalesperson, removeStaff, Staff } from "@/lib/db";
import toast from "react-hot-toast";
import { Plus, Trash2, Mail, ShieldCheck, Clock } from "lucide-react";
import Modal from "@/components/ui/Modal";

export default function StaffPage() {
  const { businessId, role, loading: authLoading } = useAuth();
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [email, setEmail] = useState("");

  const load = async () => {
    if (!businessId) return;
    const data = await getStaff(businessId);
    setStaff(data);
    setLoading(false);
  };

  useEffect(() => { load(); }, [businessId]);

  const handleInvite = async () => {
    if (!businessId || !email) { toast.error("Enter an email address"); return; }
    setSaving(true);
    try {
      await inviteSalesperson(businessId, email.trim().toLowerCase());
      toast.success(`Invited ${email}`);
      setOpen(false);
      setEmail("");
      load();
    } catch (err: any) {
      toast.error(err.message ?? "Could not send invite");
    } finally {
      setSaving(false);
    }
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
                <th className="text-left pb-3">Actions</th>
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
                  <td className="py-3">
                    <button
                      onClick={() => handleRemove(s.id!, s.email)}
                      className="text-muted hover:text-red transition-colors"
                      title="Remove access"
                    >
                      <Trash2 size={15} />
                    </button>
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
            <p className="text-xs text-muted mt-2">
              They'll get access once they sign up or log in with this email. They'll be able to see
              all clients and products, but only their own invoices and sales.
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
    </div>
  );
}
