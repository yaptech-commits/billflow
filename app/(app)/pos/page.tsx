"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  getProducts, getClients, getBusinessProfile, Product, Client,
  InvoiceLineItem, PaymentMethod, BusinessProfile, Shift, getActiveShift, openShift, closeShift,
  getCategories, Category, calculateTax
} from "@/lib/db";
import { getProductByBarcode } from "@/lib/pharmacy-db";
import { createPosSale } from "@/lib/pos-api";
import { formatMoney, cn } from "@/lib/utils";
import Modal from "@/components/ui/Modal";
import BrandedDocument from "@/components/BrandedDocument";
import toast from "react-hot-toast";
import { Search, Plus, Minus, Trash2, ShoppingCart, Printer, X, Wifi, WifiOff, ArrowRight, CreditCard, Camera, Bluetooth } from "lucide-react";
import { printReceipt } from "@/lib/print-receipt";
import { isBluetoothPrintingSupported, printReceiptOverBluetooth } from "@/lib/bluetooth-printer";
import { queueOfflineSale, syncAllOfflineData, getOfflineQueue, checkAndEnforceThreeDayOnlineAutoSwitch } from "@/lib/offline-sync";
import { createSafeId } from "@/lib/safe-id";

interface CartLine {
  productId: string;
  productName: string;
  unitPrice: number;
  quantity: number;
  maxStock: number;
}

const CASH_DENOMINATIONS = [200, 100, 50, 20, 10, 5, 2, 1, 0.5, 0.2, 0.1];

export default function PosPage() {
  const { user, businessId, role } = useAuth();
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
  const videoRef = useRef<HTMLVideoElement>(null);
  const [cameraOpen, setCameraOpen] = useState(false);

  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [customerName, setCustomerName] = useState("Walk-in Customer");
  const [payMethod, setPayMethod] = useState<PaymentMethod>("cash");
  const [amountReceived, setAmountReceived] = useState<string>("");
  const [charging, setCharging] = useState(false);
  const [bluetoothPrinting, setBluetoothPrinting] = useState(false);

  // Shift state
  const [activeShift, setActiveShift] = useState<Shift | null>(null);
  const [shiftModalOpen, setShiftModalOpen] = useState(false);
  const [openingCash, setOpeningCash] = useState("0");
  const [actualCash, setActualCash] = useState("0");
  const [cashCountByDenomination, setCashCountByDenomination] = useState<Record<string, string>>({});
  const [reconciliationNote, setReconciliationNote] = useState("");
  const [closingShift, setClosingShift] = useState(false);

  const [receipt, setReceipt] = useState<{
    invoiceId: string;
    amount: number;
    subtotal: number;
    discountAmount: number;
    taxAmount: number;
    items: CartLine[];
    customerName: string;
    method: PaymentMethod;
    timestamp: Date;
    amountPaid: number;
    change: number;
  } | null>(null);
  const [receiptWidth, setReceiptWidth] = useState<58 | 80>(80);
  const [isOnline, setIsOnline] = useState(true);
  const [isForcedOffline, setIsForcedOffline] = useState(false);
  const [offlineCount, setOfflineCount] = useState(0);
  const [isWholesale, setIsWholesale] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [discountAmount, setDiscountAmount] = useState<string>("");
  const canApplyDiscount = role === "owner" || role === "super_admin" || profile?.allowStaffDiscounts === true;
  const countedCash = useMemo(
    () => CASH_DENOMINATIONS.reduce((total, denomination) => total + denomination * (Number(cashCountByDenomination[String(denomination)]) || 0), 0),
    [cashCountByDenomination]
  );

  useEffect(() => {
    if (!canApplyDiscount) setDiscountAmount("");
  }, [canApplyDiscount]);

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

  useEffect(() => { 
    load(); 
    window.addEventListener("billflow_refresh", load);
    return () => window.removeEventListener("billflow_refresh", load);
  }, [user, businessId]);

  useEffect(() => {
    const checkStatus = () => {
      const switched = checkAndEnforceThreeDayOnlineAutoSwitch();
      if (switched) {
        toast.success("Automatic sync: 3-day offline limit reached. Switched back to Online mode and syncing queue!");
      }
      setIsOnline(navigator.onLine);
      setIsForcedOffline(localStorage.getItem("billflow_offline_mode") === "true");
    };

    const handleOnline = () => {
      setIsOnline(true);
      syncAllOfflineData({
        sale: async (data: any) => {
          if (!activeShift?.id) throw new Error("No active shift for offline sale sync");
          return createPosSale({
            ...data,
            shiftId: activeShift.id,
            idempotencyKey: data.idempotencyKey || createSafeId("pos"),
          });
        },
        invoice: async (data: any) => {
          const res = await fetch("/api/invoices", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
          });
          if (!res.ok) throw new Error("Failed to sync offline invoice");
          return res.json();
        },
        payment: async (data: any) => {
          const res = await fetch("/api/payments", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
          });
          if (!res.ok) throw new Error("Failed to sync offline payment");
          return res.json();
        }
      }).then(({ synced, failed }) => {
        if (synced > 0) {
          toast.success(`Synced ${synced} offline transactions!`);
          load();
        }
        if (failed > 0) console.warn(`${failed} offline transactions will be retried.`);
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

  useEffect(() => {
    if (!cameraOpen) return;
    let stream: MediaStream | null = null;
    let cancelled = false;
    let animationFrame = 0;

    const startCamera = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        toast.error("Camera scanning is not supported on this device.");
        setCameraOpen(false);
        return;
      }
      const BarcodeDetectorCtor = (window as Window & { BarcodeDetector?: new (options?: { formats?: string[] }) => { detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue?: string }>> } }).BarcodeDetector;
      if (!BarcodeDetectorCtor) {
        toast.error("This browser does not support camera barcode scanning. Use the search field or a USB/Bluetooth scanner.");
        setCameraOpen(false);
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
        if (cancelled || !videoRef.current) return;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        const detector = new BarcodeDetectorCtor({ formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "qr_code"] });
        const scanFrame = async () => {
          if (cancelled || !videoRef.current) return;
          try {
            const results = await detector.detect(videoRef.current);
            const code = results[0]?.rawValue?.trim();
            if (code) {
              setScanValue(code);
              setSearch(code);
              setCameraOpen(false);
              const barcodeRecord = businessId ? await getProductByBarcode(businessId, code) : null;
              const exact = products.find(p => p.sku?.toLowerCase() === code.toLowerCase())
                ?? products.find(p => p.id === barcodeRecord?.productId);
              if (exact) {
                addToCart(exact);
                toast.success(`${exact.name} added`, { duration: 1200 });
              } else {
                toast.error(`No product found for barcode "${code}"`);
              }
              return;
            }
          } catch {
            // Continue scanning; camera frames can be unavailable while autofocus settles.
          }
          animationFrame = window.requestAnimationFrame(() => { void scanFrame(); });
        };
        animationFrame = window.requestAnimationFrame(() => { void scanFrame(); });
      } catch (error: any) {
        toast.error(error?.name === "NotAllowedError" ? "Camera permission was denied." : "Could not start the camera scanner.");
        setCameraOpen(false);
      }
    };
    void startCamera();
    return () => {
      cancelled = true;
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      stream?.getTracks().forEach(track => track.stop());
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, [cameraOpen, businessId, products]);

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

  const handleScanSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const term = scanValue.trim();
    if (!term) return;
    const normalizedTerm = term.toLowerCase();
    const barcodeRecord = businessId ? await getProductByBarcode(businessId, term) : null;
    const bySku = products.find(p => p.sku && p.sku.toLowerCase() === normalizedTerm);
    const byMappedBarcode = products.find(p => p.id === barcodeRecord?.productId);
    const match = bySku ?? byMappedBarcode ?? products.find(p => p.name.toLowerCase().includes(normalizedTerm));
    if (match) {
      addToCart(match);
      toast.success(`${match.name} added`, { duration: 1200 });
    } else {
      toast.error(`No product found for "${term}"`);
    }
    setScanValue("");
    setSearch("");
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

  const subtotal = cart.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0);
  const discountVal = parseFloat(discountAmount) || 0;
  const taxRate = profile?.taxRate ?? 0;
  const taxBreakdown = calculateTax(subtotal, {
    taxRate,
    taxInclusive: profile?.taxInclusive === true,
    discountAmount: discountVal,
  });
  const tax = taxBreakdown.taxAmount;
  const total = taxBreakdown.total;

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
    setPayMethod("cash");
    setAmountReceived("");
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
      const denominationCounts = Object.fromEntries(
        Object.entries(cashCountByDenomination)
          .map(([denomination, count]) => [denomination, Number(count) || 0])
          .filter(([, count]) => Number(count) > 0)
      );
      await closeShift(activeShift.id, parseFloat(actualCash) || 0, {
        cashCountByDenomination: denominationCounts,
        reconciliationNote,
      });
      toast.success("Shift closed successfully");
      setActiveShift(null);
      setShiftModalOpen(true);
      setActualCash("0");
      setCashCountByDenomination({});
      setReconciliationNote("");
    } catch (err: any) {
      toast.error(err.message || "Could not close shift");
    } finally {
      setClosingShift(false);
    }
  };

  const handleBluetoothPrint = async () => {
    if (!receipt || !profile) return;
    setBluetoothPrinting(true);
    try {
      await printReceiptOverBluetooth({
        businessName: profile.businessName,
        invoiceNumber: receipt.invoiceId,
        issuedAt: receipt.timestamp,
        customerName: receipt.customerName,
        items: receipt.items.map(item => ({ name: item.productName, quantity: item.quantity, unitPrice: item.unitPrice })),
        subtotal: receipt.subtotal,
        discountAmount: receipt.discountAmount,
        taxAmount: receipt.taxAmount,
        total: receipt.amount,
        paymentMethod: receipt.method,
        amountPaid: receipt.amountPaid,
        change: receipt.change,
        currencyCode: profile.currency || "GHS",
      }, receiptWidth);
      toast.success("Receipt sent to the Bluetooth printer");
    } catch (err: any) {
      toast.error(err?.message || "Could not print to the Bluetooth printer");
    } finally {
      setBluetoothPrinting(false);
    }
  };

  const handleCharge = async () => {
    if (!user || !businessId) return;
    if (businessId === "SUPER_ADMIN") {
      toast.error("Please select a specific business to process sales.");
      return;
    }
    if (!activeShift) {
      toast.error("You must open a shift before making sales");
      setShiftModalOpen(true);
      return;
    }

    if (discountVal > 0 && !canApplyDiscount) {
      toast.error("Discounts are disabled for salesperson accounts. Ask the business owner to enable them in Settings.");
      setDiscountAmount("");
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
                subtotal,
                discountAmount: discountVal,
                taxAmount: result.taxAmount,
                items: cart,
                customerName: customerName || "Walk-in Customer",
                method: payMethod,
                timestamp: new Date(),
                amountPaid: result.amount,
                change: 0,
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
          subtotal,
          discountAmount: discountVal,
          taxAmount: tax,
          items: cart,
          customerName: customerName || "Walk-in Customer",
          method: payMethod,
          timestamp: new Date(),
          amountPaid: payMethod === "cash" ? (parseFloat(amountReceived) || total) : total,
          change: payMethod === "cash" ? Math.max(0, (parseFloat(amountReceived) || total) - total) : 0,
        });
        setOfflineCount(getOfflineQueue().length);
      } else {
        const result = await createPosSale({
          ...saleData,
          shiftId: activeShift.id!,
          idempotencyKey: createSafeId("pos"),
        });
        setReceipt({
          invoiceId: result.invoiceId,
          amount: result.amount,
          subtotal,
          discountAmount: discountVal,
          taxAmount: result.taxAmount,
          items: cart,
          customerName: customerName || "Walk-in Customer",
          method: payMethod,
          timestamp: new Date(),
          amountPaid: payMethod === "cash" ? (parseFloat(amountReceived) || total) : total,
          change: payMethod === "cash" ? Math.max(0, (parseFloat(amountReceived) || total) - total) : 0,
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

        <div className="flex items-stretch gap-2 mb-5">
          <form onSubmit={handleScanSubmit} className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" size={20} />
            <input
              ref={scanRef}
              className="input pl-12 h-14 text-lg font-grotesk w-full"
              placeholder="Scan barcode or search products..."
              value={scanValue}
              onChange={e => {
                const value = e.target.value;
                setScanValue(value);
                setSearch(value);
              }}
              aria-label="Search products or scan a barcode"
            />
          </form>
          <button type="button" onClick={() => setCameraOpen(true)} className="btn-ghost h-14 w-14 shrink-0 justify-center border border-border" title="Scan with camera" aria-label="Scan barcode with camera">
            <Camera size={20} className="text-gold" />
          </button>
        </div>
        {search.trim() && <p className="text-[11px] text-muted -mt-3 mb-4" aria-live="polite">Showing products matching <span className="font-bold text-surface">{search}</span> · {filteredProducts.length} result{filteredProducts.length === 1 ? "" : "s"}</p>}

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
            <div className="flex justify-between text-sm text-muted"><span>Subtotal</span><span>{formatMoney(subtotal, profile?.currency || "GHS")}</span></div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm text-muted">Discount</span>
              <input
                type="number"
                min="0"
                max={subtotal}
                step="0.01"
                className="bg-transparent border-b border-border text-right text-sm font-bold text-green w-20 focus:border-gold outline-none disabled:opacity-40 disabled:cursor-not-allowed"
                placeholder={canApplyDiscount ? "0.00" : "Owner only"}
                value={discountAmount}
                onChange={e => setDiscountAmount(e.target.value)}
                disabled={!canApplyDiscount}
                title={canApplyDiscount ? "Apply a checkout discount" : "Ask the business owner to enable salesperson discounts in Settings"}
              />
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

            {payMethod === "cash" && (
              <div>
                <label className="label">Amount Received ({profile?.currency || "GHS"})</label>
                <input 
                  className="input h-12 text-lg font-grotesk" 
                  type="number" 
                  placeholder="0.00" 
                  value={amountReceived} 
                  onChange={e => setAmountReceived(e.target.value)} 
                />
                {parseFloat(amountReceived) >= total && (
                  <div className="flex justify-between mt-2 text-green font-bold">
                    <span>Change:</span>
                    <span>{formatMoney(parseFloat(amountReceived) - total, profile?.currency || "GHS")}</span>
                  </div>
                )}
              </div>
            )}

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
            <button type="button" onClick={() => setReceiptWidth(58)} className={cn("px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-all", receiptWidth === 58 ? "bg-gold border-gold text-black" : "bg-white/5 border-border text-muted")}>58MM</button>
            <button type="button" onClick={() => setReceiptWidth(80)} className={cn("px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-all", receiptWidth === 80 ? "bg-gold border-gold text-black" : "bg-white/5 border-border text-muted")}>80MM</button>
          </div>
          <div className="flex max-h-[min(68vh,850px)] justify-center overflow-auto rounded-lg border border-border bg-white">
            <div id="receipt-content" className="w-full min-w-0">
              {receipt && (
                <BrandedDocument profile={profile} docType="INVOICE" docNumber={receipt.invoiceId.slice(-6).toUpperCase()} date={receipt.timestamp} clientName={receipt.customerName} items={receipt.items} amount={receipt.amount} subtotal={receipt.subtotal} discountAmount={receipt.discountAmount} taxAmount={receipt.taxAmount} taxRate={profile?.taxRate || 0} taxLabel={profile?.taxLabel || "VAT"} paymentMethod={receipt.method} amountPaid={receipt.amountPaid} currencyCode={profile?.currency || "GHS"} width={receiptWidth} paper />
              )}
            </div>
          </div>
          <div className="flex gap-3">
              <button 
                className="btn-ghost flex-1 justify-center gap-2" 
                onClick={() => {
                  if (!receipt || !profile) return;
                  printReceipt({
                    footerNote: profile.footerNote,
                    invoiceNumber: receipt.invoiceId,
                    issuedAt: receipt.timestamp,
                    dueDate: receipt.timestamp,
                    items: receipt.items,
                    subtotal: receipt.subtotal,
                    discountAmount: receipt.discountAmount,
                    taxAmount: receipt.taxAmount,
                    taxRate: profile?.taxRate || 0,
                    taxLabel: profile?.taxLabel || "VAT",
                    total: receipt.amount,
                    width: receiptWidth,
                    logoDataUrl: profile.logoDataUrl,
                    businessName: profile.businessName,
                    customerName: receipt.customerName,
                    currencyCode: profile?.currency || "GHS"
                  });
                }}
              >
                <Printer size={18} /> Print
              </button>
              {isBluetoothPrintingSupported() && (
                <button className="btn-ghost flex-1 justify-center gap-2" onClick={handleBluetoothPrint} disabled={bluetoothPrinting}>
                  <Bluetooth size={18} /> {bluetoothPrinting ? "Sending..." : "Bluetooth"}
                </button>
              )}
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
              <div className="space-y-4">
                <div>
                  <label className="label">Counted Cash by Denomination ({profile?.currency || "GHS"})</label>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    {CASH_DENOMINATIONS.map(denomination => (
                      <label key={denomination} className="flex items-center gap-2 rounded-lg border border-border bg-white/5 px-3 py-2">
                        <span className="text-xs text-muted min-w-12">{denomination}</span>
                        <input
                          className="input h-9 min-w-0 text-right text-sm"
                          type="number"
                          min="0"
                          step="1"
                          inputMode="numeric"
                          placeholder="0"
                          value={cashCountByDenomination[String(denomination)] || ""}
                          onChange={e => setCashCountByDenomination(previous => ({ ...previous, [String(denomination)]: e.target.value }))}
                          aria-label={`Count of ${denomination} denomination`}
                        />
                      </label>
                    ))}
                  </div>
                </div>
                <div className="rounded-xl border border-border bg-white/5 p-4 space-y-2">
                  <div className="flex justify-between text-xs text-muted"><span>Counted cash</span><span className="font-grotesk text-surface">{formatMoney(countedCash, profile?.currency || "GHS")}</span></div>
                  <div className="flex justify-between text-xs text-muted"><span>Expected cash</span><span className="font-grotesk text-surface">{formatMoney((activeShift.openingCash || 0) + (activeShift.paymentBreakdown?.cash || 0), profile?.currency || "GHS")}</span></div>
                  <div className="border-t border-border/50 pt-2 flex justify-between text-sm font-bold"><span>Difference</span><span className={cn("font-grotesk", countedCash - ((activeShift.openingCash || 0) + (activeShift.paymentBreakdown?.cash || 0)) === 0 ? "text-emerald-400" : "text-red-400")}>{formatMoney(countedCash - ((activeShift.openingCash || 0) + (activeShift.paymentBreakdown?.cash || 0)), profile?.currency || "GHS")}</span></div>
                </div>
                <div>
                  <label className="label">Final Actual Cash ({profile?.currency || "GHS"})</label>
                  <input className="input text-lg font-grotesk" type="number" inputMode="decimal" placeholder={countedCash.toFixed(2)} value={actualCash} onChange={e => setActualCash(e.target.value)} />
                  <p className="text-[10px] text-muted mt-2">This amount is stored as the final drawer count used for the official shift difference.</p>
                </div>
                <div>
                  <label className="label">Reconciliation Note <span className="text-muted font-normal">(optional)</span></label>
                  <textarea className="input min-h-20 resize-y" placeholder="Explain any shortage, overage, or adjustment" value={reconciliationNote} onChange={e => setReconciliationNote(e.target.value)} />
                </div>
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
