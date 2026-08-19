"use client";
import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import { 
  getDocs, collection, query, orderBy, doc, getDoc, updateDoc, deleteDoc, where, writeBatch, addDoc, serverTimestamp
} from "firebase/firestore";
import { sendPasswordResetEmail } from "firebase/auth";
import { db, auth } from "@/lib/firebase";
import { BusinessProfile, BusinessModule, Staff, Product, Invoice, deleteBusinessData } from "@/lib/db";
import { SyncTelemetry } from "@/lib/offline-sync";
import { formatMoney, cn } from "@/lib/utils";
import { 
  Users, Package, FileText, Search, ShieldAlert, AlertTriangle, Activity, Clock3, RefreshCw, LockKeyhole,
  Trash2, Edit, ExternalLink, ArrowRight, X, Check, Shield, Ban, RotateCcw, UserMinus,
  Truck, CreditCard, Ticket, ShoppingCart, Eye, Plus, ChevronRight
} from "lucide-react";
import Modal from "@/components/ui/Modal";
import toast from "react-hot-toast";

function requireClientDb() {
  if (!db) throw new Error("Firebase database is not configured");
  return db;
}

function requireClientAuth() {
  if (!auth) throw new Error("Firebase authentication is not configured");
  return auth;
}

const DASHBOARD_MODULES: { id: BusinessModule; label: string; description: string }[] = [
  { id: "general", label: "General Business", description: "Sales, invoices, products, clients, and payments" },
  { id: "pharmacy", label: "Pharmacy", description: "Drugs, prescriptions, claims, and controlled substances" },
  { id: "hotel", label: "Hotel", description: "Rooms, reservations, front desk, folios, and revenue" },
  { id: "coldstore", label: "Cold Store", description: "Freshness, batch, wastage, and storage operations" },
];

function dashboardModulesForBusiness(business: BusinessProfile): BusinessModule[] {
  if (business.activeModules?.length) return business.activeModules;
  if (business.businessType === "hotel" || business.businessType === "pharmacy" || business.businessType === "coldstore") return [business.businessType];
  return ["general"];
}

export default function AdminPage() {
  const { role, user } = useAuth();
  const [businesses, setBusinesses] = useState<BusinessProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeAdminTab, setActiveAdminTab] = useState<"accounts" | "sync">("accounts");
  const [telemetryByBusiness, setTelemetryByBusiness] = useState<Record<string, SyncTelemetry>>({});
  const [syncLoading, setSyncLoading] = useState(false);

  useEffect(() => {
    if (role === "super_admin") {
      fetchBusinesses();
      fetchSyncTelemetry();
    }
  }, [role]);

  const fetchSyncTelemetry = async () => {
    setSyncLoading(true);
    try {
      const snapshot = await getDocs(collection(requireClientDb(), "syncTelemetry"));
      const nextTelemetry: Record<string, SyncTelemetry> = {};
      snapshot.docs.forEach(snapshotDoc => {
        const data = snapshotDoc.data() as SyncTelemetry;
        if (data.businessId) nextTelemetry[data.businessId] = data;
      });
      setTelemetryByBusiness(nextTelemetry);
    } catch (error) {
      console.error("Failed to fetch sync telemetry:", error);
      toast.error("Unable to load sync telemetry");
    } finally {
      setSyncLoading(false);
    }
  };

  const requestBusinessSync = async (business: BusinessProfile) => {
    const t = toast.loading(`Requesting sync for ${business.businessName}...`);
    try {
      await addDoc(collection(requireClientDb(), "syncCommands"), {
        businessId: business.businessId,
        requestedBy: user?.uid || "super_admin",
        status: "requested",
        createdAt: serverTimestamp()
      });
      toast.success(`Sync request queued for ${business.businessName}`, { id: t });
    } catch (error) {
      console.error("Failed to request business sync:", error);
      toast.error(`Could not queue sync for ${business.businessName}`, { id: t });
    }
  };

  const fetchBusinesses = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(requireClientDb(), "businessProfiles"), orderBy("businessName")));
      setBusinesses(snap.docs.map(d => ({ ...d.data(), businessId: d.id } as BusinessProfile)));
    } catch (err) {
      toast.error("Failed to fetch businesses");
    } finally {
      setLoading(false);
    }
  };

  if (role !== "super_admin") {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <ShieldAlert size={48} className="text-red mb-4" />
        <h1 className="text-xl font-bold text-white">Access Denied</h1>
        <p className="text-muted text-sm mt-2">Only authorized super admins can access this page.</p>
      </div>
    );
  }

  const pendingUsers = businesses.filter(b => b.status === "pending");
  const approvedBusinesses = businesses.filter(b => b.status !== "pending");

  const filtered = approvedBusinesses.filter(b => 
    b.businessName.toLowerCase().includes(search.toLowerCase()) ||
    b.email?.toLowerCase().includes(search.toLowerCase())
  );

  const formatSyncTimestamp = (value: unknown) => {
    if (!value) return "No report yet";
    if (typeof value === "object" && value && "toDate" in value && typeof (value as { toDate?: () => Date }).toDate === "function") {
      return (value as { toDate: () => Date }).toDate().toLocaleString();
    }
    const parsed = new Date(String(value));
    return Number.isNaN(parsed.getTime()) ? "Unknown" : parsed.toLocaleString();
  };

  const handleApprove = async (id: string) => {
    const t = toast.loading("Approving account...");
    try {
      await updateDoc(doc(requireClientDb(), "businessProfiles", id), { status: "active" });
      toast.success("Account approved", { id: t });
      fetchBusinesses();
    } catch (e) {
      toast.error("Approval failed", { id: t });
    }
  };

  const handleSuspend = async (id: string, currentStatus?: string) => {
    const newStatus = currentStatus === "suspended" ? "active" : "suspended";
    const t = toast.loading(`${newStatus === "suspended" ? "Suspending" : "Activating"} account...`);
    try {
      await updateDoc(doc(requireClientDb(), "businessProfiles", id), { status: newStatus });
      toast.success(`Account ${newStatus}`, { id: t });
      fetchBusinesses();
    } catch (e) {
      toast.error("Action failed", { id: t });
    }
  };

  const telemetryRows = approvedBusinesses.map(business => ({
    business,
    telemetry: telemetryByBusiness[business.businessId]
  }));
  const monitoredAccounts = telemetryRows.filter(row => row.telemetry).length;
  const offlineAccounts = telemetryRows.filter(row => row.telemetry?.offlineMode).length;
  const queuedItems = telemetryRows.reduce((total, row) => total + (row.telemetry?.total || 0), 0);
  const failedAccounts = telemetryRows.filter(row => (row.telemetry?.lastSyncResult?.failed || 0) > 0).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">System Administration</h1>
          <p className="text-muted text-sm mt-1">Manage all business accounts and system-wide data</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              className="input pl-10 w-64"
              placeholder="Search businesses..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button onClick={fetchBusinesses} className="btn-ghost text-xs">Refresh</button>
        </div>
      </div>

      <div className="flex border-b border-border gap-6">
        <button
          onClick={() => setActiveAdminTab("accounts")}
          className={`pb-3 text-sm font-medium border-b-2 ${activeAdminTab === "accounts" ? "border-gold text-gold" : "border-transparent text-muted hover:text-white"}`}
        >
          Business Accounts ({businesses.length})
        </button>
        <button
          onClick={() => setActiveAdminTab("sync")}
          className={`pb-3 text-sm font-medium border-b-2 ${activeAdminTab === "sync" ? "border-gold text-gold" : "border-transparent text-muted hover:text-white"}`}
        >
          Offline Sync Monitor
        </button>
      </div>

      {activeAdminTab === "sync" ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="card">
              <p className="text-xs text-muted uppercase font-mono">Approved Accounts</p>
              <p className="text-2xl font-bold text-white mt-1">{approvedBusinesses.length}</p>
            </div>
            <div className="card">
              <p className="text-xs text-muted uppercase font-mono">Reporting Clients</p>
              <p className="text-2xl font-bold text-green-400 mt-1">{monitoredAccounts}</p>
              <p className="text-xs text-muted mt-1">Aggregate queue telemetry received</p>
            </div>
            <div className="card">
              <p className="text-xs text-muted uppercase font-mono">Queued Records</p>
              <p className={`text-2xl font-bold mt-1 ${queuedItems > 0 ? "text-gold" : "text-green-400"}`}>{queuedItems}</p>
              <p className="text-xs text-muted mt-1">Across reporting accounts</p>
            </div>
            <div className="card">
              <p className="text-xs text-muted uppercase font-mono">Accounts With Failures</p>
              <p className={`text-2xl font-bold mt-1 ${failedAccounts > 0 ? "text-red-400" : "text-green-400"}`}>{failedAccounts}</p>
              <p className="text-xs text-muted mt-1">Last reported sync result</p>
            </div>
          </div>

          <div className="card">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
              <div>
                <h2 className="text-lg font-bold text-white">Business Account Sync Telemetry</h2>
                <p className="text-xs text-muted mt-1">Only aggregate queue counts are shown here. Transaction and invoice payloads remain inside each business account.</p>
              </div>
              <button onClick={fetchSyncTelemetry} className="btn-gold text-xs" disabled={syncLoading}>
                {syncLoading ? "Refreshing..." : "Refresh Telemetry"}
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-border text-xs text-muted uppercase font-mono">
                    <th className="py-3 px-4">Business</th>
                    <th className="py-3 px-4">Vertical</th>
                    <th className="py-3 px-4">Mode</th>
                    <th className="py-3 px-4">Queue</th>
                    <th className="py-3 px-4">Last Seen</th>
                    <th className="py-3 px-4">Last Result</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border text-sm">
                  {telemetryRows.map(({ business, telemetry }) => {
                    const queueCount = telemetry?.total || 0;
                    const failedCount = telemetry?.lastSyncResult?.failed || 0;
                    return (
                      <tr key={business.businessId} className="hover:bg-surface/5">
                        <td className="py-3 px-4">
                          <p className="font-medium text-white">{business.businessName}</p>
                          <p className="text-xs text-muted">{business.email || business.businessId}</p>
                        </td>
                        <td className="py-3 px-4 text-muted capitalize">{business.businessType || "general"}</td>
                        <td className="py-3 px-4">
                          <span className={`px-2 py-1 rounded-full text-xs ${!telemetry ? "bg-surface/10 text-muted" : telemetry.offlineMode ? "bg-gold/10 text-gold" : "bg-green-500/10 text-green-400"}`}>
                            {!telemetry ? "Not reporting" : telemetry.offlineMode ? "Offline · 72h rule" : "Online"}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-mono text-xs">
                            <span className={queueCount > 0 ? "text-gold font-bold" : "text-green-400"}>{queueCount} total</span>
                            {telemetry && <p className="text-muted mt-1">S {telemetry.sales} · I {telemetry.invoices} · P {telemetry.payments} · F {telemetry.folios}</p>}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-xs text-muted">{formatSyncTimestamp(telemetry?.lastSeenAt)}</td>
                        <td className="py-3 px-4 text-xs">
                          {!telemetry?.lastSyncResult ? <span className="text-muted">No sync result</span> : failedCount > 0 ? <span className="text-red-400">{telemetry.lastSyncResult.synced} synced · {failedCount} failed</span> : <span className="text-green-400">{telemetry.lastSyncResult.synced} synced</span>}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button onClick={() => requestBusinessSync(business)} className="btn-ghost text-xs border border-border px-2.5 py-1 hover:bg-gold/10 hover:text-gold">
                            Request Sync
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {offlineAccounts > 0 && <p className="text-xs text-gold mt-4">{offlineAccounts} account{offlineAccounts === 1 ? " is" : "s are"} currently reporting offline mode. The 72-hour automatic online transition remains enforced on those clients.</p>}
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <SecurityAlertsWidget user={user} />

          {pendingUsers.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-gold flex items-center gap-2">
                <Shield size={20} /> Pending Approvals ({pendingUsers.length})
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {pendingUsers.map(b => (
                  <div key={b.businessId} className="card border-gold/30 bg-gold/5">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="font-bold text-surface">{b.businessName}</h3>
                        <p className="text-xs text-muted">{b.email}</p>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => handleApprove(b.businessId)} className="p-2 bg-green/20 text-green rounded-full hover:bg-green/30 transition-colors" title="Approve Account"><Check size={16} /></button>
                        <button onClick={() => handleSuspend(b.businessId, "suspended")} className="p-2 bg-red/20 text-red rounded-full hover:bg-red/30 transition-colors" title="Reject/Suspend"><X size={16} /></button>
                      </div>
                    </div>
                    <p className="text-[10px] text-muted">Signed up: {b.createdAt ? new Date(b.createdAt.toDate()).toLocaleDateString() : "N/A"}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-4">
            <h2 className="text-lg font-bold text-white">Approved Businesses</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {loading ? (
                <div className="col-span-full py-20 text-center text-muted animate-pulse">Loading businesses...</div>
              ) : filtered.length === 0 ? (
                <div className="col-span-full py-20 text-center text-muted">No businesses found</div>
              ) : (
                filtered.map(b => <BusinessCard key={b.businessId} business={b} user={user} onUpdate={fetchBusinesses} onSuspend={() => handleSuspend(b.businessId, b.status)} />)
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

type SecurityEvent = {
  id: string;
  category: "security_event" | "system_alert";
  eventType: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  title: string;
  message: string;
  actorEmail: string | null;
  businessId: string | null;
  route: string | null;
  createdAt: string | null;
};

type SecuritySummary = {
  total: number;
  securityEvents: number;
  systemAlerts: number;
  critical: number;
  high: number;
  medium: number;
};

const EMPTY_SECURITY_SUMMARY: SecuritySummary = {
  total: 0,
  securityEvents: 0,
  systemAlerts: 0,
  critical: 0,
  high: 0,
  medium: 0,
};

function formatEventTime(value: string | null) {
  if (!value) return "Time pending";
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return "Unknown time";
  const difference = Date.now() - timestamp;
  if (difference < 60_000) return "Just now";
  if (difference < 3_600_000) return `${Math.floor(difference / 60_000)}m ago`;
  if (difference < 86_400_000) return `${Math.floor(difference / 3_600_000)}h ago`;
  return new Date(value).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function securitySeverityClasses(severity: SecurityEvent["severity"]) {
  if (severity === "critical") return { text: "text-red-300", background: "bg-red-500/15", border: "border-red-500/30" };
  if (severity === "high") return { text: "text-orange-300", background: "bg-orange-500/15", border: "border-orange-500/30" };
  if (severity === "medium") return { text: "text-gold", background: "bg-gold/15", border: "border-gold/30" };
  return { text: "text-blue-300", background: "bg-blue-500/15", border: "border-blue-500/30" };
}

function SecurityAlertsWidget({ user }: { user: { getIdToken: () => Promise<string> } | null }) {
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [summary, setSummary] = useState<SecuritySummary>(EMPTY_SECURITY_SUMMARY);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchEvents = useCallback(async () => {
    if (!user) return;
    setRefreshing(true);
    try {
      const token = await user.getIdToken();
      const response = await fetch("/api/admin/security-events?limit=12", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Unable to load security events");
      setEvents(Array.isArray(payload.events) ? payload.events : []);
      setSummary({ ...EMPTY_SECURITY_SUMMARY, ...(payload.summary || {}) });
      setError(null);
    } catch (fetchError) {
      console.error("Failed to fetch security events:", fetchError);
      setError(fetchError instanceof Error ? fetchError.message : "Unable to load security events");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useEffect(() => {
    void fetchEvents();
    const interval = window.setInterval(() => void fetchEvents(), 60_000);
    return () => window.clearInterval(interval);
  }, [fetchEvents]);

  const displayedEvents = events.slice(0, 5);
  const urgentCount = summary.critical + summary.high;

  return (
    <section className="card border border-border/80 bg-surface/40 overflow-hidden" aria-labelledby="security-alerts-title">
      <div className="flex flex-col gap-4 border-b border-border/70 px-5 py-5 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gold/15 text-gold">
            <ShieldAlert size={20} />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="security-alerts-title" className="text-lg font-bold text-white">Security &amp; System Alerts</h2>
              <span className="inline-flex items-center gap-1 rounded-full bg-green-500/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-green-300">
                <Activity size={11} /> Live
              </span>
            </div>
            <p className="mt-1 text-xs text-muted">Protected activity and delivery health across BillFlow. Refreshes every minute.</p>
          </div>
        </div>
        <button
          onClick={() => void fetchEvents()}
          disabled={refreshing}
          className="btn-ghost inline-flex items-center justify-center gap-2 text-xs"
          aria-label="Refresh security events"
        >
          <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      <div className="grid grid-cols-2 divide-x divide-border/70 border-b border-border/70 md:grid-cols-4">
        <div className="px-5 py-4">
          <p className="text-[10px] font-mono uppercase tracking-wider text-muted">Events tracked</p>
          <p className="mt-1 text-2xl font-bold text-white">{summary.total}</p>
        </div>
        <div className="px-5 py-4">
          <p className="text-[10px] font-mono uppercase tracking-wider text-muted">Security events</p>
          <p className="mt-1 text-2xl font-bold text-blue-300">{summary.securityEvents}</p>
        </div>
        <div className="px-5 py-4">
          <p className="text-[10px] font-mono uppercase tracking-wider text-muted">System alerts</p>
          <p className="mt-1 text-2xl font-bold text-gold">{summary.systemAlerts}</p>
        </div>
        <div className="px-5 py-4">
          <p className="text-[10px] font-mono uppercase tracking-wider text-muted">Urgent</p>
          <p className={`mt-1 text-2xl font-bold ${urgentCount > 0 ? "text-red-300" : "text-green-300"}`}>{urgentCount}</p>
        </div>
      </div>

      <div className="px-5 py-4">
        {loading ? (
          <div className="flex items-center gap-3 py-5 text-sm text-muted">
            <RefreshCw size={16} className="animate-spin text-gold" /> Loading monitoring feed...
          </div>
        ) : error ? (
          <div className="flex items-start gap-3 rounded-lg border border-red-500/25 bg-red-500/10 p-4 text-sm text-red-200">
            <AlertTriangle size={18} className="mt-0.5 shrink-0" />
            <div>
              <p className="font-medium">Monitoring feed unavailable</p>
              <p className="mt-1 text-xs text-red-200/80">{error}</p>
            </div>
          </div>
        ) : displayedEvents.length === 0 ? (
          <div className="flex items-center gap-3 py-5 text-sm text-muted">
            <LockKeyhole size={18} className="text-green-300" /> No security events or system alerts have been recorded yet.
          </div>
        ) : (
          <div className="space-y-1">
            {displayedEvents.map((event) => {
              const tone = securitySeverityClasses(event.severity);
              const isSecurity = event.category === "security_event";
              return (
                <div key={event.id} className="flex items-start gap-3 rounded-lg px-2 py-3 transition-colors hover:bg-white/[0.03]">
                  <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tone.background} ${tone.text}`}>
                    {isSecurity ? <ShieldAlert size={15} /> : <AlertTriangle size={15} />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                      <p className="truncate text-sm font-medium text-white">{event.title}</p>
                      <span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-muted"><Clock3 size={12} /> {formatEventTime(event.createdAt)}</span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-muted">{event.message}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-wide">
                      <span className={`rounded-full border px-2 py-0.5 ${tone.background} ${tone.border} ${tone.text}`}>{event.severity}</span>
                      <span className="rounded-full border border-border px-2 py-0.5 text-muted">{isSecurity ? "Security event" : "System alert"}</span>
                      {event.route && <span className="font-mono normal-case text-muted">{event.route}</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

function BusinessCard({ business, user, onUpdate, onSuspend }: { business: BusinessProfile, user: any, onUpdate: () => void, onSuspend: () => void }) {
  const [stats, setStats] = useState({ products: 0, invoices: 0, staff: 0, payments: 0, totalRevenue: 0 });
  const [loading, setLoading] = useState(true);
  const [showStaff, setShowStaff] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);
  const [editForm, setEditForm] = useState<Partial<BusinessProfile>>({});

  useEffect(() => {
    if (showEdit) {
      setEditForm({ ...business, activeModules: dashboardModulesForBusiness(business) });
    }
  }, [showEdit, business]);

  // New Management States
  const [activeTab, setActiveTab] = useState<"products" | "invoices" | "clients" | "suppliers" | "vouchers" | "payments" | "po" | null>(null);
  const [listData, setListData] = useState<any[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any | null>(null);
  const [itemForm, setItemForm] = useState<any>({});

  const PAGE_GROUPS = [
    {
      group: "Core & General POS",
      pages: [
        { id: "/dashboard", label: "Dashboard" },
        { id: "/pos", label: "POS (Point of Sale)" },
        { id: "/invoices", label: "Invoices" },
        { id: "/payments", label: "Payments" },
        { id: "/products", label: "Products / Inventory" },
        { id: "/clients", label: "Clients & Customers" },
        { id: "/suppliers", label: "Suppliers" },
        { id: "/purchase-orders", label: "Purchase Orders" },
        { id: "/vouchers", label: "Vouchers" },
        { id: "/reports", label: "Financial Reports" },
        { id: "/settings", label: "Settings" }
      ]
    },
    {
      group: "Pharmacy Vertical",
      pages: [
        { id: "/pharmacy/drugs", label: "Drugs Directory & FEFO" },
        { id: "/pharmacy/prescriptions", label: "Prescriptions Management" },
        { id: "/pharmacy/dispensary", label: "Dispensary POS" },
        { id: "/pharmacy/batches", label: "Batch & Expiry Tracker" },
        { id: "/pharmacy/reports", label: "Pharmacy Reports" }
      ]
    },
    {
      group: "Hotel & PMS Vertical",
      pages: [
        { id: "/hotel/rooms", label: "Room Status Board" },
        { id: "/hotel/reservations", label: "Reservations Calendar" },
        { id: "/hotel/front-desk", label: "Front Desk Operations" },
        { id: "/hotel/room-pos", label: "Room POS & Folio Billing" },
        { id: "/hotel/guests", label: "Guest Directory & History" },
        { id: "/hotel/housekeeping", label: "Housekeeping & Maintenance" },
        { id: "/hotel/reports", label: "Revenue, ADR & RevPAR Audit" },
        { id: "/hotel/booking-widget", label: "Online Booking Widget" }
      ]
    },
    {
      group: "Cold Store & Specialized Retail",
      pages: [
        { id: "/coldstore/inventory", label: "Cold Store Inventory & Batch" },
        { id: "/coldstore/temperature", label: "Cold Chain Temperature Log" },
        { id: "/coldstore/dispatch", label: "Dispatch & Logistics" },
        { id: "/coldstore/reports", label: "Cold Store Reports" }
      ]
    }
  ];

  const ALL_PAGES = PAGE_GROUPS.flatMap(g => g.pages);

  const fetchStats = async (force = false) => {
    const cacheKey = `stats_${business.businessId}`;
    const lastFetchKey = `last_stats_fetch_${business.businessId}`;
    const now = Date.now();
    
    if (!force) {
      const cached = localStorage.getItem(cacheKey);
      const lastFetch = localStorage.getItem(lastFetchKey);
      if (cached && lastFetch && now - parseInt(lastFetch) < 6 * 60 * 60 * 1000) {
        const parsed = JSON.parse(cached);
        setStats(parsed.stats);
        setStaffList(parsed.staffList);
        setLoading(false);
        return;
      }
    }

    try {
      const [p, i, s, pay] = await Promise.all([
        getDocs(query(collection(requireClientDb(), "products"), where("businessId", "==", business.businessId))),
        getDocs(query(collection(requireClientDb(), "invoices"), where("businessId", "==", business.businessId))),
        getDocs(query(collection(requireClientDb(), "staff"), where("businessId", "==", business.businessId))),
        getDocs(query(collection(requireClientDb(), "payments"), where("businessId", "==", business.businessId)))
      ]);
      
      const totalRevenue = pay.docs.reduce((acc, doc) => acc + (doc.data().amount || 0), 0);
      const newStats = { 
        products: p.size, 
        invoices: i.size, 
        staff: s.size, 
        payments: pay.size,
        totalRevenue 
      };
      const newStaffList = s.docs.map(d => ({ ...d.data(), id: d.id } as Staff));
      
      setStats(newStats);
      setStaffList(newStaffList);
      
      localStorage.setItem(cacheKey, JSON.stringify({ stats: newStats, staffList: newStaffList }));
      localStorage.setItem(lastFetchKey, now.toString());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, [business.businessId]);

  const fetchTabData = async (tab: typeof activeTab) => {
    if (!tab) return;
    setListLoading(true);
    try {
      const collectionName = {
        products: "products",
        invoices: "invoices",
        clients: "clients",
        suppliers: "suppliers",
        vouchers: "vouchers",
        payments: "payments",
        po: "purchaseOrders"
      }[tab];

      const snap = await getDocs(query(collection(requireClientDb(), collectionName), where("businessId", "==", business.businessId)));
      setListData(snap.docs.map(d => ({ ...d.data(), id: d.id })));
    } catch (e) {
      toast.error("Failed to fetch data");
    } finally {
      setListLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab) fetchTabData(activeTab);
  }, [activeTab]);

  const handleDeleteItem = async (id: string) => {
    if (!confirm("Are you sure you want to permanently delete this item?")) return;
    const t = toast.loading("Permanently deleting from database...");
    try {
      const collectionName = {
        products: "products",
        invoices: "invoices",
        clients: "clients",
        suppliers: "suppliers",
        vouchers: "vouchers",
        payments: "payments",
        po: "purchaseOrders"
      }[activeTab!];
      await deleteDoc(doc(requireClientDb(), collectionName, id));
      toast.success("Permanently deleted", { id: t });
      await fetchTabData(activeTab);
      await fetchStats(true);
    } catch (e) {
      toast.error("Delete failed", { id: t });
    }
  };

  const handleSaveItem = async () => {
    const t = toast.loading("Saving...");
    try {
      const collectionName = {
        products: "products",
        invoices: "invoices",
        clients: "clients",
        suppliers: "suppliers",
        vouchers: "vouchers",
        payments: "payments",
        po: "purchaseOrders"
      }[activeTab!];
      
      const { id, new: isNew, ...dataToSave } = itemForm;
      
      if (selectedItem?.id && !selectedItem.new) {
        await updateDoc(doc(requireClientDb(), collectionName, selectedItem.id), dataToSave);
      } else {
        await addDoc(collection(requireClientDb(), collectionName), {
          ...dataToSave,
          businessId: business.businessId,
          userId: user?.uid, // Link to superadmin who created it or business owner? Let's use current superadmin.
          createdAt: serverTimestamp()
        });
      }
      toast.success("Saved successfully", { id: t });
      setSelectedItem(null);
      fetchTabData(activeTab);
      fetchStats(true);
    } catch (e) {
      toast.error("Save failed", { id: t });
    }
  };

  const handleUpdatePermissions = async () => {
    if (!editingStaff) return;
    const t = toast.loading("Updating permissions...");
    try {
      await updateDoc(doc(requireClientDb(), "staff", editingStaff.id!), {
        permissions: editingStaff.permissions || []
      });
      // Also update staffIndex for real-time rules enforcement
      if (editingStaff.staffUid) {
        await updateDoc(doc(requireClientDb(), "staffIndex", editingStaff.staffUid), {
          permissions: editingStaff.permissions || []
        });
      }
      toast.success("Permissions updated", { id: t });
      setEditingStaff(null);
      fetchStats(true);
    } catch (e) {
      toast.error("Update failed", { id: t });
    }
  };

  const handleToggleStaffStatus = async (staff: Staff) => {
    const newStatus = staff.status === "active" ? "pending" : "active";
    const t = toast.loading(`${newStatus === "pending" ? "Suspending" : "Activating"} staff...`);
    try {
      const batch = writeBatch(requireClientDb());
      batch.update(doc(requireClientDb(), "staff", staff.id!), { status: newStatus });
      if (staff.staffUid) {
        batch.update(doc(requireClientDb(), "staffIndex", staff.staffUid), { status: newStatus });
      }
      await batch.commit();
      toast.success(`Staff ${newStatus === "pending" ? "suspended" : "activated"}`, { id: t });
      fetchStats(true);
    } catch (e) {
      toast.error("Action failed", { id: t });
    }
  };

  const handleDeleteStaff = async (staff: Staff) => {
    if (!confirm(`Are you sure you want to permanently delete staff ${staff.email}? This will revoke all access.`)) return;
    const t = toast.loading("Permanently deleting staff...");
    try {
      const batch = writeBatch(requireClientDb());
      batch.delete(doc(requireClientDb(), "staff", staff.id!));
      if (staff.staffUid) {
        batch.delete(doc(requireClientDb(), "staffIndex", staff.staffUid));
      }
      await batch.commit();
      toast.success("Staff permanently deleted", { id: t });
      await fetchStats(true);
    } catch (e) {
      toast.error("Deletion failed", { id: t });
    }
  };

  const handleResetPassword = async (email: string) => {
    if (!confirm(`Send password reset email to ${email}?`)) return;
    const t = toast.loading("Sending reset email...");
    try {
      await sendPasswordResetEmail(requireClientAuth(), email);
      toast.success("Reset email sent", { id: t });
    } catch (e: any) {
      toast.error(e.message || "Failed to send reset email", { id: t });
    }
  };

  const handleUpdateBusiness = async () => {
    const t = toast.loading("Updating business profile...");
    try {
      await updateDoc(doc(requireClientDb(), "businessProfiles", business.businessId), editForm);
      toast.success("Business profile updated", { id: t });
      setShowEdit(false);
      onUpdate();
    } catch (e) {
      toast.error("Update failed", { id: t });
    }
  };

  return (
    <>
      <div className="card hover:border-gold transition-all group">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            {business.logoDataUrl ? (
              <img src={business.logoDataUrl} className="w-10 h-10 rounded object-contain bg-white/5" alt="" />
            ) : (
              <div className="w-10 h-10 rounded bg-gold/10 flex items-center justify-center text-gold font-bold">
                {business.businessName.slice(0, 2).toUpperCase()}
              </div>
            )}
            <div>
              <h3 className="font-bold text-surface group-hover:text-gold transition-colors">{business.businessName}</h3>
              <p className="text-[10px] text-muted truncate max-w-[150px]">{business.email || "No email"}</p>
            </div>
          </div>
          <button 
            onClick={() => setShowStaff(true)}
            className="text-muted hover:text-gold p-1 transition-colors" 
            title="Manage Staff"
          >
            <Users size={16} />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2 py-3 border-y border-border/50 mb-4">
          <div className="text-center">
            <p className="text-[10px] text-muted uppercase font-bold tracking-tighter">Products</p>
            <p className="text-sm font-grotesk text-surface">{loading ? "..." : stats.products}</p>
          </div>
          <div className="text-center border-x border-border/50">
            <p className="text-[10px] text-muted uppercase font-bold tracking-tighter">Invoices</p>
            <p className="text-sm font-grotesk text-surface">{loading ? "..." : stats.invoices}</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-muted uppercase font-bold tracking-tighter">Staff</p>
            <p className="text-sm font-grotesk text-surface">{loading ? "..." : stats.staff}</p>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2 mb-4">
          <button onClick={() => setActiveTab("products")} className="p-2 bg-white/5 rounded hover:bg-gold/10 hover:text-gold transition-all flex flex-col items-center gap-1">
            <Package size={14} />
            <span className="text-[9px] uppercase font-bold">Items</span>
          </button>
          <button onClick={() => setActiveTab("invoices")} className="p-2 bg-white/5 rounded hover:bg-gold/10 hover:text-gold transition-all flex flex-col items-center gap-1">
            <FileText size={14} />
            <span className="text-[9px] uppercase font-bold">Invoices</span>
          </button>
          <button onClick={() => setActiveTab("clients")} className="p-2 bg-white/5 rounded hover:bg-gold/10 hover:text-gold transition-all flex flex-col items-center gap-1">
            <Users size={14} />
            <span className="text-[9px] uppercase font-bold">Clients</span>
          </button>
          <button onClick={() => setActiveTab("suppliers")} className="p-2 bg-white/5 rounded hover:bg-gold/10 hover:text-gold transition-all flex flex-col items-center gap-1">
            <Truck size={14} />
            <span className="text-[9px] uppercase font-bold">Suppliers</span>
          </button>
          <button onClick={() => setActiveTab("vouchers")} className="p-2 bg-white/5 rounded hover:bg-gold/10 hover:text-gold transition-all flex flex-col items-center gap-1">
            <Ticket size={14} />
            <span className="text-[9px] uppercase font-bold">Vouchers</span>
          </button>
          <button onClick={() => setActiveTab("payments")} className="p-2 bg-white/5 rounded hover:bg-gold/10 hover:text-gold transition-all flex flex-col items-center gap-1">
            <CreditCard size={14} />
            <span className="text-[9px] uppercase font-bold">Payments</span>
          </button>
          <button onClick={() => setActiveTab("po")} className="p-2 bg-white/5 rounded hover:bg-gold/10 hover:text-gold transition-all flex flex-col items-center gap-1">
            <ShoppingCart size={14} />
            <span className="text-[9px] uppercase font-bold">PO</span>
          </button>
          <button onClick={() => setShowDetails(true)} className="p-2 bg-white/5 rounded hover:bg-gold/10 hover:text-gold transition-all flex flex-col items-center gap-1">
            <ExternalLink size={14} />
            <span className="text-[9px] uppercase font-bold">Stats</span>
          </button>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-[10px] text-muted">ID: {business.businessId.slice(0, 8)}...</span>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => {
                setEditForm({ ...business });
                setShowEdit(true);
              }}
              className="p-1.5 text-muted hover:text-gold transition-colors" 
              title="Edit Business"
            >
              <Edit size={14} />
            </button>
            <button 
              onClick={() => setShowDetails(true)}
              className="p-1.5 text-muted hover:text-gold transition-colors" 
              title="View Full Details"
            >
              <ExternalLink size={14} />
            </button>
            <button 
              onClick={onSuspend}
              className={cn(
                "p-1.5 transition-colors",
                business.status === "suspended" ? "text-green hover:text-green/80" : "text-muted hover:text-red"
              )}
              title={business.status === "suspended" ? "Activate Account" : "Suspend Account"}
            >
              {business.status === "suspended" ? <Check size={14} /> : <Ban size={14} />}
            </button>
            <button 
              className="p-1.5 text-muted hover:text-red transition-colors" 
              title="Delete Business Completely"
              onClick={async () => {
                if (confirm(`CRITICAL WARNING: Are you sure you want to permanently delete ${business.businessName} and all its associated records from the database? This action is IRREVERSIBLE.`)) {
                  const t = toast.loading("Permanently deleting business and all records...");
                  try {
                    await deleteBusinessData(business.businessId);
                    // Also delete businessProfile doc itself
                    await deleteDoc(doc(requireClientDb(), "businessProfiles", business.businessId));
                    toast.success("Business permanently deleted from database", { id: t });
                    onUpdate();
                  } catch (e) {
                    console.error(e);
                    toast.error("Failed to delete business completely", { id: t });
                  }
                }
              }}
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Business Details Modal */}
      <Modal open={showDetails} onClose={() => setShowDetails(false)} title={`Business Details - ${business.businessName}`}>
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-white/5 rounded-lg border border-border">
              <p className="text-[10px] text-muted uppercase font-bold mb-1">Total Revenue</p>
              <p className="text-xl font-grotesk text-gold">{formatMoney(stats.totalRevenue, business.currency || "GHS")}</p>
            </div>
            <div className="p-4 bg-white/5 rounded-lg border border-border">
              <p className="text-[10px] text-muted uppercase font-bold mb-1">Total Payments</p>
              <p className="text-xl font-grotesk text-surface">{stats.payments}</p>
            </div>
          </div>

          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase text-muted">Business Information</h4>
            <div className="grid grid-cols-1 gap-3">
              <div className="flex justify-between py-2 border-b border-border/30">
                <span className="text-xs text-muted">Email</span>
                <span className="text-xs text-surface">{business.email || "N/A"}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-border/30">
                <span className="text-xs text-muted">Phone</span>
                <span className="text-xs text-surface">{business.phone || "N/A"}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-border/30">
                <span className="text-xs text-muted">Address</span>
                <span className="text-xs text-surface">{business.address || "N/A"}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-border/30">
                <span className="text-xs text-muted">Currency</span>
                <span className="text-xs text-surface">{business.currency || "GHS"}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-border/30">
                <span className="text-xs text-muted">Tax Settings</span>
                <span className="text-xs text-surface">{business.taxLabel || "Tax"}: {business.taxRate || 0}% ({business.taxInclusive ? "Inclusive" : "Exclusive"})</span>
              </div>
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <button className="btn-primary w-full justify-center" onClick={() => setShowDetails(false)}>Close</button>
          </div>
        </div>
      </Modal>

      {/* Edit Business Modal */}
      <Modal open={showEdit} onClose={() => setShowEdit(false)} title={`Edit Business - ${business.businessName}`}>
        <div className="space-y-4">
          <div>
            <label className="label">Business Name</label>
            <input 
              className="input" 
              value={editForm.businessName || ""} 
              onChange={e => setEditForm({ ...editForm, businessName: e.target.value })} 
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Email</label>
              <input 
                className="input" 
                value={editForm.email || ""} 
                onChange={e => setEditForm({ ...editForm, email: e.target.value })} 
              />
            </div>
            <div>
              <label className="label">Phone</label>
              <input 
                className="input" 
                value={editForm.phone || ""} 
                onChange={e => setEditForm({ ...editForm, phone: e.target.value })} 
              />
            </div>
          </div>
          <div>
            <label className="label">Address</label>
            <input 
              className="input" 
              value={editForm.address || ""} 
              onChange={e => setEditForm({ ...editForm, address: e.target.value })} 
            />
          </div>
          <div>
            <label className="label">Business Type</label>
            <select
              className="input"
              value={editForm.businessType || "general"}
              onChange={e => setEditForm({ ...editForm, businessType: e.target.value as "general" | "pharmacy" | "hotel" | "coldstore" | "school" })}
            >
              <option value="general">General Business</option>
              <option value="pharmacy">Pharmacy</option>
              <option value="hotel">Hotel</option>
              <option value="coldstore">Coldstore</option>
              <option value="school">School</option>
            </select>
            <p className="text-[11px] text-muted mt-1">Changing this controls the account’s feature set and sidebar.</p>
          </div>

          <div className="pt-4 border-t border-border">
            <p className="text-sm font-bold text-surface mb-1">Active Dashboard Modules</p>
            <p className="text-xs text-muted mb-3">Select one or more modules. The business type still controls the account’s main sidebar, while these selections control which dashboards are shown together.</p>
            <div className="grid grid-cols-1 gap-2">
              {DASHBOARD_MODULES.map(module => {
                const checked = (editForm.activeModules || []).includes(module.id);
                return (
                  <button
                    key={module.id}
                    type="button"
                    onClick={() => {
                      const current = editForm.activeModules || [];
                      if (checked && current.length === 1) {
                        toast.error("Keep at least one dashboard module active");
                        return;
                      }
                      const next = checked ? current.filter(item => item !== module.id) : [...current, module.id];
                      setEditForm({ ...editForm, activeModules: next });
                    }}
                    className={cn("flex items-center justify-between gap-3 p-3 rounded-lg border text-left transition-all", checked ? "bg-gold/10 border-gold text-gold" : "bg-white/5 border-border text-muted")}
                  >
                    <span><span className="block text-xs font-bold">{module.label}</span><span className="block text-[10px] mt-1 opacity-80">{module.description}</span></span>
                    {checked ? <Check size={14} /> : <div className="w-3.5 h-3.5 border border-muted rounded" />}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Tax Rate (%)</label>
              <input 
                className="input" 
                type="number"
                value={editForm.taxRate || 0} 
                onChange={e => setEditForm({ ...editForm, taxRate: parseFloat(e.target.value) || 0 })} 
              />
            </div>
            <div>
              <label className="label">Tax Label</label>
              <input 
                className="input" 
                value={editForm.taxLabel || "VAT"} 
                onChange={e => setEditForm({ ...editForm, taxLabel: e.target.value })} 
              />
            </div>
          </div>
          <div className="flex items-center gap-3 p-4 bg-white/5 rounded-lg border border-border">
            <input 
              type="checkbox" 
              id={`autoDelete-${business.businessId}`}
              className="w-4 h-4 rounded border-border bg-black text-gold focus:ring-gold"
              checked={editForm.autoDeleteOutOfStock || false}
              onChange={(e) => setEditForm({ ...editForm, autoDeleteOutOfStock: e.target.checked })}
            />
            <label htmlFor={`autoDelete-${business.businessId}`} className="text-sm font-bold text-surface cursor-pointer">
              Auto-delete products when stock reaches 0
            </label>
          </div>

          <div className="pt-4 border-t border-border space-y-4">
            <div>
              <p className="text-sm font-bold text-surface mb-1">Owner Page Permissions (Grouped by Vertical)</p>
              <p className="text-xs text-muted">Select specific pages this business owner can access across all verticals. Leave empty for full access.</p>
            </div>
            
            {PAGE_GROUPS.map((groupObj) => (
              <div key={groupObj.group} className="space-y-2 bg-black/20 p-3 rounded-lg border border-border/60">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-gold uppercase tracking-wider">{groupObj.group}</span>
                  <button
                    type="button"
                    onClick={() => {
                      const current = editForm.permissions || [];
                      const groupIds = groupObj.pages.map(p => p.id);
                      const allSelected = groupIds.every(id => current.includes(id));
                      let next = [...current];
                      if (allSelected) {
                        next = next.filter(id => !groupIds.includes(id));
                      } else {
                        for (const id of groupIds) {
                          if (!next.includes(id)) next.push(id);
                        }
                      }
                      setEditForm({ ...editForm, permissions: next });
                    }}
                    className="text-[10px] text-muted hover:text-gold underline"
                  >
                    {groupObj.pages.every(p => (editForm.permissions || []).includes(p.id)) ? "Deselect All" : "Select All"}
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {groupObj.pages.map(page => {
                    const checked = (editForm.permissions || []).includes(page.id);
                    return (
                      <button
                        key={page.id}
                        type="button"
                        onClick={() => {
                          const current = editForm.permissions || [];
                          const next = checked ? current.filter(p => p !== page.id) : [...current, page.id];
                          setEditForm({ ...editForm, permissions: next });
                        }}
                        className={cn(
                          "flex items-center justify-between p-2 rounded-lg border text-xs font-medium transition-all text-left",
                          checked ? "bg-gold/10 border-gold text-gold" : "bg-white/5 border-border text-muted"
                        )}
                      >
                        <span className="truncate pr-1">{page.label}</span>
                        {checked ? <Check size={12} className="shrink-0" /> : <div className="w-2.5 h-2.5 border border-muted rounded shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-3 pt-4">
            <button className="btn-ghost flex-1 justify-center" onClick={() => setShowEdit(false)}>Cancel</button>
            <button className="btn-primary flex-1 justify-center" onClick={handleUpdateBusiness}>Save Changes</button>
          </div>
        </div>
      </Modal>

      {/* Staff Management Modal */}
      <Modal open={showStaff} onClose={() => setShowStaff(false)} title={`${business.businessName} - Staff`}>
        <div className="space-y-4">
          {staffList.length === 0 ? (
            <p className="text-center text-muted py-10">No staff members found for this business.</p>
          ) : (
            <div className="space-y-3">
              {staffList.map(s => (
                <div key={s.id} className="flex items-center justify-between p-3 bg-white/5 rounded-lg border border-border">
                  <div>
                    <p className="text-sm font-medium text-surface">{s.email}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={cn(
                        "text-[10px] font-bold uppercase px-1.5 py-0.5 rounded",
                        s.role === "owner" ? "bg-gold/10 text-gold" : "bg-blue/10 text-blue"
                      )}>
                        {s.role}
                      </span>
                      <span className={cn(
                        "text-[10px] font-bold uppercase px-1.5 py-0.5 rounded",
                        s.status === "active" ? "bg-green/10 text-green" : "bg-muted/10 text-muted"
                      )}>
                        {s.status}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button 
                      onClick={() => handleResetPassword(s.email)}
                      className="p-2 text-muted hover:text-gold transition-colors"
                      title="Send Password Reset"
                    >
                      <RotateCcw size={14} />
                    </button>
                    <button 
                      onClick={() => handleToggleStaffStatus(s)}
                      className={cn(
                        "p-2 transition-colors",
                        s.status === "active" ? "text-muted hover:text-red" : "text-muted hover:text-green"
                      )}
                      title={s.status === "active" ? "Suspend Staff" : "Activate Staff"}
                    >
                      {s.status === "active" ? <Ban size={14} /> : <Check size={14} />}
                    </button>
                    <button 
                      onClick={() => setEditingStaff(s)}
                      className="p-2 text-muted hover:text-gold transition-colors"
                      title="Edit Permissions"
                    >
                      <Shield size={14} />
                    </button>
                    <button 
                      onClick={() => handleDeleteStaff(s)}
                      className="p-2 text-muted hover:text-red transition-colors"
                      title="Delete Staff"
                    >
                      <UserMinus size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>

      {/* Data Management Modal */}
      <Modal 
        open={!!activeTab} 
        onClose={() => setActiveTab(null)} 
        title={`Manage ${activeTab?.toUpperCase()} - ${business.businessName}`}
      >
        <div className="space-y-4">
          <div className="flex justify-between items-center mb-4">
            <p className="text-xs text-muted">Total items: {listData.length}</p>
            <button 
              onClick={() => {
                setSelectedItem({ new: true });
                setItemForm({});
              }}
              className="btn-primary text-xs py-1.5"
            >
              <Plus size={14} /> Add New
            </button>
          </div>

          <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-2 custom-scrollbar">
            {listLoading ? (
              <p className="text-center py-10 text-muted animate-pulse">Loading data...</p>
            ) : listData.length === 0 ? (
              <p className="text-center py-10 text-muted">No records found</p>
            ) : (
              listData.map(item => (
                <div key={item.id} className="p-3 bg-white/5 rounded-lg border border-border flex items-center justify-between group">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-surface truncate">
                      {item.name || item.clientName || item.supplierName || item.code || item.invoiceNumber || item.poNumber || "Unnamed Item"}
                    </p>
                    <p className="text-[10px] text-muted mt-0.5">
                      {item.price ? `Price: ${formatMoney(item.price, business.currency || "GHS")}` : ""}
                      {item.amount ? `Amount: ${formatMoney(item.amount, business.currency || "GHS")}` : ""}
                      {item.email ? `Email: ${item.email}` : ""}
                      {item.status ? ` · Status: ${item.status}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button 
                      onClick={() => {
                        setSelectedItem(item);
                        setItemForm({ ...item });
                      }}
                      className="p-1.5 text-muted hover:text-gold transition-colors"
                    >
                      <Edit size={14} />
                    </button>
                    <button 
                      onClick={() => handleDeleteItem(item.id)}
                      className="p-1.5 text-muted hover:text-red transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="flex gap-3 pt-4 border-t border-border">
            <button className="btn-ghost w-full justify-center" onClick={() => setActiveTab(null)}>Close</button>
          </div>
        </div>
      </Modal>

      {/* Item Edit/Add Modal */}
      <Modal 
        open={!!selectedItem} 
        onClose={() => setSelectedItem(null)} 
        title={selectedItem?.new ? `Add ${activeTab}` : `Edit ${activeTab}`}
      >
        <div className="space-y-4">
          {activeTab === "products" && (
            <>
              <div><label className="label">Name</label><input className="input" value={itemForm.name || ""} onChange={e => setItemForm({...itemForm, name: e.target.value})} /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="label">Price</label><input className="input" type="number" value={itemForm.price || 0} onChange={e => setItemForm({...itemForm, price: parseFloat(e.target.value)})} /></div>
                <div><label className="label">Stock Qty</label><input className="input" type="number" value={itemForm.stockQty || 0} onChange={e => setItemForm({...itemForm, stockQty: parseInt(e.target.value)})} /></div>
              </div>
            </>
          )}
          {(activeTab === "clients" || activeTab === "suppliers") && (
            <>
              <div><label className="label">Name</label><input className="input" value={itemForm.name || ""} onChange={e => setItemForm({...itemForm, name: e.target.value})} /></div>
              <div><label className="label">Email</label><input className="input" value={itemForm.email || ""} onChange={e => setItemForm({...itemForm, email: e.target.value})} /></div>
              <div><label className="label">Phone</label><input className="input" value={itemForm.phone || ""} onChange={e => setItemForm({...itemForm, phone: e.target.value})} /></div>
            </>
          )}
          {activeTab === "vouchers" && (
            <>
              <div><label className="label">Code</label><input className="input" value={itemForm.code || ""} onChange={e => setItemForm({...itemForm, code: e.target.value})} /></div>
              <div><label className="label">Price</label><input className="input" type="number" value={itemForm.price || 0} onChange={e => setItemForm({...itemForm, price: parseFloat(e.target.value)})} /></div>
            </>
          )}
          {(activeTab === "invoices" || activeTab === "payments" || activeTab === "po") && (
            <p className="text-sm text-muted py-4 italic text-center">
              Direct editing of complex financial documents is restricted. 
              Please use the business interface or delete/re-create records.
            </p>
          )}

          <div className="flex gap-3 pt-4 border-t border-border">
            <button className="btn-ghost flex-1 justify-center" onClick={() => setSelectedItem(null)}>Cancel</button>
            <button className="btn-primary flex-1 justify-center" onClick={handleSaveItem}>Save Changes</button>
          </div>
        </div>
      </Modal>

      {/* Permissions Edit Modal */}
      <Modal open={!!editingStaff} onClose={() => setEditingStaff(null)} title="Edit Staff Permissions">
        {editingStaff && (
          <div className="space-y-6">
            <div>
              <p className="text-sm font-medium text-surface">{editingStaff.email}</p>
              <p className="text-xs text-muted mt-1">Select the pages this user can access</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {ALL_PAGES.map(page => {
                const checked = (editingStaff.permissions || []).includes(page.id);
                return (
                  <button
                    key={page.id}
                    onClick={() => {
                      const current = editingStaff.permissions || [];
                      const next = checked ? current.filter(p => p !== page.id) : [...current, page.id];
                      setEditingStaff({ ...editingStaff, permissions: next });
                    }}
                    className={cn(
                      "flex items-center justify-between p-3 rounded-lg border text-xs font-medium transition-all",
                      checked ? "bg-gold/10 border-gold text-gold" : "bg-white/5 border-border text-muted"
                    )}
                  >
                    {page.label}
                    {checked ? <Check size={14} /> : <div className="w-3.5 h-3.5 border border-muted rounded" />}
                  </button>
                );
              })}
            </div>

            <div className="flex gap-3 pt-4">
              <button className="btn-ghost flex-1 justify-center" onClick={() => setEditingStaff(null)}>Cancel</button>
              <button className="btn-primary flex-1 justify-center" onClick={handleUpdatePermissions}>Save Permissions</button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
