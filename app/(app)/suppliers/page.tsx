"use client";
import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { 
  getDocs, collection, query, where, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, orderBy
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { 
  Truck, Plus, Search, Edit, Trash2, 
  Phone, Mail, MapPin, Building2
} from "lucide-react";
import Modal from "@/components/ui/Modal";
import toast from "react-hot-toast";

interface Supplier {
  id?: string;
  name: string;
  contactPerson?: string;
  email?: string;
  phone?: string;
  address?: string;
  businessId: string;
}

export default function SuppliersPage() {
  const { businessId, role } = useAuth();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  
  const [formData, setFormData] = useState({
    name: "",
    contactPerson: "",
    email: "",
    phone: "",
    address: ""
  });

  useEffect(() => {
    if (businessId) {
      fetchSuppliers();
    }
  }, [businessId]);

  const fetchSuppliers = async () => {
    setLoading(true);
    try {
      const q = query(
        collection(db, "suppliers"), 
        where("businessId", "==", businessId),
        orderBy("name")
      );
      const snap = await getDocs(q);
      setSuppliers(snap.docs.map(d => ({ id: d.id, ...d.data() } as Supplier)));
    } catch (err) {
      console.error(err);
      toast.error("Failed to load suppliers");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessId) return;

    try {
      if (editingSupplier) {
        await updateDoc(doc(db, "suppliers", editingSupplier.id!), {
          ...formData,
          updatedAt: serverTimestamp()
        });
        toast.success("Supplier updated");
      } else {
        await addDoc(collection(db, "suppliers"), { 
          ...formData, 
          businessId,
          createdAt: serverTimestamp() 
        });
        toast.success("Supplier created");
      }
      setShowModal(false);
      fetchSuppliers();
    } catch (err) {
      toast.error("Failed to save supplier");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this supplier?")) return;
    try {
      await deleteDoc(doc(db, "suppliers", id));
      toast.success("Supplier deleted");
      fetchSuppliers();
    } catch (err) {
      toast.error("Failed to delete supplier");
    }
  };

  const filtered = suppliers.filter(s => 
    s.name.toLowerCase().includes(search.toLowerCase()) || 
    s.contactPerson?.toLowerCase().includes(search.toLowerCase()) ||
    s.phone?.includes(search)
  );

  if (role !== "owner") {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Truck size={48} className="text-muted mb-4" />
        <h1 className="text-xl font-bold text-white">Access Denied</h1>
        <p className="text-muted text-sm mt-2">Only business owners can manage suppliers.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white font-grotesk">Suppliers</h1>
          <p className="text-muted text-sm mt-1">Manage your vendors and supply chain contacts.</p>
        </div>
        <button 
          onClick={() => {
            setEditingSupplier(null);
            setFormData({ name: "", contactPerson: "", email: "", phone: "", address: "" });
            setShowModal(true);
          }}
          className="btn-primary"
        >
          <Plus size={18} />
          Add Supplier
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" size={18} />
        <input 
          type="text"
          placeholder="Search suppliers by name or contact person..."
          className="input-field pl-12"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          <div className="col-span-full py-10 text-center text-muted animate-pulse">Loading suppliers...</div>
        ) : filtered.length === 0 ? (
          <div className="col-span-full py-10 text-center text-muted">No suppliers found.</div>
        ) : filtered.map((supplier) => (
          <div key={supplier.id} className="card group hover:border-gold/30 transition-all">
            <div className="flex justify-between items-start mb-4">
              <div className="w-12 h-12 rounded-xl bg-gold/10 flex items-center justify-center text-gold">
                <Building2 size={24} />
              </div>
              <div className="flex items-center gap-1">
                <button 
                  onClick={() => {
                    setEditingSupplier(supplier);
                    setFormData({
                      name: supplier.name,
                      contactPerson: supplier.contactPerson || "",
                      email: supplier.email || "",
                      phone: supplier.phone || "",
                      address: supplier.address || ""
                    });
                    setShowModal(true);
                  }}
                  className="p-2 text-muted hover:text-white hover:bg-white/5 rounded-lg transition-all"
                >
                  <Edit size={16} />
                </button>
                <button 
                  onClick={() => handleDelete(supplier.id!)}
                  className="p-2 text-muted hover:text-red hover:bg-red/5 rounded-lg transition-all"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
            
            <h3 className="text-lg font-bold text-white mb-1">{supplier.name}</h3>
            <p className="text-xs text-gold font-medium mb-4 uppercase tracking-wider">{supplier.contactPerson || "No contact person"}</p>
            
            <div className="space-y-2">
              <div className="flex items-center gap-3 text-sm text-muted">
                <Phone size={14} className="text-muted" />
                <span>{supplier.phone || "No phone"}</span>
              </div>
              <div className="flex items-center gap-3 text-sm text-muted">
                <Mail size={14} className="text-muted" />
                <span className="truncate">{supplier.email || "No email"}</span>
              </div>
              <div className="flex items-center gap-3 text-sm text-muted">
                <MapPin size={14} className="text-muted" />
                <span className="truncate">{supplier.address || "No address"}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <Modal 
        open={showModal} 
        onClose={() => setShowModal(false)} 
        title={editingSupplier ? "Edit Supplier" : "Add New Supplier"}
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-muted uppercase mb-1.5">Company Name</label>
            <input 
              required
              className="input-field"
              value={formData.name}
              onChange={e => setFormData({...formData, name: e.target.value})}
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-muted uppercase mb-1.5">Contact Person</label>
            <input 
              className="input-field"
              value={formData.contactPerson}
              onChange={e => setFormData({...formData, contactPerson: e.target.value})}
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
            <button type="submit" className="btn-primary">Save Supplier</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
