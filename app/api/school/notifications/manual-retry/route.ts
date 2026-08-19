import { NextRequest, NextResponse } from "next/server";
import { getAdminDb, verifyServerFirebaseToken } from "@/lib/firebase-admin";
import { dispatchSchoolNotification, SchoolNotificationDispatchPayload } from "@/lib/school-notification-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RETRY_LIMIT = 5;

function isSuperAdmin(decoded: any) {
  return decoded?.email === "wisdomasaare41@gmail.com" || decoded?.role === "super_admin" || decoded?.super_admin === true;
}

async function canManageBusiness(decoded: any, businessId: string) {
  if (isSuperAdmin(decoded) || decoded?.uid === businessId) return true;
  const staffIndex = await getAdminDb().collection("staffIndex").doc(decoded.uid).get();
  const staff = staffIndex.data();
  return staffIndex.exists && staff?.status === "active" && staff?.businessId === businessId && staff?.role === "owner";
}

function retryDelayMs(retryCount: number) {
  return Math.min(60 * 60 * 1000, 2 ** retryCount * 5 * 60 * 1000);
}

export async function POST(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  let decoded: any;
  try {
    decoded = await verifyServerFirebaseToken(authorization.slice(7));
  } catch {
    return NextResponse.json({ error: "Invalid or expired session" }, { status: 401 });
  }

  let body: { notificationId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

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
  if (!(await canManageBusiness(decoded, String(data.businessId || "")))) {
    return NextResponse.json({ error: "You are not authorized to retry this notification" }, { status: 403 });
  }
  if (data.status === "sent") return NextResponse.json({ error: "This notification has already been delivered" }, { status: 409 });

  const payload: SchoolNotificationDispatchPayload = {
    notificationId,
    businessId: String(data.businessId || ""),
    propertyId: String(data.propertyId || "default_property"),
    studentId: String(data.studentId || ""),
    studentName: String(data.studentName || ""),
    recipientEmail: data.recipientEmail || undefined,
    recipientPhone: data.recipientPhone || undefined,
    title: String(data.title || "Admission letter"),
    message: String(data.message || ""),
    html: data.html || undefined,
    metadata: { ...(data.metadata || {}), manualRetry: true },
    type: String(data.type),
    channels: Array.isArray(data.channels) ? data.channels : ["in_app"],
  };

  const result = await dispatchSchoolNotification(payload);
  const channelStatuses = Object.fromEntries(Object.entries(result.results || {}).map(([channel, value]) => [channel, value]));
  const maxRetries = Math.min(Number(data.maxRetries || RETRY_LIMIT), RETRY_LIMIT);
  const nextRetryCount = result.status === "queued" ? 1 : 0;
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
    nextRetryAt: retryable ? new Date(Date.now() + retryDelayMs(0)) : null,
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
    message: result.status === "delivered" ? "Admission letter delivered." : result.status === "queued" ? "Admission letter queued for another attempt." : "Delivery attempted; review channel statuses.",
  });
}
