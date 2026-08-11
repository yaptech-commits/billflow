import { formatCedi } from "./utils";

export function printReceipt(data: any) {
  const printWindow = window.open("", "_blank", "width=800,height=900");
  if (!printWindow) return;

  const itemsHtml = data.items.map((item: any) => `
    <tr style="border-bottom: 1px solid #e5e7eb;">
      <td style="padding: 12px 16px; font-weight: 500; color: #111827;">${item.productName || item.name}</td>
      <td style="padding: 12px 16px; text-align: center; color: #4b5563;">${item.quantity}</td>
      <td style="padding: 12px 16px; text-align: right; color: #4b5563;">$${Number(item.price).toFixed(2)}</td>
      <td style="padding: 12px 16px; text-align: right; font-weight: 500; color: #111827;">$${(Number(item.price) * Number(item.quantity)).toFixed(2)}</td>
    </tr>
  `).join("");

  const subtotal = data.subtotal || data.items.reduce((acc: number, item: any) => acc + Number(item.price) * Number(item.quantity), 0);
  const tax = data.tax || subtotal * 0.10;
  const total = data.total || (subtotal + tax);

  const html = `
    <html>
      <head>
        <title>Invoice - ${data.invoiceNumber || "INV-2025-0001"}</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            color: #111827;
            background: #ffffff;
            margin: 0;
            padding: 40px;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .container {
            max-width: 750px;
            margin: 0 auto;
            background: #ffffff;
          }
          .header-row {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 30px;
          }
          .invoice-title {
            font-size: 42px;
            font-weight: 800;
            color: #1d4ed8;
            letter-spacing: -0.025em;
            margin: 0;
          }
          .title-underline {
            width: 140px;
            height: 3px;
            background-color: #f59e0b;
            margin-top: 8px;
            margin-bottom: 30px;
          }
          .logo-badge {
            text-align: right;
          }
          .bill-to-section {
            display: flex;
            justify-content: space-between;
            margin-bottom: 40px;
          }
          .bill-to-label {
            font-size: 13px;
            font-weight: 700;
            color: #1d4ed8;
            letter-spacing: 0.05em;
            margin-bottom: 8px;
            text-transform: uppercase;
          }
          .client-name {
            font-size: 18px;
            font-weight: 700;
            color: #111827;
            margin-bottom: 4px;
          }
          .client-details {
            font-size: 14px;
            color: #4b5563;
            line-height: 1.5;
          }
          .meta-table {
            border-collapse: collapse;
          }
          .meta-table td {
            padding: 4px 0;
            font-size: 14px;
          }
          .meta-label {
            font-weight: 700;
            color: #1d4ed8;
            padding-right: 30px;
            text-transform: uppercase;
            font-size: 12px;
            letter-spacing: 0.05em;
          }
          .meta-value {
            color: #111827;
            font-weight: 500;
            text-align: right;
          }
          .items-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 30px;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 1px 3px rgba(0,0,0,0.05);
            border: 1px solid #e5e7eb;
          }
          .items-table th {
            background-color: #1d4ed8;
            color: #ffffff;
            font-weight: 600;
            font-size: 14px;
            padding: 12px 16px;
            text-align: left;
            text-transform: uppercase;
            letter-spacing: 0.05em;
          }
          .totals-section {
            display: flex;
            justify-content: flex-end;
            margin-bottom: 40px;
          }
          .totals-table {
            width: 320px;
            border-collapse: collapse;
          }
          .totals-table td {
            padding: 8px 0;
            font-size: 15px;
          }
          .totals-label {
            font-weight: 700;
            color: #111827;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            font-size: 13px;
          }
          .totals-value {
            text-align: right;
            font-weight: 600;
            color: #111827;
          }
          .total-row td {
            border-top: 2px solid #f59e0b;
            padding-top: 12px;
            padding-bottom: 12px;
          }
          .total-row .totals-label {
            font-size: 20px;
            color: #1d4ed8;
            font-weight: 800;
          }
          .total-row .totals-value {
            font-size: 24px;
            color: #1d4ed8;
            font-weight: 800;
          }
          .footer-section {
            border-top: 1px solid #e5e7eb;
            padding-top: 30px;
            text-align: center;
          }
          .thank-you-badge {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            font-size: 16px;
            font-weight: 600;
            color: #1d4ed8;
          }
          .heart-icon {
            width: 24px;
            height: 24px;
            border: 2px solid #1d4ed8;
            border-radius: 50%;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            color: #1d4ed8;
            font-size: 14px;
          }
          @media print {
            body { padding: 0; }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <!-- Header -->
          <div class="header-row">
            <div>
              <h1 class="invoice-title">INVOICE</h1>
              <div class="title-underline"></div>
            </div>
            <div class="logo-badge">
              <svg width="100" height="100" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="25" y="15" width="50" height="70" rx="8" fill="#f8fafc" stroke="#cbd5e1" stroke-width="2"/>
                <text x="50" y="38" font-family="Arial" font-weight="bold" font-size="12" fill="#1d4ed8" text-anchor="middle">BillFlow</text>
                <line x1="35" y1="48" x2="65" y2="48" stroke="#cbd5e1" stroke-width="3" stroke-linecap="round"/>
                <line x1="35" y1="58" x2="65" y2="58" stroke="#cbd5e1" stroke-width="3" stroke-linecap="round"/>
                <line x1="35" y1="68" x2="55" y2="68" stroke="#cbd5e1" stroke-width="3" stroke-linecap="round"/>
                <path d="M15 60 C 15 35, 85 35, 85 60 L 75 50 M 85 60 L 75 70" stroke="#f59e0b" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
              </svg>
            </div>
          </div>

          <!-- Bill To & Meta -->
          <div class="bill-to-section">
            <div>
              <div class="bill-to-label">Bill To</div>
              <div class="client-name">${data.customerName || data.clientName || "Valued Customer"}</div>
              <div class="client-details">
                ${data.customerAddress || data.clientAddress || "Business Address"}<br/>
                ${data.customerCity || "City, Country"}
              </div>
            </div>
            <div>
              <table class="meta-table">
                <tr>
                  <td class="meta-label">Invoice #</td>
                  <td class="meta-value">${data.invoiceNumber || "INV-2025-0001"}</td>
                </tr>
                <tr>
                  <td class="meta-label">Date</td>
                  <td class="meta-value">${data.date ? new Date(data.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</td>
                </tr>
                <tr>
                  <td class="meta-label">Due Date</td>
                  <td class="meta-value">${data.dueDate ? new Date(data.dueDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</td>
                </tr>
              </table>
            </div>
          </div>

          <!-- Items Table -->
          <table class="items-table">
            <thead>
              <tr>
                <th style="width: 50%;">Item</th>
                <th style="width: 15%; text-align: center;">Qty</th>
                <th style="width: 15%; text-align: right;">Price</th>
                <th style="width: 20%; text-align: right;">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
          </table>

          <!-- Totals Section -->
          <div class="totals-section">
            <table class="totals-table">
              <tr>
                <td class="totals-label">Subtotal</td>
                <td class="totals-value">$${subtotal.toFixed(2)}</td>
              </tr>
              <tr>
                <td class="totals-label">Tax (10%)</td>
                <td class="totals-value">$${tax.toFixed(2)}</td>
              </tr>
              <tr class="total-row">
                <td class="totals-label">Total</td>
                <td class="totals-value">$${total.toFixed(2)}</td>
              </tr>
            </table>
          </div>

          <!-- Footer -->
          <div class="footer-section">
            <div class="thank-you-badge">
              <span class="heart-icon">♥</span>
              Thank you for your business!
            </div>
          </div>
        </div>

        <script>
          window.onload = () => {
            window.print();
          };
        </script>
      </body>
    </html>
  `;

  printWindow.document.write(html);
  printWindow.document.close();
}
