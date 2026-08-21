import { NextRequest, NextResponse } from "next/server";

import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SUPER_ADMIN_EMAIL = "wisdomasaare41@gmail.com";
const DELETE_CONFIRMATION = "PERMANENTLY DELETE";

function errorResponse(status: number, error: string) {
  return NextResponse.json(
    { error },
    { status, headers: { "cache-control": "no-store" } },
  );
}

function normalize(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isUserNotFound(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error
    && (error as { code?: unknown }).code === "auth/user-not-found";
}

export async function POST(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return errorResponse(401, "Authentication required");
  }

  let decoded;
  try {
    decoded = await getAdminAuth().verifyIdToken(authorization.slice(7), true);
  } catch {
    return errorResponse(401, "Invalid or expired session");
  }

  if (normalize(decoded.email) !== SUPER_ADMIN_EMAIL) {
    return errorResponse(403, "Super Admin access required");
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "A valid JSON request body is required");
  }

  const staffId = stringValue(body.staffId);
  const requestedStaffUid = stringValue(body.staffUid);
  const confirmation = stringValue(body.confirmation);
  if (!staffId && !requestedStaffUid) return errorResponse(400, "Staff ID or staff UID is required");
  if (confirmation !== DELETE_CONFIRMATION) {
    return errorResponse(400, `Type ${DELETE_CONFIRMATION} to confirm permanent deletion`);
  }

  const firestore = getAdminDb();
  const adminAuth = getAdminAuth();
  const staffSnapshot = staffId
    ? await firestore.collection("staff").doc(staffId).get()
    : null;
  const staffData = staffSnapshot?.exists ? staffSnapshot.data() || {} : {};
  const staffUid = stringValue(staffData.staffUid) || requestedStaffUid;
  const staffEmail = stringValue(staffData.email);

  if (!staffUid && !staffEmail) return errorResponse(404, "Staff account not found");
  if (staffUid === decoded.uid || normalize(staffEmail) === SUPER_ADMIN_EMAIL) {
    return errorResponse(400, "The Super Admin account cannot be deleted");
  }

  const references = new Map<string, FirebaseFirestore.DocumentReference>();
  const staffRecords = await firestore.collection("staff")
    .where("staffUid", "==", staffUid)
    .get();
  staffRecords.docs.forEach((snapshot) => references.set(snapshot.ref.path, snapshot.ref));
  if (staffSnapshot?.exists) references.set(staffSnapshot.ref.path, staffSnapshot.ref);

  const indexRef = staffUid ? firestore.collection("staffIndex").doc(staffUid) : null;
  if (indexRef) {
    const indexSnapshot = await indexRef.get();
    if (indexSnapshot.exists) references.set(indexRef.path, indexRef);
  }

  try {
    const bulkWriter = firestore.bulkWriter();
    await Promise.all(
      Array.from(references.values()).map((reference) => (
        firestore.recursiveDelete(reference, bulkWriter)
      )),
    );
    await bulkWriter.close();

    if (staffUid) {
      try {
        await adminAuth.deleteUser(staffUid);
      } catch (error) {
        if (!isUserNotFound(error)) {
          throw new Error("Staff records were deleted, but the linked authentication account could not be removed");
        }
      }
    }

    const remainingStaff = staffUid
      ? await firestore.collection("staff").where("staffUid", "==", staffUid).get()
      : { empty: true };
    const remainingIndex = staffUid
      ? await firestore.collection("staffIndex").doc(staffUid).get()
      : { exists: false };

    if (!remainingStaff.empty || remainingIndex.exists) {
      throw new Error("Staff access records still remain after deletion");
    }

    return NextResponse.json(
      {
        ok: true,
        staffId: staffId || null,
        staffUid: staffUid || null,
        staffEmail: staffEmail || null,
        deletedDocuments: references.size,
        deletedAuthenticationAccounts: staffUid ? 1 : 0,
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    console.error("Permanent staff deletion failed", { staffId, staffUid, error });
    return errorResponse(
      500,
      error instanceof Error ? error.message : "Permanent staff deletion failed",
    );
  }
}
