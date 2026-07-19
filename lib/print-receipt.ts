/**
 * Opens the browser print dialog with a receipt-optimized layout.
 * Designed for 80mm thermal printers but works with any printer.
 * Captures the content of the BrandedDocument component currently rendered.
 */
export function printReceipt(elementId: string = "branded-doc", width: 58 | 80 = 80) {
  const content = document.getElementById(elementId);
  if (!content) {
    alert("Nothing to print. Please ensure the receipt is visible.");
    return;
  }

  const printWidth = width === 58 ? "58mm" : "80mm";
  const contentWidth = width === 58 ? "54mm" : "76mm";

  const printWindow = window.open("", "_blank", "width=300,height=600");
  if (!printWindow) {
    alert("Pop-up blocked. Please allow pop-ups for this site to print receipts.");
    return;
  }

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Receipt</title>
      <style>
        /* Thermal receipt printer optimized styles */
        @page {
          size: ${printWidth} auto;
          margin: 2mm;
        }
        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }
        body {
          font-family: 'Courier New', monospace;
          font-size: ${width === 58 ? '10px' : '12px'};
          line-height: 1.4;
          color: #000;
          background: #fff;
          width: ${contentWidth};
          max-width: ${contentWidth};
          padding: 1mm;
        }
        .receipt-header {
          text-align: center;
          border-bottom: 1px dashed #000;
          padding-bottom: 8px;
          margin-bottom: 8px;
        }
        .receipt-header img {
          max-width: 50mm;
          max-height: 15mm;
          margin-bottom: 4px;
        }
        .receipt-header .business-name {
          font-weight: bold;
          font-size: 14px;
        }
        .receipt-header .business-info {
          font-size: 10px;
        }
        .receipt-meta {
          border-bottom: 1px dashed #000;
          padding-bottom: 6px;
          margin-bottom: 6px;
          font-size: 11px;
        }
        .receipt-meta .doc-type {
          font-weight: bold;
          font-size: 13px;
          text-align: center;
        }
        .receipt-items {
          border-bottom: 1px dashed #000;
          padding-bottom: 6px;
          margin-bottom: 6px;
        }
        .receipt-items .item-row {
          display: flex;
          justify-content: space-between;
          margin-bottom: 3px;
        }
        .receipt-items .item-name {
          max-width: 60%;
        }
        .receipt-totals {
          margin-bottom: 8px;
        }
        .receipt-totals .total-row {
          display: flex;
          justify-content: space-between;
          margin-bottom: 2px;
        }
        .receipt-totals .grand-total {
          font-weight: bold;
          font-size: 14px;
          border-top: 1px solid #000;
          padding-top: 4px;
          margin-top: 4px;
        }
        .receipt-footer {
          text-align: center;
          border-top: 1px dashed #000;
          padding-top: 6px;
          font-size: 10px;
        }
        .receipt-barcode {
          text-align: center;
          margin-top: 8px;
        }
        .receipt-barcode svg {
          max-width: 60mm;
        }
        @media print {
          body { width: ${contentWidth}; }
        }
      </style>
    </head>
    <body>
      ${content.innerHTML}
      <script>
        // Auto-print and close
        window.onload = function() {
          // Convert colors for thermal printer (dark bg to white bg)
          document.querySelectorAll('*').forEach(el => {
            const style = window.getComputedStyle(el);
            if (style.color && style.color !== 'rgb(0, 0, 0)') {
              el.style.color = '#000';
            }
          });
          setTimeout(() => {
            window.print();
            window.close();
          }, 250);
        };
      <\/script>
    </body>
    </html>
  `);
  printWindow.document.close();
}

/**
 * Alternative: Print using the current page's print dialog with a print-only stylesheet.
 * This approach doesn't open a new window but uses CSS @media print.
 */
export function printCurrentPage() {
  window.print();
}
