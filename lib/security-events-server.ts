import { FieldValue } from "firebase-admin/firestore";

import { getAdminDb } from "@/lib/firebase-admin";

export type SecurityEventSeverity = "info" | "warning" | "critical";
export type SecurityEventCategory = "security" | "system";

export type SecurityEventInput = {
  category: SecurityEventCategory;
  severity: SecurityEventSeverity;
  eventType: string;
  message: string;
  actorUid?: string;
  actorEmail?: string;
  businessId?: string;
  propertyId?: string;
  route?: string;
  metadata?: Record<string, string | number | boolean | null>;
};

function clean(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : undefined;
}

function cleanMetadata(metadata: SecurityEventInput["metadata"]) {
  if (!metadata) return undefined;
  return Object.fromEntries(
    Object.entries(metadata)
      .filter(([key, value]) => /^[a-zA-Z0-9_.-]{1,50}$/.test(key) && value !== undefined)
      .slice(0, 20),
  );
}

/**
 * Records server-side operational events. Firestore rules deny direct browser
 * access to securityEvents, so callers must use trusted server routes.
 */
export async function recordSecurityEvent(input: SecurityEventInput) {
  const payload = {
    category: input.category,
    severity: input.severity,
    eventType: clean(input.eventType, 80) || "unknown",
    message: clean(input.message, 500) || "Operational event",
    ...(clean(input.actorUid, 160) ? { actorUid: clean(input.actorUid, 160) } : {}),
    ...(clean(input.actorEmail, 180) ? { actorEmail: clean(input.actorEmail, 180) } : {}),
    ...(clean(input.businessId, 160) ? { businessId: clean(input.businessId, 160) } : {}),
    ...(clean(input.propertyId, 160) ? { propertyId: clean(input.propertyId, 160) } : {}),
    ...(clean(input.route, 240) ? { route: clean(input.route, 240) } : {}),
    ...(cleanMetadata(input.metadata) ? { metadata: cleanMetadata(input.metadata) } : {}),
    createdAt: FieldValue.serverTimestamp(),
  };

  try {
    const ref = await getAdminDb().collection("securityEvents").add(payload);
    return ref.id;
  } catch (error) {
    // Telemetry must never take down the business operation it observes.
    console.error("Failed to record security event", error);
    return null;
  }
}

export async function recordAuditEvent(input: Omit<SecurityEventInput, "category">) {
  return recordSecurityEvent({ ...input, category: "security" });
}

export async function recordSystemAlert(input: Omit<SecurityEventInput, "category">) {
  return recordSecurityEvent({ ...input, category: "system" });
}
