/* BillFlow reference invoice: fixed A4 portrait composition matching the supplied blue-and-gold mockup. */

import { formatMoney } from "@/lib/utils";

type PrintItem = {
  productName?: string;
  name?: string;
  quantity?: number;
  unitPrice?: number;
  price?: number;
};

type ReceiptPrintData = {
  invoiceNumber?: string;
  issuedAt?: Date | string | number;
  dueDate?: Date | string | number;
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
  customerAddress?: string;
  cashierName?: string;
  currencyCode?: string;
  footerNote?: string;
};

const BLUE = "#1556B8";
const BLUE_DARK = "#0B3F91";
const GOLD = "#E6A21A";
const INK = "#111827";
const MUTED = "#4B5563";
const RULE = "#D1D5DB";

const escapeHtml = (value: unknown) => String(value ?? "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/\"/g, "&quot;")
  .replace(/'/g, "&#039;");

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

const billFlowMark = `
  <svg class="billflow-mark" viewBox="0 0 190 190" role="img" aria-label="BillFlow" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="paper" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#FFFFFF" />
        <stop offset="0.56" stop-color="#EAF3FA" />
        <stop offset="1" stop-color="#B9CDDB" />
      </linearGradient>
      <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#FFD768" />
        <stop offset="0.5" stop-color="#F2A400" />
        <stop offset="1" stop-color="#B86A00" />
      </linearGradient>
      <filter id="shadow" x="-30%" y="-30%" width="160%" height="170%">
        <feDropShadow dx="0" dy="5" stdDeviation="5" flood-color="#7C8EA0" flood-opacity=".35" />
      </filter>
    </defs>
    <g filter="url(#shadow)">
      <path d="M57 18c0-8 7-14 15-12l70 12c9 2 15 10 15 19v113c0 9-8 16-17 15l-70-10c-8-1-13-8-13-16V18Z" fill="url(#paper)" stroke="#B7C9D6" stroke-width="2" />
      <path d="M62 26c0-5 4-8 9-7l57 10c7 1 12 7 12 14v84c0 7-6 12-13 11l-54-8c-6-1-11-6-11-12V26Z" fill="#F8FCFF" fill-opacity=".82" />
      <text x="72" y="70" fill="#1B314B" font-family="Arial, Helvetica, sans-serif" font-size="27" font-weight="700">BillFlow</text>
      <path d="M72 84h65M72 97h56M72 110h45" stroke="#A9BCCB" stroke-width="6" stroke-linecap="round" />
      <text x="66" y="135" fill="#425D74" font-family="Arial, Helvetica, sans-serif" font-size="24">$</text>
      <path d="M82 129h44M82 141h31" stroke="#A9BCCB" stroke-width="5" stroke-linecap="round" />
    </g>
    <path d="M16 99C4 73 25 50 60 49c28-1 53 8 73 24l14-12-1 42-39-1 15-13C103 78 82 69 60 69c-20 0-32 11-26 24l-18 6Z" fill="url(#gold)" stroke="#B66B00" stroke-width="2" />
    <path d="M174 91c13 26-8 49-43 50-28 1-53-8-73-24l-14 12 1-42 39 1-15 13c19 11 40 20 62 20 20 0 32-11 26-24l17-6Z" fill="url(#gold)" stroke="#B66B00" stroke-width="2" />
  </svg>
`;

export function printReceipt(data: ReceiptPrintData) {
  if (typeof window === "undefined") return;

  const printWindow = window.open("", "_blank", "width=900,height=1200");
  if (!printWindow) return;

  const currency = data.currencyCode || "GHS";
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
  const taxLabel = data.taxLabel || "Tax";
  const taxText = data.taxRate != null ? `${taxLabel} (${escapeHtml(data.taxRate)}%)` : taxLabel;

  const itemsHtml = items.map((item) => {
    const unitPrice = Number(item.unitPrice ?? item.price ?? 0);
    const quantity = Number(item.quantity ?? 1);
    const lineAmount = unitPrice * quantity;
    return `
      <tr>
        <td class="item-name">${escapeHtml(item.productName || item.name || "Item")}</td>
        <td class="item-qty">${escapeHtml(quantity)}</td>
        <td class="item-number">${formatMoney(unitPrice, currency)}</td>
        <td class="item-number">${formatMoney(lineAmount, currency)}</td>
      </tr>
    `;
  }).join("");

  const addressLines = String(data.customerAddress || "").split(/\n|,/).map(line => line.trim()).filter(Boolean);
  const customerDetails = addressLines.length
    ? addressLines.map(escapeHtml).join("<br />")
    : "";

  const html = `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Invoice - ${escapeHtml(data.invoiceNumber || "Invoice")}</title>
        <style>
          @page { size: A4 portrait; margin: 0; }
          * { box-sizing: border-box; }
          html, body { margin: 0; padding: 0; background: #fff; }
          body {
            font-family: Arial, Helvetica, sans-serif;
            color: ${INK};
            background: #fff;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .page { width: 210mm; min-height: 297mm; padding: 18mm 14mm 11mm; margin: 0 auto; display: flex; flex-direction: column; }
          .header { display: flex; align-items: flex-start; justify-content: space-between; min-height: 42mm; }
          .invoice-heading { padding-top: 13mm; }
          h1 { margin: 0; color: ${BLUE}; font-size: 25mm; line-height: .83; font-weight: 800; letter-spacing: .4mm; }
          .heading-rule { width: 91mm; height: .55mm; margin-top: 8mm; background: ${GOLD}; }
          .billflow-mark { width: 43mm; height: 43mm; margin-right: 1mm; }
          .billing-row { display: grid; grid-template-columns: 1fr 1fr; min-height: 43mm; margin-top: 8mm; margin-bottom: 10mm; }
          .bill-to { padding-top: 2mm; }
          .bill-to-title { color: ${BLUE}; font-size: 4mm; line-height: 1; font-weight: 800; letter-spacing: .3mm; margin-bottom: 5mm; }
          .customer-name { color: ${INK}; font-size: 5.4mm; font-weight: 700; margin-bottom: 4mm; }
          .customer-details { color: ${INK}; font-size: 4.1mm; line-height: 1.65; }
          .meta { border-left: .3mm solid ${RULE}; padding: 5mm 0 0 12mm; display: grid; align-content: start; row-gap: 5mm; }
          .meta-row { display: grid; grid-template-columns: 32mm 1fr; align-items: baseline; }
          .meta-label { color: ${BLUE}; font-size: 4mm; font-weight: 800; letter-spacing: .2mm; }
          .meta-value { color: ${INK}; font-size: 4.2mm; font-weight: 400; }
          .items { width: 100%; border: .25mm solid ${RULE}; border-radius: 2.2mm; border-collapse: separate; border-spacing: 0; overflow: hidden; }
          .items thead th { height: 14mm; padding: 0 8mm; color: #fff; background: ${BLUE}; font-size: 4.5mm; font-weight: 700; text-align: left; }
          .items thead th:first-child { border-top-left-radius: 2mm; }
          .items thead th:last-child { border-top-right-radius: 2mm; }
          .items th:nth-child(1) { width: 48%; }
          .items th:nth-child(2) { width: 15%; text-align: center; }
          .items th:nth-child(3), .items th:nth-child(4) { width: 18.5%; text-align: right; }
          .items tbody td { height: 18mm; padding: 0 8mm; border-bottom: .25mm solid ${RULE}; font-size: 4.25mm; }
          .items tbody tr:last-child td { border-bottom: 0; }
          .item-name { color: ${INK}; font-weight: 700; }
          .item-qty { color: ${INK}; text-align: center; }
          .item-number { color: ${INK}; text-align: right; white-space: nowrap; }
          .totals-wrap { display: flex; justify-content: flex-end; margin-top: 14mm; }
          .totals { width: 84mm; border-collapse: collapse; }
          .totals td { height: 11mm; font-size: 4.2mm; color: ${INK}; }
          .totals-label { font-weight: 700; text-transform: uppercase; letter-spacing: .15mm; }
          .totals-value { text-align: right; white-space: nowrap; }
          .total-row td { border-top: .55mm solid ${GOLD}; height: 17mm; padding-top: 4mm; }
          .total-row .totals-label, .total-row .totals-value { color: ${BLUE}; font-size: 7mm; font-weight: 800; }
          .footer { margin-top: auto; border-top: .45mm solid ${BLUE}; padding-top: 9mm; text-align: center; }
          .thanks { display: inline-flex; align-items: center; gap: 7mm; color: ${BLUE_DARK}; font-size: 5.6mm; }
          .heart { width: 13mm; height: 13mm; border: .45mm solid ${BLUE}; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; color: ${GOLD}; font-family: Georgia, serif; font-size: 8mm; line-height: 1; }
          .footer-note { margin: 4mm 0 0; color: ${MUTED}; font-size: 3.3mm; }
          @media screen and (max-width: 800px) { .page { width: 100%; min-height: 100vh; padding: 28px 24px; } h1 { font-size: clamp(42px, 12vw, 92px); } .heading-rule { width: 58%; } .header { min-height: auto; } .billflow-mark { width: 140px; height: 140px; } .billing-row { margin-top: 28px; } }
          @media print { .page { margin: 0; } }
        </style>
      </head>
      <body>
        <main class="page">
          <header class="header">
            <div class="invoice-heading"><h1>INVOICE</h1><div class="heading-rule"></div></div>
            ${billFlowMark}
          </header>

          <section class="billing-row">
            <div class="bill-to">
              <div class="bill-to-title">BILL TO</div>
              <div class="customer-name">${escapeHtml(data.customerName || "Valued Customer")}</div>
              ${customerDetails ? `<div class="customer-details">${customerDetails}</div>` : ""}
            </div>
            <div class="meta">
              <div class="meta-row"><span class="meta-label">INVOICE #</span><span class="meta-value">${escapeHtml(data.invoiceNumber || "INV-000000")}</span></div>
              <div class="meta-row"><span class="meta-label">DATE</span><span class="meta-value">${escapeHtml(dateLabel(data.issuedAt))}</span></div>
              <div class="meta-row"><span class="meta-label">DUE DATE</span><span class="meta-value">${escapeHtml(dateLabel(data.dueDate || data.issuedAt))}</span></div>
            </div>
          </section>

          <table class="items">
            <thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Amount</th></tr></thead>
            <tbody>${itemsHtml}</tbody>
          </table>

          <section class="totals-wrap">
            <table class="totals">
              <tr><td class="totals-label">SUBTOTAL</td><td class="totals-value">${formatMoney(subtotal, currency)}</td></tr>
              ${discountAmount > 0 ? `<tr><td class="totals-label">DISCOUNT</td><td class="totals-value">-${formatMoney(discountAmount, currency)}</td></tr>` : ""}
              <tr><td class="totals-label">${taxText}</td><td class="totals-value">${formatMoney(tax, currency)}</td></tr>
              <tr class="total-row"><td class="totals-label">TOTAL</td><td class="totals-value">${formatMoney(total, currency)}</td></tr>
            </table>
          </section>

          <footer class="footer">
            <div class="thanks"><span class="heart">♡</span><span>Thank you for your business!</span></div>
            ${data.footerNote ? `<p class="footer-note">${escapeHtml(data.footerNote)}</p>` : ""}
          </footer>
        </main>
        <script>window.addEventListener('load', function () { setTimeout(function () { window.print(); }, 120); });</script>
      </body>
    </html>
  `;

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
}
