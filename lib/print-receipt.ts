/* BillFlow receipt print style: professional white-paper invoice, business-owned branding, blue hierarchy with gold signature accents. */

import { formatMoney } from "@/lib/utils";

type PrintItem = {
  productName?: string;
  name?: string;
  quantity?: number;
  unitPrice?: number;
  price?: number;
};

type ReceiptPrintData = {
  businessName?: string;
  businessAddress?: string;
  businessPhone?: string;
  businessEmail?: string;
  logoDataUrl?: string;
  accentColor?: string;
  footerNote?: string;
  invoiceNumber?: string;
  issuedAt?: Date | string | number;
  items: PrintItem[];
  subtotal?: number;
  discountAmount?: number;
  taxAmount?: number;
  taxRate?: number;
  taxLabel?: string;
  total?: number;
  paymentMethod?: string;
  amountPaid?: number;
  change?: number;
  customerName?: string;
  cashierName?: string;
  currencyCode?: string;
};

const escapeHtml = (value: unknown) => String(value ?? "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/\"/g, "&quot;")
  .replace(/'/g, "&#039;");

const safeColor = (value: unknown, fallback: string) => {
  const color = String(value ?? "");
  return /^#[0-9a-f]{3,8}$/i.test(color) ? color : fallback;
};

const paymentLabel = (value?: string) => {
  if (value === "momo") return "Mobile Money";
  if (value === "card") return "Card";
  return "Cash";
};

const dateLabel = (value?: Date | string | number) => {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime())
    ? new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    : date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
};

export function printReceipt(data: ReceiptPrintData) {
  if (typeof window === "undefined") return;

  const printWindow = window.open("", "_blank", "width=800,height=900");
  if (!printWindow) return;

  const currency = data.currencyCode || "GHS";
  const accent = safeColor(data.accentColor, "#1d4ed8");
  const gold = "#f59e0b";
  const businessName = data.businessName || "Your Business";
  const initials = businessName.trim().slice(0, 2).toUpperCase() || "BF";
  const items = Array.isArray(data.items) ? data.items : [];
  const subtotal = data.subtotal != null
    ? Math.max(0, Number(data.subtotal))
    : items.reduce((sum, item) => sum + Number(item.unitPrice ?? item.price ?? 0) * Number(item.quantity ?? 1), 0);
  const discountAmount = Math.max(0, Number(data.discountAmount ?? 0));
  const tax = Math.max(0, Number(data.taxAmount ?? 0));
  const total = data.total != null
    ? Math.max(0, Number(data.total))
    : Math.max(0, subtotal - discountAmount + tax);
  const amountPaid = data.amountPaid != null ? Math.max(0, Number(data.amountPaid)) : undefined;
  const change = data.change != null ? Math.max(0, Number(data.change)) : undefined;
  const taxLabel = data.taxLabel || "VAT";

  const itemsHtml = items.map((item) => {
    const unitPrice = Number(item.unitPrice ?? item.price ?? 0);
    const quantity = Number(item.quantity ?? 1);
    const lineAmount = unitPrice * quantity;
    return `
      <tr style="border-bottom:1px solid #e5e7eb;">
        <td style="padding:12px 16px;font-weight:500;color:#111827;">${escapeHtml(item.productName || item.name || "Item")}</td>
        <td style="padding:12px 16px;text-align:center;color:#4b5563;">${escapeHtml(quantity)}</td>
        <td style="padding:12px 16px;text-align:right;color:#4b5563;">${formatMoney(unitPrice, currency)}</td>
        <td style="padding:12px 16px;text-align:right;font-weight:600;color:#111827;">${formatMoney(lineAmount, currency)}</td>
      </tr>
    `;
  }).join("");

  const logoHtml = data.logoDataUrl
    ? `<img src="${escapeHtml(data.logoDataUrl)}" alt="${escapeHtml(businessName)} logo" style="width:72px;height:72px;object-fit:contain;border-radius:8px;" />`
    : `<div style="width:72px;height:72px;border-radius:8px;background:${gold};display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:800;color:#111827;">${escapeHtml(initials)}</div>`;

  const businessDetails = [data.businessAddress, data.businessPhone, data.businessEmail]
    .filter(Boolean)
    .map(escapeHtml)
    .join("<br/>");

  const html = `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Invoice - ${escapeHtml(data.invoiceNumber || "Invoice")}</title>
        <style>
          * { box-sizing: border-box; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            color: #111827;
            background: #ffffff;
            margin: 0;
            padding: 40px;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .container { max-width: 780px; margin: 0 auto; background: #fff; }
          .header-row { display:flex; justify-content:space-between; align-items:flex-start; gap:32px; margin-bottom:30px; }
          .invoice-title { font-size:42px; font-weight:800; color:${accent}; letter-spacing:-.025em; margin:0; }
          .title-underline { width:140px; height:3px; background:${gold}; margin-top:8px; margin-bottom:24px; }
          .business-block { display:flex; align-items:flex-start; gap:14px; text-align:right; }
          .business-name { font-size:18px; font-weight:800; color:#111827; margin:0 0 5px; }
          .business-details { font-size:12px; line-height:1.55; color:#4b5563; }
          .bill-to-section { display:flex; justify-content:space-between; gap:30px; margin-bottom:38px; }
          .bill-to-label, .meta-label { font-size:12px; font-weight:800; color:${accent}; letter-spacing:.08em; text-transform:uppercase; }
          .bill-to-label { margin-bottom:8px; }
          .client-name { font-size:18px; font-weight:700; color:#111827; margin-bottom:4px; }
          .client-details { font-size:13px; color:#4b5563; line-height:1.5; }
          .meta-table { border-collapse:collapse; }
          .meta-table td { padding:4px 0; font-size:13px; }
          .meta-label { padding-right:30px; }
          .meta-value { color:#111827; font-weight:600; text-align:right; }
          .items-table { width:100%; border-collapse:collapse; margin-bottom:30px; border:1px solid #e5e7eb; border-radius:8px; overflow:hidden; }
          .items-table th { background:${accent}; color:#fff; font-weight:700; font-size:12px; padding:12px 16px; text-align:left; text-transform:uppercase; letter-spacing:.05em; }
          .totals-section { display:flex; justify-content:flex-end; margin-bottom:38px; }
          .totals-table { width:330px; border-collapse:collapse; }
          .totals-table td { padding:8px 0; font-size:14px; }
          .totals-label { font-weight:700; color:#111827; text-transform:uppercase; letter-spacing:.05em; font-size:12px; }
          .totals-value { text-align:right; font-weight:600; color:#111827; }
          .discount-row .totals-label, .discount-row .totals-value { color:#16a34a; }
          .total-row td { border-top:2px solid ${gold}; padding-top:12px; padding-bottom:12px; }
          .total-row .totals-label { font-size:19px; color:${accent}; font-weight:800; }
          .total-row .totals-value { font-size:23px; color:${accent}; font-weight:800; }
          .footer-section { border-top:1px solid #e5e7eb; padding-top:24px; text-align:center; }
          .thank-you { font-size:15px; font-weight:700; color:${accent}; }
          .footer-note { font-size:12px; line-height:1.5; color:#4b5563; margin:10px 0 0; }
          @media (max-width: 640px) { body { padding:18px; } .header-row, .bill-to-section { gap:18px; } .invoice-title { font-size:32px; } .business-name { font-size:15px; } .items-table th, .items-table td { padding:9px 8px; font-size:11px; } }
          @media print { body { padding:0; } .container { max-width:none; } }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header-row">
            <div>
              <h1 class="invoice-title">INVOICE</h1>
              <div class="title-underline"></div>
            </div>
            <div class="business-block">
              <div>
                <p class="business-name">${escapeHtml(businessName)}</p>
                <div class="business-details">${businessDetails || ""}</div>
              </div>
              ${logoHtml}
            </div>
          </div>

          <div class="bill-to-section">
            <div>
              <div class="bill-to-label">Bill To</div>
              <div class="client-name">${escapeHtml(data.customerName || "Valued Customer")}</div>
              <div class="client-details">Cashier: ${escapeHtml(data.cashierName || "Staff")}</div>
            </div>
            <div>
              <table class="meta-table">
                <tr><td class="meta-label">Invoice #</td><td class="meta-value">${escapeHtml(data.invoiceNumber || "Invoice")}</td></tr>
                <tr><td class="meta-label">Date</td><td class="meta-value">${escapeHtml(dateLabel(data.issuedAt))}</td></tr>
                <tr><td class="meta-label">Payment</td><td class="meta-value" style="text-transform:uppercase;">${escapeHtml(paymentLabel(data.paymentMethod))}</td></tr>
              </table>
            </div>
          </div>

          <table class="items-table">
            <thead><tr><th style="width:50%;">Item</th><th style="width:15%;text-align:center;">Qty</th><th style="width:15%;text-align:right;">Price</th><th style="width:20%;text-align:right;">Amount</th></tr></thead>
            <tbody>${itemsHtml}</tbody>
          </table>

          <div class="totals-section">
            <table class="totals-table">
              <tr><td class="totals-label">Subtotal</td><td class="totals-value">${formatMoney(subtotal, currency)}</td></tr>
              ${discountAmount > 0 ? `<tr class="discount-row"><td class="totals-label">Discount</td><td class="totals-value">-${formatMoney(discountAmount, currency)}</td></tr>` : ""}
              ${tax > 0 ? `<tr><td class="totals-label">${escapeHtml(taxLabel)}${data.taxRate != null ? ` (${escapeHtml(data.taxRate)}%)` : ""}</td><td class="totals-value">${formatMoney(tax, currency)}</td></tr>` : ""}
              <tr class="total-row"><td class="totals-label">Total</td><td class="totals-value">${formatMoney(total, currency)}</td></tr>
              ${amountPaid != null ? `<tr><td class="totals-label">Paid</td><td class="totals-value">${formatMoney(amountPaid, currency)}</td></tr>` : ""}
              ${change != null && change > 0 ? `<tr><td class="totals-label">Change</td><td class="totals-value">${formatMoney(change, currency)}</td></tr>` : ""}
            </table>
          </div>

          <div class="footer-section">
            <div class="thank-you">Thank you for your business!</div>
            ${data.footerNote ? `<p class="footer-note">${escapeHtml(data.footerNote)}</p>` : ""}
          </div>
        </div>
        <script>
          window.addEventListener('load', function () { setTimeout(function () { window.print(); }, 120); });
        </script>
      </body>
    </html>
  `;

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
}
