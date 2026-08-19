import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase-admin";

export type SecurityEventCategory = "security_event" | "system_alert";
export type SecurityEventSeverity = "critical" | "high" | "medium" | "low" | "info";

export type SecurityEventType =
  | "invalid_session"
  | "unauthorized_api_attempt"
  | "notification_failure"
  | "notification_queued"
  | "sync_failure"
  | "admin_action";

export type SecurityEventInput = {
  category: SecurityEventCategory;
  eventType: SecurityEventType;
  severity: SecurityEventSeverity;
  title: string;
  message: string;
  actorUid?: string | null;
  actorEmail?: string | null;
  businessId?: string | null;
  propertyId?: string | null;
  route?: string | null;
  metadata?: Record<string, string | number | boolean | null>;
};

function safeMetadata(metadata?: SecurityEventInput["metadata"]) {
  if (!metadata) return undefined;
  return Object.fromEntries(
    Object.entries(metadata).filter(([, value]) =>
      value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean",
    ),
  );
}

/**
 * Writes an operational/security event using the Admin SDK so browser clients
 * cannot forge, delete, or modify the monitoring feed.
 */
export async function recordSecurityEvent(input: SecurityEventInput) {
  try {
    await getAdminDb().collection("securityEvents").add({
      category: input.category,
      eventType: input.eventType,
      severity: input.severity,
      title: input.title.slice(0, 160),
      message: input.message.slice(0, 500),
      actorUid: input.actorUid || null,
      actorEmail: input.actorEmail || null,
      businessId: input.businessId || null,
      propertyId: input.propertyId || null,
      route: input.route || null,
      ...(safeMetadata(input.metadata) ? { metadata: safeMetadata(input.metadata) } : {}),
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (error) {
    // Monitoring must never break the protected request it observes.
    console.error("Failed to record security event", error);
  }
}

export function timestampToIso(value: unknown) {
  if (!value) return null;
  if (typeof value === "object" && value !== null && "toDate" in value && typeof (value as { toDate?: unknown }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
