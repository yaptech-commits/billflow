import { formatCedi } from "./utils";

export function printReceipt(data: any) {
  const printWindow = window.open("", "_blank", "width=400,height=600");
  if (!printWindow) return;

  const itemsHtml = data.items.map((item: any) => `
    <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
      <div style="flex: 1;">${item.productName}</div>
      <div style="text-align: right; width: 40px;">${item.quantity}</div>
      <div style="text-align: right; width: 80px;">${(item.price * item.quantity).toFixed(2)}</div>
    </div>
  `).join("");

  const html = `
    <html>
      <head>
        <title>Receipt - ${data.invoiceNumber}</title>
        <style>
          @page { size: 80mm auto; margin: 0; }
          body { 
            font-family: 'Courier New', Courier, monospace; 
            width: 72mm; 
            margin: 0 auto; 
            padding: 10mm 2mm;
            font-size: 12px;
            line-height: 1.2;
            color: #000;
          }
          .center { text-align: center; }
          .bold { font-weight: bold; }
          .uppercase { text-transform: uppercase; }
          .divider { border-top: 1px dashed #000; margin: 8px 0; }
          .header { margin-bottom: 15px; }
          .header h1 { margin: 0; font-size: 18px; }
          .header p { margin: 2px 0; font-size: 11px; }
          .section-title { margin: 10px 0; font-size: 14px; letter-spacing: 2px; }
          .footer { margin-top: 20px; font-size: 11px; }
          .barcode { margin-top: 15px; height: 40px; border-left: 1px solid #000; border-right: 1px solid #000; display: flex; align-items: center; justify-content: center; font-size: 10px; }
          .flex { display: flex; justify-content: space-between; }
        </style>
      </head>
      <body>
        <div class="header center">
          <h1 class="uppercase">${data.businessName}</h1>
          <p>${data.businessAddress || ""}</p>
          <p>Tel: ${data.businessPhone || ""}</p>
        </div>

        <div class="divider"></div>
        <div class="section-title center bold uppercase">
          ${data.paymentMethod === 'cash' ? 'CASH RECEIPT' : 'RECEIPT'}
        </div>
        <div class="divider"></div>

        <div class="flex bold" style="margin-bottom: 5px;">
          <span style="flex: 1;">Description</span>
          <span style="text-align: right; width: 40px;">Qty</span>
          <span style="text-align: right; width: 80px;">Price</span>
        </div>
        
        <div class="items">
          ${itemsHtml}
        </div>

        <div class="divider"></div>

        <div class="flex bold" style="font-size: 16px;">
          <span>Total</span>
          <span>${data.total.toFixed(2)}</span>
        </div>

        <div class="flex" style="margin-top: 5px;">
          <span>Cash</span>
          <span>${(data.amountPaid || 0).toFixed(2)}</span>
        </div>
        <div class="flex">
          <span>Change</span>
          <span>${(data.change || 0).toFixed(2)}</span>
        </div>

        <div class="divider"></div>

        <div style="font-size: 10px; margin-top: 10px;">
          <p>Invoice: ${data.invoiceNumber}</p>
          <p>Date: ${new Date().toLocaleString()}</p>
          ${data.customerName ? `<p>Customer: ${data.customerName}</p>` : ""}
          <p>Cashier: ${data.cashierName || "System"}</p>
        </div>

        <div class="divider"></div>

        <div class="footer center">
          <p class="bold">THANK YOU!</p>
          <div class="barcode">
            <div style="width: 100%; height: 100%; background: repeating-linear-gradient(90deg, #000, #000 2px, transparent 2px, transparent 4px);"></div>
          </div>
          <p style="margin-top: 5px;">${data.invoiceNumber}</p>
        </div>

        <script>
          window.onload = () => {
            window.print();
            setTimeout(() => window.close(), 500);
          };
        </script>
      </body>
    </html>
  `;

  printWindow.document.write(html);
  printWindow.document.close();
}
