"use client";

/** Hotel design note: the reservation screen favors a calendar-first workflow with clear availability signals and low-friction front-desk actions. */
import { FormEvent, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { CalendarDays, Check, Clock3, Pencil, Search, UserPlus, X } from "lucide-react";
import { Timestamp } from "firebase/firestore";
import HotelAccessGuard, { useHotelContext } from "@/components/hotel/HotelAccessGuard";
import {
  BookingSource, HotelGuest, HotelRoom, HotelWaitlistEntry, Reservation, ReservationStatus,
  getAvailableHotelRooms, getHotelGuests, getHotelRooms, getReservations, saveHotelGuest,
  saveReservation, updateReservationStatus, getHotelWaitlist, saveHotelWaitlistEntry,
} from "@/lib/db";
import { formatMoney } from "@/lib/utils";

const isoToday = () => new Date().toISOString().slice(0, 10);
const plusDays = (days: number) => { const date = new Date(); date.setDate(date.getDate() + days); return date.toISOString().slice(0, 10); };
const initialForm = { guestName: "", email: "", phone: "", roomType: "Standard", roomId: "auto", checkIn: isoToday(), checkOut: plusDays(1), adults: 1, children: 0, source: "walk_in" as BookingSource, specialRequests: "", allowOverbooking: false };

function timestampDate(value: any) { return value?.toDate?.() ?? (value ? new Date(value) : null); }
function inputDate(value: any) { const date = timestampDate(value); return date ? date.toISOString().slice(0, 10) : ""; }
function nightsBetween(start: string, end: string) { return Math.max(1, Math.ceil((new Date(`${end}T00:00:00`).getTime() - new Date(`${start}T00:00:00`).getTime()) / 86400000)); }
function statusTone(status: ReservationStatus) { return status === "booked" ? "text-gold bg-gold/10" : status === "checked_in" ? "text-blue bg-blue/10" : status === "checked_out" ? "text-green bg-green/10" : status === "cancelled" || status === "no_show" ? "text-red bg-red/10" : "text-muted bg-white/5"; }

export default function HotelReservationsPage() { return <HotelAccessGuard><ReservationsContent /></HotelAccessGuard>; }

function ReservationsContent() {
  const { businessId, propertyId, propertyName, profile } = useHotelContext();
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [guests, setGuests] = useState<HotelGuest[]>([]);
  const [rooms, setRooms] = useState<HotelRoom[]>([]);
  const [waitlist, setWaitlist] = useState<HotelWaitlistEntry[]>([]);
  const [availableRooms, setAvailableRooms] = useState<HotelRoom[]>([]);
  const [form, setForm] = useState(initialForm);
  const [editingId, setEditingId] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const load = async () => {
    if (!businessId) return;
    setLoading(true);
    try {
      const [nextReservations, nextGuests, nextRooms, nextWaitlist] = await Promise.all([
        getReservations(businessId, propertyId), getHotelGuests(businessId, propertyId), getHotelRooms(businessId, propertyId), getHotelWaitlist(businessId, propertyId),
      ]);
      setReservations(nextReservations.sort((a, b) => (timestampDate(a.checkInDate)?.getTime() || 0) - (timestampDate(b.checkInDate)?.getTime() || 0)));
      setGuests(nextGuests); setRooms(nextRooms); setWaitlist(nextWaitlist.filter(item => item.status === "waiting"));
    } catch (error: any) { toast.error(error.message || "Could not load reservations"); }
    finally { setLoading(false); }
  };

  const refreshAvailability = async () => {
    if (!businessId || !form.checkIn || !form.checkOut || new Date(form.checkOut) <= new Date(form.checkIn)) { setAvailableRooms([]); return; }
    setAvailabilityLoading(true);
    try { setAvailableRooms(await getAvailableHotelRooms(businessId, propertyId, new Date(`${form.checkIn}T00:00:00`), new Date(`${form.checkOut}T00:00:00`), form.roomType || undefined, editingId)); }
    catch (error: any) { toast.error(error.message || "Could not check availability"); }
    finally { setAvailabilityLoading(false); }
  };

  useEffect(() => { load(); }, [businessId, propertyId]);
  useEffect(() => { refreshAvailability(); }, [businessId, propertyId, form.checkIn, form.checkOut, form.roomType, editingId]);

  const filteredReservations = useMemo(() => reservations.filter(item => `${item.guestName} ${item.confirmationCode} ${item.roomNumber || ""}`.toLowerCase().includes(searchTerm.toLowerCase())), [reservations, searchTerm]);
  const calendarDays = useMemo(() => Array.from({ length: 14 }, (_, index) => { const date = new Date(); date.setDate(date.getDate() + index); return date; }), []);
  const currency = profile?.currency;

  const resetForm = () => { setForm({ ...initialForm, checkIn: isoToday(), checkOut: plusDays(1) }); setEditingId(undefined); };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!businessId) return;
    if (!form.guestName.trim() || !form.checkIn || !form.checkOut) return toast.error("Guest and stay dates are required");
    if (new Date(form.checkOut) <= new Date(form.checkIn)) return toast.error("Check-out must be after check-in");
    const selectedRoom = availableRooms.find(room => room.id === form.roomId) || availableRooms[0];
    if (!selectedRoom && !form.allowOverbooking) return toast.error("No rooms are available for those dates. Turn on overbooking to force a room assignment or add the guest to the waitlist.");
    try {
      let guest = guests.find(item => item.fullName.toLowerCase() === form.guestName.trim().toLowerCase() && item.phone === form.phone);
      if (!guest) {
        const guestId = await saveHotelGuest({ businessId, propertyId, fullName: form.guestName.trim(), email: form.email.trim(), phone: form.phone.trim(), idType: "Not provided", idNumber: "Not provided" });
        guest = { id: guestId, businessId, propertyId, fullName: form.guestName.trim(), email: form.email.trim(), phone: form.phone.trim(), idType: "Not provided", idNumber: "Not provided" };
      }
      const nights = nightsBetween(form.checkIn, form.checkOut);
      const room = selectedRoom || rooms.find(item => item.roomType === form.roomType) || rooms[0];
      if (!room) return toast.error("Add at least one room before accepting a booking");
      const reservation: Omit<Reservation, "id" | "createdAt"> = {
        businessId, propertyId, confirmationCode: editingId ? (reservations.find(item => item.id === editingId)?.confirmationCode || `BF-${Date.now().toString(36).toUpperCase()}`) : `BF-${Date.now().toString(36).toUpperCase()}`,
        guestId: guest.id!, guestName: guest.fullName, guestEmail: guest.email, guestPhone: guest.phone, roomId: room.id, roomNumber: room.roomNumber, roomType: room.roomType,
        checkInDate: Timestamp.fromDate(new Date(`${form.checkIn}T00:00:00`)), checkOutDate: Timestamp.fromDate(new Date(`${form.checkOut}T00:00:00`)), adults: Number(form.adults) || 1, children: Number(form.children) || 0,
        status: editingId ? (reservations.find(item => item.id === editingId)?.status || "booked") : "booked", bookingSource: form.source, ratePerNight: room.baseRate, totalAmount: room.baseRate * nights, amountPaid: 0, specialRequests: form.specialRequests.trim() || undefined, overbooked: !selectedRoom,
      };
      await saveReservation(reservation, editingId);
      toast.success(editingId ? "Reservation updated" : reservation.overbooked ? "Overbooked reservation recorded" : "Reservation confirmed");
      resetForm(); await load(); await refreshAvailability();
    } catch (error: any) { toast.error(error.message || "Could not save reservation"); }
  };

  const addToWaitlist = async () => {
    if (!businessId || !form.guestName.trim()) return toast.error("Enter the guest before adding to the waitlist");
    const guest = guests.find(item => item.fullName.toLowerCase() === form.guestName.trim().toLowerCase()) || { id: "pending", fullName: form.guestName.trim() } as HotelGuest;
    await saveHotelWaitlistEntry({ businessId, propertyId, guestId: guest.id!, guestName: form.guestName.trim(), roomType: form.roomType, checkInDate: Timestamp.fromDate(new Date(`${form.checkIn}T00:00:00`)), checkOutDate: Timestamp.fromDate(new Date(`${form.checkOut}T00:00:00`)), adults: Number(form.adults) || 1, children: Number(form.children) || 0, bookingSource: form.source, notes: form.specialRequests, status: "waiting" });
    toast.success("Guest added to waitlist"); await load();
  };

  const editReservation = (item: Reservation) => { setEditingId(item.id); setForm({ guestName: item.guestName, email: item.guestEmail || "", phone: item.guestPhone || "", roomType: item.roomType, roomId: item.roomId || "auto", checkIn: inputDate(item.checkInDate), checkOut: inputDate(item.checkOutDate), adults: item.adults, children: item.children, source: item.bookingSource, specialRequests: item.specialRequests || "", allowOverbooking: item.overbooked === true }); window.scrollTo({ top: 0, behavior: "smooth" }); };

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4"><div><p className="text-[10px] text-gold uppercase tracking-[0.22em] font-bold">{propertyName}</p><h1 className="font-grotesk text-2xl font-bold text-white mt-1">Reservations</h1><p className="text-sm text-muted mt-1">Calendar-based availability for every stay, not a stock counter.</p></div><div className="flex items-center gap-2"><span className="text-xs text-muted">{reservations.filter(item => item.status === "booked").length} booked</span><span className="text-xs text-muted">·</span><span className="text-xs text-gold">{waitlist.length} waiting</span></div></div>

      <section className="card"><div className="flex items-center justify-between mb-4"><div><h2 className="font-grotesk font-semibold text-white">14-day booking calendar</h2><p className="text-xs text-muted mt-1">Select a date range below to see live room availability.</p></div><CalendarDays className="text-gold" size={20} /></div><div className="grid grid-cols-7 md:grid-cols-14 gap-1.5">{calendarDays.map(day => { const dayKey = day.toISOString().slice(0, 10); const count = reservations.filter(item => item.status === "booked" || item.status === "checked_in").some(item => { const start = timestampDate(item.checkInDate)?.toISOString().slice(0, 10); const end = timestampDate(item.checkOutDate)?.toISOString().slice(0, 10); return start && end && dayKey >= start && dayKey < end; }); return <button key={dayKey} onClick={() => setForm(current => ({ ...current, checkIn: dayKey, checkOut: plusDays(1) }))} className={`p-2 rounded-lg border text-center transition-colors ${form.checkIn === dayKey ? "border-gold bg-gold/10" : "border-border bg-white/[0.02] hover:border-gold/50"}`}><p className="text-[10px] text-muted uppercase">{day.toLocaleDateString(undefined, { weekday: "short" })}</p><p className="text-sm text-white font-bold mt-1">{day.getDate()}</p><span className={`inline-block w-1.5 h-1.5 rounded-full mt-1 ${count ? "bg-blue" : "bg-green"}`} /></button>; })}</div></section>

      <div className="grid grid-cols-12 gap-5"><section className="card col-span-12 xl:col-span-5"><div className="flex items-center justify-between mb-4"><div><h2 className="font-grotesk font-semibold text-white">{editingId ? "Modify reservation" : "New reservation"}</h2><p className="text-xs text-muted mt-1">Auto-assign a room or choose a manual override.</p></div>{editingId ? <button className="btn-ghost text-xs" onClick={resetForm}><X size={14} /> Cancel edit</button> : <UserPlus className="text-gold" size={18} />}</div><form onSubmit={submit} className="space-y-3"><div className="grid grid-cols-2 gap-2"><input className="input" placeholder="Guest full name" value={form.guestName} onChange={e => setForm({ ...form, guestName: e.target.value })} /><input className="input" placeholder="Phone" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div><input className="input" type="email" placeholder="Guest email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /><div className="grid grid-cols-2 gap-2"><input className="input" type="date" value={form.checkIn} onChange={e => setForm({ ...form, checkIn: e.target.value })} /><input className="input" type="date" value={form.checkOut} onChange={e => setForm({ ...form, checkOut: e.target.value })} /></div><div className="grid grid-cols-2 gap-2"><input className="input" placeholder="Room type" value={form.roomType} onChange={e => setForm({ ...form, roomType: e.target.value })} /><select className="input" value={form.roomId} onChange={e => setForm({ ...form, roomId: e.target.value })}><option value="auto">Auto-assign available room</option>{availableRooms.map(room => <option key={room.id} value={room.id}>{room.roomNumber} · {room.roomType}</option>)}</select></div><div className="grid grid-cols-3 gap-2"><input className="input" type="number" min="1" value={form.adults} onChange={e => setForm({ ...form, adults: Number(e.target.value) })} /><input className="input" type="number" min="0" value={form.children} onChange={e => setForm({ ...form, children: Number(e.target.value) })} /><select className="input" value={form.source} onChange={e => setForm({ ...form, source: e.target.value as BookingSource })}><option value="walk_in">Walk-in</option><option value="phone">Phone</option><option value="online">Online</option><option value="ota">OTA</option><option value="corporate">Corporate</option></select></div><textarea className="input min-h-[70px]" placeholder="Special requests or billing notes" value={form.specialRequests} onChange={e => setForm({ ...form, specialRequests: e.target.value })} /><label className="flex items-center gap-2 text-xs text-muted"><input type="checkbox" checked={form.allowOverbooking} onChange={e => setForm({ ...form, allowOverbooking: e.target.checked })} /> Allow overbooking when no room is available (flagged for follow-up)</label><div className="flex gap-2"><button className="btn-primary flex-1 justify-center" disabled={availabilityLoading}><Check size={14} /> {availabilityLoading ? "Checking…" : editingId ? "Save changes" : "Confirm booking"}</button><button type="button" className="btn-ghost" onClick={addToWaitlist}><Clock3 size={14} /> Waitlist</button></div></form><div className="mt-4 p-3 rounded-lg bg-white/[0.03] border border-border"><p className="text-xs text-muted">{availabilityLoading ? "Checking live availability…" : `${availableRooms.length} ${form.roomType || "matching"} room${availableRooms.length === 1 ? "" : "s"} available for this stay.`}</p>{availableRooms[0] && <p className="text-xs text-green mt-1">Suggested: Room {availableRooms[0].roomNumber} · {formatMoney(availableRooms[0].baseRate * nightsBetween(form.checkIn, form.checkOut), currency)} total</p>}</div></section>

      <section className="card col-span-12 xl:col-span-7"><div className="flex items-center justify-between mb-4"><div><h2 className="font-grotesk font-semibold text-white">Booking ledger</h2><p className="text-xs text-muted mt-1">Every reservation is scoped to {propertyName}.</p></div><div className="relative"><Search size={14} className="absolute left-3 top-2.5 text-muted" /><input className="input pl-8 w-52" placeholder="Search guest or code" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} /></div></div>{loading ? <p className="text-muted text-sm py-10 text-center">Loading reservations…</p> : filteredReservations.length === 0 ? <div className="py-12 text-center border border-dashed border-border rounded-xl"><CalendarDays size={24} className="mx-auto text-muted mb-2" /><p className="text-muted text-sm">No reservations match this search.</p></div> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-[10px] uppercase tracking-wide text-muted border-b border-border"><th className="text-left pb-3">Guest</th><th className="text-left pb-3">Stay</th><th className="text-left pb-3">Room</th><th className="text-left pb-3">Source</th><th className="text-left pb-3">Status</th><th className="text-right pb-3">Actions</th></tr></thead><tbody>{filteredReservations.map(item => <tr key={item.id} className="border-b border-border/60"><td className="py-3"><p className="text-white font-semibold">{item.guestName}</p><p className="text-[10px] text-muted">{item.confirmationCode}{item.overbooked ? " · OVERBOOKED" : ""}</p></td><td className="py-3 text-xs text-muted">{timestampDate(item.checkInDate)?.toLocaleDateString()}<span className="block">→ {timestampDate(item.checkOutDate)?.toLocaleDateString()}</span></td><td className="py-3 text-surface">{item.roomNumber || "Unassigned"}<span className="block text-[10px] text-muted">{item.roomType}</span></td><td className="py-3 text-xs text-muted capitalize">{item.bookingSource.replace("_", " ")}</td><td className="py-3"><span className={`text-[10px] uppercase font-bold px-2 py-1 rounded-full ${statusTone(item.status)}`}>{item.status.replace("_", " ")}</span></td><td className="py-3 text-right"><button className="p-2 text-muted hover:text-gold" title="Modify" onClick={() => editReservation(item)}><Pencil size={14} /></button>{(item.status === "booked" || item.status === "checked_in") && <button className="p-2 text-muted hover:text-red" title="Cancel" onClick={async () => { if (!confirm(`Cancel ${item.confirmationCode}?`)) return; await updateReservationStatus(item.id!, "cancelled"); await load(); }}><X size={14} /></button>}</td></tr>)}</tbody></table></div>}</section></div>
    </div>
  );
}
