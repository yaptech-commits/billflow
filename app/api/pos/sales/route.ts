import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase-admin";
import { errorResponseDetails, HttpError, requireServerActor } from "@/lib/server-auth";

export const runtime = "nodejs";

type RequestedLine = { productId: string; quantity: number };
type PaymentMethod = "momo" | "card";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseBody(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpError(400, "Invalid sale request");
  }

  const body = value as Record<string, unknown>;
  if (!Array.isArray(body.items) || body.items.length === 0 || body.items.length > 100) {
    throw new HttpError(400, "A sale must contain between 1 and 100 products");
  }

  const combined = new Map<string, number>();
  for (const rawLine of body.items) {
    if (!rawLine || typeof rawLine !== "object" || Array.isArray(rawLine)) {
      throw new HttpError(400, "Invalid sale item");
    }
    const line = rawLine as Record<string, unknown>;
    if (
      typeof line.productId !== "string" ||
      !line.productId ||
      line.productId.length > 128 ||
      typeof line.quantity !== "number" ||
      !Number.isSafeInteger(line.quantity) ||
      line.quantity <= 0 ||
      line.quantity > 10_000
    ) {
      throw new HttpError(400, "Each sale item must have a valid product and quantity");
    }
    combined.set(line.productId, (combined.get(line.productId) ?? 0) + line.quantity);
  }

  const paymentMethod = body.paymentMethod;
  if (paymentMethod !== "momo" && paymentMethod !== "card") {
    throw new HttpError(400, "Unsupported payment method");
  }

  if (typeof body.shiftId !== "string" || !body.shiftId || body.shiftId.length > 128) {
    throw new HttpError(400, "An active shift is required");
  }

  if (typeof body.idempotencyKey !== "string" || !UUID_PATTERN.test(body.idempotencyKey)) {
    throw new HttpError(400, "Invalid sale identifier");
  }

  const customerName = typeof body.customerName === "string"
    ? body.customerName.trim().slice(0, 120)
    : "";
  const reference = typeof body.reference === "string"
    ? body.reference.trim().slice(0, 200)
    : "";
  const discountAmount = body.discountAmount === undefined ? 0 : body.discountAmount;
  if (
    typeof discountAmount !== "number" ||
    !Number.isFinite(discountAmount) ||
    discountAmount < 0 ||
    discountAmount > 1_000_000_000
  ) {
    throw new HttpError(400, "Invalid discount amount");
  }

  return {
    items: Array.from(combined, ([productId, quantity]): RequestedLine => ({ productId, quantity })),
    paymentMethod: paymentMethod as PaymentMethod,
    shiftId: body.shiftId,
    idempotencyKey: body.idempotencyKey,
    customerName: customerName || "Walk-in Customer",
    reference: reference || `POS-${body.idempotencyKey.slice(0, 8).toUpperCase()}`,
    discountAmount,
  };
}

const toCents = (amount: number) => Math.round(amount * 100);
const fromCents = (amount: number) => amount / 100;

export async function POST(request: NextRequest) {
  try {
    const actor = await requireServerActor(request);
    const input = parseBody(await request.json());
    const db = getAdminDb();

    const invoiceRef = db.collection("invoices").doc(input.idempotencyKey);
    const paymentRef = db.collection("payments").doc(input.idempotencyKey);
    const shiftRef = db.collection("shifts").doc(input.shiftId);
    const profileRef = db.collection("businessProfiles").doc(actor.businessId);
    const productRefs = input.items.map((line) => db.collection("products").doc(line.productId));
    const movementRefs = input.items.map((_, index) =>
      db.collection("stockMovements").doc(`${input.idempotencyKey}-${index + 1}`)
    );

    const result = await db.runTransaction(async (transaction) => {
      const snapshots = await transaction.getAll(invoiceRef, shiftRef, profileRef, ...productRefs);
      const [existingInvoice, shiftSnap, profileSnap, ...productSnaps] = snapshots;

      if (existingInvoice.exists) {
        const existing = existingInvoice.data();
        if (
          existing?.source !== "pos" ||
          existing?.userId !== actor.uid ||
          existing?.businessId !== actor.businessId
        ) {
          throw new HttpError(409, "Sale identifier is already in use");
        }
        return {
          invoiceId: existingInvoice.id,
          amount: existing.amount,
          subtotal: existing.subtotal,
          taxAmount: existing.taxAmount,
          discountAmount: existing.discountAmount ?? 0,
          items: existing.items ?? [],
          duplicate: true,
        };
      }

      if (!shiftSnap.exists) {
        throw new HttpError(409, "The selected shift no longer exists");
      }
      const shift = shiftSnap.data();
      if (
        shift?.businessId !== actor.businessId ||
        shift?.userId !== actor.uid ||
        shift?.status !== "open"
      ) {
        throw new HttpError(403, "You can only sell during your own active shift");
      }

      let lineTotalCents = 0;
      const canonicalItems = productSnaps.map((productSnap, index) => {
        const requested = input.items[index];
        if (!productSnap.exists) {
          throw new HttpError(409, "A selected product no longer exists");
        }
        const product = productSnap.data();
        if (
          product?.businessId !== actor.businessId ||
          typeof product?.name !== "string" ||
          typeof product?.price !== "number" ||
          !Number.isFinite(product.price) ||
          typeof product?.stockQty !== "number" ||
          !Number.isFinite(product.stockQty)
        ) {
          throw new HttpError(409, "A selected product is invalid");
        }
        if (product.stockQty < requested.quantity) {
          throw new HttpError(409, `Not enough stock for ${product.name}`);
        }

        lineTotalCents += toCents(product.price) * requested.quantity;
        return {
          productId: productSnap.id,
          productName: product.name,
          quantity: requested.quantity,
          unitPrice: product.price,
          previousStockQty: product.stockQty,
        };
      });

      const discountCents = toCents(input.discountAmount);
      if (discountCents > lineTotalCents) {
        throw new HttpError(400, "Discount cannot exceed the sale total");
      }

      const profile = profileSnap.exists ? profileSnap.data() : {};
      const taxRate = typeof profile?.taxRate === "number" && profile.taxRate >= 0 && profile.taxRate <= 100
        ? profile.taxRate
        : 0;
      const taxInclusive = profile?.taxInclusive === true;
      const discountedCents = lineTotalCents - discountCents;
      let subtotalCents: number;
      let taxCents: number;
      let amountCents: number;

      if (taxInclusive) {
        amountCents = discountedCents;
        taxCents = taxRate > 0
          ? Math.round(amountCents - amountCents / (1 + taxRate / 100))
          : 0;
        subtotalCents = amountCents - taxCents;
      } else {
        subtotalCents = discountedCents;
        taxCents = Math.round(subtotalCents * (taxRate / 100));
        amountCents = subtotalCents + taxCents;
      }

      if (amountCents <= 0) {
        throw new HttpError(400, "Sale total must be greater than zero");
      }

      const amount = fromCents(amountCents);
      const subtotal = fromCents(subtotalCents);
      const taxAmount = fromCents(taxCents);
      const discountAmount = fromCents(discountCents);
      const now = FieldValue.serverTimestamp();
      const publicItems = canonicalItems.map(({ previousStockQty: _previousStockQty, ...item }) => item);

      transaction.create(invoiceRef, {
        source: "pos",
        shiftId: shiftRef.id,
        userId: actor.uid,
        businessId: actor.businessId,
        clientId: "walk-in",
        clientName: input.customerName,
        items: publicItems,
        subtotal,
        taxAmount,
        taxRate,
        taxInclusive,
        discountAmount,
        amount,
        amountPaid: amount,
        status: "paid",
        paymentMethod: input.paymentMethod,
        issuedAt: now,
        dueAt: null,
        paidAt: now,
        createdAt: now,
      });

      transaction.create(paymentRef, {
        source: "pos",
        shiftId: shiftRef.id,
        userId: actor.uid,
        businessId: actor.businessId,
        clientId: "walk-in",
        clientName: input.customerName,
        invoiceId: invoiceRef.id,
        method: input.paymentMethod,
        reference: input.reference,
        amount,
        status: "success",
        createdAt: now,
      });

      const paymentBreakdown = {
        ...(shift?.paymentBreakdown ?? {}),
        [input.paymentMethod]: Number(shift?.paymentBreakdown?.[input.paymentMethod] ?? 0) + amount,
      };
      transaction.update(shiftRef, {
        totalSales: Number(shift?.totalSales ?? 0) + amount,
        paymentBreakdown,
      });

      canonicalItems.forEach((item, index) => {
        const nextStockQty = item.previousStockQty - item.quantity;
        transaction.update(productRefs[index], { stockQty: nextStockQty });
        transaction.create(movementRefs[index], {
          businessId: actor.businessId,
          productId: item.productId,
          productName: item.productName,
          delta: -item.quantity,
          resultingQty: nextStockQty,
          source: "sale",
          referenceId: invoiceRef.id,
          referenceLabel: `POS Sale · ${input.customerName}`,
          userId: actor.uid,
          createdAt: now,
        });
      });

      return {
        invoiceId: invoiceRef.id,
        amount,
        subtotal,
        taxAmount,
        discountAmount,
        items: publicItems,
        duplicate: false,
      };
    });

    return NextResponse.json(result, { status: result.duplicate ? 200 : 201 });
  } catch (error) {
    const { status, message } = errorResponseDetails(error);
    return NextResponse.json({ error: message }, { status });
  }
}
