import { NextRequest, NextResponse } from "next/server";
import { verifyServerFirebaseToken } from "@/lib/firebase-admin";
import { dispatchSchoolNotification, SchoolNotificationDispatchPayload } from "@/lib/school-notification-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  let payload: SchoolNotificationDispatchPayload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid notification payload" }, { status: 400 });
  }

  if (!payload?.notificationId || !payload.businessId || !payload.propertyId || !payload.studentId || !payload.title || !payload.message) {
    return NextResponse.json({ error: "Missing required notification fields" }, { status: 400 });
  }

  const result = await dispatchSchoolNotification(payload);
  return NextResponse.json(result);
}
