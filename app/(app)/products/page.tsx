"use client";
import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { 
  getProducts, createProduct, updateProduct, deleteProduct, getCategories, createCategory 
} from "@/lib/db";
import { Product, Category } from "@/lib/db";
import { formatCedi, cn } from "@/lib/utils";
import { 
  Package, Plus, Search, Edit, Trash2, Filter, 
  ChevronRight, AlertCircle, Tag, Layers
} from "lucide-react";
import Modal from "@/components/ui/Modal";
import Badge from "@/components/ui/Badge";
import toast from "react-hot-toast";

export default function ProductsPage() {
  const { businessId, user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  
  const [showProductModal, setShowProductModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  
  const [formData, setFormData] = useState({
    name: "",
    sku: "",
    barcode: "",
    description: "",
    price: 0,
    wholesalePrice: 0,
    stockQty: 0,
    reorderLevel: 5,
    category: "",
    unit: "pcs"
  });

  const [catData, setCatData] = useState({ name: "" });

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
      const [p, c] = await Promise.all([
        getProducts(businessId!),
        getCategories(businessId!)
      ]);
      setProducts(p);
      setCategories(c);
    } catch (err) {
      toast.error("Failed to load products");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessId) return;
    const userId = user?.uid;
    if (!userId) {
      toast.error("Your session is still loading. Please try again.");
      return;
    }

    try {
      if (editingProduct) {
        await updateProduct(editingProduct.id!, formData);
        toast.success("Product updated");
      } else {
        await createProduct({ ...formData, businessId, userId });
        toast.success("Product created");
      }
      setShowProductModal(false);
      fetchData();
    } catch (err) {
      toast.error("Failed to save product");
    }
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessId) return;

    try {
      await createCategory({ ...catData, businessId });
      toast.success("Category created");
      setShowCategoryModal(false);
      setCatData({ name: "" });
      fetchData();
    } catch (err) {
      toast.error("Failed to save category");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this product?")) return;
    try {
      await deleteProduct(id);
      toast.success("Product deleted");
      fetchData();
    } catch (err) {
      toast.error("Failed to delete product");
    }
  };

  const filtered = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase()) || 
                         p.description?.toLowerCase().includes(search.toLowerCase());
    const matchesCat = selectedCategory === "all" || p.category === selectedCategory;
    return matchesSearch && matchesCat;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white font-grotesk">Inventory</h1>
          <p className="text-muted text-sm mt-1">Manage your products, stock levels, and categories.</p>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setShowCategoryModal(true)}
            className="btn-secondary"
          >
            <Layers size={18} />
            Categories
          </button>
          <button 
            onClick={() => {
              setEditingProduct(null);
              setFormData({
                name: "",
                sku: "",
                barcode: "",
                description: "",
                price: 0,
                wholesalePrice: 0,
                stockQty: 0,
                reorderLevel: 5,
                category: "",
                unit: "pcs"
              });
              setShowProductModal(true);
            }}
            className="btn-primary"
          >
            <Plus size={18} />
            Add Product
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="md:col-span-3 relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" size={18} />
          <input 
            type="text"
            placeholder="Search products by name or description..."
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
                <th className="px-6 py-4 text-xs font-bold text-muted uppercase tracking-wider">Product</th>
                <th className="px-6 py-4 text-xs font-bold text-muted uppercase tracking-wider">Category</th>
                <th className="px-6 py-4 text-xs font-bold text-muted uppercase tracking-wider">Stock</th>
                <th className="px-6 py-4 text-xs font-bold text-muted uppercase tracking-wider">Price</th>
                <th className="px-6 py-4 text-xs font-bold text-muted uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 text-xs font-bold text-muted uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center text-muted animate-pulse">Loading products...</td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center text-muted">No products found.</td>
                </tr>
              ) : filtered.map((product) => (
                <tr key={product.id} className="hover:bg-white/5 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-gold/10 flex items-center justify-center text-gold">
                        <Package size={20} />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-white">{product.name}</p>
                        <p className="text-xs text-muted truncate max-w-[200px]">{product.description || "No description"}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center gap-1 text-xs text-muted">
                      <Tag size={12} />
                      {product.category || "Uncategorized"}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div>
                      <p className={cn(
                        "text-sm font-bold",
                        product.stockQty <= (product.reorderLevel || 5) ? "text-red" : "text-white"
                      )}>
                        {product.stockQty} {product.unit}
                      </p>
                      {product.stockQty <= (product.reorderLevel || 5) && (
                        <p className="text-[10px] text-red uppercase font-bold tracking-tighter">Low Stock</p>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-sm font-bold text-gold">{formatCedi(product.price)}</p>
                    <p className="text-[10px] text-muted">Wholesale: {formatCedi(product.wholesalePrice || 0)}</p>
                  </td>
                  <td className="px-6 py-4">
                    <Badge status={product.stockQty > 0 ? "In Stock" : "Out of Stock"} />
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button 
                        onClick={() => {
                          setEditingProduct(product);
                          setFormData({
                            name: product.name,
                            sku: product.sku || "",
                            barcode: product.barcode || "",
                            description: product.description || "",
                            price: product.price,
                            wholesalePrice: product.wholesalePrice || 0,
                            stockQty: product.stockQty,
                            reorderLevel: product.reorderLevel || 5,
                            category: product.category || "",
                            unit: product.unit || "pcs"
                          });
                          setShowProductModal(true);
                        }}
                        className="p-2 text-muted hover:text-white hover:bg-white/5 rounded-lg transition-all"
                      >
                        <Edit size={16} />
                      </button>
                      <button 
                        onClick={() => handleDelete(product.id!)}
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

      {/* Product Modal */}
      <Modal 
        open={showProductModal} 
        onClose={() => setShowProductModal(false)} 
        title={editingProduct ? "Edit Product" : "Add New Product"}
      >
        <form onSubmit={handleSaveProduct} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-muted uppercase mb-1.5">Product Name</label>
              <input 
                required
                className="input-field"
                value={formData.name}
                onChange={e => setFormData({...formData, name: e.target.value})}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-muted uppercase mb-1.5">Barcode / UPC</label>
              <input 
                className="input-field"
                placeholder="Scan or enter barcode"
                value={formData.barcode || ""}
                onChange={e => setFormData({...formData, barcode: e.target.value})}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-muted uppercase mb-1.5">SKU</label>
              <input 
                className="input-field"
                placeholder="Stock Keeping Unit"
                value={formData.sku || ""}
                onChange={e => setFormData({...formData, sku: e.target.value})}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-muted uppercase mb-1.5">Description</label>
              <textarea 
                className="input-field min-h-[80px]"
                value={formData.description}
                onChange={e => setFormData({...formData, description: e.target.value})}
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
              <label className="block text-xs font-bold text-muted uppercase mb-1.5">Wholesale Price (₵)</label>
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
              <input 
                className="input-field"
                placeholder="pcs, box, kg, etc."
                value={formData.unit}
                onChange={e => setFormData({...formData, unit: e.target.value})}
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <button type="button" onClick={() => setShowProductModal(false)} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary">Save Product</button>
          </div>
        </form>
      </Modal>

      {/* Category Modal */}
      <Modal 
        open={showCategoryModal} 
        onClose={() => setShowCategoryModal(false)} 
        title="Manage Categories"
      >
        <div className="space-y-6">
          <form onSubmit={handleSaveCategory} className="flex gap-2">
            <input 
              required
              placeholder="New category name..."
              className="input-field"
              value={catData.name}
              onChange={e => setCatData({name: e.target.value})}
            />
            <button type="submit" className="btn-primary px-4">Add</button>
          </form>

          <div className="space-y-2">
            <h4 className="text-xs font-bold text-muted uppercase tracking-wider">Existing Categories</h4>
            <div className="grid grid-cols-2 gap-2">
              {categories.map(c => (
                <div key={c.id} className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-border group">
                  <span className="text-sm text-white font-medium">{c.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
