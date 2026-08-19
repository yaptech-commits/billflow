import { NextRequest } from "next/server";
import { recordSecurityEvent } from "@/lib/security-events-server";

export type SchoolNotificationServerChannel = "in_app" | "email" | "sms" | "push" | "whatsapp";

export type SchoolNotificationDispatchPayload = {
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
  channels: SchoolNotificationServerChannel[];
};

export type SchoolNotificationDispatchResult = {
  status: "delivered" | "queued" | "partial_failure";
  results: Record<string, { status: "delivered" | "queued" | "failed"; reason?: string }>;
};

function webhookFor(channel: SchoolNotificationServerChannel) {
  if (channel === "email") return process.env.SCHOOL_EMAIL_WEBHOOK_URL;
  if (channel === "sms") return process.env.SCHOOL_SMS_WEBHOOK_URL;
  if (channel === "whatsapp") return process.env.SCHOOL_WHATSAPP_WEBHOOK_URL;
  if (channel === "push") return process.env.SCHOOL_PUSH_WEBHOOK_URL;
  return undefined;
}

function allowedWebhookUrl(rawValue?: string) {
  if (!rawValue) return undefined;
  try {
    const url = new URL(rawValue);
    const allowedProtocol = url.protocol === "https:" || (process.env.NODE_ENV !== "production" && url.protocol === "http:");
    return allowedProtocol ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

export async function dispatchSchoolNotification(payload: SchoolNotificationDispatchPayload): Promise<SchoolNotificationDispatchResult> {
  const requestedChannels = Array.from(new Set(payload.channels || []));
  const results: SchoolNotificationDispatchResult["results"] = {};

  for (const channel of requestedChannels) {
    if (channel === "in_app") {
      results[channel] = { status: "delivered", reason: "Available in the BillFlow parent portal" };
      continue;
    }

    const webhookUrl = allowedWebhookUrl(webhookFor(channel));
    if (!webhookUrl) {
      results[channel] = { status: "queued", reason: `No valid ${channel} webhook is configured on the server` };
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
  const externalValues = Object.entries(results)
    .filter(([channel]) => channel !== "in_app")
    .map(([, result]) => result);
  const relevantValues = externalValues.length ? externalValues : values;
  const status: SchoolNotificationDispatchResult["status"] = relevantValues.some((result) => result.status === "failed")
    ? "partial_failure"
    : relevantValues.some((result) => result.status === "queued")
      ? "queued"
      : "delivered";

  for (const [channel, result] of Object.entries(results)) {
    if (channel === "in_app" || result.status === "delivered") continue;
    void recordSecurityEvent({
      category: "system_alert",
      eventType: result.status === "failed" ? "notification_failure" : "notification_queued",
      severity: result.status === "failed" ? "high" : "medium",
      title: result.status === "failed" ? "Notification delivery failed" : "Notification delivery queued",
      message: result.reason || `The ${channel} notification provider needs attention.`,
      businessId: payload.businessId,
      propertyId: payload.propertyId,
      route: "/api/school/notifications/dispatch",
      metadata: { channel, notificationId: payload.notificationId, notificationType: payload.type },
    });
  }

  return { status, results };
}

export function isAuthorizedNotificationCron(request: NextRequest) {
  const configuredSecret = process.env.CRON_SECRET;
  if (!configuredSecret) return false;
  const authorization = request.headers.get("authorization");
  return authorization === `Bearer ${configuredSecret}`;
}
