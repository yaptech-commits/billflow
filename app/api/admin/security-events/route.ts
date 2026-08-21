import { NextRequest, NextResponse } from "next/server";

import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { recordSecurityEvent } from "@/lib/security-events-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SUPER_ADMIN_EMAIL = "wisdomasaare41@gmail.com";

function errorResponse(status: number, error: string) {
  return NextResponse.json({ error }, { status, headers: { "cache-control": "no-store" } });
}

export async function GET(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return errorResponse(401, "Authentication required");

  let decoded;
  try {
    decoded = await getAdminAuth().verifyIdToken(authorization.slice(7), true);
  } catch {
    await recordSecurityEvent({
      category: "security",
      severity: "warning",
      eventType: "invalid_admin_session",
      message: "An invalid session attempted to read security monitoring data.",
      route: request.nextUrl.pathname,
    });
    return errorResponse(401, "Invalid or expired session");
  }

  if ((decoded.email || "").toLowerCase() !== SUPER_ADMIN_EMAIL) {
    await recordSecurityEvent({
      category: "security",
      severity: "critical",
      eventType: "unauthorized_security_monitor_access",
      message: "A non-Super Admin attempted to read security monitoring data.",
      actorUid: decoded.uid,
      actorEmail: decoded.email ?? undefined,
      route: request.nextUrl.pathname,
    });
    return errorResponse(403, "Super Admin access required");
  }

  try {
    const snapshot = await getAdminDb()
      .collection("securityEvents")
      .orderBy("createdAt", "desc")
      .limit(40)
      .get();

    const events = snapshot.docs.map((doc) => {
      const data = doc.data();
      const createdAt = data.createdAt?.toDate?.();
      return {
        id: doc.id,
        category: data.category === "system" ? "system" : "security",
        severity: data.severity === "critical" || data.severity === "warning" ? data.severity : "info",
        eventType: String(data.eventType || "unknown"),
        message: String(data.message || "Operational event"),
        actorEmail: data.actorEmail || null,
        businessId: data.businessId || null,
        propertyId: data.propertyId || null,
        route: data.route || null,
        metadata: data.metadata || null,
        createdAt: createdAt instanceof Date ? createdAt.toISOString() : null,
      };
    });

    const summary = events.reduce(
      (counts, event) => {
        counts.total += 1;
        if (event.category === "security") counts.security += 1;
        if (event.category === "system") counts.system += 1;
        if (event.severity === "critical") counts.critical += 1;
        if (event.severity === "warning") counts.warning += 1;
        return counts;
      },
      { total: 0, security: 0, system: 0, critical: 0, warning: 0 },
    );

    return NextResponse.json(
      { events, summary, generatedAt: new Date().toISOString() },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    console.error("Failed to read security events", error);
    return errorResponse(500, "Unable to load security events");
  }
}
