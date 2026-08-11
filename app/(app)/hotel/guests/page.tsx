"use client";

/** Hotel design note: guest records are calm, searchable, and human-readable, with identity details separated from stay history. */
import { FormEvent, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { History, Search, UserRound, UserRoundPlus } from "lucide-react";
import HotelAccessGuard, { useHotelContext } from "@/components/hotel/HotelAccessGuard";
import { HotelGuest, Reservation, getHotelGuests, getReservations, saveHotelGuest } from "@/lib/db";

const initialGuest = { fullName: "", email: "", phone: "", idType: "National ID", idNumber: "", address: "" };
function asDate(value: any) { return value?.toDate?.() ?? (value ? new Date(value) : null); }

export default function HotelGuestsPage() { return <HotelAccessGuard><GuestsContent /></HotelAccessGuard>; }

function GuestsContent() {
  const { businessId, propertyId, propertyName } = useHotelContext();
  const [guests, setGuests] = useState<HotelGuest[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [form, setForm] = useState(initialGuest);
  const [editingId, setEditingId] = useState<string>();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<HotelGuest | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!businessId) return;
    setLoading(true);
    try { const [nextGuests, nextReservations] = await Promise.all([getHotelGuests(businessId, propertyId), getReservations(businessId, propertyId)]); setGuests(nextGuests); setReservations(nextReservations); }
    catch (error: any) { toast.error(error.message || "Could not load guest profiles"); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [businessId, propertyId]);

  const filtered = useMemo(() => guests.filter(item => `${item.fullName} ${item.email} ${item.phone} ${item.idNumber}`.toLowerCase().includes(search.toLowerCase())), [guests, search]);
  const historyFor = (guestId?: string) => reservations.filter(item => item.guestId === guestId).sort((a, b) => (asDate(b.checkInDate)?.getTime() || 0) - (asDate(a.checkInDate)?.getTime() || 0));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!businessId || !form.fullName.trim() || !form.phone.trim()) return toast.error("Guest name and phone are required");
    try { const stayCount = historyFor(editingId).length; await saveHotelGuest({ businessId, propertyId, fullName: form.fullName.trim(), email: form.email.trim(), phone: form.phone.trim(), idType: form.idType, idNumber: form.idNumber.trim(), address: form.address.trim(), stayHistoryCount: stayCount }, editingId); toast.success(editingId ? "Guest profile updated" : "Guest profile created"); setForm(initialGuest); setEditingId(undefined); await load(); }
    catch (error: any) { toast.error(error.message || "Could not save guest"); }
  };

  const edit = (guest: HotelGuest) => { setEditingId(guest.id); setForm({ fullName: guest.fullName, email: guest.email, phone: guest.phone, idType: guest.idType, idNumber: guest.idNumber, address: guest.address || "" }); window.scrollTo({ top: 0, behavior: "smooth" }); };

  return (
    <div className="space-y-6"><div className="flex items-end justify-between"><div><p className="text-[10px] text-gold uppercase tracking-[0.22em] font-bold">{propertyName}</p><h1 className="font-grotesk text-2xl font-bold text-white mt-1">Guest Profiles</h1><p className="text-sm text-muted mt-1">Maintain one reusable guest record for contact, identity, and stay history.</p></div><UserRound className="text-gold" size={28} /></div>
      <div className="grid grid-cols-12 gap-5"><section className="card col-span-12 xl:col-span-4"><div className="flex items-center justify-between mb-4"><div><h2 className="font-grotesk font-semibold text-white">{editingId ? "Edit guest" : "New guest"}</h2><p className="text-xs text-muted mt-1">ID details stay with the property guest profile.</p></div><UserRoundPlus className="text-gold" size={18} /></div><form onSubmit={submit} className="space-y-3"><input className="input" placeholder="Full name" value={form.fullName} onChange={e => setForm({ ...form, fullName: e.target.value })} /><div className="grid grid-cols-2 gap-2"><input className="input" type="email" placeholder="Email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /><input className="input" placeholder="Phone" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div><div className="grid grid-cols-2 gap-2"><select className="input" value={form.idType} onChange={e => setForm({ ...form, idType: e.target.value })}><option>National ID</option><option>Passport</option><option>Driver License</option><option>Other</option></select><input className="input" placeholder="ID number" value={form.idNumber} onChange={e => setForm({ ...form, idNumber: e.target.value })} /></div><textarea className="input min-h-[72px]" placeholder="Address" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} /><div className="flex gap-2"><button className="btn-primary flex-1 justify-center">{editingId ? "Save profile" : "Create profile"}</button>{editingId && <button type="button" className="btn-ghost" onClick={() => { setEditingId(undefined); setForm(initialGuest); }}>Cancel</button>}</div></form></section>
        <section className="card col-span-12 xl:col-span-8"><div className="flex items-center justify-between mb-4"><div><h2 className="font-grotesk font-semibold text-white">Guest directory</h2><p className="text-xs text-muted mt-1">{guests.length} profiles at {propertyName}.</p></div><div className="relative"><Search className="absolute left-3 top-2.5 text-muted" size={14} /><input className="input pl-8 w-60" placeholder="Search name, phone, ID" value={search} onChange={e => setSearch(e.target.value)} /></div></div>{loading ? <p className="text-muted text-sm text-center py-10">Loading guests…</p> : filtered.length === 0 ? <div className="border border-dashed border-border rounded-xl py-12 text-center"><UserRound size={24} className="mx-auto text-muted mb-2" /><p className="text-sm text-muted">No guest profiles match this search.</p></div> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-[10px] uppercase tracking-wide text-muted border-b border-border"><th className="text-left pb-3">Guest</th><th className="text-left pb-3">Contact</th><th className="text-left pb-3">Identity</th><th className="text-left pb-3">Stays</th><th className="text-right pb-3">Actions</th></tr></thead><tbody>{filtered.map(guest => { const history = historyFor(guest.id); return <tr key={guest.id} className="border-b border-border/60"><td className="py-3"><p className="text-white font-semibold">{guest.fullName}</p><p className="text-[10px] text-muted">{guest.address || "Address not recorded"}</p></td><td className="py-3 text-xs text-muted">{guest.phone}<span className="block">{guest.email || "No email"}</span></td><td className="py-3 text-xs text-surface">{guest.idType}<span className="block text-muted">{guest.idNumber || "Not provided"}</span></td><td className="py-3 text-gold font-semibold">{history.length}</td><td className="py-3 text-right"><button className="btn-ghost text-xs mr-1" onClick={() => setSelected(guest)}><History size={13} /> History</button><button className="btn-ghost text-xs" onClick={() => edit(guest)}>Edit</button></td></tr>; })}</tbody></table></div>}</section></div>
      {selected && <section className="card border-gold/30"><div className="flex justify-between items-start mb-4"><div><p className="text-[10px] text-gold uppercase tracking-wider font-bold">Stay history</p><h2 className="font-grotesk text-xl font-semibold text-white mt-1">{selected.fullName}</h2></div><button className="btn-ghost text-xs" onClick={() => setSelected(null)}>Close</button></div>{historyFor(selected.id).length === 0 ? <p className="text-sm text-muted">No stays recorded yet.</p> : <div className="grid md:grid-cols-3 gap-3">{historyFor(selected.id).map(item => <div key={item.id} className="p-3 rounded-lg border border-border"><p className="text-sm text-white font-semibold">{item.roomNumber || item.roomType}</p><p className="text-xs text-muted mt-1">{asDate(item.checkInDate)?.toLocaleDateString()} → {asDate(item.checkOutDate)?.toLocaleDateString()}</p><p className="text-[10px] text-gold uppercase mt-2">{item.status.replace("_", " ")}</p></div>)}</div>}</section>}
    </div>
  );
}
