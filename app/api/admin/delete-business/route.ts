import { NextRequest, NextResponse } from "next/server";

import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SUPER_ADMIN_EMAIL = "wisdomasaare41@gmail.com";

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

/**
 * Permanently removes one tenant. This deliberately discovers every current
 * top-level collection instead of relying on a short hard-coded list, so new
 * business-scoped collections cannot silently retain a deleted account.
 */
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

  const isSuperAdmin = normalize(decoded.email) === SUPER_ADMIN_EMAIL;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "A valid JSON request body is required");
  }

  const requestedBusinessId = stringValue(body.businessId);
  if (!requestedBusinessId) return errorResponse(400, "Business ID is required");

  const firestore = getAdminDb();
  const adminAuth = getAdminAuth();
  const ownerIdCandidate = requestedBusinessId.startsWith("biz_")
    ? requestedBusinessId.slice(4)
    : requestedBusinessId;
  const directRefs = [
    firestore.collection("businessProfiles").doc(requestedBusinessId),
    firestore.collection("businessProfiles").doc(ownerIdCandidate),
    firestore.collection("businesses").doc(requestedBusinessId),
    firestore.collection("businesses").doc(`biz_${ownerIdCandidate}`),
  ];

  const directSnapshots = await Promise.all(directRefs.map((ref) => ref.get()));
  const directData = directSnapshots
    .filter((snapshot) => snapshot.exists)
    .map((snapshot) => snapshot.data() || {});
  if (directData.length === 0) {
    return errorResponse(404, "Business account not found");
  }

  const ownerUid = directData
    .map((data) => stringValue(data.ownerUid))
    .find(Boolean) || ownerIdCandidate;
  const ownerEmail = directData
    .map((data) => stringValue(data.email) || stringValue(data.ownerEmail))
    .find(Boolean) || "";
  const ownerBusinessName = directData
    .map((data) => stringValue(data.businessName))
    .find(Boolean) || "";

  if (
    requestedBusinessId === "SUPER_ADMIN"
    || ownerUid === decoded.uid && isSuperAdmin
    || normalize(ownerEmail) === SUPER_ADMIN_EMAIL
  ) {
    return errorResponse(400, "The Super Admin account cannot be deleted");
  }

  const isOwnerDeletingSelf = ownerUid === decoded.uid
    && (requestedBusinessId === ownerUid || requestedBusinessId === `biz_${ownerUid}`);
  if (!isSuperAdmin && !isOwnerDeletingSelf) {
    return errorResponse(403, "Only the account owner or Super Admin can permanently delete this business");
  }

  const businessIds = Array.from(new Set([
    requestedBusinessId,
    ownerIdCandidate,
    `biz_${ownerUid}`,
    ...directData.map((data) => stringValue(data.businessId)),
  ].filter(Boolean)));

  const references = new Map<string, FirebaseFirestore.DocumentReference>();
  const authUids = new Set<string>([ownerUid]);
  const collections = await firestore.listCollections();

  const addSnapshotReferences = (
    collectionName: string,
    snapshots: FirebaseFirestore.QuerySnapshot,
  ) => {
    snapshots.docs.forEach((snapshot) => {
      references.set(snapshot.ref.path, snapshot.ref);
      const data = snapshot.data();
      if (collectionName === "staff" && stringValue(data.staffUid)) {
        authUids.add(stringValue(data.staffUid));
      }
      if (collectionName === "staffIndex" && snapshot.id !== ownerUid) {
        authUids.add(snapshot.id);
      }
    });
  };

  for (const collection of collections) {
    const [businessSnapshot, ownerSnapshot] = await Promise.all([
      collection.where("businessId", "in", businessIds).get(),
      collection.where("ownerUid", "==", ownerUid).get(),
    ]);
    addSnapshotReferences(collection.id, businessSnapshot);
    addSnapshotReferences(collection.id, ownerSnapshot);
  }

  directRefs.forEach((ref) => references.set(ref.path, ref));

  // There may be staff records that have a staffIndex entry but no staffUid
  // field. Include those index documents by their document ID, while keeping
  // shared staff accounts alive if they belong to another business as well.
  const staffToCheck = Array.from(authUids).filter((uid) => uid && uid !== ownerUid);
  const sharedStaffUids = new Set<string>();
  for (const staffUid of staffToCheck) {
    const staffRecords = await firestore.collection("staff")
      .where("staffUid", "==", staffUid)
      .get();
    const belongsElsewhere = staffRecords.docs.some((snapshot) => {
      const recordBusinessId = stringValue(snapshot.data().businessId);
      return recordBusinessId && !businessIds.includes(recordBusinessId);
    });
    if (belongsElsewhere) sharedStaffUids.add(staffUid);
  }

  const authUidsToDelete = Array.from(authUids).filter((uid) => (
    uid
    && uid !== decoded.uid
    && !sharedStaffUids.has(uid)
  ));

  try {
    const bulkWriter = firestore.bulkWriter();
    await Promise.all(
      Array.from(references.values()).map((reference) => (
        firestore.recursiveDelete(reference, bulkWriter)
      )),
    );
    await bulkWriter.close();

    const authDeletionResults = await Promise.allSettled(
      authUidsToDelete.map((uid) => adminAuth.deleteUser(uid)),
    );
    const authFailures = authDeletionResults.filter((result) => (
      result.status === "rejected" && !isUserNotFound(result.reason)
    ));
    if (authFailures.length > 0) {
      throw new Error(`Firestore data was deleted, but ${authFailures.length} linked authentication account(s) could not be removed`);
    }

    const remaining = new Set<string>();
    for (const collection of collections) {
      const snapshot = await collection.where("businessId", "in", businessIds).get();
      snapshot.docs.forEach((doc) => remaining.add(doc.ref.path));
    }
    const remainingDirectSnapshots = await Promise.all(directRefs.map((ref) => ref.get()));
    remainingDirectSnapshots.forEach((snapshot) => {
      if (snapshot.exists) remaining.add(snapshot.ref.path);
    });

    if (remaining.size > 0) {
      throw new Error(`${remaining.size} tenant record(s) still remain after deletion`);
    }

    return NextResponse.json(
      {
        ok: true,
        businessId: requestedBusinessId,
        businessName: ownerBusinessName || null,
        deletedDocuments: references.size,
        deletedAuthenticationAccounts: authUidsToDelete.length,
        preservedSharedStaffAccounts: sharedStaffUids.size,
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    console.error("Permanent business deletion failed", {
      businessId: requestedBusinessId,
      ownerUid,
      error,
    });
    return errorResponse(
      500,
      error instanceof Error ? error.message : "Permanent deletion failed",
    );
  }
}
