import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase-admin";
import { errorResponseDetails, HttpError, requireServerActor } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KEY_PATTERN = /^[0-9a-f-]{8,128}$/i;

type RequestedItem = { productId: string; quantity: number; productName?: string; unitPrice?: number };

function fail(status: number, error: string) {
  return NextResponse.json({ error }, { status, headers: { "cache-control": "no-store" } });
}

function numberOr(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function textOr(value: unknown, fallback = "", max = 240) {
  return typeof value === "string" ? value.trim().slice(0, max) : fallback;
}

function dateTextOr(value: unknown) {
  if (typeof value === "string") return value.trim().slice(0, 80) || null;
  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
  }
  return null;
}

function parseBody(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new HttpError(400, "Invalid invoice request");
  const body = value as Record<string, unknown>;
  const businessId = textOr(body.businessId, "", 160);
  const idempotencyKey = textOr(body.idempotencyKey, "", 128);
  if (!businessId || !idempotencyKey || !KEY_PATTERN.test(idempotencyKey)) throw new HttpError(400, "Invalid invoice identifier or business context");
  if (body.items !== undefined && (!Array.isArray(body.items) || body.items.length > 100)) throw new HttpError(400, "Invalid invoice items");
  const items: RequestedItem[] = [];
  const combined = new Map<string, RequestedItem>();
  for (const raw of (Array.isArray(body.items) ? body.items : [])) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new HttpError(400, "Invalid invoice item");
    const line = raw as Record<string, unknown>;
    const productId = textOr(line.productId, "", 128);
    const quantity = line.quantity;
    if (!productId || typeof quantity !== "number" || !Number.isSafeInteger(quantity) || quantity <= 0 || quantity > 10_000) throw new HttpError(400, "Each invoice item must have a valid product and quantity");
    const previous = combined.get(productId);
    combined.set(productId, { productId, quantity: (previous?.quantity || 0) + quantity, productName: textOr(line.productName, "", 180), unitPrice: numberOr(line.unitPrice, 0) });
  }
  items.push(...Array.from(combined.values()));
  return { body, businessId, idempotencyKey, items };
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireServerActor(request);
    const input = parseBody(await request.json());
    if (input.businessId !== actor.businessId) throw new HttpError(403, "Business context does not match the signed-in account");
    const firestore = getAdminDb();
    const invoiceRef = firestore.collection("invoices").doc(`offline-${input.idempotencyKey}`);
    const profileRef = firestore.collection("businessProfiles").doc(actor.businessId);
    const productRefs = input.items.map((item) => firestore.collection("products").doc(item.productId));

    const result = await firestore.runTransaction(async (transaction) => {
      const snapshots = await transaction.getAll(invoiceRef, profileRef, ...productRefs);
      const [existingInvoice, profileSnapshot, ...productSnapshots] = snapshots;
      if (existingInvoice.exists) {
        const existing = existingInvoice.data() || {};
        if (existing.businessId !== actor.businessId || existing.source !== "offline") throw new HttpError(409, "Invoice identifier is already in use");
        return { invoiceId: existingInvoice.id, invoiceNumber: existing.invoiceNumber || null, duplicate: true };
      }
      if (!profileSnapshot.exists) throw new HttpError(409, "Business profile not found");

      const canonicalItems = productSnapshots.map((productSnapshot, index) => {
        const requested = input.items[index];
        if (!productSnapshot.exists) throw new HttpError(409, `Product ${requested.productId} no longer exists`);
        const product = productSnapshot.data() || {};
        const stockQty = numberOr(product.stockQty, 0);
        const unitPrice = numberOr(product.price, requested.unitPrice || 0);
        if (product.businessId !== actor.businessId || typeof product.name !== "string" || stockQty < requested.quantity) throw new HttpError(409, `Product ${requested.productName || requested.productId} is no longer available in the requested quantity`);
        return { productId: productSnapshot.id, productName: product.name, quantity: requested.quantity, unitPrice };
      });

      const body = input.body;
      const subtotal = canonicalItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
      const discountAmount = Math.max(0, numberOr(body.discountAmount, 0));
      const taxAmount = Math.max(0, numberOr(body.taxAmount, 0));
      const calculatedAmount = Math.max(0, subtotal - discountAmount + taxAmount);
      const amount = body.amount === undefined ? calculatedAmount : numberOr(body.amount, calculatedAmount);
      if (amount < 0 || discountAmount > subtotal + taxAmount + 0.01) throw new HttpError(400, "Invalid invoice totals");
      const profile = profileSnapshot.data() || {};
      const invoiceNumber = (Number(profile.nextInvoiceNumber) || 0) + 1;
      const amountPaid = Math.max(0, numberOr(body.amountPaid, 0));
      const status = textOr(body.status, amountPaid >= amount ? "paid" : "pending", 32);
      const invoiceData = {
        businessId: actor.businessId,
        userId: actor.uid,
        clientId: textOr(body.clientId, "", 160),
        clientName: textOr(body.clientName, "Walk-in Customer", 180),
        customerAddress: textOr(body.customerAddress, "", 300),
        items: canonicalItems,
        subtotal,
        discountAmount,
        taxAmount,
        amount,
        amountPaid,
        status,
        source: "offline",
        isOffline: true,
        paymentMethod: textOr(body.paymentMethod, "cash", 40),
        notes: textOr(body.notes, "", 500),
        dueDate: body.dueDate !== undefined ? dateTextOr(body.dueDate) : dateTextOr(body.dueAt),
        currency: textOr(body.currency, "GHS", 8),
        invoiceNumber,
        idempotencyKey: input.idempotencyKey,
        createdAt: FieldValue.serverTimestamp(),
      };
      transaction.update(profileRef, { nextInvoiceNumber: invoiceNumber });
      transaction.set(invoiceRef, invoiceData);
      productSnapshots.forEach((productSnapshot, index) => {
        const requested = input.items[index];
        const product = productSnapshot.data() || {};
        const previousStockQty = numberOr(product.stockQty, 0);
        const nextStockQty = previousStockQty - requested.quantity;
        transaction.update(productRefs[index], { stockQty: nextStockQty });
        transaction.set(firestore.collection("stockMovements").doc(`${invoiceRef.id}-${index + 1}`), {
          businessId: actor.businessId,
          productId: productSnapshot.id,
          productName: product.name,
          delta: -requested.quantity,
          resultingQty: nextStockQty,
          source: "sale",
          referenceId: invoiceRef.id,
          referenceLabel: `Offline Invoice · ${invoiceData.clientName}`,
          userId: actor.uid,
          createdAt: FieldValue.serverTimestamp(),
        });
      });
      return { invoiceId: invoiceRef.id, invoiceNumber, duplicate: false };
    });
    return NextResponse.json({ ok: true, ...result }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const details = errorResponseDetails(error);
    return fail(details.status, details.message);
  }
}
