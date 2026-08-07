"use client";
import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { 
  addDoc, deleteDoc, doc, serverTimestamp, collection
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { formatCedi } from "@/lib/utils";
import { getVouchers, Voucher } from "@/lib/db";
import { 
  Ticket, Plus, Search, Trash2, 
  Wifi, Clock, Calendar, CheckCircle2, XCircle
} from "lucide-react";
import Modal from "@/components/ui/Modal";
import Badge from "@/components/ui/Badge";
import toast from "react-hot-toast";

export default function VouchersPage() {
  const { businessId, user } = useAuth();
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  
  const [formData, setFormData] = useState({
    code: "",
    duration: "1 Hour",
    price: 0
  });

  useEffect(() => {
    if (businessId) {
      fetchVouchers();
    }
    window.addEventListener("billflow_refresh", fetchVouchers);
    return () => window.removeEventListener("billflow_refresh", fetchVouchers);
  }, [businessId]);

  const fetchVouchers = async () => {
    if (!businessId) return;
    setLoading(true);
    try {
      const data = await getVouchers(businessId);
      setVouchers(data);
    } catch (err) {
      console.error(err);
      toast.error("Failed to load vouchers");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessId) return;
    if (businessId === "SUPER_ADMIN") {
      toast.error("Please select a specific business to generate vouchers.");
      return;
    }

    try {
      await addDoc(collection(db, "vouchers"), { 
        code: formData.code,
        validity: formData.duration,
        price: formData.price,
        data: `WiFi Access - ${formData.duration}`,
        used: false,
        businessId,
        userId: user?.uid,
        createdAt: serverTimestamp() 
      });
      toast.success("Voucher created");
      setShowModal(false);
      fetchVouchers();
    } catch (err) {
      toast.error("Failed to save voucher");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this voucher?")) return;
    try {
      await deleteDoc(doc(db, "vouchers", id));
      toast.success("Voucher deleted");
      fetchVouchers();
    } catch (err) {
      toast.error("Failed to delete voucher");
    }
  };

  const filtered = vouchers.filter(v => 
    v.code.toLowerCase().includes(search.toLowerCase()) || 
    v.validity.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white font-grotesk">WiFi Vouchers</h1>
          <p className="text-muted text-sm mt-1">Generate and manage internet access codes.</p>
        </div>
        <button 
          onClick={() => {
            setFormData({ code: "", duration: "1 Hour", price: 0 });
            setShowModal(true);
          }}
          className="btn-primary"
        >
          <Plus size={18} />
          New Voucher
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" size={18} />
        <input 
          type="text"
          placeholder="Search vouchers by code or duration..."
          className="input-field pl-12"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {loading ? (
          <div className="col-span-full py-10 text-center text-muted animate-pulse">Loading vouchers...</div>
        ) : filtered.length === 0 ? (
          <div className="col-span-full py-10 text-center text-muted">No vouchers found.</div>
        ) : filtered.map((voucher) => (
          <div key={voucher.id} className="card group hover:border-gold/30 transition-all border-dashed border-2">
            <div className="flex justify-between items-start mb-4">
              <div className="w-10 h-10 rounded-lg bg-gold/10 flex items-center justify-center text-gold">
                <Wifi size={20} />
              </div>
              <button 
                onClick={() => handleDelete(voucher.id!)}
                className="p-2 text-muted hover:text-red hover:bg-red/5 rounded-lg transition-all"
              >
                <Trash2 size={16} />
              </button>
            </div>
            
            <div className="text-center py-2 bg-white/5 rounded-xl mb-4 border border-border">
              <p className="text-xs text-muted uppercase tracking-widest font-bold">Voucher Code</p>
              <h3 className="text-xl font-mono font-bold text-white mt-1">{voucher.code}</h3>
            </div>
            
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2 text-muted">
                <Clock size={14} />
                <span>{voucher.validity}</span>
              </div>
              <p className="font-bold text-gold">{formatCedi(voucher.price)}</p>
            </div>
            
            <div className="mt-4 pt-4 border-t border-border flex items-center justify-between">
              <Badge status={voucher.used ? "used" : "active"} />
              <p className="text-[10px] text-muted uppercase font-bold tracking-tighter">
                {voucher.createdAt?.toDate ? voucher.createdAt.toDate().toLocaleDateString() : "Recent"}
              </p>
            </div>
          </div>
        ))}
      </div>

      <Modal 
        open={showModal} 
        onClose={() => setShowModal(false)} 
        title="Generate New Voucher"
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-muted uppercase mb-1.5">Voucher Code</label>
            <input 
              required
              placeholder="e.g. WIFI-9922"
              className="input-field font-mono"
              value={formData.code}
              onChange={e => setFormData({...formData, code: e.target.value})}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-muted uppercase mb-1.5">Duration</label>
              <select 
                className="input-field"
                value={formData.duration}
                onChange={e => setFormData({...formData, duration: e.target.value})}
              >
                <option value="1 Hour">1 Hour</option>
                <option value="2 Hours">2 Hours</option>
                <option value="5 Hours">5 Hours</option>
                <option value="24 Hours">24 Hours</option>
                <option value="7 Days">7 Days</option>
                <option value="30 Days">30 Days</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-muted uppercase mb-1.5">Price (₵)</label>
              <input 
                type="number" step="0.01" required
                className="input-field"
                value={formData.price}
                onChange={e => setFormData({...formData, price: parseFloat(e.target.value)})}
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary">Generate Voucher</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
