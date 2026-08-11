"use client";

/** Hotel design note: front-desk work is action-led—arrivals, departures, room states, and folios are always visible without leaving the desk. */
import { FormEvent, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { BedDouble, CalendarCheck, CircleDollarSign, ConciergeBell, LogIn, LogOut, Users, Wrench } from "lucide-react";
import HotelAccessGuard, { useHotelContext } from "@/components/hotel/HotelAccessGuard";
import {
  HotelRoom, GroupBlockBooking, Reservation, RoomStatus, RoomOccupancyStatus,
  createInvoice, createPayment, getGroupBlockBookings, getHotelRooms, getReservations,
  saveGroupBlockBooking, updateHotelRoomStatus, updateReservationStatus,
} from "@/lib/db";
import { useAuth } from "@/lib/auth-context";
import { formatMoney } from "@/lib/utils";
import { Timestamp } from "firebase/firestore";

function dateOnly(value: any) { return value?.toDate?.()?.toISOString().slice(0, 10) ?? ""; }
function isToday(value: any) { return dateOnly(value) === new Date().toISOString().slice(0, 10); }
function statusTone(room: HotelRoom) { if (room.occupancyStatus === "occupied") return "border-blue/30 bg-blue/10"; if (room.status === "dirty") return "border-red/30 bg-red/10"; if (room.status === "out_of_service") return "border-border bg-white/[0.03]"; return "border-green/30 bg-green/10"; }

export default function HotelFrontDeskPage() { return <HotelAccessGuard><FrontDeskContent /></HotelAccessGuard>; }

function FrontDeskContent() {
  const { user } = useAuth();
  const { businessId, propertyId, propertyName, profile } = useHotelContext();
  const [rooms, setRooms] = useState<HotelRoom[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [groups, setGroups] = useState<GroupBlockBooking[]>([]);
  const [selectedReservation, setSelectedReservation] = useState<Reservation | null>(null);
  const [extras, setExtras] = useState(0);
  const [amountPaid, setAmountPaid] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "momo" | "card">("cash");
  const [billing, setBilling] = useState(false);
  const [groupForm, setGroupForm] = useState({ groupName: "", contactPerson: "", phone: "", roomIds: "", checkIn: new Date().toISOString().slice(0, 10), checkOut: new Date(Date.now() + 86400000).toISOString().slice(0, 10) });

  const load = async () => {
    if (!businessId) return;
    try {
      const [nextRooms, nextReservations, nextGroups] = await Promise.all([getHotelRooms(businessId, propertyId), getReservations(businessId, propertyId), getGroupBlockBookings(businessId, propertyId)]);
      setRooms(nextRooms); setReservations(nextReservations); setGroups(nextGroups);
    } catch (error: any) { toast.error(error.message || "Could not load front desk"); }
  };
  useEffect(() => { load(); }, [businessId, propertyId]);

  const arrivals = useMemo(() => reservations.filter(item => item.status === "booked" && isToday(item.checkInDate)), [reservations]);
  const departures = useMemo(() => reservations.filter(item => item.status === "checked_in" && isToday(item.checkOutDate)), [reservations]);
  const occupied = rooms.filter(room => room.occupancyStatus === "occupied").length;
  const dirty = rooms.filter(room => room.status === "dirty").length;
  const currency = profile?.currency;

  const checkIn = async (reservation: Reservation) => {
    await updateReservationStatus(reservation.id!, "checked_in", reservation.roomId, reservation.roomNumber);
    if (reservation.roomId) await updateHotelRoomStatus(reservation.roomId, "clean", "occupied");
    toast.success(`${reservation.guestName} checked in to room ${reservation.roomNumber || "assigned room"}`); await load();
  };
  const checkOut = async (reservation: Reservation) => {
    await updateReservationStatus(reservation.id!, "checked_out", reservation.roomId, reservation.roomNumber);
    if (reservation.roomId) await updateHotelRoomStatus(reservation.roomId, "dirty", "vacant");
    toast.success(`${reservation.guestName} checked out. Room marked dirty for housekeeping.`); await load();
  };

  const totalForSelected = selectedReservation ? selectedReservation.totalAmount + (Number(extras) || 0) : 0;
  const postBill = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedReservation || !businessId || !user) return;
    const total = totalForSelected;
    const paid = Math.max(0, Number(amountPaid) || 0);
    if (paid > total) return toast.error("Amount paid cannot exceed the guest bill");
    setBilling(true);
    try {
      const invoiceRef = await createInvoice({ userId: user.uid, businessId, clientId: selectedReservation.guestId, clientName: selectedReservation.guestName, item: `Room ${selectedReservation.roomNumber || selectedReservation.roomType} · ${selectedReservation.confirmationCode}`, amount: total, subtotal: total, amountPaid: paid, status: paid >= total ? "paid" : "pending", paymentMethod, issuedAt: Timestamp.now(), dueAt: Timestamp.now(), paidAt: paid >= total ? Timestamp.now() : null, notes: `Hotel guest folio for ${propertyName}.`, isOffline: false });
      if (paid > 0) await createPayment({ userId: user.uid, businessId, clientId: selectedReservation.guestId, clientName: selectedReservation.guestName, invoiceId: invoiceRef.id, method: paymentMethod, reference: `FRONTDESK-${Date.now().toString(36).toUpperCase()}`, amount: paid, status: "success", isOffline: false });
      toast.success(paid >= total ? "Guest folio paid and posted" : "Guest folio posted as balance due"); setSelectedReservation(null); setExtras(0); setAmountPaid(0);
    } catch (error: any) { toast.error(error.message || "Could not post guest bill"); }
    finally { setBilling(false); }
  };

  const saveGroup = async (event: FormEvent) => {
    event.preventDefault();
    if (!businessId || !groupForm.groupName.trim()) return toast.error("Group name is required");
    await saveGroupBlockBooking({ businessId, propertyId, groupName: groupForm.groupName.trim(), contactPerson: groupForm.contactPerson.trim(), phone: groupForm.phone.trim(), reservedRoomIds: groupForm.roomIds.split(",").map(value => value.trim()).filter(Boolean), checkInDate: Timestamp.fromDate(new Date(`${groupForm.checkIn}T00:00:00`)), checkOutDate: Timestamp.fromDate(new Date(`${groupForm.checkOut}T00:00:00`)), status: "active" });
    toast.success("Group block saved"); setGroupForm({ ...groupForm, groupName: "", contactPerson: "", phone: "", roomIds: "" }); await load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between"><div><p className="text-[10px] text-gold uppercase tracking-[0.22em] font-bold">{propertyName}</p><h1 className="font-grotesk text-2xl font-bold text-white mt-1">Front Desk</h1><p className="text-sm text-muted mt-1">A single desk for arrivals, departures, housekeeping status, and guest folios.</p></div><ConciergeBell className="text-gold" size={28} /></div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3"><div className="card"><p className="text-[10px] text-muted uppercase">Arrivals</p><p className="text-2xl text-gold font-bold mt-1">{arrivals.length}</p></div><div className="card"><p className="text-[10px] text-muted uppercase">Departures</p><p className="text-2xl text-blue font-bold mt-1">{departures.length}</p></div><div className="card"><p className="text-[10px] text-muted uppercase">Occupied</p><p className="text-2xl text-white font-bold mt-1">{occupied}/{rooms.length}</p></div><div className="card"><p className="text-[10px] text-muted uppercase">Dirty rooms</p><p className="text-2xl text-red font-bold mt-1">{dirty}</p></div><div className="card"><p className="text-[10px] text-muted uppercase">Groups</p><p className="text-2xl text-green font-bold mt-1">{groups.filter(item => item.status === "active").length}</p></div></div>

      <section className="card"><div className="flex items-center justify-between mb-4"><div><h2 className="font-grotesk font-semibold text-white">Room status board</h2><p className="text-xs text-muted mt-1">Update housekeeping and occupancy states from the desk.</p></div><BedDouble className="text-gold" size={20} /></div>{rooms.length === 0 ? <p className="text-muted text-sm py-8 text-center">No rooms configured. Add rooms from Room Board.</p> : <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">{rooms.map(room => <div key={room.id} className={`p-3 rounded-xl border ${statusTone(room)}`}><div className="flex justify-between items-start"><p className="text-lg text-white font-bold">{room.roomNumber}</p><span className="text-[10px] text-muted">F{room.floor}</span></div><p className="text-xs text-muted mt-1 truncate">{room.roomType}</p><span className={`inline-block text-[10px] uppercase font-bold mt-3 ${room.occupancyStatus === "occupied" ? "text-blue" : room.status === "dirty" ? "text-red" : room.status === "out_of_service" ? "text-muted" : "text-green"}`}>{room.occupancyStatus === "occupied" ? "Occupied" : room.status.replace("_", " ")}</span><select className="input text-[11px] mt-3 py-1.5" value={room.status} onChange={async e => { await updateHotelRoomStatus(room.id!, e.target.value as RoomStatus); await load(); }}><option value="clean">Clean</option><option value="inspected">Inspected</option><option value="dirty">Dirty</option><option value="out_of_service">Out of service</option></select></div>)}</div>}</section>

      <div className="grid grid-cols-12 gap-5"><section className="card col-span-12 xl:col-span-7"><div className="flex justify-between items-center mb-4"><div><h2 className="font-grotesk font-semibold text-white">Today at the desk</h2><p className="text-xs text-muted mt-1">Check guests in and out without changing their reservation history.</p></div><CalendarCheck className="text-gold" size={18} /></div><div className="grid md:grid-cols-2 gap-4"><div><p className="text-[10px] text-gold uppercase font-bold tracking-wider mb-2">Arrivals</p>{arrivals.length === 0 ? <p className="text-xs text-muted py-4">No arrivals today.</p> : <div className="space-y-2">{arrivals.map(item => <div key={item.id} className="p-3 rounded-lg border border-border bg-white/[0.02] flex justify-between gap-3"><div><p className="text-sm text-white font-semibold">{item.guestName}</p><p className="text-xs text-muted">Room {item.roomNumber || "Unassigned"} · {item.confirmationCode}</p></div><button className="btn-primary text-xs" onClick={() => checkIn(item)}><LogIn size={13} /> Check in</button></div>)}</div>}</div><div><p className="text-[10px] text-blue uppercase font-bold tracking-wider mb-2">Departures</p>{departures.length === 0 ? <p className="text-xs text-muted py-4">No departures today.</p> : <div className="space-y-2">{departures.map(item => <div key={item.id} className="p-3 rounded-lg border border-border bg-white/[0.02] flex justify-between gap-3"><div><p className="text-sm text-white font-semibold">{item.guestName}</p><p className="text-xs text-muted">Room {item.roomNumber || "Unassigned"} · {formatMoney(item.totalAmount, currency)}</p></div><button className="btn-ghost text-xs" onClick={() => { setSelectedReservation(item); setAmountPaid(item.totalAmount); }}><LogOut size={13} /> Folio</button></div>)}</div>}</div></div></section>

      <section className="card col-span-12 xl:col-span-5"><div className="flex items-center justify-between mb-4"><div><h2 className="font-grotesk font-semibold text-white">Guest billing</h2><p className="text-xs text-muted mt-1">Post room charges and record cash, MoMo, or card payment.</p></div><CircleDollarSign className="text-gold" size={18} /></div>{selectedReservation ? <form onSubmit={postBill} className="space-y-3"><div className="p-3 rounded-lg bg-gold/10 border border-gold/20"><p className="text-sm text-white font-semibold">{selectedReservation.guestName}</p><p className="text-xs text-muted">Room {selectedReservation.roomNumber || selectedReservation.roomType} · {selectedReservation.confirmationCode}</p><p className="text-lg text-gold font-bold mt-2">{formatMoney(totalForSelected, currency)}</p></div><div><label className="label">Extra charges</label><input className="input" type="number" min="0" value={extras} onChange={e => setExtras(Number(e.target.value))} /></div><div><label className="label">Amount customer is paying</label><input className="input" type="number" min="0" step="0.01" value={amountPaid} onChange={e => setAmountPaid(Number(e.target.value))} /></div><div><label className="label">Payment method</label><select className="input" value={paymentMethod} onChange={e => setPaymentMethod(e.target.value as typeof paymentMethod)}><option value="cash">Cash payment</option><option value="momo">Mobile Money</option><option value="card">Card</option></select></div><div className="flex gap-2"><button className="btn-primary flex-1 justify-center" disabled={billing}>{billing ? "Posting…" : "Post guest bill"}</button><button type="button" className="btn-ghost" onClick={() => setSelectedReservation(null)}>Close</button></div><button type="button" className="btn-ghost w-full justify-center" onClick={async () => { if (!selectedReservation) return; await checkOut(selectedReservation); setSelectedReservation(null); }}>Complete check-out without posting</button></form> : <div className="py-8 text-center"><CircleDollarSign size={28} className="mx-auto text-muted mb-2" /><p className="text-sm text-muted">Select a departure to open its folio.</p></div>}</section></div>

      <section className="card"><div className="flex items-center gap-2 mb-1"><Users className="text-gold" size={18} /><h2 className="font-grotesk font-semibold text-white">Group / block bookings</h2></div><p className="text-xs text-muted mb-4">Hold multiple rooms under one group reference before individual guest reservations are created.</p><form onSubmit={saveGroup} className="grid grid-cols-1 md:grid-cols-6 gap-2"><input className="input" placeholder="Group name" value={groupForm.groupName} onChange={e => setGroupForm({ ...groupForm, groupName: e.target.value })} /><input className="input" placeholder="Contact person" value={groupForm.contactPerson} onChange={e => setGroupForm({ ...groupForm, contactPerson: e.target.value })} /><input className="input" placeholder="Phone" value={groupForm.phone} onChange={e => setGroupForm({ ...groupForm, phone: e.target.value })} /><input className="input" placeholder="Room IDs, comma-separated" value={groupForm.roomIds} onChange={e => setGroupForm({ ...groupForm, roomIds: e.target.value })} /><input className="input" type="date" value={groupForm.checkIn} onChange={e => setGroupForm({ ...groupForm, checkIn: e.target.value })} /><input className="input" type="date" value={groupForm.checkOut} onChange={e => setGroupForm({ ...groupForm, checkOut: e.target.value })} /><button className="btn-ghost md:col-span-6 justify-center"><Wrench size={14} /> Save group block</button></form>{groups.length > 0 && <div className="mt-4 grid md:grid-cols-3 gap-3">{groups.slice(0, 6).map(group => <div key={group.id} className="p-3 rounded-lg border border-border"><p className="text-sm text-white font-semibold">{group.groupName}</p><p className="text-xs text-muted">{group.contactPerson} · {group.reservedRoomIds.length} rooms</p><p className="text-[10px] text-gold mt-1">{dateOnly(group.checkInDate)} → {dateOnly(group.checkOutDate)}</p></div>)}</div>}</section>
    </div>
  );
}
