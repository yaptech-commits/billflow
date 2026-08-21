"use client";

/**
 * Hotel design note: this Room POS is a front-desk command surface, not a second
 * inventory system. Room state stays date-range/reservation based, while F&B,
 * minibar, laundry, and service extras reuse the existing product sale pipeline.
 */
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { BedDouble, CheckCircle2, CircleDollarSign, DoorOpen, LogOut, Plus, Printer, Search, UserRound, Users, X } from "lucide-react";
import HotelAccessGuard, { useHotelContext } from "@/components/hotel/HotelAccessGuard";
import { createPosSale, PosSaleResult, PosSaleRequest } from "@/lib/pos-api";
import { queueOfflineSale } from "@/lib/offline-sync";
import {
  FolioItem,
  GuestFolio,
  HotelRoom,
  PaymentMethod,
  Product,
  Reservation,
  getActiveShift,
  getGuestFolio,
  getHotelRooms,
  getProducts,
  getReservations,
  openShift,
} from "@/lib/db";
import { useAuth } from "@/lib/auth-context";
import { formatMoney } from "@/lib/utils";
import { printReceipt } from "@/lib/print-receipt";

const dateValue = (value: any) => value?.toDate?.() ?? (value ? new Date(value) : null);
const dateLabel = (value: any) => dateValue(value)?.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) || "—";
const nightsBetween = (start: any, end: any) => {
  const startDate = dateValue(start)?.getTime() || 0;
  const endDate = dateValue(end)?.getTime() || 0;
  return Math.max(1, Math.ceil((endDate - startDate) / 86400000));
};
const activeStatuses = ["booked", "checked_in"] as const;

function money(value: number, currency?: string) {
  return formatMoney(Math.max(0, Number(value) || 0), currency);
}

function roomStatusLabel(room: HotelRoom, reservation?: Reservation) {
  if (room.occupancyStatus === "occupied") return "Occupied";
  if (reservation?.status === "booked") return "Reserved";
  if (room.status === "out_of_service") return "Out of service";
  if (room.status === "dirty") return "Dirty";
  return "Free";
}

function roomTone(room: HotelRoom, reservation?: Reservation) {
  if (room.occupancyStatus === "occupied") return "border-blue/45 bg-blue/10";
  if (reservation?.status === "booked") return "border-gold/50 bg-gold/10";
  if (room.status === "out_of_service") return "border-border bg-white/[0.03] opacity-70";
  if (room.status === "dirty") return "border-red/40 bg-red/10";
  return "border-green/35 bg-green/10";
}

export default function HotelRoomPosPage() {
  return <HotelAccessGuard><RoomPosContent /></HotelAccessGuard>;
}

function RoomPosContent() {
  const { user } = useAuth();
  const { businessId, propertyId, propertyName, profile } = useHotelContext();
  const [rooms, setRooms] = useState<HotelRoom[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [activeShift, setActiveShift] = useState<any>(null);
  const [selectedRoom, setSelectedRoom] = useState<HotelRoom | null>(null);
  const [folio, setFolio] = useState<GuestFolio | null>(null);
  const [productSearch, setProductSearch] = useState("");
  const [extraLines, setExtraLines] = useState<Array<{ product: Product; quantity: number }>>([]);
  const [includeRoomCharge, setIncludeRoomCharge] = useState(true);
  const [amountPaidInput, setAmountPaidInput] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [checkoutAfterPosting, setCheckoutAfterPosting] = useState(false);
  const [posting, setPosting] = useState(false);
  const [lastSale, setLastSale] = useState<PosSaleResult | null>(null);
  const [openingCash, setOpeningCash] = useState("");
  const [openingShift, setOpeningShift] = useState(false);
  const [loading, setLoading] = useState(true);

  const currency = profile?.currency;
  const selectedReservation = useMemo(() => selectedRoom ? reservations.find(item => item.roomId === selectedRoom.id && activeStatuses.includes(item.status as any)) : undefined, [selectedRoom, reservations]);
  const selectedRoomFolioItems = folio?.items || [];
  const priorRoomCharges = selectedRoomFolioItems.filter(item => item.type === "room_charge" && !item.isVoided).reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const priorDeposits = Number(folio?.depositsTotal || 0);
  const reservationAmountPaid = Number(selectedReservation?.amountPaid || 0);
  const stayBalance = selectedReservation ? Math.max(0, Number(selectedReservation.totalAmount || 0) - Math.max(priorRoomCharges + priorDeposits, reservationAmountPaid)) : 0;
  const nights = selectedReservation ? nightsBetween(selectedReservation.checkInDate, selectedReservation.checkOutDate) : 1;
  const extrasSubtotal = extraLines.reduce((sum, line) => sum + Number(line.product.price || 0) * line.quantity, 0);
  const roomSubtotal = includeRoomCharge ? stayBalance : 0;
  const subtotal = roomSubtotal + extrasSubtotal;
  const taxRate = typeof profile?.taxRate === "number" ? profile.taxRate : 0;
  const taxAmount = profile?.taxInclusive ? subtotal - subtotal / (1 + taxRate / 100 || 1) : subtotal * (taxRate / 100);
  const totalDue = Math.max(0, profile?.taxInclusive ? subtotal : subtotal + taxAmount);
  const amountToApply = amountPaidInput === "" ? totalDue : Math.max(0, Number(amountPaidInput) || 0);
  const filteredProducts = useMemo(() => {
    const term = productSearch.trim().toLowerCase();
    if (!term) return [];
    return products.filter(product => `${product.name} ${product.sku || ""} ${product.category || ""}`.toLowerCase().includes(term)).slice(0, 8);
  }, [products, productSearch]);

  const load = async () => {
    if (!businessId || !user) return;
    setLoading(true);
    try {
      const [nextRooms, nextReservations, nextProducts, nextShift] = await Promise.all([
        getHotelRooms(businessId, propertyId),
        getReservations(businessId, propertyId),
        getProducts(businessId),
        getActiveShift(businessId, user.uid),
      ]);
      setRooms(nextRooms.sort((a, b) => a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true })));
      setReservations(nextReservations);
      setProducts(nextProducts);
      setActiveShift(nextShift);
    } catch (error: any) {
      toast.error(error.message || "Could not load Room POS");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [businessId, propertyId, user?.uid]);

  useEffect(() => {
    let mounted = true;
    if (!businessId || !selectedReservation?.id) {
      setFolio(null);
      return () => { mounted = false; };
    }
    getGuestFolio(businessId, selectedReservation.id)
      .then(value => { if (mounted) setFolio(value); })
      .catch((error: any) => { if (mounted) toast.error(error.message || "Could not load guest folio"); });
    return () => { mounted = false; };
  }, [businessId, selectedReservation?.id]);

  const selectRoom = (room: HotelRoom) => {
    setSelectedRoom(room);
    setExtraLines([]);
    setProductSearch("");
    setAmountPaidInput("");
    setCheckoutAfterPosting(false);
    setLastSale(null);
  };

  const addProduct = (product: Product) => {
    setExtraLines(current => {
      const existing = current.find(line => line.product.id === product.id);
      if (existing) return current.map(line => line.product.id === product.id ? { ...line, quantity: line.quantity + 1 } : line);
      return [...current, { product, quantity: 1 }];
    });
    setProductSearch("");
  };

  const updateQuantity = (productId: string, quantity: number) => {
    setExtraLines(current => quantity <= 0 ? current.filter(line => line.product.id !== productId) : current.map(line => line.product.id === productId ? { ...line, quantity } : line));
  };

  const startShift = async (event: FormEvent) => {
    event.preventDefault();
    if (!businessId || !user) return;
    setOpeningShift(true);
    try {
      await openShift({ businessId, userId: user.uid, userName: user.email || "Front Desk", openingCash: Math.max(0, Number(openingCash) || 0) });
      toast.success("Front-desk shift opened");
      setOpeningCash("");
      await load();
    } catch (error: any) {
      toast.error(error.message || "Could not open shift");
    } finally {
      setOpeningShift(false);
    }
  };

  const postSale = async (event: FormEvent) => {
    event.preventDefault();
    if (!businessId || !user || !activeShift?.id || !selectedRoom || !selectedReservation?.id) return;
    if (subtotal <= 0) return toast.error("Add a room balance or at least one extra charge");
    if (amountToApply > totalDue + 0.01) return toast.error("Payment cannot exceed the current folio charge");
    setPosting(true);
    try {
      const idempotencyKey = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `room-pos-${Date.now()}`;
      const saleData: PosSaleRequest = {
        idempotencyKey,
        shiftId: activeShift.id,
        customerName: selectedReservation.guestName,
        items: extraLines.map(line => ({ productId: line.product.id!, quantity: line.quantity, folioType: line.product.category?.toLowerCase().includes("food") || line.product.category?.toLowerCase().includes("drink") ? "food_beverage" : "service" })),
        paymentMethod,
        amountPaid: amountToApply,
        reference: `ROOM-${selectedRoom.roomNumber}-${Date.now().toString(36).toUpperCase()}`,
        roomCharge: includeRoomCharge && stayBalance > 0 ? { description: `Room ${selectedRoom.roomNumber} · ${nights} night${nights === 1 ? "" : "s"} stay balance`, quantity: 1, unitPrice: stayBalance } : undefined,
        hotelContext: { propertyId, reservationId: selectedReservation.id, guestId: selectedReservation.guestId, roomId: selectedRoom.id, roomNumber: selectedRoom.roomNumber, checkout: checkoutAfterPosting },
      };
      const offline = typeof window !== "undefined" && (!navigator.onLine || localStorage.getItem("billflow_offline_mode") === "true");
      if (offline) {
        const queued = queueOfflineSale({ ...saleData, businessId, userId: user.uid });
        if (!queued) throw new Error("Offline queue is unavailable on this device");
        const localResult: PosSaleResult = {
          invoiceId: `OFFLINE-${queued.id.slice(0, 8)}`,
          amount: totalDue,
          subtotal,
          taxAmount,
          discountAmount: 0,
          amountPaid: amountToApply,
          items: [
            ...(includeRoomCharge && stayBalance > 0 ? [{ productId: `room-${selectedRoom.id}`, productName: `Room ${selectedRoom.roomNumber} · ${nights} night${nights === 1 ? "" : "s"} stay balance`, quantity: 1, unitPrice: stayBalance } as any] : []),
            ...extraLines.map(line => ({ productId: line.product.id!, productName: line.product.name, quantity: line.quantity, unitPrice: Number(line.product.price || 0) } as any)),
          ],
          duplicate: false,
        };
        setLastSale(localResult);
        toast.success(checkoutAfterPosting ? "Folio charge queued; checkout will complete when online" : "Folio charge saved offline; it will sync when online");
      } else {
        const result = await createPosSale(saleData);
        setLastSale(result);
        toast.success(checkoutAfterPosting ? "Folio posted and guest checked out" : result.amountPaid && result.amountPaid < result.amount ? "Partial payment posted to folio" : "Charge posted to guest folio");
      }
      setExtraLines([]);
      setProductSearch("");
      setAmountPaidInput("");
      if (checkoutAfterPosting) setSelectedRoom(null);
      await load();
      if (!checkoutAfterPosting && selectedReservation.id) setFolio(await getGuestFolio(businessId, selectedReservation.id));
    } catch (error: any) {
      toast.error(error.message || "Could not post Room POS charge");
    } finally {
      setPosting(false);
    }
  };

  const printLastSale = () => {
    if (!lastSale || !selectedReservation) return;
    printReceipt({
      invoiceNumber: lastSale.invoiceId,
      issuedAt: new Date(),
      dueDate: new Date(),
      items: lastSale.items,
      subtotal: lastSale.subtotal,
      taxAmount: lastSale.taxAmount,
      taxRate,
      taxLabel: profile?.taxLabel || "Tax",
      total: lastSale.amount,
      amountPaid: lastSale.amountPaid,
      paymentMethod,
      customerName: `${selectedReservation.guestName} · Room ${selectedReservation.roomNumber || selectedRoom?.roomNumber || "—"}`,
      cashierName: user?.email || "Front Desk",
      currencyCode: currency,
      footerNote: profile?.footerNote,
      logoDataUrl: profile?.logoDataUrl,
      businessName: propertyName,
    });
  };

  const freeRooms = rooms.filter(room => room.occupancyStatus === "vacant" && !reservations.some(item => item.roomId === room.id && item.status === "booked"));
  const reservedRooms = rooms.filter(room => reservations.some(item => item.roomId === room.id && item.status === "booked"));
  const occupiedRooms = rooms.filter(room => room.occupancyStatus === "occupied");
  const outOfService = rooms.filter(room => room.status === "out_of_service");

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div><p className="text-[10px] text-gold uppercase tracking-[0.22em] font-bold">{propertyName}</p><h1 className="font-grotesk text-2xl font-bold text-white mt-1">Room POS</h1><p className="text-sm text-muted mt-1">Tap a room to open its reservation, guest folio, extras, and checkout actions.</p></div>
        <div className="flex items-center gap-2 text-xs text-muted"><DoorOpen size={18} className="text-gold" /> {activeShift ? <span>Shift open</span> : <span>Shift required</span>}</div>
      </div>

      {!activeShift && <section className="card border-gold/30 bg-gold/5"><div className="flex items-center gap-2 mb-1"><CircleDollarSign size={18} className="text-gold" /><h2 className="font-grotesk font-semibold text-white">Open front-desk shift</h2></div><p className="text-xs text-muted mb-4">Room POS charges use the same shift and reconciliation pipeline as the regular POS.</p><form onSubmit={startShift} className="flex flex-col sm:flex-row gap-2 max-w-xl"><input className="input" type="number" min="0" step="0.01" placeholder="Opening cash (optional)" value={openingCash} onChange={event => setOpeningCash(event.target.value)} /><button className="btn-primary justify-center" disabled={openingShift}>{openingShift ? "Opening…" : "Open shift"}</button></form></section>}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3"><div className="card"><p className="text-[10px] text-muted uppercase">Free</p><p className="text-2xl text-green font-bold mt-1">{freeRooms.length}</p></div><div className="card"><p className="text-[10px] text-muted uppercase">Reserved</p><p className="text-2xl text-gold font-bold mt-1">{reservedRooms.length}</p></div><div className="card"><p className="text-[10px] text-muted uppercase">Occupied</p><p className="text-2xl text-blue font-bold mt-1">{occupiedRooms.length}</p></div><div className="card"><p className="text-[10px] text-muted uppercase">Dirty</p><p className="text-2xl text-red font-bold mt-1">{rooms.filter(room => room.status === "dirty").length}</p></div><div className="card"><p className="text-[10px] text-muted uppercase">Out of service</p><p className="text-2xl text-muted font-bold mt-1">{outOfService.length}</p></div></div>

      <div className="grid grid-cols-12 gap-5 items-start">
        <section className="card col-span-12 xl:col-span-7">
          <div className="flex items-center justify-between mb-4"><div><h2 className="font-grotesk font-semibold text-white">Room board</h2><p className="text-xs text-muted mt-1">Free rooms have no blocking reservation for the current room inventory.</p></div><BedDouble size={20} className="text-gold" /></div>
          {loading ? <p className="text-sm text-muted py-10 text-center">Loading rooms…</p> : rooms.length === 0 ? <div className="py-10 text-center border border-dashed border-border rounded-xl"><BedDouble size={24} className="mx-auto text-muted mb-2" /><p className="text-sm text-muted">No rooms configured yet.</p><Link href="/hotel/rooms" className="btn-ghost inline-flex mt-3">Configure rooms</Link></div> : <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">{rooms.map(room => { const reservation = reservations.find(item => item.roomId === room.id && activeStatuses.includes(item.status as any)); const isSelected = selectedRoom?.id === room.id; return <button type="button" key={room.id} disabled={room.status === "out_of_service"} onClick={() => selectRoom(room)} className={`text-left p-3 rounded-xl border transition-all hover:-translate-y-0.5 ${roomTone(room, reservation)} ${isSelected ? "ring-2 ring-gold ring-offset-2 ring-offset-[#08111d]" : ""}`}><div className="flex items-start justify-between gap-2"><div><p className="text-lg text-white font-bold">{room.roomNumber}</p><p className="text-xs text-muted">{room.roomType}</p></div><span className="text-[10px] text-muted">F{room.floor}</span></div><div className="mt-4 flex items-center justify-between gap-2"><span className={`text-[10px] uppercase font-bold ${room.occupancyStatus === "occupied" ? "text-blue" : reservation ? "text-gold" : room.status === "dirty" ? "text-red" : room.status === "out_of_service" ? "text-muted" : "text-green"}`}>{roomStatusLabel(room, reservation)}</span><span className="text-xs text-white">{money(room.baseRate, currency)}</span></div>{reservation && <p className="text-[11px] text-muted mt-2 truncate"><UserRound size={11} className="inline mr-1" />{reservation.guestName}</p>}</button>; })}</div>}
        </section>

        <section className="card col-span-12 xl:col-span-5 xl:sticky xl:top-5">
          {!selectedRoom ? <div className="py-16 text-center"><DoorOpen size={30} className="mx-auto text-muted mb-3" /><p className="text-sm text-muted">Select a room to open its front-desk panel.</p></div> : <>
            <div className="flex items-start justify-between gap-3 mb-4"><div><p className="text-[10px] text-gold uppercase tracking-wider font-bold">Room {selectedRoom.roomNumber}</p><h2 className="font-grotesk font-semibold text-white mt-1">{selectedReservation?.guestName || "Room activity"}</h2><p className="text-xs text-muted mt-1">{selectedReservation ? `${selectedReservation.confirmationCode} · ${selectedReservation.status === "checked_in" ? "Checked in" : "Reserved"}` : "No active reservation"}</p></div><button type="button" className="btn-icon" aria-label="Close Room POS panel" onClick={() => setSelectedRoom(null)}><X size={16} /></button></div>
            {!selectedReservation ? <div className="p-4 rounded-xl border border-dashed border-border text-center"><p className="text-sm text-muted">This room does not have an active reservation to bill.</p><Link href="/hotel/reservations" className="btn-primary inline-flex mt-4">Create reservation</Link></div> : <>
              <div className="p-3 rounded-xl border border-border bg-white/[0.03] mb-4"><div className="flex items-center justify-between"><span className="text-xs text-muted">Stay</span><span className="text-xs text-white">{dateLabel(selectedReservation.checkInDate)} → {dateLabel(selectedReservation.checkOutDate)}</span></div><div className="flex items-center justify-between mt-2"><span className="text-xs text-muted">Open folio balance</span><span className={`text-sm font-bold ${Number(folio?.balanceDue || 0) > 0 ? "text-gold" : "text-green"}`}>{money(folio?.balanceDue || 0, currency)}</span></div><div className="grid grid-cols-3 gap-2 mt-3 text-[11px]"><span className="text-muted">Charges <b className="text-white block mt-1">{money(folio?.chargesTotal || 0, currency)}</b></span><span className="text-muted">Paid <b className="text-white block mt-1">{money((folio?.paymentsTotal || 0) + (folio?.depositsTotal || 0), currency)}</b></span><span className="text-muted">Room due <b className="text-white block mt-1">{money(stayBalance, currency)}</b></span></div></div>

              <form onSubmit={postSale} className="space-y-3">
                <label className="flex items-start gap-2 p-3 rounded-lg border border-gold/25 bg-gold/5 cursor-pointer"><input type="checkbox" checked={includeRoomCharge} onChange={event => setIncludeRoomCharge(event.target.checked)} className="mt-0.5" /><span><span className="text-sm text-white font-semibold block">Post room stay balance</span><span className="text-[11px] text-muted">{nights} night{nights === 1 ? "" : "s"} · {money(stayBalance, currency)}</span></span></label>
                <div><label className="label">Add F&B, minibar, laundry, or service</label><div className="relative"><Search size={14} className="absolute left-3 top-2.5 text-muted" /><input className="input pl-8" placeholder="Search existing products" value={productSearch} onChange={event => setProductSearch(event.target.value)} />{filteredProducts.length > 0 && <div className="absolute z-20 left-0 right-0 mt-1 rounded-lg border border-border bg-[#101c2b] shadow-2xl overflow-hidden">{filteredProducts.map(product => <button type="button" key={product.id} onClick={() => addProduct(product)} className="w-full text-left px-3 py-2.5 hover:bg-gold/10 flex items-center justify-between"><span><span className="text-sm text-white block">{product.name}</span><span className="text-[10px] text-muted">{product.category || "Service"} · stock {product.stockQty}</span></span><span className="text-xs text-gold">{money(product.price, currency)}</span></button>)}</div>}</div></div>
                {extraLines.length > 0 && <div className="space-y-2">{extraLines.map(line => <div key={line.product.id} className="flex items-center gap-2 p-2 rounded-lg bg-white/[0.03] border border-border"><div className="min-w-0 flex-1"><p className="text-xs text-white truncate">{line.product.name}</p><p className="text-[10px] text-muted">{money(line.product.price, currency)} each</p></div><input className="input w-16 py-1.5 text-center" type="number" min="1" max={line.product.stockQty} value={line.quantity} onChange={event => updateQuantity(line.product.id!, Number(event.target.value))} /><span className="text-xs text-white w-16 text-right">{money(line.product.price * line.quantity, currency)}</span><button type="button" className="text-muted hover:text-red" onClick={() => updateQuantity(line.product.id!, 0)} aria-label={`Remove ${line.product.name}`}><X size={14} /></button></div>)}</div>}
                <div className="p-3 rounded-lg border border-border space-y-2"><div className="flex justify-between text-xs text-muted"><span>Subtotal</span><span className="text-white">{money(subtotal, currency)}</span></div>{taxRate > 0 && <div className="flex justify-between text-xs text-muted"><span>{profile?.taxLabel || "Tax"} {profile?.taxInclusive ? "included" : `(${taxRate}%)`}</span><span className="text-white">{money(taxAmount, currency)}</span></div>}<div className="flex justify-between pt-2 border-t border-border"><span className="text-sm text-white font-semibold">Charge now</span><span className="text-lg text-gold font-bold">{money(totalDue, currency)}</span></div></div>
                <div><label className="label">Amount paid now</label><input className="input" type="number" min="0" step="0.01" max={totalDue} placeholder={String(totalDue)} value={amountPaidInput} onChange={event => setAmountPaidInput(event.target.value)} /></div>
                <div><label className="label">Payment method</label><select className="input" value={paymentMethod} onChange={event => setPaymentMethod(event.target.value as PaymentMethod)}><option value="cash">Cash payment</option><option value="momo">Mobile Money</option><option value="card">Card</option></select></div>
                {selectedReservation.status === "checked_in" && <label className="flex items-center gap-2 text-xs text-muted"><input type="checkbox" checked={checkoutAfterPosting} onChange={event => setCheckoutAfterPosting(event.target.checked)} /> Complete checkout after posting this folio charge</label>}
                <button className="btn-primary w-full justify-center" disabled={posting || !activeShift || totalDue <= 0}>{posting ? "Posting…" : checkoutAfterPosting ? "Post & check out" : "Post to guest folio"}</button>
                {lastSale && <div className="p-3 rounded-lg border border-green/30 bg-green/10"><div className="flex items-center gap-2 text-green text-sm font-semibold"><CheckCircle2 size={15} /> Charge saved</div><p className="text-[11px] text-muted mt-1">Invoice {lastSale.invoiceId} · {money(lastSale.amountPaid || 0, currency)} paid now</p><button type="button" className="btn-ghost mt-2 text-xs" onClick={printLastSale}><Printer size={13} /> Print receipt</button></div>}
              </form>

              {selectedRoomFolioItems.length > 0 && <div className="mt-5 pt-4 border-t border-border"><div className="flex items-center justify-between mb-2"><h3 className="text-xs text-white uppercase tracking-wider font-bold">Folio history</h3><span className="text-[10px] text-muted">{selectedRoomFolioItems.length} entries</span></div><div className="space-y-2 max-h-48 overflow-auto">{selectedRoomFolioItems.slice(0, 12).map((item: FolioItem) => <div key={item.id} className="flex justify-between gap-3 text-[11px]"><span className="text-muted truncate">{item.description}</span><span className={item.type === "payment" || item.type === "deposit" ? "text-green" : "text-white"}>{money(item.amount, currency)}</span></div>)}</div></div>}
            </>}
          </>}
        </section>
      </div>
    </div>
  );
}
