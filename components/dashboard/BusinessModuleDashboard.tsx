"use client";

/** BillFlow dashboard design note: reuse the dark operational card language while keeping each active business module clearly labeled and actionable. */
import Link from "next/link";
import { AlertTriangle, BedDouble, CalendarCheck, CheckCircle2, ClipboardList, ConciergeBell, CreditCard, Pill, ShieldCheck, Thermometer, Truck, Users, Warehouse } from "lucide-react";
import StatCard from "@/components/ui/StatCard";
import { BusinessModule, BusinessProfile, ControlledSubstanceLog, GuestFolio, HotelRoom, HousekeepingTask, InsuranceClaim, Invoice, Product, ProductBatch, Prescription, Reservation, StockAdjustment } from "@/lib/db";
import { formatMoney } from "@/lib/utils";

export interface HotelDashboardModuleData {
  rooms: HotelRoom[];
  reservations: Reservation[];
  folios: GuestFolio[];
  housekeeping: HousekeepingTask[];
}

export interface PharmacyDashboardModuleData {
  products: Product[];
  batches: ProductBatch[];
  prescriptions: Prescription[];
  claims: InsuranceClaim[];
  controlledLogs: ControlledSubstanceLog[];
  adjustments: StockAdjustment[];
  invoices: Invoice[];
}

export interface DashboardModuleData {
  hotel?: HotelDashboardModuleData;
  pharmacy?: PharmacyDashboardModuleData;
  coldstore?: {
    products: Product[];
    batches: ProductBatch[];
    adjustments: StockAdjustment[];
  };
}

function toDate(value: any): Date | null {
  if (!value) return null;
  try { return typeof value.toDate === "function" ? value.toDate() : new Date(value); } catch { return null; }
}

function isToday(value: any) { return toDate(value)?.toDateString() === new Date().toDateString(); }
function isWithinDays(value: any, days: number) {
  const date = toDate(value);
  if (!date) return false;
  const now = new Date();
  const limit = new Date();
  limit.setDate(now.getDate() + days);
  return date >= now && date <= limit;
}
function nightsBetween(start: any, end: any) {
  const from = toDate(start);
  const to = toDate(end);
  if (!from || !to) return 0;
  return Math.max(1, Math.ceil((to.getTime() - from.getTime()) / 86400000));
}
function isDrug(product: Product) {
  const label = `${product.name} ${product.category || ""}`.toLowerCase();
  return Boolean(product.isPrescriptionRequired || product.trackBatches || /drug|medicine|pharmacy|tablet|capsule|syrup|injection|cream/.test(label));
}
function SectionHeading({ title, description, href, icon }: { title: string; description: string; href: string; icon: React.ReactNode }) {
  return <div className="flex items-start justify-between gap-4 mb-4"><div className="flex items-start gap-3"><div className="w-9 h-9 rounded-lg bg-gold/10 text-gold flex items-center justify-center">{icon}</div><div><h2 className="font-grotesk font-semibold text-white">{title}</h2><p className="text-xs text-muted mt-1">{description}</p></div></div><Link href={href} className="text-xs text-gold hover:underline whitespace-nowrap">View details</Link></div>;
}
function ModuleStat({ href, label, value, delta, trend, accent }: { href: string; label: string; value: string; delta?: string; trend?: "up" | "down"; accent?: "gold" | "green" | "blue" | "red" }) {
  return <Link href={href} className="block hover:-translate-y-0.5 transition-transform"><StatCard label={label} value={value} delta={delta} trend={trend} accent={accent} /></Link>;
}

function HotelSection({ data, profile }: { data: HotelDashboardModuleData; profile: BusinessProfile }) {
  const { rooms, reservations, folios, housekeeping } = data;
  const occupiedRooms = rooms.filter(room => room.occupancyStatus === "occupied");
  const occupiedRoomIds = new Set(occupiedRooms.map(room => room.id).filter(Boolean));
  const reservedRoomIds = new Set(reservations.filter(item => item.status === "booked" && item.roomId && !occupiedRoomIds.has(item.roomId)).map(item => item.roomId));
  const reservedCount = reservedRoomIds.size;
  const freeCount = Math.max(0, rooms.length - occupiedRooms.length - reservedCount);
  const arrivals = reservations.filter(item => item.status === "booked" && isToday(item.checkInDate));
  const departures = reservations.filter(item => item.status === "checked_in" && isToday(item.checkOutDate));
  const checkedIn = reservations.filter(item => item.status === "checked_in");
  const roomRevenue = folios.reduce((sum, folio) => sum + folio.items.filter(item => item.type === "room_charge" && !item.isVoided).reduce((total, item) => total + item.amount, 0), 0);
  const ancillaryRevenue = folios.reduce((sum, folio) => sum + folio.items.filter(item => ["food_beverage", "service"].includes(item.type) && !item.isVoided).reduce((total, item) => total + item.amount, 0), 0);
  const roomNights = reservations.filter(item => !["cancelled", "no_show"].includes(item.status)).reduce((sum, item) => sum + nightsBetween(item.checkInDate, item.checkOutDate), 0);
  const adr = roomNights ? roomRevenue / roomNights : 0;
  const revPar = rooms.length ? roomRevenue / rooms.length : 0;
  const dirtyRooms = rooms.filter(room => room.status === "dirty").length;
  const cleanRooms = rooms.filter(room => room.status === "clean" || room.status === "inspected").length;
  const outstanding = checkedIn.filter(item => folios.find(folio => folio.reservationId === item.id)?.balanceDue).length;
  const trend = Array.from({ length: 7 }, (_, index) => {
    const day = new Date();
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() - (6 - index));
    const occupied = reservations.filter(item => {
      const start = toDate(item.checkInDate);
      const end = toDate(item.checkOutDate);
      return !["cancelled", "no_show"].includes(item.status) && start && end && start <= day && end > day;
    }).length;
    return { label: day.toLocaleDateString("en-US", { weekday: "short" }), value: rooms.length ? Math.round((occupied / rooms.length) * 100) : 0 };
  });
  const recentStays = [...reservations].filter(item => item.status === "checked_in" || item.status === "checked_out").sort((a, b) => (toDate(b.createdAt)?.getTime() || 0) - (toDate(a.createdAt)?.getTime() || 0)).slice(0, 5);

  return <section className="space-y-4 mb-8"><SectionHeading title={`${profile.propertyName || profile.businessName} · Hotel`} description="Property performance, desk activity, folios, and room readiness." href="/hotel/reports" icon={<BedDouble size={18} />} /><div className="grid grid-cols-2 md:grid-cols-4 gap-4"><ModuleStat href="/hotel/reports" label="Occupancy rate" value={`${rooms.length ? Math.round((occupiedRooms.length / rooms.length) * 100) : 0}%`} delta={`${occupiedRooms.length}/${rooms.length} rooms today`} trend="up" accent="blue" /><ModuleStat href="/hotel/reports" label="ADR" value={formatMoney(adr, profile.currency)} delta="Average daily rate" accent="gold" /><ModuleStat href="/hotel/reports" label="RevPAR" value={formatMoney(revPar, profile.currency)} delta="Revenue per available room" accent="green" /><ModuleStat href="/hotel/front-desk" label="Outstanding folios" value={String(outstanding)} delta="Checked-in guests with balance" trend={outstanding ? "down" : "up"} accent={outstanding ? "red" : "green"} /></div><div className="grid grid-cols-2 md:grid-cols-5 gap-4"><ModuleStat href="/hotel/room-pos" label="Free rooms" value={String(freeCount)} delta="Ready for assignment" accent="green" /><ModuleStat href="/hotel/room-pos" label="Reserved rooms" value={String(reservedCount)} delta="Upcoming stays" accent="gold" /><ModuleStat href="/hotel/room-pos" label="Occupied rooms" value={String(occupiedRooms.length)} delta="Currently in house" accent="blue" /><ModuleStat href="/hotel/front-desk" label="Today's arrivals" value={String(arrivals.length)} delta="Scheduled check-ins" accent="gold" /><ModuleStat href="/hotel/front-desk" label="Today's departures" value={String(departures.length)} delta="Scheduled check-outs" accent="green" /></div><div className="grid md:grid-cols-3 gap-5"><div className="card md:col-span-2"><div className="flex items-center justify-between mb-4"><div><h3 className="font-grotesk font-semibold text-white">Occupancy trend</h3><p className="text-[10px] text-muted uppercase tracking-wider mt-1">Last 7 days</p></div><Link href="/hotel/reports" className="text-xs text-gold hover:underline">Revenue & audit</Link></div><div className="flex items-end gap-3 h-32">{trend.map(item => <div key={item.label} className="flex-1 h-full flex flex-col items-center justify-end gap-2"><div className="w-full rounded-t bg-blue/70 min-h-[4px]" style={{ height: `${Math.max(4, item.value)}%` }} title={`${item.value}%`} /><span className="text-[10px] text-muted">{item.label}</span></div>)}</div></div><div className="card"><h3 className="font-grotesk font-semibold text-white mb-4">Room & housekeeping status</h3><div className="space-y-3 text-sm"><Link href="/hotel/room-pos" className="flex justify-between text-surface hover:text-gold"><span>Free / Reserved / Occupied</span><span className="text-white font-semibold">{freeCount} / {reservedCount} / {occupiedRooms.length}</span></Link><Link href="/hotel/rooms" className="flex justify-between text-surface hover:text-gold"><span>Clean rooms</span><span className="text-green font-semibold">{cleanRooms}</span></Link><Link href="/hotel/rooms" className="flex justify-between text-surface hover:text-gold"><span>Need cleaning</span><span className="text-red font-semibold">{dirtyRooms}</span></Link><div className="flex justify-between text-surface"><span>Pending tasks</span><span className="text-gold font-semibold">{housekeeping.filter(task => task.status !== "completed").length}</span></div></div></div></div><div className="grid md:grid-cols-3 gap-5"><div className="card"><h3 className="font-grotesk font-semibold text-white mb-3">Revenue mix</h3><div className="space-y-3"><div className="flex justify-between text-sm"><span className="text-muted">Room revenue</span><span className="text-white font-semibold">{formatMoney(roomRevenue, profile.currency)}</span></div><div className="flex justify-between text-sm"><span className="text-muted">F&amp;B and services</span><span className="text-white font-semibold">{formatMoney(ancillaryRevenue, profile.currency)}</span></div></div></div><div className="card md:col-span-2"><div className="flex items-center justify-between mb-3"><h3 className="font-grotesk font-semibold text-white">Recent check-ins / check-outs</h3><Link href="/hotel/front-desk" className="text-xs text-gold hover:underline">Front desk</Link></div>{recentStays.length === 0 ? <p className="text-sm text-muted py-5 text-center">No recent stay activity.</p> : <div className="space-y-2">{recentStays.map(item => <div key={item.id} className="flex items-center justify-between py-2 border-b border-border last:border-0"><div><p className="text-sm text-surface">{item.guestName}</p><p className="text-xs text-muted">Room {item.roomNumber || item.roomType}</p></div><span className="text-[10px] uppercase font-bold text-blue">{item.status.replace("_", " ")}</span></div>)}</div>}</div></div></section>;
}

function PharmacySection({ data, profile }: { data: PharmacyDashboardModuleData; profile: BusinessProfile }) {
  const drugProducts = data.products.filter(isDrug);
  const drugIds = new Set(drugProducts.map(product => product.id).filter(Boolean));
  const drugInvoices = data.invoices.filter(invoice => invoice.items?.some(item => drugIds.has(item.productId)));
  const drugRevenue = drugInvoices.reduce((sum, invoice) => sum + invoice.amount, 0);
  const lowStock = drugProducts.filter(product => product.stockQty <= (product.reorderLevel ?? 5));
  const expiryAlerts = data.batches.filter(batch => drugIds.has(batch.productId) && isWithinDays(batch.expiryDate, 30));
  const prescriptionsToday = data.prescriptions.filter(item => isToday(item.issuedAt)).length;
  const prescriptionsWeek = data.prescriptions.filter(item => isWithinDays(item.issuedAt, 7)).length;
  const claims = { pending: data.claims.filter(item => item.status === "pending" || item.status === "submitted").length, approved: data.claims.filter(item => item.status === "approved" || item.status === "paid").length, rejected: data.claims.filter(item => item.status === "rejected").length };
  const controlledToday = data.controlledLogs.filter(item => isToday(item.dispensedAt)).reduce((sum, item) => sum + item.quantityDispensed, 0);
  const topDrugs = drugInvoices.reduce((acc, invoice) => { (invoice.items || []).filter(item => drugIds.has(item.productId)).forEach(item => { acc[item.productName] = (acc[item.productName] || 0) + item.quantity; }); return acc; }, {} as Record<string, number>);
  const topDrugEntries = Object.entries(topDrugs).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const recentAdjustments = data.adjustments.slice(0, 5);

  return <section className="space-y-4 mb-8"><SectionHeading title="Pharmacy operations" description="Drug sales, stock risk, clinical activity, and claims visibility." href="/drugs" icon={<Pill size={18} />} /><div className="grid grid-cols-2 md:grid-cols-4 gap-4"><ModuleStat href="/reports" label="Drug sales revenue" value={formatMoney(drugRevenue, profile.currency)} delta="Paid invoices containing drugs" accent="gold" /><ModuleStat href="/expiry-alerts" label="Expiry alerts" value={String(expiryAlerts.length)} delta="Next 30 days" trend={expiryAlerts.length ? "down" : "up"} accent={expiryAlerts.length ? "red" : "green"} /><ModuleStat href="/products" label="Low-stock drugs" value={String(lowStock.length)} delta="At or below reorder level" trend={lowStock.length ? "down" : "up"} accent={lowStock.length ? "red" : "green"} /><ModuleStat href="/prescriptions" label="Prescriptions" value={String(prescriptionsToday)} delta={`${prescriptionsWeek} in the last 7 days`} accent="blue" /></div><div className="grid grid-cols-2 md:grid-cols-4 gap-4"><ModuleStat href="/insurance-claims" label="Claims pending" value={String(claims.pending)} delta={`${claims.approved} approved / ${claims.rejected} rejected`} accent="gold" /><ModuleStat href="/controlled-substances" label="Controlled dispensed" value={String(controlledToday)} delta="Units today" accent="red" /><ModuleStat href="/stock-adjustments" label="Recent adjustments" value={String(data.adjustments.length)} delta="Loss and stock corrections" accent="blue" /><ModuleStat href="/drugs" label="Tracked drug SKUs" value={String(drugProducts.length)} delta="Products in pharmacy view" accent="green" /></div><div className="grid md:grid-cols-3 gap-5"><div className="card md:col-span-2"><div className="flex items-center justify-between mb-4"><div><h3 className="font-grotesk font-semibold text-white">Top-selling drugs</h3><p className="text-xs text-muted mt-1">Derived from the existing invoice item lines.</p></div><Pill className="text-gold" size={18} /></div>{topDrugEntries.length === 0 ? <p className="text-sm text-muted py-6 text-center">No drug sales recorded yet.</p> : <div className="space-y-3">{topDrugEntries.map(([name, quantity], index) => <div key={name} className="flex items-center justify-between"><div className="flex items-center gap-3"><span className="text-xs text-muted w-4">{index + 1}.</span><span className="text-sm text-surface">{name}</span></div><span className="text-xs text-muted">{quantity} sold</span></div>)}</div>}</div><div className="card"><h3 className="font-grotesk font-semibold text-white mb-4">Recent adjustments</h3>{recentAdjustments.length === 0 ? <p className="text-sm text-muted py-5 text-center">No stock adjustments.</p> : <div className="space-y-3">{recentAdjustments.map(item => <div key={item.id} className="border-b border-border last:border-0 pb-2"><p className="text-sm text-surface truncate">{item.productName}</p><p className="text-xs text-muted">{item.reason} · {item.quantityAdjusted}</p></div>)}</div>}</div></div></section>;
}

function ColdStoreSection({ data, profile }: { data: NonNullable<DashboardModuleData["coldstore"]>; profile: BusinessProfile }) {
  const freshness = data.batches.filter(batch => isWithinDays(batch.expiryDate, 30));
  const wastage = data.adjustments.filter(item => item.reason === "wastage" || item.reason === "damage" || item.reason === "expired");
  const wastageValue = wastage.reduce((sum, item) => sum + Math.abs(item.quantityAdjusted), 0);
  return <section className="space-y-4 mb-8"><SectionHeading title="Cold Store" description="Batch freshness and stock-loss signals from the existing inventory records." href="/temperature-monitoring" icon={<Warehouse size={18} />} /><div className="grid grid-cols-2 md:grid-cols-4 gap-4"><ModuleStat href="/temperature-monitoring" label="Storage units" value="Not configured" delta="Connect storage telemetry" accent="blue" /><ModuleStat href="/temperature-monitoring" label="Temperature excursions" value="Not configured" delta="No telemetry source yet" accent="gold" /><ModuleStat href="/expiry-alerts" label="Freshness alerts" value={String(freshness.length)} delta="Batches within 30 days" trend={freshness.length ? "down" : "up"} accent={freshness.length ? "red" : "green"} /><ModuleStat href="/stock-adjustments" label="Recent wastage units" value={String(wastageValue)} delta={`${wastage.length} damage / wastage records`} accent="red" /></div><div className="card"><div className="flex items-center gap-3 mb-3"><Thermometer className="text-gold" size={18} /><div><h3 className="font-grotesk font-semibold text-white">Cold-store data boundary</h3><p className="text-xs text-muted mt-1">Freshness and wastage use existing batch and stock-adjustment records; live unit and temperature counts remain unavailable until telemetry records are configured.</p></div></div><Link href="/temperature-monitoring" className="text-xs text-gold hover:underline">Open temperature monitoring</Link></div></section>;
}

export default function BusinessModuleDashboard({ modules, data, profile }: { modules: BusinessModule[]; data: DashboardModuleData; profile: BusinessProfile }) {
  return <div>{modules.includes("hotel") && data.hotel ? <HotelSection data={data.hotel} profile={profile} /> : null}{modules.includes("pharmacy") && data.pharmacy ? <PharmacySection data={data.pharmacy} profile={profile} /> : null}{modules.includes("coldstore") && data.coldstore ? <ColdStoreSection data={data.coldstore} profile={profile} /> : null}</div>;
}
