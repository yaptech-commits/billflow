/* BillFlow reference invoice preview: the paper branch mirrors the supplied blue-and-gold mockup. */

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
  /** Kept for compatibility with existing invoice callers. */
  width?: 58 | 80;
  /** Render the A4-like blue-and-gold reference invoice for POS. */
  paper?: boolean;
}

const BLUE = "#1556B8";
const BLUE_DARK = "#0B3F91";
const GOLD = "#E6A21A";
const INK = "#111827";
const RULE = "#D1D5DB";

function BillFlowMark() {
  return (
    <svg viewBox="0 0 190 190" role="img" aria-label="BillFlow" className="h-[clamp(92px,18vw,190px)] w-[clamp(92px,18vw,190px)] shrink-0" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="preview-paper" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset="0.56" stopColor="#EAF3FA" />
          <stop offset="1" stopColor="#B9CDDB" />
        </linearGradient>
        <linearGradient id="preview-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FFD768" />
          <stop offset="0.5" stopColor="#F2A400" />
          <stop offset="1" stopColor="#B86A00" />
        </linearGradient>
        <filter id="preview-shadow" x="-30%" y="-30%" width="160%" height="170%">
          <feDropShadow dx="0" dy="5" stdDeviation="5" floodColor="#7C8EA0" floodOpacity=".35" />
        </filter>
      </defs>
      <g filter="url(#preview-shadow)">
        <path d="M57 18c0-8 7-14 15-12l70 12c9 2 15 10 15 19v113c0 9-8 16-17 15l-70-10c-8-1-13-8-13-16V18Z" fill="url(#preview-paper)" stroke="#B7C9D6" strokeWidth="2" />
        <path d="M62 26c0-5 4-8 9-7l57 10c7 1 12 7 12 14v84c0 7-6 12-13 11l-54-8c-6-1-11-6-11-12V26Z" fill="#F8FCFF" fillOpacity=".82" />
        <text x="72" y="70" fill="#1B314B" fontFamily="Arial, Helvetica, sans-serif" fontSize="27" fontWeight="700">BillFlow</text>
        <path d="M72 84h65M72 97h56M72 110h45" stroke="#A9BCCB" strokeWidth="6" strokeLinecap="round" />
        <text x="66" y="135" fill="#425D74" fontFamily="Arial, Helvetica, sans-serif" fontSize="24">$</text>
        <path d="M82 129h44M82 141h31" stroke="#A9BCCB" strokeWidth="5" strokeLinecap="round" />
      </g>
      <path d="M16 99C4 73 25 50 60 49c28-1 53 8 73 24l14-12-1 42-39-1 15-13C103 78 82 69 60 69c-20 0-32 11-26 24l-18 6Z" fill="url(#preview-gold)" stroke="#B66B00" strokeWidth="2" />
      <path d="M174 91c13 26-8 49-43 50-28 1-53-8-73-24l-14 12 1-42 39 1-15 13c19 11 40 20 62 20 20 0 32-11 26-24l17-6Z" fill="url(#preview-gold)" stroke="#B66B00" strokeWidth="2" />
    </svg>
  );
}

function ReferenceInvoice({
  profile, docNumber, date, clientName, items, amount, subtotal, taxAmount, taxRate, taxLabel, discountAmount, currencyCode,
}: BrandedDocumentProps) {
  const currency = currencyCode || "GHS";
  const calculatedSubtotal = subtotal ?? items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const tax = taxAmount ?? 0;
  const taxTitle = `${taxLabel || "TAX"} (${taxRate ?? 0}%)`;
  const customerName = clientName || "Valued Customer";
  const issuedDate = date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const invoiceNumber = docNumber || "INV-000000";

  return (
    <div className="w-full bg-white px-[clamp(20px,5vw,68px)] pb-[clamp(24px,4vw,48px)] pt-[clamp(20px,4vw,54px)] font-sans text-[#111827]" style={{ fontFamily: "Arial, Helvetica, sans-serif" }}>
      <div className="flex items-start justify-between gap-4">
        <div className="pt-[clamp(10px,3vw,34px)]">
          <h1 className="m-0 font-sans text-[clamp(48px,10vw,94px)] font-extrabold leading-[.82] tracking-[.02em] text-[#1556B8]">INVOICE</h1>
          <div className="mt-[clamp(18px,3vw,34px)] h-[3px] w-[clamp(150px,45vw,360px)] bg-[#E6A21A]" />
        </div>
        <BillFlowMark />
      </div>

      <div className="mt-[clamp(28px,5vw,64px)] grid grid-cols-2 gap-5 pb-[clamp(22px,4vw,46px)]">
        <div className="pt-1">
          <div className="mb-4 text-[clamp(14px,2vw,22px)] font-extrabold tracking-[.08em] text-[#1556B8]">BILL TO</div>
          <div className="mb-3 text-[clamp(17px,2.5vw,28px)] font-bold text-[#111827]">{customerName}</div>
          {profile?.address && <div className="whitespace-pre-line text-[clamp(13px,1.8vw,21px)] leading-[1.55] text-[#111827]">{profile.address}</div>}
        </div>
        <div className="grid content-start gap-4 border-l border-[#D1D5DB] pl-[clamp(18px,4vw,64px)] pt-4">
          <div className="grid grid-cols-[minmax(86px,1fr)_minmax(100px,1.25fr)] items-baseline gap-3">
            <span className="text-[clamp(12px,1.8vw,20px)] font-extrabold tracking-[.06em] text-[#1556B8]">INVOICE #</span>
            <span className="text-[clamp(13px,1.9vw,21px)] text-[#111827]">{invoiceNumber}</span>
          </div>
          <div className="grid grid-cols-[minmax(86px,1fr)_minmax(100px,1.25fr)] items-baseline gap-3">
            <span className="text-[clamp(12px,1.8vw,20px)] font-extrabold tracking-[.06em] text-[#1556B8]">DATE</span>
            <span className="text-[clamp(13px,1.9vw,21px)] text-[#111827]">{issuedDate}</span>
          </div>
          <div className="grid grid-cols-[minmax(86px,1fr)_minmax(100px,1.25fr)] items-baseline gap-3">
            <span className="text-[clamp(12px,1.8vw,20px)] font-extrabold tracking-[.06em] text-[#1556B8]">DUE DATE</span>
            <span className="text-[clamp(13px,1.9vw,21px)] text-[#111827]">{issuedDate}</span>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-[8px] border border-[#D1D5DB]">
        <table className="w-full table-fixed border-collapse">
          <thead>
            <tr className="bg-[#1556B8] text-white">
              <th className="w-[48%] px-3 py-4 text-left text-[clamp(12px,1.9vw,21px)] font-bold sm:px-6">Item</th>
              <th className="w-[15%] px-1 py-4 text-center text-[clamp(12px,1.9vw,21px)] font-bold">Qty</th>
              <th className="w-[18.5%] px-1 py-4 text-right text-[clamp(12px,1.9vw,21px)] font-bold">Price</th>
              <th className="w-[18.5%] px-3 py-4 text-right text-[clamp(12px,1.9vw,21px)] font-bold sm:px-6">Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => (
              <tr key={`${item.productName}-${index}`} className="border-b border-[#D1D5DB] last:border-b-0">
                <td className="px-3 py-5 text-[clamp(12px,1.9vw,21px)] font-bold sm:px-6">{item.productName}</td>
                <td className="px-1 py-5 text-center text-[clamp(12px,1.9vw,21px)]">{item.quantity}</td>
                <td className="px-1 py-5 text-right text-[clamp(12px,1.9vw,21px)] whitespace-nowrap">{formatMoney(item.unitPrice, currency)}</td>
                <td className="px-3 py-5 text-right text-[clamp(12px,1.9vw,21px)] whitespace-nowrap sm:px-6">{formatMoney(item.unitPrice * item.quantity, currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-[clamp(26px,5vw,64px)] flex justify-end">
        <table className="w-[min(100%,380px)] border-collapse">
          <tbody>
            <tr><td className="h-10 text-[clamp(12px,1.8vw,20px)] font-bold uppercase tracking-[.04em]">SUBTOTAL</td><td className="h-10 text-right text-[clamp(12px,1.8vw,20px)] whitespace-nowrap">{formatMoney(calculatedSubtotal, currency)}</td></tr>
            {discountAmount != null && discountAmount > 0 && <tr><td className="h-10 text-[clamp(12px,1.8vw,20px)] font-bold uppercase tracking-[.04em]">DISCOUNT</td><td className="h-10 text-right text-[clamp(12px,1.8vw,20px)] whitespace-nowrap">-{formatMoney(discountAmount, currency)}</td></tr>}
            <tr><td className="h-10 text-[clamp(12px,1.8vw,20px)] font-bold uppercase tracking-[.04em]">{taxTitle}</td><td className="h-10 text-right text-[clamp(12px,1.8vw,20px)] whitespace-nowrap">{formatMoney(tax, currency)}</td></tr>
            <tr className="border-t-[3px] border-[#E6A21A]"><td className="pt-4 text-[clamp(19px,3.3vw,34px)] font-extrabold uppercase tracking-[.04em] text-[#1556B8]">TOTAL</td><td className="pt-4 text-right text-[clamp(19px,3.3vw,34px)] font-extrabold text-[#1556B8] whitespace-nowrap">{formatMoney(amount, currency)}</td></tr>
          </tbody>
        </table>
      </div>

      <div className="mt-[clamp(30px,6vw,82px)] border-t-2 border-[#1556B8] pt-[clamp(18px,4vw,42px)] text-center">
        <div className="inline-flex items-center gap-4 text-[clamp(15px,2.5vw,27px)] text-[#0B3F91]">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-full border-2 border-[#1556B8] font-serif text-4xl leading-none text-[#E6A21A]">♡</span>
          <span>Thank you for your business!</span>
        </div>
        {profile?.footerNote && <p className="mt-3 text-xs text-[#4B5563]">{profile.footerNote}</p>}
      </div>
    </div>
  );
}

export default function BrandedDocument(props: BrandedDocumentProps) {
  if (props.paper) return <ReferenceInvoice {...props} />;

  const { profile, docType, docNumber, date, clientName, items, amount, subtotal, taxAmount, taxRate, taxLabel, discountAmount, amountPaid, paymentMethod, meta, currencyCode } = props;
  const accent = profile?.accentColor || DEFAULT_ACCENT_COLOR;
  const businessName = profile?.businessName || "Your Business";
  const balanceDue = amountPaid != null ? amount - amountPaid : undefined;

  return (
    <div id="branded-doc" className="space-y-4 text-sm">
      <div className="flex items-start justify-between gap-4 border-b border-dashed border-border pb-4">
        <div className="flex min-w-0 items-center gap-3">
          {profile?.logoDataUrl ? <img src={profile.logoDataUrl} alt={businessName} className="h-12 w-12 shrink-0 rounded object-contain" /> : <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded font-grotesk font-bold text-black" style={{ backgroundColor: accent }}>{businessName.slice(0, 2).toUpperCase()}</div>}
          <div className="min-w-0">
            <p className="truncate font-grotesk font-semibold text-white">{businessName}</p>
            {profile?.address && <p className="truncate text-xs text-muted">{profile.address}</p>}
            {profile?.phone && <p className="text-xs text-muted">{profile.phone}</p>}
            {profile?.email && <p className="text-xs text-muted">{profile.email}</p>}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-grotesk text-xs font-bold tracking-wide" style={{ color: accent }}>{docType}</p>
          <p className="mt-0.5 text-xs text-muted">#{docNumber}</p>
          <p className="text-xs text-muted">{date.toLocaleDateString("en-GH")}</p>
        </div>
      </div>
      <div className="border-b border-dashed border-border pb-3"><p className="text-xs text-muted">Billed to</p><p className="text-surface">{clientName}</p>{meta && <p className="mt-1 text-xs text-muted">{meta}</p>}{paymentMethod && <p className="text-xs text-muted">Payment: {paymentMethod === "momo" ? "Mobile Money" : paymentMethod === "card" ? "Card" : "Cash"}</p>}</div>
      <div className="space-y-2 border-b border-dashed border-border pb-3">{items.map((li, i) => <div key={i} className="text-surface"><div className="flex justify-between font-medium"><span className="flex-1">{li.productName}</span><span className="ml-2">{formatMoney(li.unitPrice * li.quantity, currencyCode)}</span></div><div className="text-[10px] text-muted">{li.quantity} × {formatMoney(li.unitPrice, currencyCode)}</div></div>)}</div>
      <div className="space-y-1">{(subtotal != null && subtotal !== amount) && <div className="flex justify-between text-xs text-muted"><span>Subtotal</span><span>{formatMoney(subtotal, currencyCode)}</span></div>}{discountAmount != null && discountAmount > 0 && <div className="flex justify-between text-xs text-green"><span>Discount</span><span>-{formatMoney(discountAmount, currencyCode)}</span></div>}{taxAmount != null && taxAmount > 0 && <div className="flex justify-between text-xs text-muted"><span>{taxLabel || "VAT"} ({taxRate ?? 0}%)</span><span>{formatMoney(taxAmount, currencyCode)}</span></div>}<div className="flex justify-between font-grotesk text-base font-bold" style={{ color: accent }}><span>TOTAL</span><span>{formatMoney(amount, currencyCode)}</span></div>{balanceDue !== undefined && balanceDue > 0.01 && <><div className="flex justify-between text-xs text-muted"><span>Paid</span><span>{formatMoney(amountPaid!, currencyCode)}</span></div><div className="flex justify-between text-xs font-semibold text-red"><span>Balance Due</span><span>{formatMoney(balanceDue, currencyCode)}</span></div></>}</div>
      {profile?.footerNote && <p className="border-t border-dashed border-border pt-2 text-center text-xs text-muted">{profile.footerNote}</p>}
    </div>
  );
}
