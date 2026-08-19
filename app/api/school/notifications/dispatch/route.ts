import { NextRequest, NextResponse } from "next/server";
import { verifyServerFirebaseToken } from "@/lib/firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Channel = "email" | "sms" | "push" | "in_app";

type NotificationPayload = {
  notificationId: string;
  businessId: string;
  propertyId: string;
  studentId: string;
  studentName: string;
  recipientEmail?: string;
  recipientPhone?: string;
  title: string;
  message: string;
  html?: string;
  metadata?: Record<string, string | number | boolean | null>;
  type: string;
  channels: Channel[];
};

const webhookFor = (channel: Channel) => {
  if (channel === "email") return process.env.SCHOOL_EMAIL_WEBHOOK_URL;
  if (channel === "sms") return process.env.SCHOOL_SMS_WEBHOOK_URL;
  if (channel === "push") return process.env.SCHOOL_PUSH_WEBHOOK_URL;
  return undefined;
};

export async function POST(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  try {
    await verifyServerFirebaseToken(authorization.slice("Bearer ".length));
  } catch {
    return NextResponse.json({ error: "Invalid Firebase session or missing server credentials" }, { status: 401 });
  }

  let payload: NotificationPayload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid notification payload" }, { status: 400 });
  }

  if (!payload?.notificationId || !payload.businessId || !payload.propertyId || !payload.studentId || !payload.title || !payload.message) {
    return NextResponse.json({ error: "Missing required notification fields" }, { status: 400 });
  }

  const requestedChannels = Array.from(new Set(payload.channels || []));
  const results: Record<string, { status: "delivered" | "queued" | "failed"; reason?: string }> = {};

  for (const channel of requestedChannels) {
    if (channel === "in_app") {
      results[channel] = { status: "delivered", reason: "Available in the BillFlow parent portal" };
      continue;
    }
    const webhookUrl = webhookFor(channel);
    if (!webhookUrl) {
      results[channel] = { status: "queued", reason: `No ${channel} webhook is configured on the server` };
      continue;
    }
    try {
      const webhookSecret = process.env.SCHOOL_NOTIFICATION_WEBHOOK_SECRET;
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(webhookSecret ? { "x-billflow-webhook-secret": webhookSecret } : {}),
        },
        body: JSON.stringify({
          event: "billflow.school.notification",
          notificationId: payload.notificationId,
          businessId: payload.businessId,
          propertyId: payload.propertyId,
          studentId: payload.studentId,
          studentName: payload.studentName,
          recipientEmail: payload.recipientEmail,
          recipientPhone: payload.recipientPhone,
          title: payload.title,
          message: payload.message,
          html: payload.html,
          metadata: payload.metadata,
          type: payload.type,
          channel,
        }),
      });
      results[channel] = response.ok
        ? { status: "delivered" }
        : { status: "failed", reason: `Webhook returned HTTP ${response.status}` };
    } catch (error) {
      results[channel] = { status: "failed", reason: error instanceof Error ? error.message : "Webhook request failed" };
    }
  }

  const values = Object.values(results);
  const status = values.some((result) => result.status === "failed")
    ? "partial_failure"
    : values.some((result) => result.status === "delivered")
      ? "delivered"
      : "queued";

  return NextResponse.json({ status, results });
}
