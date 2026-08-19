"use client";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { updateProfile } from "firebase/auth";
import { auth } from "@/lib/firebase";
import {
  getBusinessProfile, upsertBusinessProfile, BusinessProfile,
  DEFAULT_ACCENT_COLOR, MAX_LOGO_BYTES, CURRENCIES, DEFAULT_CURRENCY,
  DEFAULT_TAX_RATE, DEFAULT_TAX_LABEL, deleteBusinessData,
} from "@/lib/db";
import { checkAndEnforceThreeDayOnlineAutoSwitch, getOfflineSummary, syncAllOfflineData } from "@/lib/offline-sync";
import { getDocs, collection, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { getNotificationPreferences, saveNotificationPreferences, SchoolNotificationPreferences } from "@/lib/school-db";
import toast from "react-hot-toast";
import { AlertCircle, CheckCircle2, MailCheck, MessageSquareText, Upload, X } from "lucide-react";

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className={`w-10 h-6 rounded-full relative transition-colors flex-shrink-0 ${on ? "bg-gold" : "bg-border"}`}
    >
      <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${on ? "left-5" : "left-1"}`} />
    </button>
  );
}

export default function SettingsPage() {
  const { user, businessId, role, propertyId: authPropertyId } = useAuth();
  const effectiveRole = role as string;
  const schoolPropertyId = authPropertyId || "default_property";
  const [name, setName] = useState(user?.displayName ?? "");
  const [saving, setSaving] = useState(false);

  // Invoice/receipt branding
  const [brand, setBrand] = useState({
    businessName: "", address: "", phone: "", email: "",
    accentColor: DEFAULT_ACCENT_COLOR, portalAccentColor: "#4F46E5", footerNote: "", currency: DEFAULT_CURRENCY,
    taxRate: DEFAULT_TAX_RATE, taxInclusive: false, taxLabel: DEFAULT_TAX_LABEL,
    paystackPublicKey: "", businessType: "general" as "general" | "pharmacy" | "hotel" | "coldstore" | "school",
    propertyId: "default_property", propertyName: "Main Property",
    allowStaffDiscounts: false,
  });
  const [logoDataUrl, setLogoDataUrl] = useState<string | undefined>(undefined);
  const [brandLoading, setBrandLoading] = useState(true);
  const [brandSaving, setBrandSaving] = useState(false);
  const [exportStartDate, setExportStartDate] = useState("");
  const [exportEndDate, setExportEndDate] = useState("");
  const [offlineSummary, setOfflineSummary] = useState({ sales: 0, invoices: 0, payments: 0, folios: 0, total: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [schoolNotificationPreferences, setSchoolNotificationPreferences] = useState<SchoolNotificationPreferences | null>(null);
  const [schoolNotificationSaving, setSchoolNotificationSaving] = useState(false);
  const [providerReadiness, setProviderReadiness] = useState<{ email: { configured: boolean; envVar: string; description: string; validationMessage?: string }; sms: { configured: boolean; envVar: string; description: string; validationMessage?: string }; webhookAuth?: { configured: boolean; envVar: string; description: string } } | null>(null);
  const [providerReadinessLoading, setProviderReadinessLoading] = useState(false);

  useEffect(() => {
    if (!businessId) return;
    getBusinessProfile(businessId).then(profile => {
      if (profile) {
        setBrand({
          businessName: profile.businessName ?? "",
          address: profile.address ?? "",
          phone: profile.phone ?? "",
          email: profile.email ?? "",
          accentColor: profile.accentColor ?? DEFAULT_ACCENT_COLOR,
          portalAccentColor: profile.portalAccentColor ?? "#4F46E5",
          footerNote: profile.footerNote ?? "",
          currency: profile.currency ?? DEFAULT_CURRENCY,
          taxRate: profile.taxRate ?? DEFAULT_TAX_RATE,
          taxInclusive: profile.taxInclusive ?? false,
          taxLabel: profile.taxLabel ?? DEFAULT_TAX_LABEL,
          paystackPublicKey: profile.paystackPublicKey ?? "",
          businessType: (profile as any).businessType ?? "general",
          propertyId: profile.propertyId ?? "default_property",
          propertyName: profile.propertyName ?? profile.businessName ?? "Main Property",
          allowStaffDiscounts: profile.allowStaffDiscounts === true,
        });
        setLogoDataUrl(profile.logoDataUrl);
      }
      setBrandLoading(false);
    });
  }, [businessId]);

  useEffect(() => {
    if (!businessId) return;
    let cancelled = false;
    const loadSchoolCommunicationSettings = async () => {
      setProviderReadinessLoading(true);
      try {
        const [preferences, token] = await Promise.all([
          getNotificationPreferences(businessId, schoolPropertyId),
          auth.currentUser?.getIdToken(),
        ]);
        if (!cancelled) setSchoolNotificationPreferences(preferences);
        if (!token) return;
        const response = await fetch("/api/school/notifications/config", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) throw new Error("Could not read delivery configuration");
        const config = await response.json();
        if (!cancelled) setProviderReadiness(config);
      } catch (error) {
        console.error("School communication settings warning:", error);
      } finally {
        if (!cancelled) setProviderReadinessLoading(false);
      }
    };
    loadSchoolCommunicationSettings();
    return () => { cancelled = true; };
  }, [businessId, schoolPropertyId, user?.uid]);

  const handleLogoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file");
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      toast.error(`Logo must be under ${Math.round(MAX_LOGO_BYTES / 1024)}KB — try a smaller or more compressed image`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setLogoDataUrl(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleSaveBrand = async () => {
    if (!businessId) return;
    if (!brand.businessName) {
      toast.error("Business name is required");
      return;
    }
    setBrandSaving(true);
    try {
      const currentProfile = await getBusinessProfile(businessId);
      await upsertBusinessProfile({
        businessId,
        ...brand,
        // Business type is an administrative control. Owners can edit branding but cannot change the operating mode.
        businessType: effectiveRole === "super_admin" ? brand.businessType : (currentProfile?.businessType ?? brand.businessType),
        logoDataUrl,
      });
      toast.success("Invoice branding saved");
    } catch (err: any) {
      toast.error(err.message ?? "Could not save branding");
    } finally {
      setBrandSaving(false);
    }
  };

  const handleSaveSchoolNotifications = async () => {
    if (!businessId) return;
    setSchoolNotificationSaving(true);
    try {
      const current = schoolNotificationPreferences || await getNotificationPreferences(businessId, schoolPropertyId);
      const next = {
        ...current,
        businessId,
        propertyId: schoolPropertyId,
        admissionLetterSms: current.admissionLetterSms === true,
      };
      await saveNotificationPreferences(next);
      setSchoolNotificationPreferences(next);
      toast.success("School communication preferences saved");
    } catch (error: any) {
      toast.error(error?.message || "Could not save school communication preferences");
    } finally {
      setSchoolNotificationSaving(false);
    }
  };

  const [toggles, setToggles] = useState({
    paystack: true, flutterwave: false, momo: true,
    paidAlert: true, overdueReminder: true, weeklyReport: false,
    offlineMode: false,
  });

  useEffect(() => {
    // Check 3-day automatic online transition rule on mount
    const switched = checkAndEnforceThreeDayOnlineAutoSwitch();
    if (switched) {
      toast.success("Automatic sync: 3-day offline limit reached. Switched back to Online mode and syncing data!");
    }

    const isOffline = localStorage.getItem("billflow_offline_mode") === "true";
    setToggles(t => ({ ...t, offlineMode: isOffline }));
    setOfflineSummary(getOfflineSummary());
  }, []);

  const toggle = (key: keyof typeof toggles) => {
    const newValue = !toggles[key];
    setToggles(t => ({ ...t, [key]: newValue }));
    if (key === "offlineMode") {
      localStorage.setItem("billflow_offline_mode", newValue.toString());
      if (newValue) {
        localStorage.setItem("billflow_offline_start_timestamp", Date.now().toString());
        toast.success("Offline Mode Enabled (Auto-syncs online after 3 days)");
      } else {
        localStorage.removeItem("billflow_offline_start_timestamp");
        toast.success("Online Mode Enabled");
      }
      // Dispatch custom event for real-time updates across components
      window.dispatchEvent(new Event("billflow_offline_change"));
    }
  };

  const handleClearOfflineData = () => {
    const confirmText = "clear offline data";
    const input = prompt(`This will permanently delete all offline-queued sales, invoices, and payments that haven't been synced. Type "${confirmText}" to confirm:`);
    
    if (input !== confirmText) {
      if (input !== null) toast.error("Incorrect confirmation text");
      return;
    }

    localStorage.removeItem("billflow_offline_sales");
    localStorage.removeItem("billflow_offline_invoices");
    localStorage.removeItem("billflow_offline_payments");
    toast.success("Offline data cleared successfully");
    window.dispatchEvent(new Event("billflow_refresh"));
  };

  const handleSave = async () => {
    if (!auth.currentUser) return;
    setSaving(true);
    await updateProfile(auth.currentUser, { displayName: name });
    toast.success("Profile updated ✅");
    setSaving(false);
  };

  const [deleting, setDeleting] = useState(false);
  const handleDeleteAccount = async () => {
    if (!businessId || role !== "owner") return;
    const confirmText = "delete my business data";
    const input = prompt(`DANGER: This will permanently delete all your products, sales, and business data. Type "${confirmText}" to confirm:`);
    
    if (input !== confirmText) {
      if (input !== null) toast.error("Incorrect confirmation text");
      return;
    }

    setDeleting(true);
    try {
      await deleteBusinessData(businessId);
      toast.success("All business data has been deleted.");
      // Redirect or logout
      setTimeout(() => {
        auth.signOut();
        window.location.href = "/auth/login";
      }, 2000);
    } catch (err: any) {
      toast.error(err.message || "Could not delete account data");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="max-w-xl space-y-6">
      {/* Account */}
      <div className="card">
        <h2 className="font-grotesk font-semibold text-white mb-5">Account</h2>
        <div className="space-y-4">
          <div>
            <label className="label">Display Name</label>
            <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Your Name" />
          </div>
          <div>
            <label className="label">Email</label>
            <input className="input" value={user?.email ?? ""} disabled />
          </div>
          <div>
            <label className="label">Currency</label>
            <select className="input" value={brand.currency} onChange={e => setBrand(b => ({ ...b, currency: e.target.value }))}>
              {Object.entries(CURRENCIES).map(([code, { name, symbol }]) => (
                <option key={code} value={code}>{code} — {name} ({symbol})</option>
              ))}
            </select>
          </div>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>

      {/* Invoice & Receipt Branding */}
      {role === "owner" && (
        <div className="card">
          <h2 className="font-grotesk font-semibold text-white mb-1">Invoice &amp; Receipt Branding</h2>
          <p className="text-xs text-muted mb-5">This appears on invoices, POS receipts, and the Parent Portal after a student lookup.</p>

          {brandLoading ? (
            <p className="text-muted text-sm py-6 text-center">Loading...</p>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="label">Logo</label>
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-lg bg-deep border border-border flex items-center justify-center overflow-hidden flex-shrink-0">
                    {logoDataUrl ? (
                      <img src={logoDataUrl} alt="Logo preview" className="w-full h-full object-contain" />
                    ) : (
                      <span className="text-[10px] text-muted text-center px-1">No logo</span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button className="btn-ghost text-xs" onClick={() => fileInputRef.current?.click()}>
                      <Upload size={13} /> Upload
                    </button>
                    {logoDataUrl && (
                      <button className="btn-ghost text-xs" onClick={() => setLogoDataUrl(undefined)}>
                        <X size={13} /> Remove
                      </button>
                    )}
                  </div>
                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoSelect} />
                </div>
                <p className="text-[11px] text-muted mt-1.5">PNG or JPG, under {Math.round(MAX_LOGO_BYTES / 1024)}KB</p>
              </div>

              <div>
                <label className="label">Business Name *</label>
                <input className="input" value={brand.businessName} onChange={e => setBrand(b => ({ ...b, businessName: e.target.value }))} placeholder="Y.A.P Multimedia & Tech" />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="label mb-0">Business Type</label>
                  {effectiveRole !== "super_admin" && (
                    <span className="text-[11px] text-muted">Managed by Super Admin</span>
                  )}
                </div>
                <select
                  className={`input mt-1 ${effectiveRole !== "super_admin" ? "opacity-70 cursor-not-allowed" : ""}`}
                  value={brand.businessType}
                  disabled={effectiveRole !== "super_admin"}
                  onChange={e => setBrand(b => ({ ...b, businessType: e.target.value as typeof b.businessType }))}
                >
                  <option value="general">General Business</option>
                  <option value="pharmacy">Pharmacy</option>
                  <option value="hotel">Hotel</option>
                  <option value="coldstore">Coldstore</option>
                  <option value="school">School</option>
                </select>
                <p className="text-[11px] text-muted mt-1.5">Only Super Admin can change the business operating mode. Hotel accounts receive room, reservation, front desk, guest, and billing modules only.</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Property ID</label>
                  <input className="input" value={brand.propertyId} onChange={e => setBrand(b => ({ ...b, propertyId: e.target.value.replace(/\s+/g, "_").toLowerCase() }))} placeholder="default_property" />
                  <p className="text-[11px] text-muted mt-1">Stable identifier used on rooms, rates, guests, and reservations.</p>
                </div>
                <div>
                  <label className="label">Property Name</label>
                  <input className="input" value={brand.propertyName} onChange={e => setBrand(b => ({ ...b, propertyName: e.target.value }))} placeholder="Main Property" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Phone</label>
                  <input className="input" value={brand.phone} onChange={e => setBrand(b => ({ ...b, phone: e.target.value }))} placeholder="Optional" />
                </div>
                <div>
                  <label className="label">Contact Email</label>
                  <input className="input" value={brand.email} onChange={e => setBrand(b => ({ ...b, email: e.target.value }))} placeholder="Optional" />
                </div>
              </div>

              <div>
                <label className="label">Address</label>
                <input className="input" value={brand.address} onChange={e => setBrand(b => ({ ...b, address: e.target.value }))} placeholder="Optional" />
              </div>

              <div>
                <label className="label">Brand Accent Color</label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={brand.accentColor}
                    onChange={e => setBrand(b => ({ ...b, accentColor: e.target.value }))}
                    className="w-10 h-10 rounded-lg border border-border bg-transparent cursor-pointer p-0"
                  />
                  <input
                    className="input flex-1"
                    value={brand.accentColor}
                    onChange={e => setBrand(b => ({ ...b, accentColor: e.target.value }))}
                    placeholder={DEFAULT_ACCENT_COLOR}
                  />
                </div>
                <p className="text-[11px] text-muted mt-1.5">Used for totals and highlights on invoices &amp; receipts</p>
              </div>

              <div>
                <label className="label">Parent Portal Accent Color</label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={brand.portalAccentColor}
                    onChange={e => setBrand(b => ({ ...b, portalAccentColor: e.target.value }))}
                    className="w-10 h-10 rounded-lg border border-border bg-transparent cursor-pointer p-0"
                  />
                  <input
                    className="input flex-1"
                    value={brand.portalAccentColor}
                    onChange={e => setBrand(b => ({ ...b, portalAccentColor: e.target.value }))}
                    placeholder="#4F46E5"
                  />
                </div>
                <p className="text-[11px] text-muted mt-1.5">Used for the Parent Portal landing page actions, highlights, and focus states.</p>
              </div>

              <div>
                <label className="label">Footer Note</label>
                <input className="input" value={brand.footerNote} onChange={e => setBrand(b => ({ ...b, footerNote: e.target.value }))} placeholder="e.g. Thank you for your business! Goods sold are non-refundable after 7 days." />
              </div>

              {/* Tax Settings */}
              <div className="border-t border-border pt-4 mt-4">
                <h3 className="font-grotesk font-semibold text-white text-sm mb-3">Tax Settings</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="label">Tax Rate (%)</label>
                    <input className="input" type="number" min="0" max="100" step="0.5" value={brand.taxRate} onChange={e => setBrand(b => ({ ...b, taxRate: parseFloat(e.target.value) || 0 }))} placeholder="e.g. 15" />
                    <p className="text-[11px] text-muted mt-1">Set to 0 to disable tax</p>
                  </div>
                  <div>
                    <label className="label">Tax Label</label>
                    <input className="input" value={brand.taxLabel} onChange={e => setBrand(b => ({ ...b, taxLabel: e.target.value }))} placeholder="e.g. VAT, GST, Sales Tax" />
                  </div>
                </div>
                <div className="flex items-center justify-between mt-3">
                  <div>
                    <p className="text-sm text-surface">Tax-inclusive pricing</p>
                    <p className="text-[11px] text-muted">Product prices already include tax</p>
                  </div>
                  <Toggle on={brand.taxInclusive} onToggle={() => setBrand(b => ({ ...b, taxInclusive: !b.taxInclusive }))} />
                </div>
              </div>

              <div className="border-t border-border pt-4 mt-4">
                <h3 className="font-grotesk font-semibold text-white text-sm mb-3">Checkout Controls</h3>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm text-surface">Allow salesperson discounts</p>
                    <p className="text-[11px] text-muted mt-1">When enabled, salesperson accounts can apply discounts at POS checkout. Owners can always discount.</p>
                  </div>
                  <Toggle on={brand.allowStaffDiscounts === true} onToggle={() => setBrand(b => ({ ...b, allowStaffDiscounts: !b.allowStaffDiscounts }))} />
                </div>
              </div>

              <button className="btn-primary" onClick={handleSaveBrand} disabled={brandSaving}>
                {brandSaving ? "Saving..." : "Save Branding"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* School Communications */}
      {brand.businessType === "school" && (effectiveRole === "owner" || effectiveRole === "super_admin") && (
        <div className="card">
          <div className="flex items-start justify-between gap-4 mb-5">
            <div>
              <h2 className="font-grotesk font-semibold text-white mb-1">School Communications</h2>
              <p className="text-xs text-muted">Admission letters use your saved school branding and are delivered through the configured server webhooks.</p>
            </div>
            <MailCheck size={20} className="text-gold shrink-0" />
          </div>

          <div className="space-y-3 mb-5">
            {[
              { key: "email" as const, label: "Email delivery", icon: MailCheck },
              { key: "sms" as const, label: "SMS delivery", icon: MessageSquareText },
            ].map(({ key, label, icon: Icon }) => {
              const channel = providerReadiness?.[key];
              const configured = channel?.configured === true;
              return (
                <div key={key} className={`flex items-start gap-3 p-3 rounded-xl border ${configured ? "border-green/30 bg-green/5" : "border-gold/30 bg-gold/5"}`}>
                  {configured ? <CheckCircle2 size={16} className="text-green mt-0.5 shrink-0" /> : <AlertCircle size={16} className="text-gold mt-0.5 shrink-0" />}
                  <Icon size={16} className={configured ? "text-green mt-0.5 shrink-0" : "text-gold mt-0.5 shrink-0"} />
                  <div className="min-w-0">
                    <p className="text-sm text-surface">{label}: {providerReadinessLoading ? "Checking..." : configured ? "Ready" : "Not configured"}</p>
                    <p className="text-[11px] text-muted mt-0.5">{channel?.description || "Delivery status is checked server-side."}</p>
                    {!configured && channel?.validationMessage && <p className="text-[11px] text-gold mt-1">{channel.validationMessage}</p>}
                    {!configured && channel?.envVar && <p className="text-[11px] text-gold mt-1">Set <code className="font-mono">{channel.envVar}</code> in the Vercel server environment settings, then redeploy.</p>}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="rounded-lg border border-border bg-background/40 p-3 mb-5">
            <p className="text-xs font-semibold text-foreground">Webhook security</p>
            <p className="text-[11px] text-muted mt-1">{providerReadiness?.webhookAuth?.configured ? "Shared-secret authentication is enabled for outbound delivery." : "For production, configure a shared secret on both BillFlow and your provider adapter."}</p>
            {!providerReadiness?.webhookAuth?.configured && <p className="text-[11px] text-gold mt-1">Set <code className="font-mono">{providerReadiness?.webhookAuth?.envVar || "SCHOOL_NOTIFICATION_WEBHOOK_SECRET"}</code> in Vercel and validate the x-billflow-webhook-secret header on the receiving adapter.</p>}
          </div>

          <div className="flex items-center justify-between gap-4 py-3.5 border-y border-border">
            <div>
              <p className="text-sm text-surface">Send admission letters by SMS</p>
              <p className="text-[11px] text-muted mt-1">When enabled, a guardian phone number receives an SMS copy. Email remains the primary channel when available.</p>
            </div>
            <Toggle
              on={schoolNotificationPreferences?.admissionLetterSms === true}
              onToggle={() => setSchoolNotificationPreferences((current) => current ? { ...current, admissionLetterSms: !current.admissionLetterSms } : current)}
            />
          </div>

          <div className="flex items-center justify-between gap-3 mt-4">
            <p className="text-[11px] text-muted">Provider secrets are never stored in Firestore or exposed to the browser.</p>
            <button className="btn-primary text-xs" onClick={handleSaveSchoolNotifications} disabled={schoolNotificationSaving || !schoolNotificationPreferences}>
              {schoolNotificationSaving ? "Saving..." : "Save Communication Settings"}
            </button>
          </div>
        </div>
      )}

      {/* Payment Gateways */}
      <div className="card">
        <h2 className="font-grotesk font-semibold text-white mb-5">Payment Gateways</h2>
        <div className="space-y-4 mb-6">
          <div>
            <label className="label">Your Paystack Public Key</label>
            <input 
              className="input" 
              type="text" 
              placeholder="pk_live_..." 
              value={brand.paystackPublicKey} 
              onChange={e => setBrand(b => ({ ...b, paystackPublicKey: e.target.value }))} 
            />
            <p className="text-[11px] text-muted mt-1.5">Enter your Paystack Public Key to receive payments directly to your account.</p>
          </div>
          <button className="btn-primary w-full justify-center" onClick={handleSaveBrand} disabled={brandSaving}>
            {brandSaving ? "Saving..." : "Save API Settings"}
          </button>
        </div>

        {[
          { key: "paystack", label: "Paystack", sub: "Card & MoMo payments" },
          { key: "flutterwave", label: "Flutterwave", sub: "Multi-currency payments" },
          { key: "momo", label: "MTN Mobile Money", sub: "Direct MoMo integration" },
        ].map(({ key, label, sub }) => (
          <div key={key} className="flex items-center justify-between py-3.5 border-b border-border last:border-0">
            <div>
              <p className="text-sm text-surface">{label}</p>
              <p className="text-xs text-muted mt-0.5">{sub}</p>
            </div>
            <Toggle on={toggles[key as keyof typeof toggles]} onToggle={() => toggle(key as keyof typeof toggles)} />
          </div>
        ))}
      </div>

      {/* Connectivity & Sync Status Dashboard */}
      <div className="card">
        <h2 className="font-grotesk font-semibold text-white mb-3">Connectivity & Sync Status</h2>
        <p className="text-xs text-muted mb-4">Monitor offline queues, retry state, and force synchronization across your connected devices.</p>
        
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          <div className="p-3 bg-surface/5 rounded-xl border border-border">
            <p className="text-[10px] uppercase tracking-wider text-muted font-mono">Offline Sales</p>
            <p className="text-lg font-bold text-white mt-0.5">{offlineSummary.sales}</p>
          </div>
          <div className="p-3 bg-surface/5 rounded-xl border border-border">
            <p className="text-[10px] uppercase tracking-wider text-muted font-mono">Offline Invoices</p>
            <p className="text-lg font-bold text-white mt-0.5">{offlineSummary.invoices}</p>
          </div>
          <div className="p-3 bg-surface/5 rounded-xl border border-border">
            <p className="text-[10px] uppercase tracking-wider text-muted font-mono">Offline Payments</p>
            <p className="text-lg font-bold text-white mt-0.5">{offlineSummary.payments}</p>
          </div>
          <div className="p-3 bg-surface/5 rounded-xl border border-border">
            <p className="text-[10px] uppercase tracking-wider text-muted font-mono">Total Unsynced</p>
            <p className={`text-lg font-bold mt-0.5 ${offlineSummary.total > 0 ? "text-gold" : "text-white"}`}>{offlineSummary.total}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 py-3.5 border-b border-border">
          <div>
            <p className="text-sm text-surface">Force Offline Mode</p>
            <p className="text-xs text-muted mt-0.5">Work without internet (Auto-syncs online after 3 days).</p>
          </div>
          <Toggle on={toggles.offlineMode} onToggle={() => toggle("offlineMode")} />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 py-3.5 border-b border-border">
          <div>
            <p className="text-sm text-surface">Manual Sync Queue</p>
            <p className="text-xs text-muted mt-0.5">Attempt to synchronize all pending offline items immediately.</p>
          </div>
          <button
            onClick={async () => {
              const t = toast.loading("Syncing offline queue...");
              try {
                const res = await syncAllOfflineData({
                  sale: async (data: any) => {
                    const r = await fetch("/api/pos/sales", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify(data),
                    });
                    if (!r.ok) throw new Error("Sync failed");
                    return r.json();
                  },
                  invoice: async (data: any) => {
                    const r = await fetch("/api/invoices", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify(data),
                    });
                    if (!r.ok) throw new Error("Sync failed");
                    return r.json();
                  },
                  payment: async (data: any) => {
                    const r = await fetch("/api/payments", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify(data),
                    });
                    if (!r.ok) throw new Error("Sync failed");
                    return r.json();
                  }
                });
                setOfflineSummary(getOfflineSummary());
                if (res.synced > 0) {
                  toast.success(`Successfully synced ${res.synced} items!`, { id: t });
                } else {
                  toast.success("Queue checked. No items ready or already synced.", { id: t });
                }
              } catch (err) {
                console.error(err);
                toast.error("Sync encountered errors. Will retry automatically.", { id: t });
              }
            }}
            className="btn-gold text-xs"
          >
            Sync Now
          </button>
        </div>

        <div className="flex items-center justify-between py-3.5 mt-2">
          <div>
            <p className="text-sm text-red font-bold">Clear Offline Queue</p>
            <p className="text-xs text-muted mt-0.5">Permanently delete all unsynced offline records.</p>
          </div>
          <button onClick={handleClearOfflineData} className="btn-ghost text-red text-xs hover:bg-red/10">Clear Now</button>
        </div>
      </div>

      {/* Notifications */}
      <div className="card">
        <h2 className="font-grotesk font-semibold text-white mb-5">Notifications</h2>
        {[
          { key: "paidAlert", label: "Invoice paid alert", sub: "SMS + Email when payment received" },
          { key: "overdueReminder", label: "Overdue reminders", sub: "Auto-remind clients 1 day before due" },
          { key: "weeklyReport", label: "Weekly revenue report", sub: "Summary every Monday" },
        ].map(({ key, label, sub }) => (
          <div key={key} className="flex items-center justify-between py-3.5 border-b border-border last:border-0">
            <div>
              <p className="text-sm text-surface">{label}</p>
              <p className="text-xs text-muted mt-0.5">{sub}</p>
            </div>
            <Toggle on={toggles[key as keyof typeof toggles]} onToggle={() => toggle(key as keyof typeof toggles)} />
          </div>
        ))}
      </div>

      {/* Export My Data */}
      <div className="card">
        <h2 className="font-grotesk font-semibold text-white mb-2">Export My Data (Excel & CSV)</h2>
        <p className="text-xs text-muted mb-4">Download complete backup copies of your invoices, transactions (payments), and inventory with optional date filtering for accounting and record keeping.</p>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4 p-3 bg-surface/5 rounded-xl border border-border">
          <div>
            <label className="block text-xs text-muted mb-1">Start Date (Optional)</label>
            <input
              type="date"
              value={exportStartDate}
              onChange={(e) => setExportStartDate(e.target.value)}
              className="input text-xs w-full"
            />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1">End Date (Optional)</label>
            <input
              type="date"
              value={exportEndDate}
              onChange={(e) => setExportEndDate(e.target.value)}
              className="input text-xs w-full"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={async () => {
              if (!businessId) {
                toast.error("No active business selected");
                return;
              }
              const t = toast.loading("Generating Excel workbook...");
              try {
                const invSnap = await getDocs(query(collection(db, "invoices"), where("businessId", "==", businessId)));
                const paySnap = await getDocs(query(collection(db, "payments"), where("businessId", "==", businessId)));
                const prodSnap = await getDocs(query(collection(db, "products"), where("businessId", "==", businessId)));

                const startDate = exportStartDate ? new Date(exportStartDate).getTime() : 0;
                const endDate = exportEndDate ? new Date(exportEndDate).getTime() + 86400000 : Infinity;

                const invoices = invSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter((item: any) => {
                  const time = item.createdAt?.toDate ? item.createdAt.toDate().getTime() : 0;
                  return !exportStartDate && !exportEndDate || (time >= startDate && time <= endDate);
                });

                const payments = paySnap.docs.map(d => ({ id: d.id, ...d.data() })).filter((item: any) => {
                  const time = item.createdAt?.toDate ? item.createdAt.toDate().getTime() : 0;
                  return !exportStartDate && !exportEndDate || (time >= startDate && time <= endDate);
                });

                const products = prodSnap.docs.map(d => ({ id: d.id, ...d.data() }));

                // Build XML Spreadsheet 2003 format (Native Excel Workbook with multiple sheets)
                let xml = `<?xml version="1.0"?>
                <?mso-application progid="Excel.Sheet"?>
                <Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
                 xmlns:o="urn:schemas-microsoft-com:office:office"
                 xmlns:x="urn:schemas-microsoft-com:office:excel"
                 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
                 xmlns:html="http://www.w3.org/TR/REC-html40">
                 <Styles>
                  <Style ss:ID="Default" ss:Name="Normal">
                   <Alignment ss:Vertical="Bottom"/>
                   <Borders/>
                   <Font ss:FontName="Calibri" ss:Size="11"/>
                   <Interior/>
                   <NumberFormat/>
                   <Protection/>
                  </Style>
                  <Style ss:ID="Header">
                   <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#FFFFFF"/>
                   <Interior ss:Color="#1F2937" ss:Pattern="Solid"/>
                  </Style>
                 </Styles>`;

                // 1. Invoices Sheet
                xml += `<Worksheet ss:Name="Invoices"><Table>`;
                xml += `<Row ss:StyleID="Header"><Cell><Data ss:Type="String">Invoice ID</Data></Cell><Cell><Data ss:Type="String">Number</Data></Cell><Cell><Data ss:Type="String">Client</Data></Cell><Cell><Data ss:Type="String">Amount</Data></Cell><Cell><Data ss:Type="String">Status</Data></Cell><Cell><Data ss:Type="String">Paid</Data></Cell><Cell><Data ss:Type="String">Date</Data></Cell></Row>`;
                invoices.forEach((inv: any) => {
                  const dateStr = inv.createdAt?.toDate ? inv.createdAt.toDate().toISOString() : "";
                  xml += `<Row>`;
                  xml += `<Cell><Data ss:Type="String">${inv.id}</Data></Cell>`;
                  xml += `<Cell><Data ss:Type="String">${inv.invoiceNumber || ""}</Data></Cell>`;
                  xml += `<Cell><Data ss:Type="String">${inv.clientName || ""}</Data></Cell>`;
                  xml += `<Cell><Data ss:Type="Number">${inv.amount || 0}</Data></Cell>`;
                  xml += `<Cell><Data ss:Type="String">${inv.status || ""}</Data></Cell>`;
                  xml += `<Cell><Data ss:Type="Number">${inv.amountPaid || 0}</Data></Cell>`;
                  xml += `<Cell><Data ss:Type="String">${dateStr}</Data></Cell>`;
                  xml += `</Row>`;
                });
                xml += `</Table></Worksheet>`;

                // 2. Transactions Sheet
                xml += `<Worksheet ss:Name="Transactions"><Table>`;
                xml += `<Row ss:StyleID="Header"><Cell><Data ss:Type="String">Transaction ID</Data></Cell><Cell><Data ss:Type="String">Invoice ID</Data></Cell><Cell><Data ss:Type="String">Method</Data></Cell><Cell><Data ss:Type="String">Amount</Data></Cell><Cell><Data ss:Type="String">Reference</Data></Cell><Cell><Data ss:Type="String">Status</Data></Cell><Cell><Data ss:Type="String">Date</Data></Cell></Row>`;
                payments.forEach((pay: any) => {
                  const dateStr = pay.createdAt?.toDate ? pay.createdAt.toDate().toISOString() : "";
                  xml += `<Row>`;
                  xml += `<Cell><Data ss:Type="String">${pay.id}</Data></Cell>`;
                  xml += `<Cell><Data ss:Type="String">${pay.invoiceId || ""}</Data></Cell>`;
                  xml += `<Cell><Data ss:Type="String">${pay.method || ""}</Data></Cell>`;
                  xml += `<Cell><Data ss:Type="Number">${pay.amount || 0}</Data></Cell>`;
                  xml += `<Cell><Data ss:Type="String">${pay.reference || ""}</Data></Cell>`;
                  xml += `<Cell><Data ss:Type="String">${pay.status || ""}</Data></Cell>`;
                  xml += `<Cell><Data ss:Type="String">${dateStr}</Data></Cell>`;
                  xml += `</Row>`;
                });
                xml += `</Table></Worksheet>`;

                // 3. Inventory Sheet
                xml += `<Worksheet ss:Name="Inventory"><Table>`;
                xml += `<Row ss:StyleID="Header"><Cell><Data ss:Type="String">Product ID</Data></Cell><Cell><Data ss:Type="String">Name</Data></Cell><Cell><Data ss:Type="String">Category</Data></Cell><Cell><Data ss:Type="String">Price</Data></Cell><Cell><Data ss:Type="String">Stock Qty</Data></Cell><Cell><Data ss:Type="String">Reorder Level</Data></Cell></Row>`;
                products.forEach((prod: any) => {
                  xml += `<Row>`;
                  xml += `<Cell><Data ss:Type="String">${prod.id}</Data></Cell>`;
                  xml += `<Cell><Data ss:Type="String">${prod.name || ""}</Data></Cell>`;
                  xml += `<Cell><Data ss:Type="String">${prod.category || ""}</Data></Cell>`;
                  xml += `<Cell><Data ss:Type="Number">${prod.price || 0}</Data></Cell>`;
                  xml += `<Cell><Data ss:Type="Number">${prod.stockQty || 0}</Data></Cell>`;
                  xml += `<Cell><Data ss:Type="Number">${prod.reorderLevel || 0}</Data></Cell>`;
                  xml += `</Row>`;
                });
                xml += `</Table></Worksheet>`;

                xml += `</Workbook>`;

                const blob = new Blob([xml], { type: "application/vnd.ms-excel;charset=utf-8;" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `billflow_backup_${businessId}_${Date.now()}.xls`;
                a.click();
                toast.success("Excel backup workbook downloaded successfully!", { id: t });
              } catch (e) {
                console.error(e);
                toast.error("Failed to generate Excel export", { id: t });
              }
            }}
            className="btn-gold text-xs flex items-center gap-2"
          >
            Export Complete Excel Workbook (.xls)
          </button>

          <button
            onClick={async () => {
              if (!businessId) {
                toast.error("No active business selected");
                return;
              }
              const t = toast.loading("Exporting invoices CSV...");
              try {
                const snap = await getDocs(query(collection(db, "invoices"), where("businessId", "==", businessId)));
                const startDate = exportStartDate ? new Date(exportStartDate).getTime() : 0;
                const endDate = exportEndDate ? new Date(exportEndDate).getTime() + 86400000 : Infinity;

                const rows = snap.docs.map(d => {
                  const data = d.data();
                  return {
                    id: d.id,
                    invoiceNumber: data.invoiceNumber || "",
                    clientName: data.clientName || "",
                    amount: data.amount || 0,
                    status: data.status || "",
                    amountPaid: data.amountPaid || 0,
                    createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : ""
                  };
                }).filter((r: any) => {
                  const time = r.createdAt ? new Date(r.createdAt).getTime() : 0;
                  return !exportStartDate && !exportEndDate || (time >= startDate && time <= endDate);
                });

                if (rows.length === 0) {
                  toast.error("No invoices found in date range", { id: t });
                  return;
                }
                const headers = Object.keys(rows[0]);
                const csvContent = [
                  headers.join(","),
                  ...rows.map(r => headers.map(h => `"${String((r as any)[h] || "").replace(/"/g, '""')}"`).join(","))
                ].join("\n");
                const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `billflow_invoices_${businessId}_${Date.now()}.csv`;
                a.click();
                toast.success("Invoices CSV downloaded successfully!", { id: t });
              } catch (e) {
                console.error(e);
                toast.error("Failed to export invoices", { id: t });
              }
            }}
            className="btn-ghost border border-border text-xs flex items-center gap-2 hover:bg-gold/10 hover:text-gold"
          >
            Export Invoices (CSV)
          </button>
          <button
            onClick={async () => {
              if (!businessId) {
                toast.error("No active business selected");
                return;
              }
              const t = toast.loading("Exporting transactions CSV...");
              try {
                const snap = await getDocs(query(collection(db, "payments"), where("businessId", "==", businessId)));
                const startDate = exportStartDate ? new Date(exportStartDate).getTime() : 0;
                const endDate = exportEndDate ? new Date(exportEndDate).getTime() + 86400000 : Infinity;

                const rows = snap.docs.map(d => {
                  const data = d.data();
                  return {
                    id: d.id,
                    invoiceId: data.invoiceId || "",
                    method: data.method || "",
                    amount: data.amount || 0,
                    reference: data.reference || "",
                    status: data.status || "",
                    createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : ""
                  };
                }).filter((r: any) => {
                  const time = r.createdAt ? new Date(r.createdAt).getTime() : 0;
                  return !exportStartDate && !exportEndDate || (time >= startDate && time <= endDate);
                });

                if (rows.length === 0) {
                  toast.error("No transactions found in date range", { id: t });
                  return;
                }
                const headers = Object.keys(rows[0]);
                const csvContent = [
                  headers.join(","),
                  ...rows.map(r => headers.map(h => `"${String((r as any)[h] || "").replace(/"/g, '""')}"`).join(","))
                ].join("\n");
                const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `billflow_transactions_${businessId}_${Date.now()}.csv`;
                a.click();
                toast.success("Transactions CSV downloaded successfully!", { id: t });
              } catch (e) {
                console.error(e);
                toast.error("Failed to export transactions", { id: t });
              }
            }}
            className="btn-ghost border border-border text-xs flex items-center gap-2 hover:bg-gold/10 hover:text-gold"
          >
            Export Transactions (CSV)
          </button>
        </div>
      </div>

      {/* Danger zone */}
      {role === "owner" && (
        <div className="card border-red/20">
          <h2 className="font-grotesk font-semibold text-red mb-3">Danger Zone</h2>
          <p className="text-xs text-muted mb-4">These actions are permanent and cannot be undone. All your business records will be wiped from our database.</p>
          <button 
            className="btn-danger" 
            onClick={handleDeleteAccount}
            disabled={deleting}
          >
            {deleting ? "Deleting Data..." : "Delete All Business Data"}
          </button>
        </div>
      )}
    </div>
  );
}
