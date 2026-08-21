"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { getInvoices, getPayments, Invoice, Payment } from "@/lib/db";
import { formatCedi } from "@/lib/utils";
import StatCard from "@/components/ui/StatCard";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, PieChart, Pie, Cell, Legend,
} from "recharts";

export default function ReportsPage() {
  const { user, businessId, role } = useAuth();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);

  const load = () => {
    if (!user || !businessId) return;
    const invoiceOpts = role === "salesperson" ? { onlyUserId: user.uid } : undefined;
    Promise.all([getInvoices(businessId, invoiceOpts), getPayments(businessId)]).then(([inv, pay]) => {
      // Merge every unsynced queue into the report so offline activity remains
      // visible until the authenticated reconnect worker removes it.
      const parseQueue = (key: string) => {
        if (typeof window === "undefined") return [];
        try {
          const parsed = JSON.parse(localStorage.getItem(key) || "[]");
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [];
        }
      };
      const offlineSales = parseQueue("billflow_offline_sales");
      const manualOfflineInvoices = parseQueue("billflow_offline_invoices");
      const manualOfflinePayments = parseQueue("billflow_offline_payments");
      const isVisible = (record: any) => {
        const data = record?.data || {};
        return data.businessId === businessId && (role !== "salesperson" || data.userId === user.uid);
      };
      const offlineDate = (timestamp: unknown) => ({ toDate: () => new Date(typeof timestamp === "number" ? timestamp : Date.now()) }) as any;
      const saleAmount = (s: any) => Number(s?.data?.amount) || (Array.isArray(s?.data?.items) ? s.data.items.reduce((sum: number, l: any) => sum + (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0), 0) : 0);

      const offlineInvoices: Invoice[] = [
        ...offlineSales.filter(isVisible).map((s: any) => ({
          id: s.id,
          businessId,
          userId: s.data.userId || user.uid,
          clientId: s.data.clientId || "",
          clientName: s.data.customerName || "Walk-in Customer",
          amount: saleAmount(s),
          amountPaid: s.data.amountPaid ?? saleAmount(s),
          status: "paid",
          paymentMethod: s.data.paymentMethod || s.data.method || "cash",
          issuedAt: offlineDate(s.timestamp),
          dueAt: null,
          isOffline: true,
        } as any)),
        ...manualOfflineInvoices.filter(isVisible).map((s: any) => ({
          ...s.data,
          id: s.id,
          businessId,
          userId: s.data.userId || user.uid,
          amount: Number(s.data.amount) || 0,
          issuedAt: offlineDate(s.timestamp),
          dueAt: s.data.dueDate ? offlineDate(new Date(s.data.dueDate).getTime()) : null,
          isOffline: true,
        } as any)),
      ];

      const offlinePayments: Payment[] = [
        ...offlineSales.filter(isVisible).map((s: any) => ({
          id: `sale-payment-${s.id}`,
          businessId,
          userId: s.data.userId || user.uid,
          clientId: s.data.clientId || "",
          clientName: s.data.customerName || "Walk-in Customer",
          amount: saleAmount(s),
          method: s.data.paymentMethod || s.data.method || "cash",
          status: "success",
          createdAt: offlineDate(s.timestamp),
          isOffline: true,
        } as any)),
        ...manualOfflinePayments.filter(isVisible).map((s: any) => ({
          ...s.data,
          id: s.id,
          businessId,
          userId: s.data.userId || user.uid,
          amount: Number(s.data.amount) || 0,
          createdAt: offlineDate(s.timestamp),
          isOffline: true,
        } as any)),
      ];

      setInvoices([...offlineInvoices, ...inv]);
      setPayments([...offlinePayments, ...pay]);
    });
  };

  useEffect(() => {
    load();
    window.addEventListener("billflow_refresh", load);
    return () => window.removeEventListener("billflow_refresh", load);
  }, [user, businessId, role]);

  const totalRevenue = invoices.filter(i => i.status === "paid").reduce((s, i) => s + i.amount, 0);
  const totalCollected = payments.filter(p => p.status === "success").reduce((s, p) => s + p.amount, 0);
  const outstanding = invoices.filter(i => ["pending", "overdue"].includes(i.status)).reduce((s, i) => s + i.amount, 0);
  const rate = totalRevenue > 0 ? ((totalCollected / totalRevenue) * 100).toFixed(1) : "0";

  const momoTotal = payments.filter(p => p.method === "momo" && p.status === "success").reduce((s, p) => s + p.amount, 0);
  const cardTotal = payments.filter(p => p.method === "card" && p.status === "success").reduce((s, p) => s + p.amount, 0);
  const cashTotal = payments.filter(p => p.method === "cash" && p.status === "success").reduce((s, p) => s + p.amount, 0);
  
  const pieData = [
    { name: "Cash", value: cashTotal, color: "#F5A623" },
    { name: "MoMo", value: momoTotal, color: "#10B981" },
    { name: "Card", value: cardTotal, color: "#3B82F6" },
  ].filter(d => d.value > 0);

  // Generate dynamic chart data for the last 30 days
  const monthlyData = Array.from({ length: 30 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (29 - i));
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
      
    return { name: d.getDate().toString(), revenue };
  });

  const dailyData = monthlyData.slice(-7);

  return (
    <div>
      <div className="grid grid-cols-4 gap-4 mb-7">
        <StatCard label="Total Revenue" value={formatCedi(totalRevenue)} delta="Jan–Jul 2026" accent="gold" />
        <StatCard label="Total Collected" value={formatCedi(totalCollected)} delta={`${rate}% collection rate`} accent="green" />
        <StatCard label="Avg Invoice" value={formatCedi(invoices.length ? totalRevenue / invoices.length : 0)} delta={`${invoices.length} invoices`} accent="blue" />
        <StatCard label="Outstanding" value={formatCedi(outstanding)} trend="down" delta="Needs chasing" accent="red" />
      </div>

      <div className="grid grid-cols-3 gap-5">
        <div className="col-span-2 card">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="font-grotesk font-semibold text-white">Revenue Trend</h2>
              <p className="text-[10px] text-muted uppercase tracking-wider font-bold mt-1">Monthly snapshot — Last 30 Days</p>
            </div>
            <div className="flex gap-4 text-xs text-muted">
              <span className="flex items-center gap-1.5 font-bold uppercase tracking-tighter"><span className="w-2.5 h-2.5 rounded-sm bg-gold inline-block" /> Revenue</span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={monthlyData} barSize={12}>
              <defs>
                <linearGradient id="colorRevRep" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#F5A623" stopOpacity={0.8}/>
                  <stop offset="95%" stopColor="#F5A623" stopOpacity={0.1}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1E1E2E" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: "#7B7B9A", fontSize: 9 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#7B7B9A", fontSize: 9 }} axisLine={false} tickLine={false} tickFormatter={v => `₵${v}`} />
              <Tooltip 
                cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                contentStyle={{ background: "#16161F", border: "1px solid #1E1E2E", borderRadius: 8, fontSize: 12 }} 
                formatter={(v: number) => [`GH₵ ${v.toLocaleString()}`, "Revenue"]} 
              />
              <Bar dataKey="revenue" fill="url(#colorRevRep)" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <h2 className="font-grotesk font-semibold text-white mb-5">Payment Method Breakdown</h2>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={75} paddingAngle={4} dataKey="value">
                {pieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Legend formatter={(v) => <span style={{ fontSize: 11, color: "#7B7B9A" }}>{v}</span>} />
              <Tooltip contentStyle={{ background: "#16161F", border: "1px solid #1E1E2E", borderRadius: 8, fontSize: 12 }} formatter={(v: number) => [`GH₵ ${v.toLocaleString()}`, ""]} />
            </PieChart>
          </ResponsiveContainer>
          <div className="mt-4 space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-muted">Cash Sales</span>
              <span className="font-grotesk font-semibold text-gold">{formatCedi(cashTotal)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted">MoMo Payments</span>
              <span className="font-grotesk font-semibold text-green">{formatCedi(momoTotal)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted">Card Payments</span>
              <span className="font-grotesk font-semibold text-blue">{formatCedi(cardTotal)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
