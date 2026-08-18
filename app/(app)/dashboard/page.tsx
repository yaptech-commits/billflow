"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { getInvoices, getPayments, getClients, getBusinessProfile, getProducts, getHotelRooms, getReservations, getGuestFolio, getHousekeepingTasks, getPrescriptionsByBusiness, Invoice, Payment, BusinessProfile, BusinessModule, CURRENCIES } from "@/lib/db";
import { getProductBatchesForBusiness, getInsuranceClaimsForBusiness, getStockAdjustmentsForBusiness, getControlledSubstanceLogsForBusiness } from "@/lib/pharmacy-db";
import { buildTermAnalytics, getAssessments, getAttendance, getAvailableTerms, getSchoolClasses, getStudentFees, getStudents } from "@/lib/school-db";
import StatCard from "@/components/ui/StatCard";
import Badge from "@/components/ui/Badge";
import { formatMoney } from "@/lib/utils";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Plus } from "lucide-react";
import Link from "next/link";
import BusinessModuleDashboard, { DashboardModuleData } from "@/components/dashboard/BusinessModuleDashboard";

function resolveActiveModules(profile: BusinessProfile | null): BusinessModule[] {
  if (profile?.activeModules?.length) return profile.activeModules;
  switch (profile?.businessType) {
    case "hotel": return ["hotel"];
    case "pharmacy": return ["pharmacy"];
    case "coldstore": return ["coldstore"];
    case "school": return ["school"];
    default: return ["general"];
  }
}

export default function DashboardPage() {
  const { user, businessId, role } = useAuth();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [clients, setClients] = useState<number>(0);
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [moduleData, setModuleData] = useState<DashboardModuleData>({});
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    if (!user || !businessId) return;
    setLoading(true);
    const invoiceOpts = role === "salesperson" ? { onlyUserId: user.uid } : undefined;
    const safe = async <T,>(request: Promise<T>, fallback: T) => {
      try { return await request; } catch (error) { console.warn("Dashboard module data unavailable", error); return fallback; }
    };

    try {
      const [inv, pay, cli, prof] = await Promise.all([
        getInvoices(businessId, invoiceOpts),
        getPayments(businessId),
        getClients(businessId),
        getBusinessProfile(businessId),
      ]);

      const offlineSales = typeof window !== "undefined" ? JSON.parse(localStorage.getItem("billflow_offline_sales") || "[]") : [];
      const offlineInvoices: Invoice[] = offlineSales.map((s: any) => ({
        id: s.id,
        invoiceNumber: `OFFLINE-${s.id.slice(0, 5)}`,
        clientId: s.data.clientId || "",
        clientName: s.data.customerName || "Walk-in Customer",
        item: s.data.items.map((li: any) => `${li.productName} ×${li.quantity}`).join(", "),
        amount: s.data.amount || s.data.items.reduce((sum: number, l: any) => sum + (l.quantity * l.unitPrice), 0),
        status: "paid",
        issuedAt: { toDate: () => new Date(s.timestamp) } as any,
        isOffline: true
      }));
      const offlinePayments: Payment[] = offlineSales.map((s: any) => ({
        id: s.id,
        clientName: s.data.customerName || "Walk-in Customer",
        amount: s.data.amount || s.data.items.reduce((sum: number, l: any) => sum + (l.quantity * l.unitPrice), 0),
        method: s.data.paymentMethod || s.data.method,
        status: "success",
        createdAt: { toDate: () => new Date(s.timestamp) } as any,
        isOffline: true
      }));

      setInvoices([...offlineInvoices, ...inv]);
      setPayments([...offlinePayments, ...pay]);
      setClients(cli.length);
      setProfile(prof);

      const modules = resolveActiveModules(prof);
      const nextData: DashboardModuleData = {};
      if (modules.includes("hotel")) {
        const [rooms, reservations, housekeeping] = await Promise.all([
          safe(getHotelRooms(businessId, prof?.propertyId || "default_property"), []),
          safe(getReservations(businessId, prof?.propertyId || "default_property"), []),
          safe(getHousekeepingTasks(businessId, prof?.propertyId || "default_property"), []),
        ]);
        const folios = (await Promise.all(reservations.filter(item => Boolean(item.id)).map(item => safe(getGuestFolio(businessId, item.id as string), null)))).filter(Boolean) as NonNullable<Awaited<ReturnType<typeof getGuestFolio>>>[];
        nextData.hotel = { rooms, reservations, housekeeping, folios };
      }
      if (modules.includes("pharmacy")) {
        const [products, batches, prescriptions, claims, controlledLogs, adjustments] = await Promise.all([
          safe(getProducts(businessId), []),
          safe(getProductBatchesForBusiness(businessId), []),
          safe(getPrescriptionsByBusiness(businessId), []),
          safe(getInsuranceClaimsForBusiness(businessId), []),
          safe(getControlledSubstanceLogsForBusiness(businessId), []),
          safe(getStockAdjustmentsForBusiness(businessId), []),
        ]);
        nextData.pharmacy = { products, batches, prescriptions, claims, controlledLogs, adjustments, invoices: [...offlineInvoices, ...inv] };
      }
      if (modules.includes("coldstore")) {
        const [products, batches, adjustments] = await Promise.all([
          safe(getProducts(businessId), []),
          safe(getProductBatchesForBusiness(businessId), []),
          safe(getStockAdjustmentsForBusiness(businessId), []),
        ]);
        nextData.coldstore = { products, batches, adjustments };
      }
      if (modules.includes("school")) {
        const propertyId = prof?.propertyId || "default_property";
        const [students, classes, fees, attendance, assessments] = await Promise.all([
          safe(getStudents(businessId, propertyId), []),
          safe(getSchoolClasses(businessId, propertyId), []),
          safe(getStudentFees(businessId, propertyId), []),
          safe(getAttendance(businessId, propertyId), []),
          safe(getAssessments(businessId, propertyId), []),
        ]);
        const terms = getAvailableTerms(assessments, attendance);
        const term = terms[terms.length - 1] || "";
        nextData.school = {
          students,
          classes,
          fees,
          attendance,
          assessments,
          term,
          analytics: buildTermAnalytics(students, assessments, attendance, term),
        };
      }
      setModuleData(nextData);
    } catch (error) {
      console.error("Dashboard data load failed", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    
    window.addEventListener("billflow_refresh", loadData);
    return () => window.removeEventListener("billflow_refresh", loadData);
  }, [user, businessId, role]);

  const totalRevenue = invoices.filter(i => i.status === "paid").reduce((s, i) => s + i.amount, 0);
  const paidCount = invoices.filter(i => i.status === "paid").length;
  const overdue = invoices.filter(i => i.status === "overdue").reduce((s, i) => s + i.amount, 0);
  const currencyCode = profile?.currency;
  const activeModules = resolveActiveModules(profile);
  const showGeneral = activeModules.includes("general");

  // Generate dynamic chart data for the last 7 days
  const dailyData = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const dayStr = d.toLocaleDateString("en-US", { weekday: "short" });
    const dateStr = d.toDateString();
    
    const revenue = invoices
      .filter(inv => {
        if (inv.status !== "paid" || !inv.issuedAt) return false;
        try {
          const date = typeof inv.issuedAt.toDate === 'function' ? inv.issuedAt.toDate() : new Date(inv.issuedAt as any);
          return date.toDateString() === dateStr;
        } catch (e) {
          return false;
        }
      })
      .reduce((sum, inv) => sum + inv.amount, 0);
      
    return { name: dayStr, revenue };
  });

  // Calculate top products (logic based on both legacy text and new items array)
  const topProducts = invoices
    .filter(i => i.status === "paid")
    .reduce((acc, inv) => {
      if (inv.items && Array.isArray(inv.items)) {
        inv.items.forEach(item => {
          acc[item.productName] = (acc[item.productName] || 0) + item.quantity;
        });
      } else if (inv.item) {
        const items = inv.item.split(", ");
        items.forEach(item => {
          const [name, qtyStr] = item.split(" ×");
          const qty = parseInt(qtyStr) || 1;
          acc[name] = (acc[name] || 0) + qty;
        });
      }
      return acc;
    }, {} as Record<string, number>);

  const topProductsData = Object.entries(topProducts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, value]) => ({ name, value }));

  // Payment method breakdown
  const methodTotals = payments.reduce((acc, p) => {
    acc[p.method] = (acc[p.method] || 0) + p.amount;
    return acc;
  }, {} as Record<string, number>);

  const methodData = [
    { name: "Cash", value: methodTotals["cash"] || 0, color: "#F5A623" },
    { name: "MoMo", value: methodTotals["momo"] || 0, color: "#10B981" },
    { name: "Card", value: methodTotals["card"] || 0, color: "#3B82F6" },
  ].filter(d => d.value > 0);

  return (
    <div>
      {profile && activeModules.some(module => module !== "general") ? <BusinessModuleDashboard modules={activeModules} data={moduleData} profile={profile} /> : null}
      {showGeneral ? <>
      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-7">
        <StatCard label="Total Revenue" value={formatMoney(totalRevenue, currencyCode)} delta="14.2% this month" trend="up" accent="gold" />
        <StatCard label="Paid Invoices" value={String(paidCount)} delta={`${paidCount} collected`} trend="up" accent="green" />
        <StatCard label="Active Clients" value={String(clients)} delta="Growing" trend="up" accent="blue" />
        <StatCard label="Overdue" value={formatMoney(overdue, currencyCode)} delta="Needs attention" trend="down" accent="red" />
      </div>

      <div className="grid grid-cols-3 gap-5 mb-7">
        {/* Recent invoices */}
        <div className="col-span-2 card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-grotesk font-semibold text-white">Recent Invoices</h2>
            <Link href="/invoices" className="text-xs text-gold hover:underline">View all</Link>
          </div>

          {loading ? (
            <p className="text-muted text-sm py-8 text-center">Loading...</p>
          ) : invoices.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-muted text-sm mb-3">No invoices yet</p>
              <Link href="/invoices" className="btn-primary inline-flex"><Plus size={14} /> New Invoice</Link>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] text-muted uppercase tracking-wide">
                  <th className="text-left pb-3">Client</th>
                  <th className="text-left pb-3">Item</th>
                  <th className="text-left pb-3">Amount</th>
                  <th className="text-left pb-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {invoices.slice(0, 6).map((inv) => (
                  <tr key={inv.id} className="border-t border-border hover:bg-white/[0.02]">
                    <td className="py-3 text-surface">{inv.clientName}</td>
                    <td className="py-3 text-muted text-xs">{inv.item}</td>
                    <td className="py-3 font-grotesk font-semibold">{formatMoney(inv.amount, currencyCode)}</td>
                    <td className="py-3"><Badge status={inv.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Recent payments */}
        <div className="card">
          <h2 className="font-grotesk font-semibold text-white mb-4">Recent Payments</h2>
          {payments.length === 0 ? (
            <p className="text-muted text-sm py-4 text-center">No payments yet</p>
          ) : (
            <div className="space-y-3">
              {payments.slice(0, 5).map((p) => (
                <div key={p.id} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm bg-gold/10">
                    {p.method === "momo" ? "📱" : "💳"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-surface truncate">{p.clientName}</p>
                    <p className="text-xs text-muted">{p.method === "momo" ? "Mobile Money" : "Card"}</p>
                  </div>
                  <p className="text-sm font-grotesk font-semibold text-green">+{formatMoney(p.amount, currencyCode)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Revenue charts */}
      <div className="grid grid-cols-3 gap-5">
        <div className="col-span-2 card">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="font-grotesk font-semibold text-white">Revenue Performance</h2>
              <p className="text-[10px] text-muted uppercase tracking-wider font-bold mt-1">Daily trend — Last 7 Days</p>
            </div>
            <div className="text-right">
              <p className="text-lg font-grotesk font-bold text-gold">{formatMoney(totalRevenue, currencyCode)}</p>
              <p className="text-[9px] text-muted uppercase font-bold tracking-tighter">Total Period Revenue</p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={dailyData} barSize={36}>
              <defs>
                <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#F5A623" stopOpacity={0.8}/>
                  <stop offset="95%" stopColor="#F5A623" stopOpacity={0.1}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1E1E2E" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: "#7B7B9A", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#7B7B9A", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${profile?.currency ? CURRENCIES[profile.currency as keyof typeof CURRENCIES]?.symbol : ''}${v}`} />
              <Tooltip
                cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                contentStyle={{ background: "#16161F", border: "1px solid #1E1E2E", borderRadius: 8, fontSize: 12 }}
                formatter={(v: number) => [`${profile?.currency ? CURRENCIES[profile.currency as keyof typeof CURRENCIES]?.symbol : ''} ${v.toLocaleString()}`, "Revenue"]}
              />
              <Bar dataKey="revenue" fill="url(#colorRev)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="flex flex-col gap-5">
          <div className="card flex-1">
            <h2 className="font-grotesk font-semibold text-white mb-5">Sales by Method</h2>
            <div className="space-y-4">
              {methodData.length === 0 ? (
                <p className="text-center text-muted text-sm py-4">No sales data</p>
              ) : (
                methodData.map((d) => {
                  const percentage = ((d.value / totalRevenue) * 100).toFixed(1);
                  return (
                    <div key={d.name}>
                      <div className="flex justify-between text-[10px] mb-1.5">
                        <span className="text-muted font-bold uppercase">{d.name}</span>
                        <span className="text-white font-bold">{percentage}%</span>
                      </div>
                      <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                        <div 
                          className="h-full rounded-full transition-all duration-500" 
                          style={{ width: `${percentage}%`, backgroundColor: d.color }} 
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="card flex-1">
            <h2 className="font-grotesk font-semibold text-white mb-4 text-sm">Top Products</h2>
            <div className="space-y-3">
              {topProductsData.length === 0 ? (
                <p className="text-center text-muted text-[10px] py-2">No product data</p>
              ) : (
                topProductsData.map((p, idx) => (
                  <div key={p.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[10px] text-muted font-bold w-3">{idx + 1}.</span>
                      <span className="text-xs text-surface truncate">{p.name}</span>
                    </div>
                    <span className="text-[10px] bg-white/5 px-2 py-0.5 rounded text-muted font-bold">{p.value} sold</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
      </> : null}
    </div>
  );
}
