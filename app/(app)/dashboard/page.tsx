"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { getInvoices, getPayments, getClients, getBusinessProfile, Invoice, Payment, BusinessProfile, CURRENCIES } from "@/lib/db";
import StatCard from "@/components/ui/StatCard";
import Badge from "@/components/ui/Badge";
import { formatMoney } from "@/lib/utils";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Plus } from "lucide-react";
import Link from "next/link";

export default function DashboardPage() {
  const { user, businessId, role } = useAuth();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [clients, setClients] = useState<number>(0);
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !businessId) return;
    const invoiceOpts = role === "salesperson" ? { onlyUserId: user.uid } : undefined;
    Promise.all([
      getInvoices(businessId, invoiceOpts),
      getPayments(businessId),
      getClients(businessId),
      getBusinessProfile(businessId),
    ]).then(([inv, pay, cli, prof]) => {
      // Merge with offline records
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
      setLoading(false);
    });
  }, [user, businessId, role]);

  const totalRevenue = invoices.filter(i => i.status === "paid").reduce((s, i) => s + i.amount, 0);
  const paidCount = invoices.filter(i => i.status === "paid").length;
  const overdue = invoices.filter(i => i.status === "overdue").reduce((s, i) => s + i.amount, 0);
  const currencyCode = profile?.currency;

  // Generate dynamic chart data for the last 7 days
  const dailyData = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const dayStr = d.toLocaleDateString("en-US", { weekday: "short" });
    const dateStr = d.toDateString();
    
    const revenue = invoices
      .filter(inv => inv.status === "paid" && inv.issuedAt?.toDate().toDateString() === dateStr)
      .reduce((sum, inv) => sum + inv.amount, 0);
      
    return { name: dayStr, revenue };
  });

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
            <h2 className="font-grotesk font-semibold text-white">Daily Revenue — Last 7 Days</h2>
            <span className="text-xs text-muted">{profile?.businessName}</span>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={dailyData} barSize={32}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1E1E2E" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: "#7B7B9A", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#7B7B9A", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${profile?.currency ? CURRENCIES[profile.currency as keyof typeof CURRENCIES]?.symbol : ''}${v}`} />
              <Tooltip
                contentStyle={{ background: "#16161F", border: "1px solid #1E1E2E", borderRadius: 8, fontSize: 12 }}
                formatter={(v: number) => [`${profile?.currency ? CURRENCIES[profile.currency as keyof typeof CURRENCIES]?.symbol : ''} ${v.toLocaleString()}`, "Revenue"]}
              />
              <Bar dataKey="revenue" fill="#F5A623" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <h2 className="font-grotesk font-semibold text-white mb-5">Sales by Method</h2>
          <div className="h-[200px] flex flex-col justify-center">
            {methodData.length === 0 ? (
              <p className="text-center text-muted text-sm">No sales data</p>
            ) : (
              <div className="space-y-4">
                {methodData.map((d) => {
                  const percentage = ((d.value / totalRevenue) * 100).toFixed(1);
                  return (
                    <div key={d.name}>
                      <div className="flex justify-between text-xs mb-1.5">
                        <span className="text-muted">{d.name}</span>
                        <span className="text-white font-medium">{percentage}%</span>
                      </div>
                      <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                        <div 
                          className="h-full rounded-full transition-all duration-500" 
                          style={{ width: `${percentage}%`, backgroundColor: d.color }} 
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
