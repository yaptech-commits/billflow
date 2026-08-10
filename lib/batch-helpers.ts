import { ProductBatch } from "./db";
import { Timestamp } from "firebase/firestore";

/**
 * Get batches for a product, sorted by expiry date (FEFO - First-Expired-First-Out)
 */
export function getBatchesSortedByExpiry(batches: ProductBatch[]): ProductBatch[] {
  return [...batches].sort((a, b) => {
    const dateA = a.expiryDate instanceof Timestamp ? a.expiryDate.toDate() : new Date(a.expiryDate);
    const dateB = b.expiryDate instanceof Timestamp ? b.expiryDate.toDate() : new Date(b.expiryDate);
    return dateA.getTime() - dateB.getTime();
  });
}

/**
 * Deduct quantity from batches using FEFO logic
 * Returns array of deductions with batch IDs and quantities
 */
export function deductBatchesFEFO(
  batches: ProductBatch[],
  quantityNeeded: number
): Array<{ batchId: string; quantity: number; expiryDate: Timestamp }> {
  const deductions: Array<{ batchId: string; quantity: number; expiryDate: Timestamp }> = [];
  const sortedBatches = getBatchesSortedByExpiry(batches);
  let remaining = quantityNeeded;

  for (const batch of sortedBatches) {
    if (remaining <= 0) break;
    
    const deductQty = Math.min(batch.quantity, remaining);
    deductions.push({
      batchId: batch.id!,
      quantity: deductQty,
      expiryDate: batch.expiryDate,
    });
    remaining -= deductQty;
  }

  return deductions;
}

/**
 * Check if a batch is expired
 */
export function isBatchExpired(batch: ProductBatch): boolean {
  const expiryDate = batch.expiryDate instanceof Timestamp 
    ? batch.expiryDate.toDate() 
    : new Date(batch.expiryDate);
  return expiryDate < new Date();
}

/**
 * Check if a batch is expiring soon (within 30 days)
 */
export function isBatchExpiringSoon(batch: ProductBatch, daysThreshold: number = 30): boolean {
  const expiryDate = batch.expiryDate instanceof Timestamp 
    ? batch.expiryDate.toDate() 
    : new Date(batch.expiryDate);
  const now = new Date();
  const daysUntilExpiry = (expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  return daysUntilExpiry > 0 && daysUntilExpiry <= daysThreshold;
}

/**
 * Get total quantity available for a product across all non-expired batches
 */
export function getTotalAvailableQuantity(batches: ProductBatch[]): number {
  return batches
    .filter(b => !isBatchExpired(b))
    .reduce((sum, b) => sum + b.quantity, 0);
}

/**
 * Format expiry date for display
 */
export function formatExpiryDate(date: Timestamp | Date | null): string {
  if (!date) return "N/A";
  const d = date instanceof Timestamp ? date.toDate() : new Date(date);
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

/**
 * Get batch status badge color
 */
export function getBatchStatusColor(batch: ProductBatch): "red" | "yellow" | "green" {
  if (isBatchExpired(batch)) return "red";
  if (isBatchExpiringSoon(batch)) return "yellow";
  return "green";
}
