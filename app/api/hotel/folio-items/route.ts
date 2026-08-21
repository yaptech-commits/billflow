import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase-admin";
import { errorResponseDetails, HttpError, requireServerActor } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KEY_PATTERN = /^[0-9a-f-]{8,128}$/i;
const FOLIO_TYPES = new Set(["room_charge", "food_beverage", "service", "tax", "adjustment", "deposit", "payment"]);
const PAYER_TYPES = new Set(["primary", "company", "split_guest"]);

function fail(status: number, error: string) {
  return NextResponse.json({ error }, { status, headers: { "cache-control": "no-store" } });
}

function textOr(value: unknown, fallback = "", max = 240) {
  return typeof value === "string" ? value.trim().slice(0, max) : fallback;
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireServerActor(request);
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new HttpError(400, "Invalid folio request");
    const input = body as Record<string, unknown>;
    const businessId = textOr(input.businessId, "", 160);
    const propertyId = textOr(input.propertyId, "", 160);
    const reservationId = textOr(input.reservationId, "", 160);
    const guestId = textOr(input.guestId, "", 160);
    const roomNumber = textOr(input.roomNumber, "", 80);
    const type = textOr(input.type, "", 40);
    const description = textOr(input.description, "", 300);
    const payerType = textOr(input.payerType, "primary", 30);
    const amount = input.amount;
    const idempotencyKey = textOr(input.idempotencyKey, "", 128);
    if (!businessId || businessId !== actor.businessId) throw new HttpError(403, "Business context does not match the signed-in account");
    if (!propertyId || !reservationId || !guestId || !roomNumber || !description) throw new HttpError(400, "Property, reservation, guest, room, and description are required");
    if (!FOLIO_TYPES.has(type) || !PAYER_TYPES.has(payerType)) throw new HttpError(400, "Unsupported folio type or payer type");
    if (!idempotencyKey || !KEY_PATTERN.test(idempotencyKey)) throw new HttpError(400, "Invalid folio identifier");
    if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0 || amount > 1_000_000_000) throw new HttpError(400, "Invalid folio amount");

    const firestore = getAdminDb();
    const profileRef = firestore.collection("businessProfiles").doc(actor.businessId);
    const reservationRef = firestore.collection("hotelReservations").doc(reservationId);
    const folioRef = firestore.collection("hotelFolioItems").doc(`offline-${idempotencyKey}`);
    const result = await firestore.runTransaction(async (transaction) => {
      const [existingFolio, profileSnapshot, reservationSnapshot] = await transaction.getAll(folioRef, profileRef, reservationRef);
      if (existingFolio.exists) {
        const existing = existingFolio.data() || {};
        if (existing.businessId !== actor.businessId || existing.propertyId !== propertyId) throw new HttpError(409, "Folio identifier is already in use");
        return { folioItemId: existingFolio.id, duplicate: true };
      }
      if (!profileSnapshot.exists || profileSnapshot.data()?.businessType !== "hotel") throw new HttpError(403, "Hotel folios are available only for hotel businesses");
      if (profileSnapshot.data()?.propertyId && profileSnapshot.data()?.propertyId !== propertyId) throw new HttpError(403, "The selected property does not belong to this business");
      if (!reservationSnapshot.exists || reservationSnapshot.data()?.businessId !== actor.businessId || reservationSnapshot.data()?.propertyId !== propertyId) throw new HttpError(409, "The selected reservation is not available for this property");
      transaction.set(folioRef, {
        businessId: actor.businessId,
        propertyId,
        reservationId,
        guestId,
        roomNumber,
        type,
        description,
        amount,
        payerType,
        ...(textOr(input.payerName, "", 180) ? { payerName: textOr(input.payerName, "", 180) } : {}),
        postedBy: actor.uid,
        isVoided: false,
        isOffline: true,
        idempotencyKey,
        postedAt: FieldValue.serverTimestamp(),
      });
      return { folioItemId: folioRef.id, duplicate: false };
    });
    return NextResponse.json({ ok: true, ...result }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const details = errorResponseDetails(error);
    return fail(details.status, details.message);
  }
}
