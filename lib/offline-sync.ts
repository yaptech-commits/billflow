/**
 * Enhanced offline sync queue for POS sales, invoices, payments, and hotel folios.
 * Stores pending payloads in localStorage with idempotency keys and retry counters.
 */

const SYNC_QUEUE_KEY = "billflow_offline_sales";
const OFFLINE_INVOICES_KEY = "billflow_offline_invoices";
const OFFLINE_PAYMENTS_KEY = "billflow_offline_payments";
const OFFLINE_FOLIOS_KEY = "billflow_offline_folios";

export interface OfflineItem {
  id: string;
  data: any;
  timestamp: number;
  retries: number;
}

export function queueOfflineItem(key: string, payload: any) {
  if (typeof window === "undefined") return null;
  const queue: OfflineItem[] = JSON.parse(localStorage.getItem(key) || "[]");

  // Prevent exact duplicate payload queuing within 10 seconds
  const duplicate = queue.find(item =>
    JSON.stringify(item.data) === JSON.stringify(payload) &&
    (Date.now() - item.timestamp) < 10000
  );
  if (duplicate) return duplicate;

  const newItem: OfflineItem = {
    id: crypto.randomUUID(),
    data: {
      ...payload,
      idempotencyKey: payload.idempotencyKey || crypto.randomUUID()
    },
    timestamp: Date.now(),
    retries: 0,
  };
  queue.push(newItem);
  localStorage.setItem(key, JSON.stringify(queue));
  return newItem;
}

export function queueOfflineSale(saleData: any) {
  return queueOfflineItem(SYNC_QUEUE_KEY, saleData);
}

export function queueOfflineInvoice(invoiceData: any) {
  return queueOfflineItem(OFFLINE_INVOICES_KEY, invoiceData);
}

export function queueOfflinePayment(paymentData: any) {
  return queueOfflineItem(OFFLINE_PAYMENTS_KEY, paymentData);
}

export function queueOfflineFolioCharge(chargeData: any) {
  return queueOfflineItem(OFFLINE_FOLIOS_KEY, chargeData);
}

export function getOfflineQueue(key: string = SYNC_QUEUE_KEY): OfflineItem[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(key) || "[]");
  } catch {
    return [];
  }
}

export function removeFromQueue(key: string, id: string) {
  if (typeof window === "undefined") return;
  const queue = getOfflineQueue(key);
  const filtered = queue.filter(item => item.id !== id);
  localStorage.setItem(key, JSON.stringify(filtered));
}

export async function syncQueue(key: string, syncFn: (data: any) => Promise<any>) {
  const queue = getOfflineQueue(key);
  if (queue.length === 0) return { synced: 0, failed: 0 };

  let synced = 0;
  let failed = 0;
  const remaining: OfflineItem[] = [];

  for (const item of queue) {
    try {
      await syncFn(item.data);
      synced++;
    } catch (err) {
      console.error(`Failed to sync offline item from ${key}:`, err);
      item.retries = (item.retries || 0) + 1;
      // Keep in queue if under 5 retries, drop if persistent failure
      if (item.retries < 5) {
        remaining.push(item);
      }
      failed++;
    }
  }

  localStorage.setItem(key, JSON.stringify(remaining));
  return { synced, failed };
}

export async function syncAllOfflineData(syncHandlers: {
  sale: (data: any) => Promise<any>;
  invoice: (data: any) => Promise<any>;
  payment: (data: any) => Promise<any>;
  folio?: (data: any) => Promise<any>;
}) {
  const salesResult = await syncQueue(SYNC_QUEUE_KEY, syncHandlers.sale);
  const invoicesResult = await syncQueue(OFFLINE_INVOICES_KEY, syncHandlers.invoice);
  const paymentsResult = await syncQueue(OFFLINE_PAYMENTS_KEY, syncHandlers.payment);
  let foliosResult = { synced: 0, failed: 0 };
  if (syncHandlers.folio) {
    foliosResult = await syncQueue(OFFLINE_FOLIOS_KEY, syncHandlers.folio);
  }

  return {
    synced: salesResult.synced + invoicesResult.synced + paymentsResult.synced + foliosResult.synced,
    failed: salesResult.failed + invoicesResult.failed + paymentsResult.failed + foliosResult.failed,
  };
}

export function getOfflineSummary() {
  if (typeof window === "undefined") return { sales: 0, invoices: 0, payments: 0, folios: 0, total: 0 };
  const sales = getOfflineQueue(SYNC_QUEUE_KEY).length;
  const invoices = getOfflineQueue(OFFLINE_INVOICES_KEY).length;
  const payments = getOfflineQueue(OFFLINE_PAYMENTS_KEY).length;
  const folios = getOfflineQueue(OFFLINE_FOLIOS_KEY).length;
  return { sales, invoices, payments, folios, total: sales + invoices + payments + folios };
}

export function clearAllOfflineData() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(SYNC_QUEUE_KEY);
  localStorage.removeItem(OFFLINE_INVOICES_KEY);
  localStorage.removeItem(OFFLINE_PAYMENTS_KEY);
  localStorage.removeItem(OFFLINE_FOLIOS_KEY);
}

// Backward-compatible wrappers for existing BillFlow pages.
export function syncOfflineSales(syncFn: (data: any) => Promise<any>) {
  return syncQueue(SYNC_QUEUE_KEY, syncFn);
}

export function syncOfflineInvoices(syncFn: (data: any) => Promise<any>) {
  return syncQueue(OFFLINE_INVOICES_KEY, syncFn);
}

export function syncOfflinePayments(syncFn: (data: any) => Promise<any>) {
  return syncQueue(OFFLINE_PAYMENTS_KEY, syncFn);
}

export function deleteOfflineInvoice(id: string) {
  removeFromQueue(OFFLINE_INVOICES_KEY, id);
}

export function deleteOfflinePayment(id: string) {
  removeFromQueue(OFFLINE_PAYMENTS_KEY, id);
}

export function deleteOfflinePOSSale(id: string) {
  removeFromQueue(SYNC_QUEUE_KEY, id);
}
