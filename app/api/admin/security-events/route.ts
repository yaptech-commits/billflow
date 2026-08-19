import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { errorResponseDetails, requireServerSuperAdmin } from "@/lib/server-auth";
import { timestampToIso } from "@/lib/security-events-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_EVENTS = 50;

function clampLimit(rawLimit: string | null) {
  const parsed = Number(rawLimit || 12);
  if (!Number.isFinite(parsed)) return 12;
  return Math.min(MAX_EVENTS, Math.max(5, Math.floor(parsed)));
}

export async function GET(request: NextRequest) {
  try {
    await requireServerSuperAdmin(request);
    const limit = clampLimit(request.nextUrl.searchParams.get("limit"));
    const snapshot = await getAdminDb()
      .collection("securityEvents")
      .orderBy("createdAt", "desc")
      .limit(limit)
      .get();

    const events = snapshot.docs.map((eventDoc) => {
      const data = eventDoc.data() as Record<string, unknown>;
      return {
        id: eventDoc.id,
        category: data.category === "system_alert" ? "system_alert" : "security_event",
        eventType: String(data.eventType || "admin_action"),
        severity: ["critical", "high", "medium", "low", "info"].includes(String(data.severity))
          ? String(data.severity)
          : "info",
        title: String(data.title || "System event"),
        message: String(data.message || "No additional event details were recorded."),
        actorEmail: typeof data.actorEmail === "string" ? data.actorEmail : null,
        businessId: typeof data.businessId === "string" ? data.businessId : null,
        route: typeof data.route === "string" ? data.route : null,
        createdAt: timestampToIso(data.createdAt),
      };
    });

    const summary = events.reduce(
      (counts, event) => {
        counts.total += 1;
        if (event.category === "security_event") counts.securityEvents += 1;
        if (event.category === "system_alert") counts.systemAlerts += 1;
        if (event.severity === "critical") counts.critical += 1;
        if (event.severity === "high") counts.high += 1;
        if (event.severity === "medium") counts.medium += 1;
        return counts;
      },
      { total: 0, securityEvents: 0, systemAlerts: 0, critical: 0, high: 0, medium: 0 },
    );

    return NextResponse.json({ events, summary, generatedAt: new Date().toISOString() });
  } catch (error) {
    const details = errorResponseDetails(error);
    return NextResponse.json({ error: details.message }, { status: details.status });
  }
}
