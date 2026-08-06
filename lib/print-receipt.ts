import { formatCedi } from "./utils";

export function printReceipt(data: any) {
  const printWindow = window.open("", "_blank", "width=400,height=600");
  if (!printWindow) return;

  const html = `
    <html>
      <head>
        <title>Receipt - ${data.invoiceNumber}</title>
        <style>
          body { font-family: 'Courier New', Courier, monospace; font-size: 12px; padding: 20px; color: #000; }
          .center { text-align: center; }
          .bold { font-weight: bold; }
          .hr { border-top: 1px dashed #000; margin: 10px 0; }
          .flex { display: flex; justify-content: space-between; }
          .mt-10 { margin-top: 10px; }
          .mt-20 { margin-top: 20px; }
          table { width: 100%; border-collapse: collapse; }
          th { text-align: left; border-bottom: 1px solid #000; padding-bottom: 5px; }
          td { padding: 5px 0; }
        </style>
      </head>
      <body>
        <div class="center">
          <h2 class="bold">${data.businessName}</h2>
          <p>${data.businessAddress || ""}</p>
          <p>${data.businessPhone || ""}</p>
          <p class="bold mt-10">RECEIPT</p>
        </div>
        
        <div class="mt-20">
          <div class="flex"><span>Date:</span> <span>${new Date().toLocaleString()}</span></div>
          <div class="flex"><span>Invoice #:</span> <span>${data.invoiceNumber}</span></div>
          <div class="flex"><span>Cashier:</span> <span>${data.cashierName}</span></div>
        </div>
        
        <div class="hr"></div>
        
        <table>
          <thead>
            <tr>
              <th>Item</th>
              <th>Qty</th>
              <th>Price</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            ${data.items.map((item: any) => `
              <tr>
                <td>${item.productName}</td>
                <td>${item.quantity}</td>
                <td>${formatCedi(item.price)}</td>
                <td>${formatCedi(item.price * item.quantity)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
        
        <div class="hr"></div>
        
        <div class="mt-10">
          <div class="flex"><span>Subtotal:</span> <span>${formatCedi(data.subtotal)}</span></div>
          ${data.taxAmount > 0 ? `<div class="flex"><span>Tax:</span> <span>${formatCedi(data.taxAmount)}</span></div>` : ""}
          ${data.discountAmount > 0 ? `<div class="flex"><span>Discount:</span> <span>-${formatCedi(data.discountAmount)}</span></div>` : ""}
          <div class="flex bold mt-10" style="font-size: 14px;">
            <span>TOTAL:</span> <span>${formatCedi(data.total)}</span>
          </div>
        </div>
        
        <div class="hr"></div>
        
        <div class="mt-10">
          <div class="flex"><span>Method:</span> <span style="text-transform: uppercase;">${data.paymentMethod}</span></div>
          <div class="flex"><span>Amount Paid:</span> <span>${formatCedi(data.amountPaid)}</span></div>
          ${data.change > 0 ? `<div class="flex"><span>Change:</span> <span>${formatCedi(data.change)}</span></div>` : ""}
        </div>
        
        <div class="center mt-20">
          <p class="bold">Thank you for your business!</p>
          <p>Powered by BillFlow</p>
        </div>
        
        <script>
          window.onload = () => {
            window.print();
            window.close();
          };
        </script>
      </body>
    </html>
  `;

  printWindow.document.write(html);
  printWindow.document.close();
}
