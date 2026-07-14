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

const chartData = [
  { month: "Jan", revenue: 1800 }, { month: "Feb", revenue: 2200 },
  { month: "Mar", revenue: 1600 }, { month: "Apr", revenue: 2800 },
  { month: "May", revenue: 3100 }, { month: "Jun", revenue: 2900 },
  { month: "Jul", revenue: 3840 },
];

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
      getPayments(user.uid),
      getClients(businessId),
      getBusinessProfile(businessId),
    ]).then(([inv, pay, cli, prof]) => {
      setInvoices(inv);
      setPayments(pay);
      setClients(cli.length);
      setProfile(prof);
      setLoading(false);
    });
  }, [user, businessId, role]);

  const totalRevenue = invoices.filter(i => i.status === "paid").reduce((s, i) => s + i.amount, 0);
  const paidCount = invoices.filter(i => i.status === "paid").length;
  const overdue = invoices.filter(i => i.status === "overdue").reduce((s, i) => s + i.amount, 0);
  const currencyCode = profile?.currency;

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

      {/* Revenue chart */}
      <div className="card">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-grotesk font-semibold text-white">Revenue — Last 7 Months</h2>
          <span className="text-xs text-muted">{profile?.currency ? `${profile.currency} — ${profile.businessName}` : 'Loading...'}</span>
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={chartData} barSize={28}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1E1E2E" vertical={false} />
            <XAxis dataKey="month" tick={{ fill: "#7B7B9A", fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "#7B7B9A", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${profile?.currency ? CURRENCIES[profile.currency as keyof typeof CURRENCIES]?.symbol : ''}${v}`} />
            <Tooltip
              contentStyle={{ background: "#16161F", border: "1px solid #1E1E2E", borderRadius: 8, fontSize: 12 }}
              formatter={(v: number) => [`${profile?.currency ? CURRENCIES[profile.currency as keyof typeof CURRENCIES]?.symbol : ''} ${v.toLocaleString()}`, "Revenue"]}
            />
            <Bar dataKey="revenue" fill="#F5A623" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
