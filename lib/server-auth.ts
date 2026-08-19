import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { recordSecurityEvent } from "@/lib/security-events-server";
import type { NextRequest } from "next/server";

export type ServerActor = {
  uid: string;
  email: string | null;
  businessId: string;
  role: "owner" | "salesperson" | "super_admin";
  propertyId?: string | null;
};

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "HttpError";
  }
}

type DecodedServerToken = {
  uid: string;
  email?: string;
  role?: string;
  super_admin?: boolean;
  admin?: boolean;
};

function configuredSuperAdminEmails() {
  return new Set(
    (process.env.SUPER_ADMIN_EMAILS || process.env.SUPER_ADMIN_EMAIL || "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

function hasSuperAdminClaim(decoded: DecodedServerToken) {
  const email = String(decoded.email || "").trim().toLowerCase();
  return decoded.role === "super_admin"
    || decoded.super_admin === true
    || decoded.admin === true
    || (email.length > 0 && configuredSuperAdminEmails().has(email));
}

async function decodeRequestToken(request: NextRequest): Promise<DecodedServerToken> {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    void recordSecurityEvent({
      category: "security_event",
      eventType: "invalid_session",
      severity: "medium",
      title: "Unauthenticated API request",
      message: "A protected API route was requested without a Firebase bearer token.",
      route: request.nextUrl.pathname,
      metadata: { method: request.method },
    });
    throw new HttpError(401, "Authentication required");
  }

  try {
    return await getAdminAuth().verifyIdToken(authorization.slice("Bearer ".length), true) as DecodedServerToken;
  } catch {
    void recordSecurityEvent({
      category: "security_event",
      eventType: "invalid_session",
      severity: "high",
      title: "Invalid or expired session",
      message: "A protected API route received an invalid or expired Firebase session token.",
      route: request.nextUrl.pathname,
      metadata: { method: request.method },
    });
    throw new HttpError(401, "Invalid or expired session");
  }
}

export async function requireServerActor(request: NextRequest): Promise<ServerActor> {
  const decoded = await decodeRequestToken(request);
  const db = getAdminDb();

  if (hasSuperAdminClaim(decoded)) {
    return {
      uid: decoded.uid,
      email: decoded.email ?? null,
      businessId: "SUPER_ADMIN",
      role: "super_admin",
      propertyId: null,
    };
  }

  const indexSnap = await db.collection("staffIndex").doc(decoded.uid).get();
  if (!indexSnap.exists) {
    const profileSnap = await db.collection("businessProfiles").doc(decoded.uid).get();
    const profile = profileSnap.data() as Record<string, any> | undefined;
    if (profile?.status === "suspended") {
      throw new HttpError(403, "Your account has been suspended");
    }
    if (profile?.status === "pending") {
      throw new HttpError(403, "Your account is pending approval");
    }
    return {
      uid: decoded.uid,
      email: decoded.email ?? null,
      businessId: decoded.uid,
      role: "owner",
      propertyId: typeof profile?.propertyId === "string" ? profile.propertyId : null,
    };
  }

  const index = indexSnap.data() as Record<string, any> | undefined;
  if (
    index?.status !== "active" ||
    index?.role !== "salesperson" ||
    typeof index?.businessId !== "string" ||
    !index.businessId
  ) {
    throw new HttpError(403, "This staff account is not active");
  }

  return {
    uid: decoded.uid,
    email: decoded.email ?? null,
    businessId: index.businessId,
    role: "salesperson",
    propertyId: typeof index.propertyId === "string" ? index.propertyId : null,
  };
}

export async function requireServerSuperAdmin(request: NextRequest): Promise<ServerActor> {
  const actor = await requireServerActor(request);
  if (actor.role !== "super_admin") {
    void recordSecurityEvent({
      category: "security_event",
      eventType: "unauthorized_api_attempt",
      severity: "high",
      title: "Unauthorized super-admin API attempt",
      message: `${actor.role} attempted to access a super-admin-only API route.`,
      actorUid: actor.uid,
      actorEmail: actor.email,
      businessId: actor.businessId,
      propertyId: actor.propertyId,
      route: request.nextUrl.pathname,
      metadata: { method: request.method, role: actor.role },
    });
    throw new HttpError(403, "Super-admin access required");
  }
  return actor;
}

export function errorResponseDetails(error: unknown) {
  if (error instanceof HttpError) {
    return { status: error.status, message: error.message };
  }

  console.error("Protected API error", error);
  return { status: 500, message: "Internal server error" };
}
