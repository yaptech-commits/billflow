import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { errorResponseDetails, requireServerActor } from "@/lib/server-auth";
import { dispatchSchoolNotification, SchoolNotificationDispatchPayload } from "@/lib/school-notification-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_PROPERTY_ID = "default_property";

function normalizePropertyId(value: unknown) {
  return String(value || DEFAULT_PROPERTY_ID).trim() || DEFAULT_PROPERTY_ID;
}

function canManageNotification(actor: Awaited<ReturnType<typeof requireServerActor>>, data: Record<string, any>) {
  if (actor.role === "super_admin") return true;
  if (actor.role !== "owner") return false;
  if (String(data.businessId || "") !== actor.businessId) return false;
  return !actor.propertyId || normalizePropertyId(data.propertyId) === actor.propertyId;
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireServerActor(request);
    if (actor.role !== "owner" && actor.role !== "super_admin") {
      return NextResponse.json({ error: "Owner or super-admin access required" }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const notificationId = String(body.notificationId || "").trim();
    if (!notificationId) {
      return NextResponse.json({ error: "notificationId is required" }, { status: 400 });
    }

    const notificationDoc = await getAdminDb().collection("schoolNotifications").doc(notificationId).get();
    if (!notificationDoc.exists) {
      return NextResponse.json({ error: "Notification not found" }, { status: 404 });
    }

    const data = notificationDoc.data() as Record<string, any>;
    if (!canManageNotification(actor, data)) {
      return NextResponse.json({ error: "You are not authorized to dispatch this notification" }, { status: 403 });
    }

    const payload: SchoolNotificationDispatchPayload = {
      notificationId,
      businessId: String(data.businessId || ""),
      propertyId: normalizePropertyId(data.propertyId),
      studentId: String(data.studentId || ""),
      studentName: String(data.studentName || ""),
      recipientEmail: data.recipientEmail || undefined,
      recipientPhone: data.recipientPhone || undefined,
      title: String(data.title || "School notification"),
      message: String(data.message || ""),
      html: data.html || undefined,
      metadata: data.metadata || undefined,
      type: String(data.type || "announcement"),
      channels: Array.isArray(data.channels) ? data.channels : ["in_app"],
    };

    if (!payload.businessId || !payload.studentId || !payload.title || !payload.message) {
      return NextResponse.json({ error: "Stored notification is incomplete" }, { status: 422 });
    }

    const result = await dispatchSchoolNotification(payload);
    return NextResponse.json(result);
  } catch (error) {
    const details = errorResponseDetails(error);
    return NextResponse.json({ error: details.message }, { status: details.status });
  }
}
