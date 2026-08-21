import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase-admin";
import { errorResponseDetails, HttpError, requireServerActor } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KEY_PATTERN = /^[0-9a-f-]{8,128}$/i;

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
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new HttpError(400, "Invalid payment request");
    const input = body as Record<string, unknown>;
    const businessId = textOr(input.businessId, "", 160);
    const idempotencyKey = textOr(input.idempotencyKey, "", 128);
    const invoiceId = textOr(input.invoiceId, "", 160);
    const amount = input.amount;
    const method = textOr(input.method, "", 20);
    if (!businessId || businessId !== actor.businessId) throw new HttpError(403, "Business context does not match the signed-in account");
    if (!idempotencyKey || !KEY_PATTERN.test(idempotencyKey)) throw new HttpError(400, "Invalid payment identifier");
    if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0 || amount > 1_000_000_000) throw new HttpError(400, "Invalid payment amount");
    if (method !== "cash" && method !== "momo" && method !== "card") throw new HttpError(400, "Unsupported payment method");

    const firestore = getAdminDb();
    const paymentRef = firestore.collection("payments").doc(`offline-${idempotencyKey}`);
    const invoiceRef = invoiceId ? firestore.collection("invoices").doc(invoiceId) : null;
    const result = await firestore.runTransaction(async (transaction) => {
      const existingPayment = await transaction.get(paymentRef);
      if (existingPayment.exists) {
        const existing = existingPayment.data() || {};
        if (existing.businessId !== actor.businessId || (invoiceId && existing.invoiceId !== invoiceId)) {
          throw new HttpError(409, "Payment identifier is already in use");
        }
        return { paymentId: existingPayment.id, duplicate: true, amount: existing.amount || amount };
      }

      const invoiceSnapshot = invoiceRef ? await transaction.get(invoiceRef) : null;
      const invoice = invoiceSnapshot?.data() || {};
      if (invoiceId) {
        if (!invoiceSnapshot?.exists) throw new HttpError(409, "The linked invoice no longer exists");
        if (invoice.businessId !== actor.businessId) throw new HttpError(403, "The linked invoice belongs to another business");
        const currentPaid = typeof invoice.amountPaid === "number" ? invoice.amountPaid : 0;
        const invoiceTotal = typeof invoice.amount === "number" ? invoice.amount : 0;
        if (currentPaid + amount > invoiceTotal + 0.01) throw new HttpError(409, "Payment exceeds the remaining invoice balance");
        const newAmountPaid = currentPaid + amount;
        const fullyPaid = newAmountPaid >= invoiceTotal - 0.01;
        transaction.update(invoiceRef!, {
          amountPaid: newAmountPaid,
          status: fullyPaid ? "paid" : "pending",
          ...(fullyPaid ? { paidAt: FieldValue.serverTimestamp() } : {}),
        });
      }

      transaction.set(paymentRef, {
        userId: actor.uid,
        businessId: actor.businessId,
        clientId: textOr(invoice.clientId, textOr(input.clientId, "", 160), 160),
        clientName: textOr(invoice.clientName, textOr(input.clientName, "Walk-in Customer", 180), 180),
        ...(invoiceId ? { invoiceId } : {}),
        method,
        reference: textOr(input.reference, `OFFLINE-${idempotencyKey.slice(0, 8).toUpperCase()}`, 200),
        amount,
        status: "success",
        isOffline: true,
        idempotencyKey,
        createdAt: FieldValue.serverTimestamp(),
      });
      return { paymentId: paymentRef.id, duplicate: false, amount };
    });
    return NextResponse.json({ ok: true, ...result }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const details = errorResponseDetails(error);
    return fail(details.status, details.message);
  }
}
