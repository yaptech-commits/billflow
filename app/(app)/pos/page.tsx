"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  getProducts, getClients, getBusinessProfile, Product, Client,
  InvoiceLineItem, PaymentMethod, BusinessProfile, Shift, getActiveShift, openShift, closeShift,
  getCategories, Category
} from "@/lib/db";
import { createPosSale } from "@/lib/pos-api";
import { formatMoney, cn } from "@/lib/utils";
import Modal from "@/components/ui/Modal";
import BrandedDocument from "@/components/BrandedDocument";
import toast from "react-hot-toast";
import { Search, Plus, Minus, Trash2, ShoppingCart, Printer, X, Wifi, WifiOff, ArrowRight, CreditCard } from "lucide-react";
import { printReceipt } from "@/lib/print-receipt";
import { queueOfflineSale, syncOfflineSales, getOfflineQueue } from "@/lib/offline-sync";

interface CartLine {
  productId: string;
  productName: string;
  unitPrice: number;
  quantity: number;
  maxStock: number;
}

export default function PosPage() {
  const { user, businessId } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [selectedClient, setSelectedClient] = useState<string>("");
  const [discount, setDiscount] = useState<number>(0);
  const [scanValue, setScanValue] = useState("");
  const [search, setSearch] = useState("");
  const scanRef = useRef<HTMLInputElement>(null);

  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [customerName, setCustomerName] = useState("Walk-in Customer");
  const [payMethod, setPayMethod] = useState<PaymentMethod>("momo");
  const [charging, setCharging] = useState(false);

  // Shift state
  const [activeShift, setActiveShift] = useState<Shift | null>(null);
  const [shiftModalOpen, setShiftModalOpen] = useState(false);
  const [openingCash, setOpeningCash] = useState("0");
  const [actualCash, setActualCash] = useState("0");
  const [closingShift, setClosingShift] = useState(false);

  const [receipt, setReceipt] = useState<{
    invoiceId: string;
    amount: number;
    items: CartLine[];
    customerName: string;
    method: PaymentMethod;
    timestamp: Date;
  } | null>(null);
  const [receiptWidth, setReceiptWidth] = useState<58 | 80 | '58x3276'>(80);

  const [isOnline, setIsOnline] = useState(true);
  const [isForcedOffline, setIsForcedOffline] = useState(false);
  const [offlineCount, setOfflineCount] = useState(0);
  const [isWholesale, setIsWholesale] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [discountAmount, setDiscountAmount] = useState<string>("");

  const load = async () => {
    if (!businessId) return;
    try {
      const [productData, clientData, profileData, categoryData] = await Promise.all([
        getProducts(businessId),
        getClients(businessId),
        getBusinessProfile(businessId),
        getCategories(businessId),
      ]);
      setProducts(productData);
      setClients(clientData);
      setProfile(profileData);
      setCategories(categoryData);

      if (user) {
        const shift = await getActiveShift(businessId, user.uid);
        setActiveShift(shift);
        if (!shift) setShiftModalOpen(true);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [user, businessId]);

  useEffect(() => {
    const checkStatus = () => {
      setIsOnline(navigator.onLine);
      setIsForcedOffline(localStorage.getItem("billflow_offline_mode") === "true");
    };

    const handleOnline = () => {
      setIsOnline(true);
      if (!activeShift?.id) return;
      
      syncOfflineSales(async (data: any) => {
        return createPosSale({
          idempotencyKey: crypto.randomUUID(),
          shiftId: activeShift.id!,
          customerName: data.customerName || "Walk-in Customer",
          items: data.items.map((l: any) => ({ productId: l.productId, quantity: l.quantity })),
          paymentMethod: data.paymentMethod,
          discountAmount: data.discountAmount,
        });
      }).then(({ synced }) => {
        if (synced > 0) {
          toast.success(`Synced ${synced} offline sales!`);
          load();
        }
        setOfflineCount(getOfflineQueue().length);
      });
    };
    const handleOffline = () => setIsOnline(false);

    checkStatus();
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("billflow_offline_change", checkStatus);
    
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("billflow_offline_change", checkStatus);
    };
  }, [businessId, activeShift]);

  useEffect(() => {
    scanRef.current?.focus();
  }, [checkoutOpen, receipt]);

  const addToCart = (p: Product, qty = 1) => {
    if (p.stockQty <= 0) {
      toast.error(`${p.name} is out of stock`);
      return;
    }
    setCart(prev => {
      const existing = prev.find(l => l.productId === p.id);
      if (existing) {
        const nextQty = existing.quantity + qty;
        if (nextQty > p.stockQty) {
          toast.error(`Only ${p.stockQty} of ${p.name} in stock`);
          return prev;
        }
        return prev.map(l => l.productId === p.id ? { ...l, quantity: nextQty } : l);
      }
      if (qty > p.stockQty) {
        toast.error(`Only ${p.stockQty} of ${p.name} in stock`);
        return prev;
      }
      const price = isWholesale && p.wholesalePrice ? p.wholesalePrice : p.price;
      return [...prev, { productId: p.id!, productName: p.name, unitPrice: price, quantity: qty, maxStock: p.stockQty }];
    });
  };

  const handleScanSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const term = scanValue.trim();
    if (!term) return;
    const bySku = products.find(p => p.sku && p.sku.toLowerCase() === term.toLowerCase());
    const match = bySku ?? products.find(p => p.name.toLowerCase().includes(term.toLowerCase()));
    if (match) {
      addToCart(match);
      toast.success(`${match.name} added`, { duration: 1200 });
    } else {
      toast.error(`No product found for "${term}"`);
    }
    setScanValue("");
  };

  const updateQty = (productId: string, delta: number) => {
    setCart(prev => prev.map(l => {
      if (l.productId !== productId) return l;
      const nextQty = l.quantity + delta;
      if (nextQty <= 0) return l;
      if (nextQty > l.maxStock) {
        toast.error(`Only ${l.maxStock} in stock`);
        return l;
      }
      return { ...l, quantity: nextQty };
    }));
  };

  const removeLine = (productId: string) => setCart(prev => prev.filter(l => l.productId !== productId));
  const clearCart = () => setCart([]);

  const lineTotal = cart.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0);
  const discountVal = parseFloat(discountAmount) || 0;
  const total = lineTotal - discountVal;

  const filteredProducts = useMemo(() => {
    let list = products;
    if (search) {
      list = list.filter(p =>
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        (p.sku ?? "").toLowerCase().includes(search.toLowerCase())
      );
    }
    if (selectedCategory !== "all") {
      list = list.filter(p => p.categoryId === selectedCategory);
    }
    return list;
  }, [products, search, selectedCategory]);

  const openCheckout = () => {
    if (cart.length === 0) {
      toast.error("Cart is empty");
      return;
    }
    setCustomerName("Walk-in Customer");
    setPayMethod("momo");
    setCheckoutOpen(true);
  };

  const handleOpenShift = async () => {
    if (!user || !businessId) return;
    try {
      await openShift({
        businessId,
        userId: user.uid,
        userName: user.displayName || "Staff",
        openingCash: parseFloat(openingCash) || 0,
      });
      toast.success("Shift opened successfully");
      load();
      setShiftModalOpen(false);
    } catch (err: any) {
      toast.error(err.message || "Could not open shift");
    }
  };

  const handleCloseShift = async () => {
    if (!activeShift?.id) return;
    setClosingShift(true);
    try {
      await closeShift(activeShift.id, parseFloat(actualCash) || 0);
      toast.success("Shift closed successfully");
      setActiveShift(null);
      setShiftModalOpen(true);
      setActualCash("0");
    } catch (err: any) {
      toast.error(err.message || "Could not close shift");
    } finally {
      setClosingShift(false);
    }
  };

  const handleCharge = async () => {
    if (!user || !businessId) return;
    if (!activeShift) {
      toast.error("You must open a shift before making sales");
      setShiftModalOpen(true);
      return;
    }

    const items: InvoiceLineItem[] = cart.map(l => ({
      productId: l.productId, productName: l.productName, quantity: l.quantity, unitPrice: l.unitPrice,
    }));
    
    const saleData = {
      customerName: customerName || "Walk-in Customer",
      items,
      paymentMethod: payMethod,
      discountAmount: discountVal,
    };

    if (isOnline && !isForcedOffline && (payMethod === "card" || payMethod === "momo") && profile?.paystackPublicKey) {
      if (typeof window !== "undefined" && (window as any).PaystackPop) {
        const handler = (window as any).PaystackPop.setup({
          key: profile.paystackPublicKey,
          email: user.email || "customer@billflow.app",
          amount: Math.round(total * 100),
          currency: profile.currency || "GHS",
          callback: async (response: any) => {
            setCharging(true);
            try {
              const result = await createPosSale({ 
                ...saleData, 
                reference: response.reference,
                shiftId: activeShift!.id!,
                idempotencyKey: response.reference
              });
              setReceipt({
                invoiceId: result.invoiceId,
                amount: result.amount,
                items: cart,
                customerName: customerName || "Walk-in Customer",
                method: payMethod,
                timestamp: new Date(),
              });
              setProducts(prev => prev.map(p => {
                const item = cart.find(c => c.productId === p.id);
                return item ? { ...p, stockQty: p.stockQty - item.quantity } : p;
              }));
              setActiveShift(prev => prev ? {
                ...prev,
                totalSales: (prev.totalSales || 0) + result.amount,
                paymentBreakdown: {
                  momo: prev.paymentBreakdown?.momo || 0,
                  card: prev.paymentBreakdown?.card || 0,
                  cash: prev.paymentBreakdown?.cash || 0,
                  [payMethod]: (prev.paymentBreakdown?.[payMethod] || 0) + result.amount
                }
              } : null);
              setCheckoutOpen(false);
              setCart([]);
              toast.success("Payment successful!");
            } catch (err: any) {
              toast.error(err.message ?? "Payment succeeded but could not record sale");
            } finally {
              setCharging(false);
            }
          },
          onClose: () => { toast.error("Payment window closed"); }
        });
        handler.openIframe();
        return;
      } else {
        toast.error("Payment gateway is still loading. Please wait a moment.");
        return;
      }
    }

    setCharging(true);
    try {
      if (!isOnline || isForcedOffline) {
        const offlineSale = queueOfflineSale(saleData);
        toast.success(isForcedOffline ? "Sale saved in Offline Mode!" : "Sale saved offline! Will sync when online.");
        setReceipt({
          invoiceId: `OFFLINE-${offlineSale.id.slice(0, 5)}`,
          amount: total,
          items: cart,
          customerName: customerName || "Walk-in Customer",
          method: payMethod,
          timestamp: new Date(),
        });
        setOfflineCount(getOfflineQueue().length);
      } else {
        const result = await createPosSale({
          ...saleData,
          shiftId: activeShift.id!,
          idempotencyKey: crypto.randomUUID(),
        });
        setReceipt({
          invoiceId: result.invoiceId,
          amount: result.amount,
          items: cart,
          customerName: customerName || "Walk-in Customer",
          method: payMethod,
          timestamp: new Date(),
        });
        setProducts(prev => prev.map(p => {
          const item = cart.find(c => c.productId === p.id);
          return item ? { ...p, stockQty: p.stockQty - item.quantity } : p;
        }));
        setActiveShift(prev => prev ? {
          ...prev,
          totalSales: (prev.totalSales || 0) + result.amount,
          paymentBreakdown: {
            momo: prev.paymentBreakdown?.momo || 0,
            card: prev.paymentBreakdown?.card || 0,
            cash: prev.paymentBreakdown?.cash || 0,
            [payMethod]: (prev.paymentBreakdown?.[payMethod] || 0) + result.amount
          }
        } : null);
      }
      setCheckoutOpen(false);
      setCart([]);
    } catch (err: any) {
      toast.error(err.message ?? "Could not complete sale");
    } finally {
      setCharging(false);
    }
  };

  return (
    <div className="grid grid-cols-[1fr_360px] gap-5 items-start">
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-lg border font-bold text-[10px] uppercase tracking-wider",
              isForcedOffline ? "bg-orange/10 border-orange/30 text-orange" : 
              isOnline ? "bg-green/10 border-green/30 text-green" : "bg-red/10 border-red/30 text-red"
            )}>
              {isForcedOffline ? <WifiOff size={12} /> : isOnline ? <Wifi size={12} /> : <WifiOff size={12} />}
              {isForcedOffline ? "Forced Offline" : isOnline ? "Online" : "Offline"}
            </div>
            <div className="flex items-center gap-2 bg-border/30 p-1 rounded-lg">
              <button onClick={() => setIsWholesale(false)} className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${!isWholesale ? "bg-gold text-black shadow-lg" : "text-muted hover:text-surface"}`}>RETAIL</button>
              <button onClick={() => setIsWholesale(true)} className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${isWholesale ? "bg-gold text-black shadow-lg" : "text-muted hover:text-surface"}`}>WHOLESALE</button>
            </div>
          </div>
          {isWholesale && <span className="text-[10px] font-bold text-gold bg-gold/10 px-2 py-1 rounded border border-gold/20 animate-pulse">WHOLESALE MODE ACTIVE</span>}
        </div>

        <form onSubmit={handleScanSubmit} className="relative mb-5">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" size={20} />
          <input ref={scanRef} className="input pl-12 h-14 text-lg font-grotesk" placeholder="Scan barcode or search products..." value={scanValue} onChange={e => setScanValue(e.target.value)} />
        </form>

        <div className="flex gap-2 mb-6 overflow-x-auto pb-2 custom-scrollbar">
          <button onClick={() => setSelectedCategory("all")} className={cn("px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all border", selectedCategory === "all" ? "bg-gold border-gold text-black" : "bg-white/5 border-border text-muted hover:border-gold/50")}>All Products</button>
          {categories.map(cat => (
            <button key={cat.id} onClick={() => setSelectedCategory(cat.id!)} className={cn("px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all border", selectedCategory === cat.id ? "bg-gold border-gold text-black" : "bg-white/5 border-border text-muted hover:border-gold/50")}>{cat.name}</button>
          ))}
        </div>

        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4, 5, 6, 7, 8].map(i => <div key={i} className="h-40 bg-white/5 rounded-xl animate-pulse border border-border/50" />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filteredProducts.map(p => (
              <button key={p.id} onClick={() => addToCart(p)} className="card p-3 text-left hover:border-gold transition-all group relative overflow-hidden">
                <div className="flex justify-between items-start mb-2">
                  <span className="text-[10px] font-bold text-muted uppercase tracking-wider">{p.sku || "NO SKU"}</span>
                  <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded", p.stockQty <= (p.reorderLevel || 5) ? "bg-red/10 text-red" : "bg-green/10 text-green")}>{p.stockQty} in stock</span>
                </div>
                <h3 className="font-bold text-sm text-surface line-clamp-2 mb-2 h-10">{p.name}</h3>
                <p className="text-lg font-grotesk font-bold text-gold">{formatMoney(isWholesale && p.wholesalePrice ? p.wholesalePrice : p.price, profile?.currency || "GHS")}</p>
                <div className="absolute bottom-0 right-0 p-2 opacity-0 group-hover:opacity-100 transition-opacity"><Plus size={20} className="text-gold" /></div>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="card p-0 flex flex-col h-[calc(100vh-120px)] sticky top-24">
        <div className="p-5 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShoppingCart size={18} className="text-gold" />
            <h2 className="font-bold text-white">Current Cart</h2>
          </div>
          <span className="bg-white/10 text-surface text-[10px] font-bold px-2 py-1 rounded-full">{cart.length} ITEMS</span>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center opacity-30">
              <ShoppingCart size={48} className="mb-4" />
              <p className="text-sm">Cart is empty</p>
            </div>
          ) : (
            cart.map(l => (
              <div key={l.productId} className="bg-white/5 rounded-lg p-3 border border-border/50 group">
                <div className="flex justify-between mb-2">
                  <p className="text-sm font-bold text-surface truncate pr-2">{l.productName}</p>
                  <button onClick={() => removeLine(l.productId)} className="text-muted hover:text-red transition-colors"><Trash2 size={14} /></button>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 bg-black/40 rounded-lg p-1 border border-border/50">
                    <button onClick={() => updateQty(l.productId, -1)} className="w-6 h-6 flex items-center justify-center rounded bg-white/5 hover:bg-white/10"><Minus size={12} /></button>
                    <span className="text-xs font-bold w-4 text-center">{l.quantity}</span>
                    <button onClick={() => updateQty(l.productId, 1)} className="w-6 h-6 flex items-center justify-center rounded bg-white/5 hover:bg-white/10"><Plus size={12} /></button>
                  </div>
                  <p className="font-grotesk font-bold text-gold">{formatMoney(l.unitPrice * l.quantity, profile?.currency || "GHS")}</p>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="p-5 bg-black/40 border-t border-border space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between text-sm text-muted"><span>Subtotal</span><span>{formatMoney(lineTotal, profile?.currency || "GHS")}</span></div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm text-muted">Discount</span>
              <input type="number" className="bg-transparent border-b border-border text-right text-sm font-bold text-green w-20 focus:border-gold outline-none" placeholder="0.00" value={discountAmount} onChange={e => setDiscountAmount(e.target.value)} />
            </div>
            <div className="flex justify-between text-xl font-grotesk font-bold text-white pt-2 border-t border-border/50"><span>Total</span><span className="text-gold">{formatMoney(total, profile?.currency || "GHS")}</span></div>
          </div>
          <button onClick={openCheckout} disabled={cart.length === 0} className="btn-primary w-full h-14 text-lg justify-center gap-3 shadow-xl shadow-gold/10">CHECKOUT <ArrowRight size={20} /></button>
          <button onClick={clearCart} className="btn-ghost w-full justify-center text-xs opacity-50 hover:opacity-100">Clear Cart</button>
        </div>
      </div>

      <Modal open={checkoutOpen} onClose={() => setCheckoutOpen(false)} title="Complete Checkout">
        <div className="space-y-6">
          <div className="bg-gold/5 p-4 rounded-xl border border-gold/20 text-center">
            <p className="text-xs text-gold font-bold uppercase tracking-widest mb-1">Total Payable</p>
            <p className="text-4xl font-grotesk font-bold text-white">{formatMoney(total, profile?.currency || "GHS")}</p>
          </div>
          <div className="space-y-4">
            <div>
              <label className="label">Customer Name</label>
              <input className="input h-12" value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="e.g. John Doe" />
            </div>
            <div>
              <label className="label">Payment Method</label>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { id: "cash", label: "Cash", icon: <CreditCard size={18} /> },
                  { id: "momo", label: "MoMo", icon: <Wifi size={18} /> },
                  { id: "card", label: "Card", icon: <CreditCard size={18} /> }
                ].map(m => (
                  <button key={m.id} onClick={() => setPayMethod(m.id as PaymentMethod)} className={cn("flex flex-col items-center gap-2 p-3 rounded-xl border transition-all", payMethod === m.id ? "bg-gold border-gold text-black" : "bg-white/5 border-border text-muted hover:border-gold/50")}>
                    {m.icon}<span className="text-[10px] font-bold uppercase">{m.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
          <button onClick={handleCharge} disabled={charging} className="btn-primary w-full h-14 text-lg justify-center gap-3 shadow-xl shadow-gold/10">{charging ? "Processing..." : "PAY & PRINT"}</button>
        </div>
      </Modal>

      <Modal open={!!receipt} onClose={() => setReceipt(null)} title="Sale Successful">
        <div className="space-y-6">
          <div className="flex justify-center gap-3 mb-2">
            <button onClick={() => setReceiptWidth(58)} className={cn("px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-all", receiptWidth === 58 ? "bg-gold border-gold text-black" : "bg-white/5 border-border text-muted")}>58MM</button>
            <button onClick={() => setReceiptWidth('58x3276')} className={cn("px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-all", receiptWidth === '58x3276' ? "bg-gold border-gold text-black" : "bg-white/5 border-border text-muted")}>58MM (LONG)</button>
            <button onClick={() => setReceiptWidth(80)} className={cn("px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-all", receiptWidth === 80 ? "bg-gold border-gold text-black" : "bg-white/5 border-border text-muted")}>80MM</button>
          </div>
          <div className="flex justify-center overflow-hidden rounded-lg border border-border bg-white max-h-[400px] overflow-y-auto">
            <div id="receipt-content" className="p-4" style={{ width: (receiptWidth === 58 || receiptWidth === '58x3276') ? "220px" : "300px" }}>
              {receipt && (
                <BrandedDocument profile={profile} docType="RECEIPT" docNumber={receipt.invoiceId.slice(-6).toUpperCase()} date={receipt.timestamp} clientName={receipt.customerName} items={receipt.items} amount={receipt.amount} paymentMethod={receipt.method} currencyCode={profile?.currency || "GHS"} width={receiptWidth} />
              )}
            </div>
          </div>
          <div className="flex gap-3">
            <button className="btn-ghost flex-1 justify-center gap-2" onClick={() => printReceipt("receipt-content", receiptWidth)}><Printer size={18} /> Print</button>
            <button className="btn-primary flex-1 justify-center" onClick={() => setReceipt(null)}>DONE</button>
          </div>
        </div>
      </Modal>

      <Modal open={shiftModalOpen} onClose={() => {}} title={activeShift ? "Close Shift" : "Open New Shift"}>
        <div className="space-y-6">
          {!activeShift ? (
            <>
              <div>
                <label className="label">Opening Cash in Drawer ({profile?.currency || "GHS"})</label>
                <input className="input text-lg font-grotesk" type="number" placeholder="0.00" value={openingCash} onChange={e => setOpeningCash(e.target.value)} />
                <p className="text-[10px] text-muted mt-2">Enter the amount of cash currently in the register to start your shift.</p>
              </div>
              <button className="btn-primary w-full h-14 text-lg justify-center" onClick={handleOpenShift}>OPEN SHIFT</button>
            </>
          ) : (
            <>
              <div className="bg-white/5 rounded-xl border border-border p-4 space-y-3">
                <div className="flex justify-between text-xs text-muted"><span>Opened By:</span><span className="text-surface font-bold">{activeShift.userName}</span></div>
                <div className="flex justify-between text-xs text-muted"><span>Opened At:</span><span className="text-surface font-bold">{new Date(activeShift.openedAt.toDate()).toLocaleString()}</span></div>
                <div className="border-t border-border/50 pt-3 space-y-2">
                  {Object.entries(activeShift.paymentBreakdown || {}).map(([method, amount]) => (
                    <div key={method} className="flex justify-between text-xs">
                      <span className="capitalize text-muted">{method}</span>
                      <span className="font-grotesk text-surface">{formatMoney(amount as number, profile?.currency || "GHS")}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <label className="label">Actual Cash in Drawer ({profile?.currency || "GHS"})</label>
                <input className="input text-lg font-grotesk" type="number" placeholder="0.00" value={actualCash} onChange={e => setActualCash(e.target.value)} />
                <p className="text-[10px] text-muted mt-2">Expected cash: {formatMoney((activeShift.openingCash || 0) + (activeShift.paymentBreakdown?.cash || 0), profile?.currency || "GHS")}</p>
              </div>
              <div className="flex gap-3 pt-2">
                <button className="btn-ghost flex-1 justify-center" onClick={() => setShiftModalOpen(false)}>Cancel</button>
                <button className="btn-primary flex-1 justify-center" onClick={handleCloseShift} disabled={closingShift}>{closingShift ? "Closing..." : "CLOSE SHIFT"}</button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}
