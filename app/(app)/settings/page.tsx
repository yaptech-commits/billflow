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
import toast from "react-hot-toast";
import { Upload, X } from "lucide-react";

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
  const { user, businessId, role } = useAuth();
  const [name, setName] = useState(user?.displayName ?? "");
  const [saving, setSaving] = useState(false);

  // Invoice/receipt branding
  const [brand, setBrand] = useState({
    businessName: "", address: "", phone: "", email: "",
    accentColor: DEFAULT_ACCENT_COLOR, footerNote: "", currency: DEFAULT_CURRENCY,
    taxRate: DEFAULT_TAX_RATE, taxInclusive: false, taxLabel: DEFAULT_TAX_LABEL,
  });
  const [logoDataUrl, setLogoDataUrl] = useState<string | undefined>(undefined);
  const [brandLoading, setBrandLoading] = useState(true);
  const [brandSaving, setBrandSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
          footerNote: profile.footerNote ?? "",
          currency: profile.currency ?? DEFAULT_CURRENCY,
          taxRate: profile.taxRate ?? DEFAULT_TAX_RATE,
          taxInclusive: profile.taxInclusive ?? false,
          taxLabel: profile.taxLabel ?? DEFAULT_TAX_LABEL,
        });
        setLogoDataUrl(profile.logoDataUrl);
      }
      setBrandLoading(false);
    });
  }, [businessId]);

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
      await upsertBusinessProfile({
        businessId,
        ...brand,
        logoDataUrl,
      });
      toast.success("Invoice branding saved");
    } catch (err: any) {
      toast.error(err.message ?? "Could not save branding");
    } finally {
      setBrandSaving(false);
    }
  };

  const [toggles, setToggles] = useState({
    paystack: true, flutterwave: false, momo: true,
    paidAlert: true, overdueReminder: true, weeklyReport: false,
  });

  const toggle = (key: keyof typeof toggles) =>
    setToggles(t => ({ ...t, [key]: !t[key] }));

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
          <p className="text-xs text-muted mb-5">This appears on every invoice and POS receipt your clients see.</p>

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

              <button className="btn-primary" onClick={handleSaveBrand} disabled={brandSaving}>
                {brandSaving ? "Saving..." : "Save Branding"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Payment Gateways */}
      <div className="card">
        <h2 className="font-grotesk font-semibold text-white mb-5">Payment Gateways</h2>
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
        <div className="mt-4 p-3 bg-gold/5 border border-gold/20 rounded-lg">
          <p className="text-xs text-gold">📋 Add your Paystack public key to <code className="bg-black/30 px-1 rounded">.env.local</code> to go live.</p>
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
