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
  /** Receipt width in mm, e.g. 58 or 80. Defaults to 80. */
  width?: 58 | 80 | '58x3276';
}

/**
 * Shared branded layout for invoices and POS receipts. Pulls logo, business
 * details, accent color, and footer note from the business's profile so
 * every client-facing document reflects the business's own identity rather
 * than BillFlow's.
 */
export default function BrandedDocument({
  profile, docType, docNumber, date, clientName, items, amount, subtotal, taxAmount, taxRate, taxLabel, discountAmount, amountPaid, paymentMethod, meta, currencyCode, width = 80,
}: BrandedDocumentProps) {
  const accent = profile?.accentColor || DEFAULT_ACCENT_COLOR;
  const businessName = profile?.businessName || "Your Business";
  const balanceDue = amountPaid != null ? amount - amountPaid : undefined;

  return (
    <div id="branded-doc" className="space-y-4 text-sm font-bold">
      <div className="text-center border-b border-dashed border-border pb-4">
        <p className="font-grotesk font-bold text-lg text-surface mb-2">{businessName}</p>
        {profile?.address && <p className="text-[10px] text-muted">{profile.address}</p>}
        <div className="flex items-center justify-center gap-2 text-[10px] text-muted">
          {profile?.phone && <span>{profile.phone}</span>}
          {profile?.email && <span>{profile.email}</span>}
        </div>
        <div className="text-center w-full mt-2 pt-2 border-t border-border/20">
          <p className="font-grotesk font-bold text-[10px] tracking-widest uppercase" style={{ color: accent }}>{docType}</p>
          <div className="flex justify-between text-[10px] text-muted mt-0.5">
            <span>#{docNumber}</span>
            <span>{date.toLocaleDateString("en-GH")}</span>
          </div>
        </div>
      </div>

      <div className="border-b border-dashed border-border pb-3">
        <p className="text-xs text-muted">Billed to</p>
        <p className="text-surface">{clientName}</p>
        {meta && <p className="text-xs text-muted mt-1">{meta}</p>}
        {paymentMethod && <p className="text-xs text-muted">Payment: {paymentMethod === "momo" ? "Mobile Money" : paymentMethod === "card" ? "Card" : "Cash"}</p>}
      </div>

      <div className="space-y-2 border-b border-dashed border-border pb-3">
        {items.map((li, i) => (
          <div key={i} className="text-surface">
            <div className="flex justify-between font-medium">
              <span className="flex-1">{li.productName}</span>
              <span className="ml-2">{formatMoney(li.unitPrice * li.quantity, currencyCode)}</span>
            </div>
            <div className="text-[10px] text-muted">
              {li.quantity} × {formatMoney(li.unitPrice, currencyCode)}
            </div>
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
