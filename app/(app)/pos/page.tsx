"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  getProducts, getClients, getBusinessProfile, Product, Client,
  InvoiceLineItem, PaymentMethod, BusinessProfile, Shift, getActiveShift, openShift, closeShift,
  getCategories, Category
} from "@/lib/db";
import { createPosSale } from "@/lib/pos-api";
import { formatMoney } from "@/lib/utils";
import Modal from "@/components/ui/Modal";
import BrandedDocument from "@/components/BrandedDocument";
import toast from "react-hot-toast";
import { Search, Plus, Minus, Trash2, ShoppingCart, Printer, X, Wifi, WifiOff } from "lucide-react";
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
  const [receiptWidth, setReceiptWidth] = useState<58 | 80>(80);

  const [isOnline, setIsOnline] = useState(true);
  const [offlineCount, setOfflineCount] = useState(0);
  const [isWholesale, setIsWholesale] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [discountAmount, setDiscountAmount] = useState<string>("");

  const load = async () => {
    if (!businessId) return;
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

    setLoading(false);
  };

  useEffect(() => { load(); }, [user, businessId]);

  useEffect(() => {
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

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    setIsOnline(navigator.onLine);
    setOfflineCount(getOfflineQueue().length);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [businessId, activeShift]);

  // Keep the scan input focused so a barcode scanner (acting as a keyboard) always lands here.
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
    // Exact SKU match first (what a barcode scanner produces), fall back to name search.
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

    // If online and using Card or MoMo, trigger Paystack if a key is provided
    if (isOnline && (payMethod === "card" || payMethod === "momo") && profile?.paystackPublicKey) {
      // @ts-ignore - PaystackPop is loaded via script in public/index.html or similar
      if (typeof window !== "undefined" && (window as any).PaystackPop) {
        const handler = (window as any).PaystackPop.setup({
          key: profile.paystackPublicKey,
          email: user.email || "customer@billflow.app",
          amount: Math.round(total * 100), // in pesewas
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
              
              // Optimistic UI update
              setProducts(prev => prev.map(p => {
                const item = cart.find(c => c.productId === p.id);
                return item ? { ...p, stockQty: p.stockQty - item.quantity } : p;
              }));
              setActiveShift(prev => prev ? {
                ...prev,
                totalSales: (prev.totalSales || 0) + result.amount,
                paymentBreakdown: {
                  ...prev.paymentBreakdown,
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
          onClose: () => {
            toast.error("Payment window closed");
          }
        });
        handler.openIframe();
        return;
      } else {
        toast.error("Payment gateway is still loading. Please wait a moment.");
        return;
      }
    }

    // Default flow for Cash or Offline
    setCharging(true);
    try {
      if (!isOnline) {
        const offlineSale = queueOfflineSale(saleData);
        toast.success("Sale saved offline. Will sync when online.");
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
        
        // Optimistic UI update
        setProducts(prev => prev.map(p => {
          const item = cart.find(c => c.productId === p.id);
          return item ? { ...p, stockQty: p.stockQty - item.quantity } : p;
        }));
        setActiveShift(prev => prev ? {
          ...prev,
          totalSales: (prev.totalSales || 0) + result.amount,
          paymentBreakdown: {
            ...prev.paymentBreakdown,
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
      {/* Left: scan + product grid */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 bg-border/30 p-1 rounded-lg">
            <button
              onClick={() => setIsWholesale(false)}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${!isWholesale ? "bg-gold text-black shadow-lg" : "text-muted hover:text-surface"}`}
            >
              RETAIL
            </button>
            <button
              onClick={() => setIsWholesale(true)}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${isWholesale ? "bg-gold text-black shadow-lg" : "text-muted hover:text-surface"}`}
            >
              WHOLESALE
            </button>
          </div>
          {isWholesale && (
            <span className="text-[10px] font-bold text-gold bg-gold/10 px-2 py-1 rounded border border-gold/20 animate-pulse">
              WHOLESALE MODE ACTIVE
            </span>
          )}
        </div>

        <form onSubmit={handleScanSubmit} className="mb-4">
          <div className="relative">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
            <input
              ref={scanRef}
              className="input pl-10"
              placeholder="Scan barcode / SKU or type product name, then Enter..."
              value={scanValue}
              onChange={e => setScanValue(e.target.value)}
              autoFocus
            />
          </div>
        </form>

        <div className="flex gap-2 mb-4 overflow-x-auto pb-1 no-scrollbar">
          <button
            onClick={() => setSelectedCategory("all")}
            className={`px-3 py-1.5 rounded-full text-[10px] font-bold whitespace-nowrap transition-all border ${
              selectedCategory === "all" ? "bg-gold border-gold text-black shadow-md" : "bg-white/5 border-border text-muted hover:border-muted"
            }`}
          >
            ALL CATEGORIES
          </button>
          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id!)}
              className={`px-3 py-1.5 rounded-full text-[10px] font-bold whitespace-nowrap transition-all border ${
                selectedCategory === cat.id ? "bg-gold border-gold text-black shadow-md" : "bg-white/5 border-border text-muted hover:border-muted"
              }`}
            >
              {cat.name.toUpperCase()}
            </button>
          ))}
        </div>

        <input
          className="input mb-4"
          placeholder="Filter products..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />

        {loading ? (
          <p className="text-muted text-sm py-10 text-center">Loading products...</p>
        ) : filteredProducts.length === 0 ? (
          <p className="text-muted text-sm py-10 text-center">No products found</p>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {filteredProducts.map(p => (
              <button
                key={p.id}
                onClick={() => addToCart(p)}
                className="card p-4 hover:border-gold transition-all text-left group relative"
              >
                <div className="flex justify-between items-start mb-2">
                  <span className="text-[10px] font-bold text-muted uppercase tracking-wider">{p.sku || "NO SKU"}</span>
                  <span className={cn(
                    "text-[10px] font-bold px-1.5 py-0.5 rounded",
                    p.stockQty <= (p.reorderLevel || 5) ? "bg-red/10 text-red" : "bg-green/10 text-green"
                  )}>
                    {p.stockQty} {p.unit || "pcs"}
                  </span>
                </div>
                <h3 className="font-bold text-surface mb-1 truncate group-hover:text-gold transition-colors">{p.name}</h3>
                <p className="text-lg font-grotesk text-white">{formatMoney(isWholesale && p.wholesalePrice ? p.wholesalePrice : p.price, profile?.currency || "GHS")}</p>
                <div className="absolute inset-0 bg-gold/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Right: Cart */}
      <div className="sticky top-24 flex flex-col h-[calc(100vh-120px)]">
        <div className="card flex-1 flex flex-col p-0 overflow-hidden">
          <div className="p-4 border-b border-border flex items-center justify-between bg-white/5">
            <h2 className="font-bold text-surface flex items-center gap-2">
              <ShoppingCart size={18} /> Current Sale
            </h2>
            <button onClick={clearCart} className="text-muted hover:text-red transition-colors">
              <Trash2 size={16} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
            {cart.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-muted py-20">
                <ShoppingCart size={40} className="mb-4 opacity-20" />
                <p className="text-sm">Cart is empty</p>
              </div>
            ) : (
              cart.map(l => (
                <div key={l.productId} className="flex items-center gap-3 bg-white/5 p-3 rounded-lg border border-border/50">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-surface truncate">{l.productName}</p>
                    <p className="text-xs text-muted">{formatMoney(l.unitPrice, profile?.currency || "GHS")} each</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => updateQty(l.productId, -1)} className="p-1 hover:text-gold transition-colors">
                      <Minus size={14} />
                    </button>
                    <span className="text-sm font-grotesk w-6 text-center text-white">{l.quantity}</span>
                    <button onClick={() => updateQty(l.productId, 1)} className="p-1 hover:text-gold transition-colors">
                      <Plus size={14} />
                    </button>
                  </div>
                  <button onClick={() => removeLine(l.productId)} className="text-muted hover:text-red p-1 transition-colors">
                    <X size={14} />
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="p-5 bg-white/5 border-t border-border space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted">Subtotal</span>
              <span className="text-surface font-grotesk">{formatMoney(lineTotal, profile?.currency || "GHS")}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm text-muted">Discount</span>
              <input
                className="input h-8 text-right font-grotesk w-24"
                type="number"
                placeholder="0.00"
                value={discountAmount}
                onChange={e => setDiscountAmount(e.target.value)}
              />
            </div>
            <div className="pt-3 border-t border-border flex justify-between items-end">
              <span className="font-bold text-surface">Total</span>
              <span className="text-2xl font-grotesk font-bold text-gold">{formatMoney(total, profile?.currency || "GHS")}</span>
            </div>
            <button
              onClick={openCheckout}
              disabled={cart.length === 0}
              className="btn-primary w-full justify-center py-4 mt-2 shadow-lg shadow-gold/10"
            >
              PROCEED TO CHECKOUT
            </button>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between px-2">
          <div className="flex items-center gap-2">
            {isOnline ? (
              <span className="flex items-center gap-1.5 text-[10px] font-bold text-green">
                <Wifi size={12} /> ONLINE
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-[10px] font-bold text-red">
                <WifiOff size={12} /> OFFLINE
              </span>
            )}
            {offlineCount > 0 && (
              <span className="text-[10px] font-bold text-gold bg-gold/10 px-1.5 py-0.5 rounded">
                {offlineCount} PENDING SYNC
              </span>
            )}
          </div>
          <button
            onClick={() => setShiftModalOpen(true)}
            className="text-[10px] font-bold text-muted hover:text-gold transition-colors"
          >
            {activeShift ? "SHIFT MANAGEMENT" : "OPEN SHIFT"}
          </button>
        </div>
      </div>

      {/* Checkout Modal */}
      <Modal open={checkoutOpen} onClose={() => setCheckoutOpen(false)} title="Checkout">
        <div className="space-y-6">
          <div className="bg-white/5 p-4 rounded-lg border border-border text-center">
            <p className="text-sm text-muted mb-1">Total Amount Due</p>
            <p className="text-3xl font-grotesk font-bold text-gold">{formatMoney(total, profile?.currency || "GHS")}</p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="label">Customer Name</label>
              <input
                className="input"
                placeholder="Walk-in Customer"
                value={customerName}
                onChange={e => setCustomerName(e.target.value)}
              />
            </div>

            <div>
              <label className="label">Payment Method</label>
              <div className="grid grid-cols-3 gap-3">
                {(["cash", "momo", "card"] as const).map(m => (
                  <button
                    key={m}
                    onClick={() => setPayMethod(m)}
                    className={cn(
                      "p-3 rounded-lg border text-xs font-bold transition-all uppercase",
                      payMethod === m ? "bg-gold border-gold text-black" : "bg-white/5 border-border text-muted hover:border-muted"
                    )}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <button className="btn-ghost flex-1 justify-center" onClick={() => setCheckoutOpen(false)}>Cancel</button>
            <button
              className="btn-primary flex-1 justify-center"
              onClick={handleCharge}
              disabled={charging}
            >
              {charging ? "Processing..." : "Complete Sale"}
            </button>
          </div>
        </div>
      </Modal>

      {/* Receipt Modal */}
      <Modal open={!!receipt} onClose={() => setReceipt(null)} title="Sale Complete">
        {receipt && (
          <div className="space-y-6">
            <div className="flex justify-center mb-4">
              <div className="flex items-center gap-2 bg-border/30 p-1 rounded-lg">
                <button
                  onClick={() => setReceiptWidth(58)}
                  className={`px-3 py-1 rounded-md text-[10px] font-bold transition-all ${receiptWidth === 58 ? "bg-white text-black shadow-sm" : "text-muted"}`}
                >
                  58MM
                </button>
                <button
                  onClick={() => setReceiptWidth(80)}
                  className={`px-3 py-1 rounded-md text-[10px] font-bold transition-all ${receiptWidth === 80 ? "bg-white text-black shadow-sm" : "text-muted"}`}
                >
                  80MM
                </button>
              </div>
            </div>

            <div className="flex justify-center overflow-hidden rounded-lg border border-border bg-white">
              <div id="receipt-content" className="p-4" style={{ width: receiptWidth === 58 ? "220px" : "300px" }}>
                <BrandedDocument profile={profile!} type="receipt">
                  <div className="text-[10px] space-y-1">
                    <div className="flex justify-between border-b border-dashed border-black pb-1">
                      <span>Receipt #:</span>
                      <span className="font-bold">{receipt.invoiceId.slice(-6).toUpperCase()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Date:</span>
                      <span>{receipt.timestamp.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Customer:</span>
                      <span>{receipt.customerName}</span>
                    </div>
                    <div className="flex justify-between border-b border-dashed border-black pb-1">
                      <span>Method:</span>
                      <span className="uppercase">{receipt.method}</span>
                    </div>

                    <div className="py-2 space-y-1">
                      {receipt.items.map((item, idx) => (
                        <div key={idx} className="flex justify-between">
                          <span className="flex-1 truncate pr-2">{item.quantity}x {item.productName}</span>
                          <span className="font-bold">{formatMoney(item.quantity * item.unitPrice, profile?.currency || "GHS")}</span>
                        </div>
                      ))}
                    </div>

                    <div className="border-t border-black pt-1 space-y-1">
                      <div className="flex justify-between text-xs font-bold">
                        <span>TOTAL:</span>
                        <span>{formatMoney(receipt.amount, profile?.currency || "GHS")}</span>
                      </div>
                    </div>
                  </div>
                </BrandedDocument>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                className="btn-ghost flex-1 justify-center gap-2"
                onClick={() => setReceipt(null)}
              >
                Done
              </button>
              <button
                className="btn-primary flex-1 justify-center gap-2"
                onClick={() => printReceipt("receipt-content")}
              >
                <Printer size={16} /> Print Receipt
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Shift Modal */}
      <Modal open={shiftModalOpen} onClose={() => activeShift && setShiftModalOpen(false)} title={activeShift ? "End Shift" : "Start New Shift"}>
        <div className="space-y-6">
          {!activeShift ? (
            <>
              <div className="p-4 bg-gold/5 border border-gold/20 rounded-lg">
                <p className="text-sm text-surface leading-relaxed">
                  To start making sales, please enter your opening cash balance. This helps track your daily sales and cash flow.
                </p>
              </div>
              <div>
                <label className="label">Opening Cash Balance ({profile?.currency || "GHS"})</label>
                <input
                  className="input text-lg font-grotesk"
                  type="number"
                  placeholder="0.00"
                  value={openingCash}
                  onChange={e => setOpeningCash(e.target.value)}
                  autoFocus
                />
              </div>
              <button onClick={handleOpenShift} className="btn-primary w-full justify-center py-3">
                START SHIFT
              </button>
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="card bg-white/5 border-border">
                  <p className="text-[10px] text-muted uppercase font-bold mb-1">Started At</p>
                  <p className="text-sm text-surface">{new Date(activeShift.openedAt.toDate()).toLocaleTimeString()}</p>
                </div>
                <div className="card bg-white/5 border-border">
                  <p className="text-[10px] text-muted uppercase font-bold mb-1">Total Sales</p>
                  <p className="text-sm text-surface font-grotesk">{formatMoney(activeShift.totalSales || 0, profile?.currency || "GHS")}</p>
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-xs font-bold text-muted uppercase">Payment Breakdown</p>
                <div className="space-y-2">
                  {Object.entries(activeShift.paymentBreakdown || {}).map(([method, amount]) => (
                    <div key={method} className="flex justify-between text-sm p-2 bg-white/5 rounded border border-border/30">
                      <span className="capitalize text-muted">{method}</span>
                      <span className="font-grotesk text-surface">{formatMoney(amount as number, profile?.currency || "GHS")}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="label">Actual Cash in Drawer ({profile?.currency || "GHS"})</label>
                <input
                  className="input text-lg font-grotesk"
                  type="number"
                  placeholder="0.00"
                  value={actualCash}
                  onChange={e => setActualCash(e.target.value)}
                />
                <p className="text-[10px] text-muted mt-2">
                  Expected cash based on sales: {formatMoney((activeShift.openingCash || 0) + (activeShift.paymentBreakdown?.cash || 0), profile?.currency || "GHS")}
                </p>
              </div>

              <div className="flex gap-3 pt-2">
                <button className="btn-ghost flex-1 justify-center" onClick={() => setShiftModalOpen(false)}>Cancel</button>
                <button
                  className="btn-primary flex-1 justify-center"
                  onClick={handleCloseShift}
                  disabled={closingShift}
                >
                  {closingShift ? "Closing..." : "CLOSE SHIFT"}
                </button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}
