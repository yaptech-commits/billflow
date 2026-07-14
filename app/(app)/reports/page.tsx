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

const monthlyData = [
  { month: "Jan", revenue: 1800, expenses: 900 },
  { month: "Feb", revenue: 2200, expenses: 1100 },
  { month: "Mar", revenue: 1600, expenses: 800 },
  { month: "Apr", revenue: 2800, expenses: 1400 },
  { month: "May", revenue: 3100, expenses: 1500 },
  { month: "Jun", revenue: 2900, expenses: 1200 },
  { month: "Jul", revenue: 3840, expenses: 1800 },
];

export default function ReportsPage() {
  const { user, businessId, role } = useAuth();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);

  useEffect(() => {
    if (!user || !businessId) return;
    const invoiceOpts = role === "salesperson" ? { onlyUserId: user.uid } : undefined;
    Promise.all([getInvoices(businessId, invoiceOpts), getPayments(user.uid)]).then(([inv, pay]) => {
      setInvoices(inv); setPayments(pay);
    });
  }, [user, businessId, role]);

  const totalRevenue = invoices.filter(i => i.status === "paid").reduce((s, i) => s + i.amount, 0);
  const totalCollected = payments.filter(p => p.status === "success").reduce((s, p) => s + p.amount, 0);
  const outstanding = invoices.filter(i => ["pending", "overdue"].includes(i.status)).reduce((s, i) => s + i.amount, 0);
  const rate = totalRevenue > 0 ? ((totalCollected / totalRevenue) * 100).toFixed(1) : "0";

  const momoTotal = payments.filter(p => p.method === "momo").reduce((s, p) => s + p.amount, 0);
  const cardTotal = payments.filter(p => p.method === "card").reduce((s, p) => s + p.amount, 0);
  const pieData = [
    { name: "Mobile Money", value: momoTotal || 1 },
    { name: "Card", value: cardTotal || 1 },
  ];

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
            <h2 className="font-grotesk font-semibold text-white">Monthly Revenue vs. Expenses</h2>
            <div className="flex gap-4 text-xs text-muted">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-gold inline-block" />Revenue</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-red inline-block" />Expenses</span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={monthlyData} barSize={16} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1E1E2E" vertical={false} />
              <XAxis dataKey="month" tick={{ fill: "#7B7B9A", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#7B7B9A", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `₵${v}`} />
              <Tooltip contentStyle={{ background: "#16161F", border: "1px solid #1E1E2E", borderRadius: 8, fontSize: 12 }} formatter={(v: number, name: string) => [`GH₵ ${v}`, name]} />
              <Bar dataKey="revenue" fill="#F5A623" radius={[3, 3, 0, 0]} />
              <Bar dataKey="expenses" fill="#FF4D6D" radius={[3, 3, 0, 0]} opacity={0.7} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <h2 className="font-grotesk font-semibold text-white mb-5">Payment Methods</h2>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={75} paddingAngle={4} dataKey="value">
                <Cell fill="#F5A623" />
                <Cell fill="#4A9EFF" />
              </Pie>
              <Legend formatter={(v) => <span style={{ fontSize: 12, color: "#7B7B9A" }}>{v}</span>} />
              <Tooltip contentStyle={{ background: "#16161F", border: "1px solid #1E1E2E", borderRadius: 8, fontSize: 12 }} formatter={(v: number) => [`GH₵ ${v.toLocaleString()}`, ""]} />
            </PieChart>
          </ResponsiveContainer>
          <div className="mt-3 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted">MoMo</span>
              <span className="font-grotesk font-semibold text-gold">{formatCedi(momoTotal)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted">Card</span>
              <span className="font-grotesk font-semibold text-[#4A9EFF]">{formatCedi(cardTotal)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
