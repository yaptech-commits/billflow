import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { errorResponseDetails, requireServerActor } from "@/lib/server-auth";
import { dispatchSchoolNotification, SchoolNotificationDispatchPayload } from "@/lib/school-notification-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RETRY_LIMIT = 5;
const DEFAULT_PROPERTY_ID = "default_property";

function normalizePropertyId(value: unknown) {
  return String(value || DEFAULT_PROPERTY_ID).trim() || DEFAULT_PROPERTY_ID;
}

function retryDelayMs(retryCount: number) {
  return Math.min(60 * 60 * 1000, 2 ** retryCount * 5 * 60 * 1000);
}

function canManageNotification(actor: Awaited<ReturnType<typeof requireServerActor>>, data: Record<string, any>) {
  if (actor.role === "super_admin") return true;
  return actor.role === "owner"
    && actor.businessId === String(data.businessId || "")
    && (!actor.propertyId || normalizePropertyId(data.propertyId) === actor.propertyId);
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireServerActor(request);
    if (actor.role !== "owner" && actor.role !== "super_admin") {
      return NextResponse.json({ error: "Owner or super-admin access required" }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const notificationId = String(body.notificationId || "").trim();
    if (!notificationId) return NextResponse.json({ error: "notificationId is required" }, { status: 400 });

    const db = getAdminDb();
    const notificationRef = db.collection("schoolNotifications").doc(notificationId);
    const notificationDoc = await notificationRef.get();
    if (!notificationDoc.exists) return NextResponse.json({ error: "Notification not found" }, { status: 404 });

    const data = notificationDoc.data() as Record<string, any>;
    if (data.type !== "admission_created") {
      return NextResponse.json({ error: "Only admission-letter notifications can be manually retried here" }, { status: 400 });
    }
    if (!canManageNotification(actor, data)) {
      return NextResponse.json({ error: "You are not authorized to retry this notification" }, { status: 403 });
    }
    if (data.status === "sent") return NextResponse.json({ error: "This notification has already been delivered" }, { status: 409 });

    const payload: SchoolNotificationDispatchPayload = {
      notificationId,
      businessId: String(data.businessId || ""),
      propertyId: normalizePropertyId(data.propertyId),
      studentId: String(data.studentId || ""),
      studentName: String(data.studentName || ""),
      recipientEmail: data.recipientEmail || undefined,
      recipientPhone: data.recipientPhone || undefined,
      title: String(data.title || "Admission letter"),
      message: String(data.message || ""),
      html: data.html || undefined,
      metadata: { ...(data.metadata || {}), manualRetry: true },
      type: "admission_created",
      channels: Array.isArray(data.channels) ? data.channels : ["in_app"],
    };

    const result = await dispatchSchoolNotification(payload);
    const channelStatuses = Object.fromEntries(Object.entries(result.results || {}).map(([channel, value]) => [channel, value]));
    const maxRetries = Math.min(Number(data.maxRetries || RETRY_LIMIT), RETRY_LIMIT);
    const previousRetryCount = Math.max(0, Number(data.retryCount || 0));
    const nextRetryCount = result.status === "queued" ? previousRetryCount + 1 : previousRetryCount;
    const retryable = result.status === "queued" && nextRetryCount < maxRetries;
    const retryReason = Object.values(result.results || {})
      .filter((channel) => channel.status !== "delivered")
      .map((channel) => channel.reason)
      .filter(Boolean)
      .join("; ") || undefined;

    await notificationRef.update({
      status: result.status === "delivered" ? "sent" : result.status === "partial_failure" ? "failed" : "queued",
      deliveryStatus: channelStatuses,
      retryCount: nextRetryCount,
      maxRetries,
      nextRetryAt: retryable ? new Date(Date.now() + retryDelayMs(previousRetryCount)) : null,
      lastRetryError: retryable ? retryReason || "Delivery is still queued." : result.status === "queued" ? "Retry limit reached" : null,
      lastAttemptAt: new Date(),
      lastManualRetryAt: new Date(),
      manualRetryCount: Number(data.manualRetryCount || 0) + 1,
      ...(result.status === "delivered" ? { sentAt: new Date() } : {}),
    });

    return NextResponse.json({
      notificationId,
      status: result.status,
      results: result.results,
      message: result.status === "delivered"
        ? "Admission letter delivered."
        : result.status === "queued"
          ? "Admission letter queued for another attempt."
          : "Delivery attempted; review channel statuses.",
    });
  } catch (error) {
    const details = errorResponseDetails(error);
    return NextResponse.json({ error: details.message }, { status: details.status });
  }
}
