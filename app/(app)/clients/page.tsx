"use client";
import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { getClients, createClient, updateClient, deleteClient } from "@/lib/db";
import { Client } from "@/lib/db";
import { 
  Users, Plus, Search, Edit, Trash2, 
  Phone, Mail, MapPin, User
} from "lucide-react";
import Modal from "@/components/ui/Modal";
import toast from "react-hot-toast";

export default function ClientsPage() {
  const { businessId, user } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    address: ""
  });

  useEffect(() => {
    if (businessId) {
      fetchClients();
    }
  }, [businessId]);

  const fetchClients = async () => {
    setLoading(true);
    try {
      const data = await getClients(businessId!);
      setClients(data);
    } catch (err) {
      toast.error("Failed to load clients");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessId) return;

    try {
      if (editingClient) {
        await updateClient(editingClient.id!, formData);
        toast.success("Client updated");
      } else {
        await createClient({ ...formData, businessId, userId: user?.uid });
        toast.success("Client created");
      }
      setShowModal(false);
      fetchClients();
    } catch (err) {
      toast.error("Failed to save client");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this client?")) return;
    try {
      await deleteClient(id);
      toast.success("Client deleted");
      fetchClients();
    } catch (err) {
      toast.error("Failed to delete client");
    }
  };

  const filtered = clients.filter(c => 
    c.name.toLowerCase().includes(search.toLowerCase()) || 
    c.phone?.includes(search) ||
    c.email?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white font-grotesk">Clients</h1>
          <p className="text-muted text-sm mt-1">Manage your customer database and contact information.</p>
        </div>
        <button 
          onClick={() => {
            setEditingClient(null);
            setFormData({ name: "", email: "", phone: "", address: "" });
            setShowModal(true);
          }}
          className="btn-primary"
        >
          <Plus size={18} />
          Add Client
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" size={18} />
        <input 
          type="text"
          placeholder="Search clients by name, phone, or email..."
          className="input-field pl-12"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          <div className="col-span-full py-10 text-center text-muted animate-pulse">Loading clients...</div>
        ) : filtered.length === 0 ? (
          <div className="col-span-full py-10 text-center text-muted">No clients found.</div>
        ) : filtered.map((client) => (
          <div key={client.id} className="card group hover:border-gold/30 transition-all">
            <div className="flex justify-between items-start mb-4">
              <div className="w-12 h-12 rounded-xl bg-gold/10 flex items-center justify-center text-gold">
                <User size={24} />
              </div>
              <div className="flex items-center gap-1">
                <button 
                  onClick={() => {
                    setEditingClient(client);
                    setFormData({
                      name: client.name,
                      email: client.email || "",
                      phone: client.phone || "",
                      address: client.address || ""
                    });
                    setShowModal(true);
                  }}
                  className="p-2 text-muted hover:text-white hover:bg-white/5 rounded-lg transition-all"
                >
                  <Edit size={16} />
                </button>
                <button 
                  onClick={() => handleDelete(client.id!)}
                  className="p-2 text-muted hover:text-red hover:bg-red/5 rounded-lg transition-all"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
            
            <h3 className="text-lg font-bold text-white mb-4">{client.name}</h3>
            
            <div className="space-y-2">
              <div className="flex items-center gap-3 text-sm text-muted">
                <Phone size={14} className="text-gold" />
                <span>{client.phone || "No phone"}</span>
              </div>
              <div className="flex items-center gap-3 text-sm text-muted">
                <Mail size={14} className="text-gold" />
                <span className="truncate">{client.email || "No email"}</span>
              </div>
              <div className="flex items-center gap-3 text-sm text-muted">
                <MapPin size={14} className="text-gold" />
                <span className="truncate">{client.address || "No address"}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <Modal 
        open={showModal} 
        onClose={() => setShowModal(false)} 
        title={editingClient ? "Edit Client" : "Add New Client"}
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-muted uppercase mb-1.5">Full Name</label>
            <input 
              required
              className="input-field"
              value={formData.name}
              onChange={e => setFormData({...formData, name: e.target.value})}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-muted uppercase mb-1.5">Email Address</label>
              <input 
                type="email"
                className="input-field"
                value={formData.email}
                onChange={e => setFormData({...formData, email: e.target.value})}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-muted uppercase mb-1.5">Phone Number</label>
              <input 
                className="input-field"
                value={formData.phone}
                onChange={e => setFormData({...formData, phone: e.target.value})}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-muted uppercase mb-1.5">Address</label>
            <textarea 
              className="input-field min-h-[80px]"
              value={formData.address}
              onChange={e => setFormData({...formData, address: e.target.value})}
            />
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary">Save Client</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
