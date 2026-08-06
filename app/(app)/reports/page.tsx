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

  useEffect(() => {
    if (!user || !businessId) return;
    const invoiceOpts = role === "salesperson" ? { onlyUserId: user.uid } : undefined;
    Promise.all([getInvoices(businessId, invoiceOpts), getPayments(businessId)]).then(([inv, pay]) => {
      // Merge with offline records
      const offlineSales = typeof window !== "undefined" ? JSON.parse(localStorage.getItem("billflow_offline_sales") || "[]") : [];
      
      const offlineInvoices: Invoice[] = offlineSales.map((s: any) => ({
        id: s.id,
        amount: s.data.amount || s.data.items.reduce((sum: number, l: any) => sum + (l.quantity * l.unitPrice), 0),
        status: "paid",
        issuedAt: { toDate: () => new Date(s.timestamp) } as any,
        isOffline: true
      } as any));

      const offlinePayments: Payment[] = offlineSales.map((s: any) => ({
        id: s.id,
        amount: s.data.amount || s.data.items.reduce((sum: number, l: any) => sum + (l.quantity * l.unitPrice), 0),
        method: s.data.paymentMethod || s.data.method,
        status: "success",
        createdAt: { toDate: () => new Date(s.timestamp) } as any,
        isOffline: true
      } as any));

      setInvoices([...offlineInvoices, ...inv]); 
      setPayments([...offlinePayments, ...pay]);
    });
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
            <h2 className="font-grotesk font-semibold text-white">Daily Revenue — Last 7 Days</h2>
            <div className="flex gap-4 text-xs text-muted">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-gold inline-block" />Revenue</span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={dailyData} barSize={24}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1E1E2E" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: "#7B7B9A", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#7B7B9A", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `₵${v}`} />
              <Tooltip contentStyle={{ background: "#16161F", border: "1px solid #1E1E2E", borderRadius: 8, fontSize: 12 }} formatter={(v: number) => [`GH₵ ${v}`, "Revenue"]} />
              <Bar dataKey="revenue" fill="#F5A623" radius={[3, 3, 0, 0]} />
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
