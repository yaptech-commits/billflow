import { NextRequest, NextResponse } from "next/server";
import { verifyServerFirebaseToken } from "@/lib/firebase-admin";
import { getOnboardingPaymentSummary } from "@/lib/onboarding-payment";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

async function authenticate(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) throw new Error("Authentication required");
  return verifyServerFirebaseToken(authorization.slice("Bearer ".length));
}

export async function GET(request: NextRequest) {
  try {
    const user = await authenticate(request);
    const requestedBusinessId = request.nextUrl.searchParams.get("businessId")?.trim() || "";
    const businessId = requestedBusinessId === user.uid || requestedBusinessId === `biz_${user.uid}` ? user.uid : "";
    if (!businessId) return jsonError("Invalid onboarding account.", 403);

    const summary = await getOnboardingPaymentSummary(businessId);
    return NextResponse.json(summary, { headers: { "Cache-Control": "no-store" } });
  } catch (error: any) {
    console.error("Onboarding payment details failed:", error);
    const message = error?.message === "Authentication required" ? error.message : error?.message || "The onboarding plan could not be loaded.";
    return jsonError(message, message === "Authentication required" ? 401 : 400);
  }
}

export async function POST() {
  return jsonError("Use GET to read onboarding plan details.", 405);
}
