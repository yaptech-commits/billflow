"use client";

/** Hotel design note: the dashboard is a property operations brief—occupancy and desk actions outrank generic retail sales metrics. */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BedDouble, CalendarCheck, ConciergeBell, Users } from "lucide-react";
import { BusinessProfile, HotelRoom, Reservation, getHotelRooms, getReservations } from "@/lib/db";
import { formatMoney } from "@/lib/utils";

function toDate(value: any) { return value?.toDate?.() ?? (value ? new Date(value) : null); }
function isToday(value: any) { return toDate(value)?.toDateString() === new Date().toDateString(); }

export default function HotelDashboard({ businessId, profile }: { businessId: string; profile: BusinessProfile }) {
  const propertyId = profile.propertyId || "default_property";
  const [rooms, setRooms] = useState<HotelRoom[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    Promise.all([getHotelRooms(businessId, propertyId), getReservations(businessId, propertyId)]).then(([nextRooms, nextReservations]) => {
      if (!mounted) return;
      setRooms(nextRooms); setReservations(nextReservations); setLoading(false);
    }).catch(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [businessId, propertyId]);

  const arrivals = useMemo(() => reservations.filter(item => item.status === "booked" && isToday(item.checkInDate)), [reservations]);
  const departures = useMemo(() => reservations.filter(item => item.status === "checked_in" && isToday(item.checkOutDate)), [reservations]);
  const occupied = rooms.filter(room => room.occupancyStatus === "occupied").length;
  const ready = rooms.filter(room => room.occupancyStatus === "vacant" && room.status !== "dirty" && room.status !== "out_of_service").length;
  const dirty = rooms.filter(room => room.status === "dirty").length;
  const occupancyRate = rooms.length ? Math.round((occupied / rooms.length) * 100) : 0;

  return <div className="space-y-6"><div><p className="text-[10px] text-gold uppercase tracking-[0.22em] font-bold">{profile.propertyName || profile.businessName}</p><h1 className="font-grotesk text-2xl font-bold text-white mt-1">Hotel Operations</h1><p className="text-sm text-muted mt-1">Today’s property pulse: occupancy, arrivals, departures, and room readiness.</p></div>{loading ? <div className="card text-muted text-sm">Loading property operations…</div> : <><div className="grid grid-cols-2 md:grid-cols-5 gap-3"><div className="card"><p className="text-[10px] text-muted uppercase">Occupancy</p><p className="text-2xl text-blue font-bold mt-1">{occupancyRate}%</p><p className="text-[10px] text-muted">{occupied}/{rooms.length} rooms</p></div><div className="card"><p className="text-[10px] text-muted uppercase">Arrivals</p><p className="text-2xl text-gold font-bold mt-1">{arrivals.length}</p><p className="text-[10px] text-muted">Today</p></div><div className="card"><p className="text-[10px] text-muted uppercase">Departures</p><p className="text-2xl text-green font-bold mt-1">{departures.length}</p><p className="text-[10px] text-muted">Today</p></div><div className="card"><p className="text-[10px] text-muted uppercase">Ready rooms</p><p className="text-2xl text-white font-bold mt-1">{ready}</p><p className="text-[10px] text-muted">Available now</p></div><div className="card"><p className="text-[10px] text-muted uppercase">Housekeeping</p><p className="text-2xl text-red font-bold mt-1">{dirty}</p><p className="text-[10px] text-muted">Dirty rooms</p></div></div><div className="grid md:grid-cols-3 gap-5"><div className="card md:col-span-2"><div className="flex items-center justify-between mb-4"><div><h2 className="font-grotesk font-semibold text-white">Desk queue</h2><p className="text-xs text-muted mt-1">Actionable stays for today.</p></div><ConciergeBell className="text-gold" size={20} /></div>{[...arrivals, ...departures].length === 0 ? <p className="text-sm text-muted py-8 text-center">No arrival or departure actions scheduled today.</p> : <div className="space-y-2">{[...arrivals, ...departures].slice(0, 8).map(item => <div key={item.id} className="flex items-center justify-between p-3 rounded-lg bg-white/[0.03] border border-border"><div><p className="text-sm text-white font-semibold">{item.guestName}</p><p className="text-xs text-muted">Room {item.roomNumber || item.roomType} · {item.confirmationCode}</p></div><span className={`text-[10px] uppercase font-bold px-2 py-1 rounded-full ${item.status === "booked" ? "text-gold bg-gold/10" : "text-blue bg-blue/10"}`}>{item.status === "booked" ? "Arriving" : "Departing"}</span></div>)}</div>}</div><div className="space-y-3"><Link href="/hotel/front-desk" className="card flex items-center gap-3 hover:border-gold/50 transition-colors"><ConciergeBell className="text-gold" size={20} /><div><p className="text-sm text-white font-semibold">Open Front Desk</p><p className="text-xs text-muted">Check-ins, folios, room board</p></div></Link><Link href="/hotel/reservations" className="card flex items-center gap-3 hover:border-gold/50 transition-colors"><CalendarCheck className="text-gold" size={20} /><div><p className="text-sm text-white font-semibold">Manage Reservations</p><p className="text-xs text-muted">Live date-range availability</p></div></Link><Link href="/hotel/rooms" className="card flex items-center gap-3 hover:border-gold/50 transition-colors"><BedDouble className="text-gold" size={20} /><div><p className="text-sm text-white font-semibold">Room Setup</p><p className="text-xs text-muted">Rates, tax rules, housekeeping</p></div></Link><div className="card flex items-center gap-3"><Users className="text-gold" size={20} /><div><p className="text-sm text-white font-semibold">Guest profiles</p><p className="text-xs text-muted">{new Set(reservations.map(item => item.guestId)).size} guests with stays</p></div></div></div></div></>}</div>;
}
