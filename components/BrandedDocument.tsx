"use client";
import { BusinessProfile, DEFAULT_ACCENT_COLOR } from "@/lib/db";
import { formatMoney } from "@/lib/utils";

interface LineItem {
  productName: string;
  quantity: number;
  unitPrice: number;
}

interface BrandedDocumentProps {
  profile: BusinessProfile | null;
  /** e.g. "INVOICE" or "RECEIPT" */
  docType: string;
  docNumber: string;
  date: Date;
  clientName: string;
  items: LineItem[];
  amount: number;
  subtotal?: number;
  taxAmount?: number;
  taxRate?: number;
  taxLabel?: string;
  discountAmount?: number;
  amountPaid?: number;
  paymentMethod?: string;
  /** Extra line for context, e.g. "Due: 12 Aug 2026" */
  meta?: string;
  currencyCode?: string;
}

/**
 * Shared branded layout for invoices and POS receipts. Pulls logo, business
 * details, accent color, and footer note from the business's profile so
 * every client-facing document reflects the business's own identity rather
 * than BillFlow's.
 */
export default function BrandedDocument({
  profile, docType, docNumber, date, clientName, items, amount, subtotal, taxAmount, taxRate, taxLabel, discountAmount, amountPaid, paymentMethod, meta, currencyCode,
}: BrandedDocumentProps) {
  const accent = profile?.accentColor || DEFAULT_ACCENT_COLOR;
  const businessName = profile?.businessName || "Your Business";
  const balanceDue = amountPaid != null ? amount - amountPaid : undefined;

  return (
    <div id="branded-doc" className="space-y-4 text-sm">
      <div className="flex items-start justify-between gap-4 border-b border-dashed border-border pb-4">
        <div className="flex items-center gap-3 min-w-0">
          {profile?.logoDataUrl ? (
            <img src={profile.logoDataUrl} alt={businessName} className="w-12 h-12 object-contain rounded flex-shrink-0" />
          ) : (
            <div
              className="w-12 h-12 rounded flex items-center justify-center font-grotesk font-bold text-black flex-shrink-0"
              style={{ backgroundColor: accent }}
            >
              {businessName.slice(0, 2).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <p className="font-grotesk font-semibold text-white truncate">{businessName}</p>
            {profile?.address && <p className="text-xs text-muted truncate">{profile.address}</p>}
            {profile?.phone && <p className="text-xs text-muted">{profile.phone}</p>}
            {profile?.email && <p className="text-xs text-muted">{profile.email}</p>}
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="font-grotesk font-bold text-xs tracking-wide" style={{ color: accent }}>{docType}</p>
          <p className="text-xs text-muted mt-0.5">#{docNumber}</p>
          <p className="text-xs text-muted">{date.toLocaleDateString("en-GH")}</p>
        </div>
      </div>

      <div className="border-b border-dashed border-border pb-3">
        <p className="text-xs text-muted">Billed to</p>
        <p className="text-surface">{clientName}</p>
        {meta && <p className="text-xs text-muted mt-1">{meta}</p>}
        {paymentMethod && <p className="text-xs text-muted">Payment: {paymentMethod === "momo" ? "Mobile Money" : paymentMethod === "card" ? "Card" : "Cash"}</p>}
      </div>

      <div className="space-y-1.5 border-b border-dashed border-border pb-3">
        {items.map((li, i) => (
          <div key={i} className="flex justify-between text-surface">
            <span>{li.productName} ×{li.quantity}</span>
            <span>{formatMoney(li.unitPrice * li.quantity, currencyCode)}</span>
          </div>
        ))}
      </div>

      <div className="space-y-1">
        {(subtotal != null && subtotal !== amount) && (
          <div className="flex justify-between text-xs text-muted">
            <span>Subtotal</span>
            <span>{formatMoney(subtotal, currencyCode)}</span>
          </div>
        )}
        {(discountAmount != null && discountAmount > 0) && (
          <div className="flex justify-between text-xs text-green">
            <span>Discount</span>
            <span>-{formatMoney(discountAmount, currencyCode)}</span>
          </div>
        )}
        {(taxAmount != null && taxAmount > 0) && (
          <div className="flex justify-between text-xs text-muted">
            <span>{taxLabel || "VAT"} ({taxRate ?? 0}%)</span>
            <span>{formatMoney(taxAmount, currencyCode)}</span>
          </div>
        )}
        <div className="flex justify-between font-grotesk font-bold text-base" style={{ color: accent }}>
          <span>TOTAL</span>
          <span>{formatMoney(amount, currencyCode)}</span>
        </div>
        {balanceDue !== undefined && balanceDue > 0.01 && (
          <>
            <div className="flex justify-between text-xs text-muted">
              <span>Paid</span>
              <span>{formatMoney(amountPaid!, currencyCode)}</span>
            </div>
            <div className="flex justify-between text-xs text-red font-semibold">
              <span>Balance Due</span>
              <span>{formatMoney(balanceDue, currencyCode)}</span>
            </div>
          </>
        )}
      </div>

      {profile?.footerNote && (
        <p className="text-center text-xs text-muted pt-2 border-t border-dashed border-border">{profile.footerNote}</p>
      )}
    </div>
  );
}
