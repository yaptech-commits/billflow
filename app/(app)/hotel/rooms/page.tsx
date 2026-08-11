"use client";

/** Hotel design note: operational dark canvas, gold command accents, compact tables, and status colors that read at a glance. */
import { FormEvent, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { BedDouble, Plus, Save, Trash2, Wrench } from "lucide-react";
import { Timestamp } from "firebase/firestore";
import HotelAccessGuard, { useHotelContext } from "@/components/hotel/HotelAccessGuard";
import {
  HotelRoom, RoomStatus, RoomOccupancyStatus, SeasonalRatePlan, TaxRule,
  getHotelRooms, saveHotelRoom, deleteHotelRoom, updateHotelRoomStatus,
  getSeasonalRatePlans, saveSeasonalRatePlan, getHotelTaxRules, saveHotelTaxRule,
} from "@/lib/db";
import { formatMoney } from "@/lib/utils";

const emptyRoom = { roomNumber: "", roomType: "Standard", floor: "1", capacity: 2, baseRate: 0, amenities: "" };
const emptyRate = { name: "", roomTypeId: "Standard", startDate: "", endDate: "", weekdayRate: 0, weekendRate: 0 };
const emptyTax = { name: "", percentage: 0, isInclusive: false };

function toDate(value: any) {
  return value?.toDate?.() ?? (value ? new Date(value) : null);
}

function statusClass(status: RoomStatus, occupancy: RoomOccupancyStatus) {
  if (occupancy === "occupied") return "bg-blue/10 text-blue border-blue/20";
  if (status === "dirty") return "bg-red/10 text-red border-red/20";
  if (status === "out_of_service") return "bg-white/5 text-muted border-border";
  return "bg-green/10 text-green border-green/20";
}

export default function HotelRoomsPage() {
  return <HotelAccessGuard><HotelRoomsContent /></HotelAccessGuard>;
}

function HotelRoomsContent() {
  const { businessId, propertyId, propertyName, profile } = useHotelContext();
  const [rooms, setRooms] = useState<HotelRoom[]>([]);
  const [rates, setRates] = useState<SeasonalRatePlan[]>([]);
  const [taxRules, setTaxRules] = useState<TaxRule[]>([]);
  const [roomForm, setRoomForm] = useState(emptyRoom);
  const [rateForm, setRateForm] = useState(emptyRate);
  const [taxForm, setTaxForm] = useState(emptyTax);
  const [editingRoomId, setEditingRoomId] = useState<string>();
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!businessId) return;
    setLoading(true);
    try {
      const [nextRooms, nextRates, nextTaxes] = await Promise.all([
        getHotelRooms(businessId, propertyId),
        getSeasonalRatePlans(businessId, propertyId),
        getHotelTaxRules(businessId, propertyId),
      ]);
      setRooms(nextRooms);
      setRates(nextRates);
      setTaxRules(nextTaxes);
    } catch (error: any) {
      toast.error(error.message || "Could not load hotel setup");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [businessId, propertyId]);

  const occupancy = useMemo(() => rooms.filter(room => room.occupancyStatus === "occupied").length, [rooms]);
  const currency = profile?.currency;

  const submitRoom = async (event: FormEvent) => {
    event.preventDefault();
    if (!businessId || !roomForm.roomNumber.trim()) return toast.error("Room number is required");
    try {
      await saveHotelRoom({
        businessId,
        propertyId,
        roomNumber: roomForm.roomNumber.trim(),
        roomType: roomForm.roomType.trim() || "Standard",
        floor: roomForm.floor.trim() || "1",
        capacity: Math.max(1, Number(roomForm.capacity) || 1),
        amenities: roomForm.amenities.split(",").map(value => value.trim()).filter(Boolean),
        status: "clean",
        occupancyStatus: "vacant",
        baseRate: Math.max(0, Number(roomForm.baseRate) || 0),
      }, editingRoomId);
      toast.success(editingRoomId ? "Room updated" : "Room added");
      setRoomForm(emptyRoom);
      setEditingRoomId(undefined);
      await load();
    } catch (error: any) {
      toast.error(error.message || "Could not save room");
    }
  };

  const editRoom = (room: HotelRoom) => {
    setEditingRoomId(room.id);
    setRoomForm({ roomNumber: room.roomNumber, roomType: room.roomType, floor: room.floor, capacity: room.capacity, baseRate: room.baseRate, amenities: room.amenities.join(", ") });
  };

  const submitRate = async (event: FormEvent) => {
    event.preventDefault();
    if (!businessId || !rateForm.name.trim()) return toast.error("Rate plan name is required");
    await saveSeasonalRatePlan({
      businessId, propertyId, name: rateForm.name.trim(), roomTypeId: rateForm.roomTypeId.trim() || "Standard",
      startDate: rateForm.startDate ? Timestamp.fromDate(new Date(`${rateForm.startDate}T00:00:00`)) : null,
      endDate: rateForm.endDate ? Timestamp.fromDate(new Date(`${rateForm.endDate}T23:59:59`)) : null,
      weekdayRate: Math.max(0, Number(rateForm.weekdayRate) || 0), weekendRate: Math.max(0, Number(rateForm.weekendRate) || 0),
    });
    setRateForm(emptyRate);
    toast.success("Seasonal rate plan saved");
    await load();
  };

  const submitTax = async (event: FormEvent) => {
    event.preventDefault();
    if (!businessId || !taxForm.name.trim()) return toast.error("Tax name is required");
    await saveHotelTaxRule({ businessId, propertyId, name: taxForm.name.trim(), percentage: Math.max(0, Number(taxForm.percentage) || 0), isInclusive: taxForm.isInclusive });
    setTaxForm(emptyTax);
    toast.success("Tax rule saved");
    await load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-[10px] text-gold uppercase tracking-[0.22em] font-bold">{propertyName}</p>
          <h1 className="font-grotesk text-2xl font-bold text-white mt-1">Room Board &amp; Property Setup</h1>
          <p className="text-sm text-muted mt-1">Manage inventory, pricing seasons, and property tax rules in one workspace.</p>
        </div>
        <div className="flex gap-3 text-right">
          <div className="card py-3 px-4"><p className="text-[10px] text-muted uppercase">Rooms</p><p className="text-xl text-white font-bold">{rooms.length}</p></div>
          <div className="card py-3 px-4"><p className="text-[10px] text-muted uppercase">Occupied</p><p className="text-xl text-blue font-bold">{occupancy}</p></div>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-5">
        <section className="card col-span-12 xl:col-span-7">
          <div className="flex justify-between items-center mb-4"><div><h2 className="font-grotesk font-semibold text-white">Room inventory</h2><p className="text-xs text-muted mt-1">Each room is a property-scoped unit with its own operational status.</p></div><BedDouble className="text-gold" size={20} /></div>
          <form onSubmit={submitRoom} className="grid grid-cols-2 md:grid-cols-6 gap-2 mb-5">
            <input className="input" placeholder="Room no." value={roomForm.roomNumber} onChange={e => setRoomForm({ ...roomForm, roomNumber: e.target.value })} />
            <input className="input" placeholder="Room type" value={roomForm.roomType} onChange={e => setRoomForm({ ...roomForm, roomType: e.target.value })} />
            <input className="input" placeholder="Floor" value={roomForm.floor} onChange={e => setRoomForm({ ...roomForm, floor: e.target.value })} />
            <input className="input" type="number" min="1" placeholder="Capacity" value={roomForm.capacity} onChange={e => setRoomForm({ ...roomForm, capacity: Number(e.target.value) })} />
            <input className="input" type="number" min="0" placeholder="Base rate" value={roomForm.baseRate} onChange={e => setRoomForm({ ...roomForm, baseRate: Number(e.target.value) })} />
            <input className="input" placeholder="Amenities: WiFi, AC" value={roomForm.amenities} onChange={e => setRoomForm({ ...roomForm, amenities: e.target.value })} />
            <button className="btn-primary col-span-2 md:col-span-6 justify-center"><Save size={14} /> {editingRoomId ? "Update room" : "Add room"}</button>
          </form>
          {loading ? <p className="text-muted text-sm py-8 text-center">Loading room inventory…</p> : rooms.length === 0 ? <div className="text-center py-10 border border-dashed border-border rounded-xl"><BedDouble size={24} className="mx-auto text-muted mb-2" /><p className="text-muted text-sm">No rooms configured yet.</p></div> : (
            <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-[10px] uppercase tracking-wide text-muted border-b border-border"><th className="text-left pb-3">Room</th><th className="text-left pb-3">Type</th><th className="text-left pb-3">Capacity</th><th className="text-left pb-3">Rate</th><th className="text-left pb-3">Status</th><th className="text-right pb-3">Actions</th></tr></thead><tbody>{rooms.map(room => <tr key={room.id} className="border-b border-border/60"><td className="py-3 text-white font-semibold">{room.roomNumber}<span className="block text-[10px] text-muted">Floor {room.floor}</span></td><td className="py-3 text-surface">{room.roomType}<span className="block text-[10px] text-muted truncate max-w-[150px]">{room.amenities.join(" · ") || "No amenities"}</span></td><td className="py-3 text-muted">{room.capacity} guests</td><td className="py-3 text-gold font-semibold">{formatMoney(room.baseRate, currency)}</td><td className="py-3"><select className={`text-[11px] px-2 py-1 rounded-full border ${statusClass(room.status, room.occupancyStatus)} bg-transparent`} value={room.status} onChange={async e => { await updateHotelRoomStatus(room.id!, e.target.value as RoomStatus); await load(); }}><option value="clean">Clean</option><option value="inspected">Inspected</option><option value="dirty">Dirty</option><option value="out_of_service">Out of service</option></select><span className="block text-[10px] text-muted mt-1">{room.occupancyStatus}</span></td><td className="py-3 text-right"><button className="btn-ghost text-xs mr-1" onClick={() => editRoom(room)}>Edit</button><button className="p-2 text-muted hover:text-red" title="Delete room" onClick={async () => { if (!confirm(`Delete room ${room.roomNumber}?`)) return; await deleteHotelRoom(room.id!); await load(); }}><Trash2 size={14} /></button></td></tr>)}</tbody></table></div>
          )}
        </section>

        <section className="card col-span-12 xl:col-span-5">
          <div className="flex items-center justify-between mb-4"><div><h2 className="font-grotesk font-semibold text-white">Seasonal rate plans</h2><p className="text-xs text-muted mt-1">Date-bounded weekday and weekend pricing.</p></div><Plus className="text-gold" size={18} /></div>
          <form onSubmit={submitRate} className="space-y-2 mb-4"><input className="input" placeholder="Plan name" value={rateForm.name} onChange={e => setRateForm({ ...rateForm, name: e.target.value })} /><div className="grid grid-cols-2 gap-2"><input className="input" placeholder="Room type" value={rateForm.roomTypeId} onChange={e => setRateForm({ ...rateForm, roomTypeId: e.target.value })} /><input className="input" type="number" min="0" placeholder="Weekday rate" value={rateForm.weekdayRate} onChange={e => setRateForm({ ...rateForm, weekdayRate: Number(e.target.value) })} /><input className="input" type="number" min="0" placeholder="Weekend rate" value={rateForm.weekendRate} onChange={e => setRateForm({ ...rateForm, weekendRate: Number(e.target.value) })} /><input className="input" type="date" value={rateForm.startDate} onChange={e => setRateForm({ ...rateForm, startDate: e.target.value })} /><input className="input" type="date" value={rateForm.endDate} onChange={e => setRateForm({ ...rateForm, endDate: e.target.value })} /></div><button className="btn-ghost w-full justify-center"><Plus size={14} /> Save rate plan</button></form>
          <div className="space-y-2">{rates.length === 0 ? <p className="text-xs text-muted py-4">No seasonal plans yet. Base room rates remain active.</p> : rates.map(rate => <div key={rate.id} className="p-3 rounded-lg bg-white/[0.03] border border-border"><div className="flex justify-between"><span className="text-sm text-white font-semibold">{rate.name}</span><span className="text-xs text-gold">{rate.roomTypeId}</span></div><p className="text-xs text-muted mt-1">Weekday {formatMoney(rate.weekdayRate, currency)} · Weekend {formatMoney(rate.weekendRate, currency)}</p><p className="text-[10px] text-muted mt-1">{toDate(rate.startDate)?.toLocaleDateString() || "Any date"} → {toDate(rate.endDate)?.toLocaleDateString() || "Open ended"}</p></div>)}</div>
        </section>
      </div>

      <section className="card">
        <div className="flex items-center justify-between mb-4"><div><h2 className="font-grotesk font-semibold text-white">Property tax rules</h2><p className="text-xs text-muted mt-1">Configure occupancy tax, VAT/GST, tourism levies, or service charges per property.</p></div><Wrench className="text-gold" size={18} /></div>
        <form onSubmit={submitTax} className="grid grid-cols-1 md:grid-cols-4 gap-2 mb-4"><input className="input" placeholder="Rule name" value={taxForm.name} onChange={e => setTaxForm({ ...taxForm, name: e.target.value })} /><input className="input" type="number" min="0" step="0.1" placeholder="Percentage" value={taxForm.percentage} onChange={e => setTaxForm({ ...taxForm, percentage: Number(e.target.value) })} /><label className="flex items-center gap-2 px-3 text-sm text-muted"><input type="checkbox" checked={taxForm.isInclusive} onChange={e => setTaxForm({ ...taxForm, isInclusive: e.target.checked })} /> Inclusive in room rate</label><button className="btn-ghost justify-center"><Plus size={14} /> Add tax rule</button></form>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">{taxRules.length === 0 ? <p className="text-xs text-muted">No property-specific rules configured.</p> : taxRules.map(rule => <div key={rule.id} className="flex justify-between items-center p-3 rounded-lg border border-border bg-white/[0.03]"><div><p className="text-sm text-white font-semibold">{rule.name}</p><p className="text-xs text-muted">{rule.isInclusive ? "Inclusive" : "Added at billing"}</p></div><span className="text-gold font-bold">{rule.percentage}%</span></div>)}</div>
      </section>
    </div>
  );
}
