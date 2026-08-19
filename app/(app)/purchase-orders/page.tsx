"use client";
import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { 
  updateDoc, deleteDoc, doc
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { formatCedi } from "@/lib/utils";
import { getPurchaseOrders, PurchaseOrder, POStatus } from "@/lib/db";
import { 
  BarChart3, Plus, Search, Trash2, 
  Eye, FileText, Truck, Calendar, CheckCircle2, Clock
} from "lucide-react";
import Modal from "@/components/ui/Modal";
import Badge from "@/components/ui/Badge";
import toast from "react-hot-toast";

export default function PurchaseOrdersPage() {
  const { businessId, role } = useAuth();
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  
  useEffect(() => {
    if (businessId) {
      fetchOrders();
    }
    window.addEventListener("billflow_refresh", fetchOrders);
    return () => window.removeEventListener("billflow_refresh", fetchOrders);
  }, [businessId]);

  const fetchOrders = async () => {
    if (!businessId) return;
    setLoading(true);
    try {
      const data = await getPurchaseOrders(businessId);
      setOrders(data);
    } catch (err) {
      console.error(err);
      toast.error("Failed to load purchase orders");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateStatus = async (id: string, status: POStatus) => {
    if (!db) {
      toast.error("Database is unavailable. Please try again.");
      return;
    }
    try {
      await updateDoc(doc(db, "purchaseOrders", id), { status });
      toast.success(`Order marked as ${status}`);
      fetchOrders();
    } catch (err) {
      toast.error("Failed to update status");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this order?")) return;
    if (!db) {
      toast.error("Database is unavailable. Please try again.");
      return;
    }
    try {
      await deleteDoc(doc(db, "purchaseOrders", id));
      toast.success("Order deleted");
      fetchOrders();
    } catch (err) {
      toast.error("Failed to delete order");
    }
  };

  const filtered = orders.filter(o => 
    o.poNumber.toLowerCase().includes(search.toLowerCase()) || 
    o.supplierName.toLowerCase().includes(search.toLowerCase())
  );

  if (role !== "owner" && role !== "super_admin") {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <BarChart3 size={48} className="text-muted mb-4" />
        <h1 className="text-xl font-bold text-white">Access Denied</h1>
        <p className="text-muted text-sm mt-2">Only business owners or super admins can manage purchase orders.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white font-grotesk">Purchase Orders</h1>
          <p className="text-muted text-sm mt-1">Track and manage orders from your suppliers.</p>
        </div>
        <button 
          onClick={() => toast.error("Please add items via the Inventory page first")}
          className="btn-primary"
        >
          <Plus size={18} />
          New Order
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" size={18} />
        <input 
          type="text"
          placeholder="Search orders by number or supplier..."
          className="input-field pl-12"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border bg-white/5">
                <th className="px-6 py-4 text-xs font-bold text-muted uppercase tracking-wider">Order Info</th>
                <th className="px-6 py-4 text-xs font-bold text-muted uppercase tracking-wider">Supplier</th>
                <th className="px-6 py-4 text-xs font-bold text-muted uppercase tracking-wider">Total</th>
                <th className="px-6 py-4 text-xs font-bold text-muted uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 text-xs font-bold text-muted uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-muted animate-pulse">Loading orders...</td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-muted">No purchase orders found.</td>
                </tr>
              ) : filtered.map((order) => (
                <tr key={order.id} className="hover:bg-white/5 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-blue/10 flex items-center justify-center text-blue">
                        <FileText size={20} />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-white">{order.poNumber}</p>
                        <p className="text-[10px] text-muted flex items-center gap-1">
                          <Calendar size={10} />
                          {order.createdAt?.toDate ? order.createdAt.toDate().toLocaleDateString() : "Recent"}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 text-sm text-white font-medium">
                      <Truck size={14} className="text-muted" />
                      {order.supplierName}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-sm font-bold text-gold">{formatCedi(order.totalCost)}</p>
                    <p className="text-[10px] text-muted">{order.items?.length || 0} items</p>
                  </td>
                  <td className="px-6 py-4">
                    <Badge status={order.status} />
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {order.status === "ordered" && (
                        <button 
                          onClick={() => handleUpdateStatus(order.id!, "received")}
                          className="p-2 text-green hover:bg-green/10 rounded-lg transition-all"
                          title="Mark as Received"
                        >
                          <CheckCircle2 size={16} />
                        </button>
                      )}
                      {order.status === "draft" && (
                        <button 
                          onClick={() => handleUpdateStatus(order.id!, "ordered")}
                          className="p-2 text-blue hover:bg-blue/10 rounded-lg transition-all"
                          title="Mark as Ordered"
                        >
                          <Clock size={16} />
                        </button>
                      )}
                      <button 
                        onClick={() => handleDelete(order.id!)}
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
    </div>
  );
}
