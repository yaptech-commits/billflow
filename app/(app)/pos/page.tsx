"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  getProducts, createSale, getClients, getBusinessProfile, Product, Client,
  InvoiceLineItem, PaymentMethod, BusinessProfile, Shift, getActiveShift, openShift, closeShift
} from "@/lib/db";
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
    invoiceId: string; amount: number; items: CartLine[]; customerName: string;
    method: PaymentMethod; timestamp: Date;
  } | null>(null);

  const [isOnline, setIsOnline] = useState(true);
  const [offlineCount, setOfflineCount] = useState(0);
  const [isWholesale, setIsWholesale] = useState(false);

  const load = async () => {
    if (!businessId) return;
    const [productData, clientData, profileData] = await Promise.all([
      getProducts(businessId),
      getClients(businessId),
      getBusinessProfile(businessId),
    ]);
    setProducts(productData);
    setClients(clientData);
    setProfile(profileData);

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
      syncOfflineSales(createSale).then(({ synced }) => {
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
  }, [businessId]);

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

  const total = cart.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0);

  const filteredProducts = useMemo(() => {
    let list = products;
    if (search) {
      list = list.filter(p =>
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        (p.sku ?? "").toLowerCase().includes(search.toLowerCase())
      );
    }
    return list;
  }, [products, search]);

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
    setCharging(true);
    try {
      const items: InvoiceLineItem[] = cart.map(l => ({
        productId: l.productId, productName: l.productName, quantity: l.quantity, unitPrice: l.unitPrice,
      }));
      const saleData = {
        userId: user.uid,
        businessId,
        clientId: "walk-in",
        clientName: customerName || "Walk-in Customer",
        items,
        paymentMethod: payMethod,
      };

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
        const result = await createSale(saleData);
        setReceipt({
          invoiceId: result.invoiceId,
          amount: result.amount,
          items: cart,
          customerName: customerName || "Walk-in Customer",
          method: payMethod,
          timestamp: new Date(),
        });
        load();
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
                disabled={p.stockQty <= 0}
                className="card text-left p-3.5 hover:border-gold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <p className="text-sm font-medium text-surface truncate">{p.name}</p>
                <p className="text-xs text-muted mt-0.5">{p.sku || "—"}</p>
                <div className="flex items-center justify-between mt-2">
                  <span className="font-grotesk font-semibold text-gold">
                    {formatMoney(isWholesale && p.wholesalePrice ? p.wholesalePrice : p.price)}
                  </span>
                  <span className="text-[11px] text-muted">{p.stockQty} in stock</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Right: cart */}
      <div className="card sticky top-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-grotesk font-semibold text-white flex items-center gap-2">
            <ShoppingCart size={16} /> Cart
          </h2>
          <div className="flex items-center gap-3">
            {activeShift && (
              <button onClick={() => setShiftModalOpen(true)} className="text-[10px] uppercase tracking-wider font-bold text-green border border-green/30 px-1.5 py-0.5 rounded">
                Shift Open
              </button>
            )}
            <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${isOnline ? "text-muted" : "bg-red/10 text-red"}`}>
              {isOnline ? <Wifi size={10} /> : <WifiOff size={10} />}
              {isOnline ? "Online" : "Offline"}
              {offlineCount > 0 && <span className="ml-1 bg-red text-white px-1 rounded-full">{offlineCount}</span>}
            </div>
            {cart.length > 0 && (
              <button onClick={clearCart} className="text-xs text-muted hover:text-red transition-colors">Clear</button>
            )}
          </div>
        </div>

        {cart.length === 0 ? (
          <p className="text-muted text-sm py-10 text-center">Scan or tap a product to add it</p>
        ) : (
          <div className="space-y-3 mb-4 max-h-[45vh] overflow-y-auto">
            {cart.map(l => (
              <div key={l.productId} className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-surface truncate">{l.productName}</p>
                  <p className="text-xs text-muted">{formatMoney(l.unitPrice)} each</p>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button onClick={() => updateQty(l.productId, -1)} className="w-6 h-6 flex items-center justify-center rounded bg-border text-muted hover:text-surface">
                    <Minus size={12} />
                  </button>
                  <span className="text-sm text-surface w-5 text-center">{l.quantity}</span>
                  <button onClick={() => updateQty(l.productId, 1)} className="w-6 h-6 flex items-center justify-center rounded bg-border text-muted hover:text-surface">
                    <Plus size={12} />
                  </button>
                  <button onClick={() => removeLine(l.productId)} className="text-muted hover:text-red ml-1">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="border-t border-border pt-3 mb-4 flex items-center justify-between">
          <span className="text-sm text-muted">Total</span>
          <span className="font-grotesk font-bold text-xl text-gold">{formatMoney(total)}</span>
        </div>

        <button className="btn-primary w-full justify-center" onClick={openCheckout} disabled={cart.length === 0}>
          Checkout
        </button>
      </div>

      {/* Checkout modal */}
      <Modal open={checkoutOpen} onClose={() => setCheckoutOpen(false)} title="Checkout">
        <div className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <span className="text-sm text-muted">Total due</span>
            <span className="font-grotesk font-bold text-xl text-gold">{formatMoney(total)}</span>
          </div>
          <div>
            <label className="label">Customer Name</label>
            <input className="input" value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Walk-in Customer" />
          </div>
          <div>
            <label className="label">Payment Method</label>
            <div className="grid grid-cols-2 gap-3">
              {(["momo", "card", "cash"] as const).map(m => (
                <button
                  key={m}
                  onClick={() => setPayMethod(m)}
                  className={`border-2 rounded-xl p-3 text-center transition-all ${
                    payMethod === m ? "border-gold bg-gold/5" : "border-border hover:border-muted"
                  }`}
                >
                  <div className="text-2xl mb-1">{m === "momo" ? "📱" : m === "card" ? "💳" : "💵"}</div>
                  <div className="text-xs font-semibold text-surface">{m === "momo" ? "Mobile Money" : m === "card" ? "Card" : "Cash"}</div>
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button className="btn-ghost" onClick={() => setCheckoutOpen(false)}>Cancel</button>
            <button className="btn-primary" onClick={handleCharge} disabled={charging}>
              {charging ? "Processing..." : `Charge ${formatMoney(total)}`}
            </button>
          </div>
        </div>
      </Modal>

      {/* Shift Management Modal */}
      <Modal
        open={shiftModalOpen}
        onClose={() => activeShift ? setShiftModalOpen(false) : null}
        title={activeShift ? "Close Shift" : "Open Shift"}
        width="max-w-sm"
      >
        <div className="space-y-4">
          {!activeShift ? (
            <>
              <p className="text-sm text-muted">Please enter the starting cash amount in the drawer to begin your shift.</p>
              <div>
                <label className="label">Opening Cash ({profile?.currency || "GH₵"})</label>
                <input
                  className="input"
                  type="number"
                  value={openingCash}
                  onChange={e => setOpeningCash(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <button className="btn-primary w-full justify-center" onClick={handleOpenShift}>
                Start Shift
              </button>
            </>
          ) : (
            <>
              <div className="space-y-2 text-sm text-muted">
                <div className="flex justify-between">
                  <span>Opened at:</span>
                  <span className="text-surface">{activeShift.openedAt.toDate().toLocaleString("en-GH")}</span>
                </div>
                <div className="flex justify-between">
                  <span>Opening Cash:</span>
                  <span className="text-surface">{formatMoney(activeShift.openingCash)}</span>
                </div>
              </div>
              <div className="border-t border-border pt-4">
                <label className="label">Actual Cash in Drawer</label>
                <input
                  className="input"
                  type="number"
                  value={actualCash}
                  onChange={e => setActualCash(e.target.value)}
                  placeholder="0.00"
                />
                <p className="text-[11px] text-muted mt-1">Count all cash in the drawer, including the opening float.</p>
              </div>
              <button className="btn-primary w-full justify-center bg-red hover:bg-red/80 border-red" onClick={handleCloseShift} disabled={closingShift}>
                {closingShift ? "Closing..." : "Close Shift & End Day"}
              </button>
            </>
          )}
        </div>
      </Modal>

      {/* Receipt modal */}
      <Modal open={!!receipt} onClose={() => setReceipt(null)} title="Sale Complete">
        {receipt && (
          <div>
            <div className="mb-5">
              <BrandedDocument
                profile={profile}
                docType="RECEIPT"
                docNumber={receipt.invoiceId.slice(0, 8).toUpperCase()}
                date={receipt.timestamp}
                clientName={receipt.customerName}
                items={receipt.items.map(l => ({ productName: l.productName, quantity: l.quantity, unitPrice: l.unitPrice }))}
                amount={receipt.amount}
                paymentMethod={receipt.method}
              />
            </div>
            <div className="flex gap-3 justify-end">
              <button className="btn-ghost" onClick={() => setReceipt(null)}><X size={14} /> Close</button>
              <button className="btn-primary" onClick={() => printReceipt("branded-doc")}>
                <Printer size={14} /> Print Receipt
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
