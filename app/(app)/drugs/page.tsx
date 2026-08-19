"use client";
import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { 
  getProducts, createProduct, updateProduct, deleteProduct, getCategories, getBusinessProfile
} from "@/lib/db";
import { Product, Category, BusinessProfile } from "@/lib/db";
import { formatCedi, cn } from "@/lib/utils";
import { 
  Pill, Plus, Search, Edit, Trash2, Filter, 
  AlertCircle, Tag, ChevronLeft
} from "lucide-react";
import Modal from "@/components/ui/Modal";
import Badge from "@/components/ui/Badge";
import toast from "react-hot-toast";
import Link from "next/link";

export default function DrugsPage() {
  const { businessId, user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [businessProfile, setBusinessProfile] = useState<BusinessProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  
  const [showDrugModal, setShowDrugModal] = useState(false);
  const [editingDrug, setEditingDrug] = useState<Product | null>(null);
  
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    price: 0,
    wholesalePrice: 0,
    stockQty: 0,
    reorderLevel: 5,
    category: "",
    unit: "tablets",
    trackBatches: true,
    isPrescriptionRequired: false,
  });

  useEffect(() => {
    if (businessId) {
      fetchData();
    }
    window.addEventListener("billflow_refresh", fetchData);
    return () => window.removeEventListener("billflow_refresh", fetchData);
  }, [businessId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [p, c, profile] = await Promise.all([
        getProducts(businessId!),
        getCategories(businessId!),
        getBusinessProfile(businessId!)
      ]);
      setProducts(p);
      setCategories(c);
      setBusinessProfile(profile);
    } catch (err) {
      toast.error("Failed to load drugs");
    } finally {
      setLoading(false);
    }
  };

  // Check if business is pharmacy type
  const isPharmacy = (businessProfile as any)?.businessType === "pharmacy";

  const handleSaveDrug = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessId) return;
    const userId = user?.uid;
    if (!userId) {
      toast.error("Your session is still loading. Please try again.");
      return;
    }

    try {
      if (editingDrug) {
        await updateProduct(editingDrug.id!, formData);
        toast.success("Drug updated");
      } else {
        await createProduct({ 
          ...formData, 
          businessId, 
          userId,
          trackBatches: true,
        });
        toast.success("Drug created");
      }
      setShowDrugModal(false);
      fetchData();
    } catch (err) {
      toast.error("Failed to save drug");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this drug?")) return;
    try {
      await deleteProduct(id);
      toast.success("Drug deleted");
      fetchData();
    } catch (err) {
      toast.error("Failed to delete drug");
    }
  };

  const filtered = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase()) || 
                         p.description?.toLowerCase().includes(search.toLowerCase());
    const matchesCat = selectedCategory === "all" || p.category === selectedCategory;
    return matchesSearch && matchesCat;
  });

  if (!isPharmacy) {
    return (
      <div className="space-y-6">
        <div className="card border-yellow/20 bg-yellow/5">
          <div className="flex items-start gap-4">
            <AlertCircle className="text-yellow flex-shrink-0 mt-1" size={20} />
            <div>
              <h3 className="font-grotesk font-semibold text-white mb-1">Pharmacy Features Not Enabled</h3>
              <p className="text-sm text-muted mb-4">The Drugs page is only available for pharmacy-type businesses. To enable pharmacy features, go to Settings and change your Business Type to "Pharmacy".</p>
              <Link href="/settings" className="btn-primary text-sm">
                Go to Settings
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white font-grotesk">Pharmacy Drugs</h1>
          <p className="text-muted text-sm mt-1">Manage pharmaceutical products, stock levels, and batch tracking.</p>
        </div>
        <button 
          onClick={() => {
            setEditingDrug(null);
            setFormData({
              name: "",
              description: "",
              price: 0,
              wholesalePrice: 0,
              stockQty: 0,
              reorderLevel: 5,
              category: "",
              unit: "tablets",
              trackBatches: true,
              isPrescriptionRequired: false,
            });
            setShowDrugModal(true);
          }}
          className="btn-primary"
        >
          <Plus size={18} />
          Add Drug
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="md:col-span-3 relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" size={18} />
          <input 
            type="text"
            placeholder="Search drugs by name or description..."
            className="input-field pl-12"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="relative">
          <Filter className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" size={18} />
          <select 
            className="input-field pl-12 appearance-none"
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
          >
            <option value="all">All Categories</option>
            {categories.map(c => (
              <option key={c.id} value={c.name}>{c.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border bg-white/5">
                <th className="px-6 py-4 text-xs font-bold text-muted uppercase tracking-wider">Drug Name</th>
                <th className="px-6 py-4 text-xs font-bold text-muted uppercase tracking-wider">Category</th>
                <th className="px-6 py-4 text-xs font-bold text-muted uppercase tracking-wider">Stock</th>
                <th className="px-6 py-4 text-xs font-bold text-muted uppercase tracking-wider">Price</th>
                <th className="px-6 py-4 text-xs font-bold text-muted uppercase tracking-wider">Prescription</th>
                <th className="px-6 py-4 text-xs font-bold text-muted uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 text-xs font-bold text-muted uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-10 text-center text-muted animate-pulse">Loading drugs...</td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-10 text-center text-muted">No drugs found.</td>
                </tr>
              ) : filtered.map((drug) => (
                <tr key={drug.id} className="hover:bg-white/5 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-gold/10 flex items-center justify-center text-gold">
                        <Pill size={20} />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-white">{drug.name}</p>
                        <p className="text-xs text-muted truncate max-w-[200px]">{drug.description || "No description"}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center gap-1 text-xs text-muted">
                      <Tag size={12} />
                      {drug.category || "Uncategorized"}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div>
                      <p className={cn(
                        "text-sm font-bold",
                        drug.stockQty <= (drug.reorderLevel || 5) ? "text-red" : "text-white"
                      )}>
                        {drug.stockQty} {drug.unit}
                      </p>
                      {drug.stockQty <= (drug.reorderLevel || 5) && (
                        <p className="text-[10px] text-red uppercase font-bold tracking-tighter">Low Stock</p>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-sm font-bold text-gold">{formatCedi(drug.price)}</p>
                    <p className="text-[10px] text-muted">Cost: {formatCedi(drug.costPrice || 0)}</p>
                  </td>
                  <td className="px-6 py-4">
                    <Badge status={drug.isPrescriptionRequired ? "Rx Required" : "OTC"} />
                  </td>
                  <td className="px-6 py-4">
                    <Badge status={drug.stockQty > 0 ? "In Stock" : "Out of Stock"} />
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button 
                        onClick={() => {
                          setEditingDrug(drug);
                          setFormData({
                            name: drug.name,
                            description: drug.description || "",
                            price: drug.price,
                            wholesalePrice: drug.wholesalePrice || 0,
                            stockQty: drug.stockQty,
                            reorderLevel: drug.reorderLevel || 5,
                            category: drug.category || "",
                            unit: drug.unit || "tablets",
                            trackBatches: drug.trackBatches || true,
                            isPrescriptionRequired: drug.isPrescriptionRequired || false,
                          });
                          setShowDrugModal(true);
                        }}
                        className="p-2 text-muted hover:text-white hover:bg-white/5 rounded-lg transition-all"
                      >
                        <Edit size={16} />
                      </button>
                      <button 
                        onClick={() => handleDelete(drug.id!)}
                        className="p-2 text-muted hover:text-red hover:bg-red/5 rounded-lg transition-all"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Drug Modal */}
      <Modal 
        open={showDrugModal} 
        onClose={() => setShowDrugModal(false)} 
        title={editingDrug ? "Edit Drug" : "Add New Drug"}
      >
        <form onSubmit={handleSaveDrug} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-muted uppercase mb-1.5">Drug Name</label>
              <input 
                required
                className="input-field"
                value={formData.name}
                onChange={e => setFormData({...formData, name: e.target.value})}
                placeholder="e.g., Paracetamol 500mg"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-muted uppercase mb-1.5">Description</label>
              <textarea 
                className="input-field min-h-[80px]"
                value={formData.description}
                onChange={e => setFormData({...formData, description: e.target.value})}
                placeholder="Drug details, manufacturer, etc."
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-muted uppercase mb-1.5">Retail Price (₵)</label>
              <input 
                type="number" step="0.01" required
                className="input-field"
                value={formData.price}
                onChange={e => setFormData({...formData, price: parseFloat(e.target.value)})}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-muted uppercase mb-1.5">Cost Price (₵)</label>
              <input 
                type="number" step="0.01"
                className="input-field"
                value={formData.wholesalePrice}
                onChange={e => setFormData({...formData, wholesalePrice: parseFloat(e.target.value)})}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-muted uppercase mb-1.5">Current Stock</label>
              <input 
                type="number" required
                className="input-field"
                value={formData.stockQty}
                onChange={e => setFormData({...formData, stockQty: parseInt(e.target.value)})}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-muted uppercase mb-1.5">Reorder Level</label>
              <input 
                type="number" required
                className="input-field"
                value={formData.reorderLevel}
                onChange={e => setFormData({...formData, reorderLevel: parseInt(e.target.value)})}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-muted uppercase mb-1.5">Category</label>
              <select 
                className="input-field"
                value={formData.category}
                onChange={e => setFormData({...formData, category: e.target.value})}
              >
                <option value="">Uncategorized</option>
                {categories.map(c => (
                  <option key={c.id} value={c.name}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-muted uppercase mb-1.5">Unit</label>
              <select 
                className="input-field"
                value={formData.unit}
                onChange={e => setFormData({...formData, unit: e.target.value})}
              >
                <option value="tablets">Tablets</option>
                <option value="capsules">Capsules</option>
                <option value="ml">Milliliters (ml)</option>
                <option value="syrup">Syrup</option>
                <option value="injection">Injection</option>
                <option value="cream">Cream</option>
                <option value="powder">Powder</option>
                <option value="pcs">Pieces</option>
              </select>
            </div>
            <div className="sm:col-span-2 border-t border-border pt-4">
              <label className="flex items-center gap-3 cursor-pointer">
                <input 
                  type="checkbox"
                  checked={formData.isPrescriptionRequired}
                  onChange={e => setFormData({...formData, isPrescriptionRequired: e.target.checked})}
                  className="w-4 h-4 rounded border-border"
                />
                <span className="text-sm text-surface">Prescription Required</span>
              </label>
              <p className="text-xs text-muted mt-2">Check if this drug requires a valid prescription before sale</p>
            </div>
            <div className="sm:col-span-2">
              <label className="flex items-center gap-3 cursor-pointer">
                <input 
                  type="checkbox"
                  checked={formData.trackBatches}
                  onChange={e => setFormData({...formData, trackBatches: e.target.checked})}
                  className="w-4 h-4 rounded border-border"
                />
                <span className="text-sm text-surface">Track Batches & Expiry</span>
              </label>
              <p className="text-xs text-muted mt-2">Enable batch tracking for expiry date management</p>
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <button type="button" onClick={() => setShowDrugModal(false)} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary">Save Drug</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
