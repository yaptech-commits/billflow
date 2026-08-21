import { NextResponse } from "next/server";

import { getAdminDb } from "@/lib/firebase-admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Public liveness/readiness endpoint. It intentionally exposes only service
 * health booleans and never returns credentials, tenant data, or stack traces.
 */
export async function GET() {
  const checks = {
    firestore: false,
    paymentProviderConfigured: Boolean(process.env.PAYSTACK_SECRET_KEY),
    emailProviderConfigured: Boolean(process.env.RESEND_API_KEY),
  };

  try {
    await getAdminDb().collection("businessProfiles").limit(1).get();
    checks.firestore = true;
  } catch (error) {
    console.error("BillFlow health check failed:", error);
  }

  const ready = checks.firestore;
  return NextResponse.json(
    {
      status: ready ? "ok" : "degraded",
      service: "billflow",
      version: process.env.VERCEL_GIT_COMMIT_SHA || process.env.npm_package_version || "unknown",
      checks,
      timestamp: new Date().toISOString(),
    },
    { status: ready ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
