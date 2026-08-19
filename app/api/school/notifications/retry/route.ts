import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { dispatchSchoolNotification, isAuthorizedNotificationCron, SchoolNotificationDispatchPayload } from "@/lib/school-notification-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const RETRY_LIMIT = 5;
const RETRY_BATCH_SIZE = 20;

function toMillis(value: any) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  const parsed = Date.parse(String(value));
  return Number.isNaN(parsed) ? 0 : parsed;
}

function retryDelayMs(retryCount: number) {
  return Math.min(60 * 60 * 1000, 2 ** retryCount * 5 * 60 * 1000);
}

export async function GET(request: NextRequest) {
  if (!isAuthorizedNotificationCron(request)) {
    return NextResponse.json({ error: "Cron authentication required" }, { status: 401 });
  }

  const db = getAdminDb();
  const snapshot = await db
    .collection("schoolNotifications")
    .where("status", "==", "queued")
    .limit(RETRY_BATCH_SIZE)
    .get();

  const now = Date.now();
  let processed = 0;
  let delivered = 0;
  let queued = 0;
  let failed = 0;
  let skipped = 0;

  for (const notificationDoc of snapshot.docs) {
    const data = notificationDoc.data() as Record<string, any>;
    const retryCount = Number(data.retryCount || 0);
    const maxRetries = Math.min(Number(data.maxRetries || RETRY_LIMIT), RETRY_LIMIT);
    if (retryCount >= maxRetries || toMillis(data.nextRetryAt) > now) {
      skipped += 1;
      continue;
    }

    const payload: SchoolNotificationDispatchPayload = {
      notificationId: notificationDoc.id,
      businessId: data.businessId,
      propertyId: data.propertyId || "default_property",
      studentId: data.studentId,
      studentName: data.studentName,
      recipientEmail: data.recipientEmail,
      recipientPhone: data.recipientPhone,
      title: data.title,
      message: data.message,
      html: data.html,
      metadata: data.metadata,
      type: data.type,
      channels: Array.isArray(data.channels) ? data.channels : ["in_app"],
    };

    processed += 1;
    const result = await dispatchSchoolNotification(payload);
    const channelStatuses = Object.fromEntries(Object.entries(result.results || {}).map(([channel, value]) => [channel, value]));
    const nextRetryCount = result.status === "queued" ? retryCount + 1 : retryCount;
    const retryable = result.status === "queued" && nextRetryCount < maxRetries;
    const retryReason = Object.values(result.results || {})
      .filter((channel) => channel.status !== "delivered")
      .map((channel) => channel.reason)
      .filter(Boolean)
      .join("; ") || undefined;

    await notificationDoc.ref.update({
      status: result.status === "delivered" ? "sent" : result.status === "partial_failure" ? "failed" : "queued",
      deliveryStatus: channelStatuses,
      retryCount: nextRetryCount,
      maxRetries,
      nextRetryAt: retryable ? new Date(Date.now() + retryDelayMs(retryCount)) : null,
      lastRetryError: retryable ? retryReason || "Delivery is still queued." : result.status === "queued" ? "Retry limit reached" : null,
      lastAttemptAt: new Date(),
      ...(result.status === "delivered" ? { sentAt: new Date() } : {}),
    });

    if (result.status === "delivered") delivered += 1;
    else if (result.status === "queued") queued += 1;
    else failed += 1;
  }

  return NextResponse.json({
    processed,
    delivered,
    queued,
    failed,
    skipped,
    retryLimit: RETRY_LIMIT,
    batchSize: RETRY_BATCH_SIZE,
  });
}
