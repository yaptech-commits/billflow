/**
 * Generates a unique SKU for a product.
 * Format: BF-XXXXX (BF prefix + 5 alphanumeric characters)
 * Uses a combination of timestamp and random characters for uniqueness.
 */
export function generateSKU(productName?: string): string {
  const prefix = "BF";
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let suffix = "";

  // Use first 2 chars of product name if available
  if (productName && productName.length >= 2) {
    suffix += productName.slice(0, 2).toUpperCase().replace(/[^A-Z0-9]/g, "X");
  } else {
    suffix += chars[Math.floor(Math.random() * 26)];
    suffix += chars[Math.floor(Math.random() * 26)];
  }

  // Add 3 random alphanumeric characters
  for (let i = 0; i < 3; i++) {
    suffix += chars[Math.floor(Math.random() * chars.length)];
  }

  return `${prefix}-${suffix}`;
}

/**
 * Generates a barcode-compatible numeric code from a SKU.
 * Uses EAN-13 compatible format: 200 (in-store prefix) + 9 digits + check digit.
 */
export function generateBarcodeFromSKU(sku: string): string {
  // Convert SKU to a numeric hash
  let hash = 0;
  for (let i = 0; i < sku.length; i++) {
    hash = ((hash << 5) - hash + sku.charCodeAt(i)) | 0;
  }
  // Make it positive and pad to 9 digits
  const numericPart = Math.abs(hash).toString().padStart(9, "0").slice(0, 9);
  const code = "200" + numericPart;

  // Calculate EAN-13 check digit
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(code[i]) * (i % 2 === 0 ? 1 : 3);
  }
  const checkDigit = (10 - (sum % 10)) % 10;

  return code + checkDigit;
}
