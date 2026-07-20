import { NextRequest } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";

export type ServerActor = {
  uid: string;
  email: string | null;
  businessId: string;
  role: "owner" | "salesperson";
};

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "HttpError";
  }
}

export async function requireServerActor(request: NextRequest): Promise<ServerActor> {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    throw new HttpError(401, "Authentication required");
  }

  let decoded;
  try {
    decoded = await getAdminAuth().verifyIdToken(authorization.slice(7), true);
  } catch {
    throw new HttpError(401, "Invalid or expired session");
  }

  const indexSnap = await getAdminDb().collection("staffIndex").doc(decoded.uid).get();
  if (!indexSnap.exists) {
    return {
      uid: decoded.uid,
      email: decoded.email ?? null,
      businessId: decoded.uid,
      role: "owner",
    };
  }

  const index = indexSnap.data();
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
  };
}

export function errorResponseDetails(error: unknown) {
  if (error instanceof HttpError) {
    return { status: error.status, message: error.message };
  }

  console.error("Protected API error", error);
  return { status: 500, message: "Internal server error" };
}
