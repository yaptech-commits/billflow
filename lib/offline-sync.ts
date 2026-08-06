/**
 * Simple offline sync queue for POS sales.
 * Stores pending sales in localStorage and attempts to sync them when online.
 */

const SYNC_QUEUE_KEY = "billflow_offline_sales";

export interface OfflineSale {
  id: string;
  data: any;
  timestamp: number;
}

export function queueOfflineSale(saleData: any) {
  const queue: OfflineSale[] = JSON.parse(localStorage.getItem(SYNC_QUEUE_KEY) || "[]");
  const newSale: OfflineSale = {
    id: crypto.randomUUID(),
    data: saleData,
    timestamp: Date.now(),
  };
  queue.push(newSale);
  localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(queue));
  return newSale;
}

export function getOfflineQueue(): OfflineSale[] {
  if (typeof window === "undefined") return [];
  return JSON.parse(localStorage.getItem(SYNC_QUEUE_KEY) || "[]");
}

export function removeFromQueue(id: string) {
  const queue = getOfflineQueue();
  const filtered = queue.filter(s => s.id !== id);
  localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(filtered));
}

export async function syncOfflineSales(syncFn: (data: any) => Promise<any>) {
  const queue = getOfflineQueue();
  if (queue.length === 0) return { synced: 0, failed: 0 };

  let synced = 0;
  let failed = 0;

  for (const sale of queue) {
    try {
      await syncFn(sale.data);
      removeFromQueue(sale.id);
      synced++;
    } catch (err) {
      console.error("Failed to sync offline sale:", err);
      failed++;
    }
  }

  return { synced, failed };
}

export async function syncOfflineInvoices(syncFn: (data: any) => Promise<any>) {
  const queue = JSON.parse(localStorage.getItem("billflow_offline_invoices") || "[]");
  if (queue.length === 0) return { synced: 0, failed: 0 };

  let synced = 0;
  let failed = 0;
  const remaining = [];

  for (const inv of queue) {
    try {
      await syncFn(inv.data);
      synced++;
    } catch (err) {
      console.error("Failed to sync offline invoice:", err);
      remaining.push(inv);
      failed++;
    }
  }

  localStorage.setItem("billflow_offline_invoices", JSON.stringify(remaining));
  return { synced, failed };
}

export async function syncOfflinePayments(syncFn: (data: any) => Promise<any>) {
  const queue = JSON.parse(localStorage.getItem("billflow_offline_payments") || "[]");
  if (queue.length === 0) return { synced: 0, failed: 0 };

  let synced = 0;
  let failed = 0;
  const remaining = [];

  for (const pay of queue) {
    try {
      await syncFn(pay.data);
      synced++;
    } catch (err) {
      console.error("Failed to sync offline payment:", err);
      remaining.push(pay);
      failed++;
    }
  }

  localStorage.setItem("billflow_offline_payments", JSON.stringify(remaining));
  return { synced, failed };
}

export function deleteOfflineInvoice(id: string) {
  const queue = JSON.parse(localStorage.getItem("billflow_offline_invoices") || "[]");
  const filtered = queue.filter((inv: any) => inv.id !== id);
  localStorage.setItem("billflow_offline_invoices", JSON.stringify(filtered));
}

export function deleteOfflinePayment(id: string) {
  const queue = JSON.parse(localStorage.getItem("billflow_offline_payments") || "[]");
  const filtered = queue.filter((pay: any) => pay.id !== id);
  localStorage.setItem("billflow_offline_payments", JSON.stringify(filtered));
}

export function deleteOfflinePOSSale(id: string) {
  const queue = JSON.parse(localStorage.getItem("billflow_offline_sales") || "[]");
  const filtered = queue.filter((sale: any) => sale.id !== id);
  localStorage.setItem("billflow_offline_sales", JSON.stringify(filtered));
}
