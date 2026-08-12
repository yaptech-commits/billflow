/**
 * Enhanced offline sync queue for POS sales, invoices, payments, and hotel folios.
 * Stores pending payloads in localStorage with idempotency keys and retry counters.
 */

import { collection, doc, onSnapshot, query, runTransaction, setDoc, updateDoc, where } from "firebase/firestore";
import { db } from "@/lib/firebase";

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

export interface SyncTelemetry {
  businessId: string;
  sales: number;
  invoices: number;
  payments: number;
  folios: number;
  total: number;
  offlineMode: boolean;
  lastSeenAt?: unknown;
  lastSyncAt?: unknown;
  lastSyncResult?: { synced: number; failed: number };
}

function resolveActiveBusinessId(explicitBusinessId?: string) {
  if (explicitBusinessId) return explicitBusinessId;
  if (typeof window === "undefined") return null;
  return localStorage.getItem("billflow_active_business_id");
}

/** Publishes only aggregate queue telemetry; invoice, payment, and product payloads never leave the browser. */
export async function reportOfflineSyncTelemetry(businessId?: string, syncResult?: { synced: number; failed: number }) {
  if (typeof window === "undefined" || !navigator.onLine) return;
  const resolvedBusinessId = resolveActiveBusinessId(businessId);
  if (!resolvedBusinessId || resolvedBusinessId === "default") return;

  const summary = getOfflineSummary();
  const telemetryRef = doc(db, "syncTelemetry", resolvedBusinessId);
  try {
    await setDoc(telemetryRef, {
      businessId: resolvedBusinessId,
      ...summary,
      offlineMode: localStorage.getItem("billflow_offline_mode") === "true",
      lastSeenAt: new Date().toISOString(),
      ...(syncResult ? { lastSyncAt: new Date().toISOString(), lastSyncResult: syncResult } : {})
    }, { merge: true });
  } catch (error) {
    console.warn("Unable to publish offline sync telemetry:", error);
  }
}

export function subscribeToManualSyncCommands(
  businessId: string,
  syncHandlers: {
    sale: (data: any) => Promise<any>;
    invoice: (data: any) => Promise<any>;
    payment: (data: any) => Promise<any>;
    folio?: (data: any) => Promise<any>;
  },
  onComplete?: (result: { synced: number; failed: number }) => void
) {
  if (typeof window === "undefined" || !businessId) return () => undefined;

  const commandsQuery = query(collection(db, "syncCommands"), where("businessId", "==", businessId));
  return onSnapshot(commandsQuery, (snapshot) => {
    snapshot.docs
      .filter(command => command.data().status === "requested")
      .forEach(async (commandSnapshot) => {
        const commandRef = doc(db, "syncCommands", commandSnapshot.id);
        let claimed = false;
        try {
          await runTransaction(db, async (transaction) => {
            const current = await transaction.get(commandRef);
            if (current.exists() && current.data().status === "requested") {
              transaction.update(commandRef, { status: "processing", startedAt: new Date().toISOString() });
              claimed = true;
            }
          });
          if (!claimed) return;

          const result = await syncAllOfflineData(syncHandlers);
          await updateDoc(commandRef, {
            status: result.failed > 0 ? "completed_with_errors" : "completed",
            completedAt: new Date().toISOString(),
            result
          });
          await reportOfflineSyncTelemetry(businessId, result);
          onComplete?.(result);
        } catch (error) {
          console.error("Manual sync command failed:", error);
          try {
            await updateDoc(commandRef, {
              status: "failed",
              completedAt: new Date().toISOString(),
              error: error instanceof Error ? error.message : "Unknown sync error"
            });
          } catch (updateError) {
            console.error("Unable to record manual sync failure:", updateError);
          }
        }
      });
  }, (error) => {
    console.warn("Unable to listen for manual sync commands:", error);
  });
}

export function checkAndEnforceThreeDayOnlineAutoSwitch() {
  if (typeof window === "undefined") return false;
  const isOfflineMode = localStorage.getItem("billflow_offline_mode") === "true";
  if (!isOfflineMode) return false;

  const timestampKey = "billflow_offline_start_timestamp";
  const now = Date.now();
  let startTimestamp = localStorage.getItem(timestampKey);

  if (!startTimestamp) {
    // If offline mode is enabled but no start time recorded, set it now
    localStorage.setItem(timestampKey, now.toString());
    return false;
  }

  const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
  const elapsed = now - parseInt(startTimestamp, 10);

  if (elapsed >= THREE_DAYS_MS) {
    // Exceeded 3 days! Automatically switch back to online mode
    localStorage.setItem("billflow_offline_mode", "false");
    localStorage.removeItem(timestampKey);
    window.dispatchEvent(new Event("billflow_offline_change"));

    // Push notification / activity log for admin
    try {
      const businessId = localStorage.getItem("billflow_active_business_id") || "default";
      // We record an in-app notification in Firestore if db is reachable or queue locally
      const notifKey = "billflow_admin_notifications";
      const existingNotifs = JSON.parse(localStorage.getItem(notifKey) || "[]");
      const newNotif = {
        id: crypto.randomUUID(),
        businessId,
        title: "Automatic Online Sync Triggered",
        message: "The 3-day offline limit was reached. Account automatically switched back to Online mode and data sync has started.",
        type: "alert",
        read: false,
        createdAt: Date.now()
      };
      existingNotifs.unshift(newNotif);
      localStorage.setItem(notifKey, JSON.stringify(existingNotifs));
    } catch (e) {
      console.error("Failed to log admin notification:", e);
    }

    return true;
  }

  return false;
}

export function clearAllOfflineData() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(SYNC_QUEUE_KEY);
  localStorage.removeItem(OFFLINE_INVOICES_KEY);
  localStorage.removeItem(OFFLINE_PAYMENTS_KEY);
  localStorage.removeItem(OFFLINE_FOLIOS_KEY);
  localStorage.removeItem("billflow_offline_start_timestamp");
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
