import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase-admin";
import { errorResponseDetails, HttpError, requireServerActor } from "@/lib/server-auth";

export const runtime = "nodejs";

type RequestedLine = { productId: string; quantity: number; folioType?: "food_beverage" | "service" };
type PaymentMethod = "momo" | "card" | "cash";

interface PrescriptionValidation {
  productId: string;
  requiresPrescription: boolean;
  prescriptionId?: string;
  refillsRemaining?: number;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEFAULT_PROPERTY_ID = "default_property";

function parseBody(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpError(400, "Invalid sale request");
  }

  const body = value as Record<string, unknown>;
  const hasRoomCharge = Boolean(body.roomCharge && typeof body.roomCharge === "object" && !Array.isArray(body.roomCharge));
  if ((!Array.isArray(body.items) || body.items.length > 100) && !hasRoomCharge) {
    throw new HttpError(400, "A sale must contain products or a room charge");
  }
  if (Array.isArray(body.items) && body.items.length === 0 && !hasRoomCharge) {
    throw new HttpError(400, "A sale must contain at least one line item");
  }

  const combined = new Map<string, number>();
  for (const rawLine of (Array.isArray(body.items) ? body.items : [])) {
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
  if (paymentMethod !== "momo" && paymentMethod !== "card" && paymentMethod !== "cash") {
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

  const amountPaid = body.amountPaid === undefined ? undefined : body.amountPaid;
  if (amountPaid !== undefined && (typeof amountPaid !== "number" || !Number.isFinite(amountPaid) || amountPaid < 0 || amountPaid > 1_000_000_000)) {
    throw new HttpError(400, "Invalid amount paid");
  }

  const roomCharge = hasRoomCharge ? body.roomCharge as Record<string, unknown> : undefined;
  let parsedRoomCharge: { description: string; quantity: number; unitPrice: number } | undefined;
  if (roomCharge) {
    if (typeof roomCharge.description !== "string" || !roomCharge.description.trim() || roomCharge.description.length > 160 || typeof roomCharge.quantity !== "number" || !Number.isSafeInteger(roomCharge.quantity) || roomCharge.quantity <= 0 || typeof roomCharge.unitPrice !== "number" || !Number.isFinite(roomCharge.unitPrice) || roomCharge.unitPrice < 0) {
      throw new HttpError(400, "Invalid room charge");
    }
    parsedRoomCharge = { description: roomCharge.description.trim(), quantity: roomCharge.quantity, unitPrice: roomCharge.unitPrice };
  }

  const hotelContext = body.hotelContext && typeof body.hotelContext === "object" && !Array.isArray(body.hotelContext)
    ? body.hotelContext as Record<string, unknown>
    : undefined;
  if (
    hotelContext && (
      typeof hotelContext.propertyId !== "string" ||
      !hotelContext.propertyId.trim() ||
      typeof hotelContext.reservationId !== "string" ||
      !hotelContext.reservationId.trim() ||
      typeof hotelContext.guestId !== "string" ||
      !hotelContext.guestId.trim() ||
      typeof hotelContext.roomNumber !== "string" ||
      !hotelContext.roomNumber.trim() ||
      (hotelContext.roomId !== undefined && typeof hotelContext.roomId !== "string")
    )
  ) {
    throw new HttpError(400, "Invalid hotel folio context");
  }

  return {
    items: Array.from(combined, ([productId, quantity]): RequestedLine => ({ productId, quantity })),
    propertyId: typeof body.propertyId === "string" && body.propertyId.trim() ? body.propertyId.trim().slice(0, 128) : undefined,
    paymentMethod: paymentMethod as PaymentMethod,
    shiftId: body.shiftId,
    idempotencyKey: body.idempotencyKey,
    customerName: customerName || "Walk-in Customer",
    reference: reference || `POS-${body.idempotencyKey.slice(0, 8).toUpperCase()}`,
    discountAmount,
    amountPaid: amountPaid === undefined ? undefined : Number(amountPaid),
    roomCharge: parsedRoomCharge,
    hotelContext: hotelContext ? {
      propertyId: (hotelContext.propertyId as string).trim(),
      reservationId: (hotelContext.reservationId as string).trim(),
      guestId: (hotelContext.guestId as string).trim(),
      roomNumber: (hotelContext.roomNumber as string).trim(),
      roomId: typeof hotelContext.roomId === "string" && hotelContext.roomId.trim() ? hotelContext.roomId.trim() : undefined,
      checkout: hotelContext.checkout === true,
    } : undefined,
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
    const folioRefs = [
      ...input.items.map((_, index) => db.collection("hotelFolioItems").doc(`${input.idempotencyKey}-folio-${index + 1}`)),
      ...(input.roomCharge ? [db.collection("hotelFolioItems").doc(`${input.idempotencyKey}-folio-room`)] : []),
      db.collection("hotelFolioItems").doc(`${input.idempotencyKey}-folio-tax`),
    ];
    const reservationRef = input.hotelContext?.reservationId ? db.collection("hotelReservations").doc(input.hotelContext.reservationId) : null;
    const roomRef = input.hotelContext?.roomId ? db.collection("hotelRooms").doc(input.hotelContext.roomId) : null;
    const relatedHotelRefs = [reservationRef, roomRef].filter(
      (ref): ref is Exclude<typeof ref, null> => ref !== null,
    );

    const result = await db.runTransaction(async (transaction) => {
      const snapshots = await transaction.getAll(invoiceRef, shiftRef, profileRef, ...productRefs, ...relatedHotelRefs);
      const [existingInvoice, shiftSnap, profileSnap] = snapshots;
      const productStartIndex = 3;
      const productEndIndex = productStartIndex + productRefs.length;
      const productSnaps = snapshots.slice(productStartIndex, productEndIndex);
      const reservationSnap = reservationRef ? snapshots[productEndIndex] : undefined;
      const roomSnap = roomRef
        ? snapshots[productEndIndex + (reservationRef ? 1 : 0)]
        : undefined;

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
          amountPaid: existing.amountPaid ?? existing.amount ?? 0,
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

      const isSuperAdmin = String(actor.role) === "super_admin";
      const activePropertyId = isSuperAdmin
        ? input.propertyId || input.hotelContext?.propertyId
        : actor.propertyId || input.hotelContext?.propertyId || input.propertyId;
      if (!isSuperAdmin && actor.propertyId && input.propertyId && input.propertyId !== actor.propertyId) {
        throw new HttpError(403, "The selected property is outside your account scope");
      }
      if (!isSuperAdmin && actor.propertyId && input.hotelContext?.propertyId && input.hotelContext.propertyId !== actor.propertyId) {
        throw new HttpError(403, "The selected hotel property is outside your account scope");
      }
      if (shift?.propertyId && activePropertyId && String(shift.propertyId) !== activePropertyId) {
        throw new HttpError(403, "The selected shift belongs to a different property");
      }

      let salePropertyId = activePropertyId || undefined;
      if (input.hotelContext) {
        if (salePropertyId && input.hotelContext.propertyId !== salePropertyId) {
          throw new HttpError(403, "The hotel folio belongs to a different property");
        }
        salePropertyId = input.hotelContext.propertyId;

        const reservation = reservationSnap?.data();
        if (!reservationSnap?.exists || !reservation) {
          throw new HttpError(404, "The selected hotel reservation was not found");
        }
        if (
          reservation.businessId !== actor.businessId ||
          reservation.propertyId !== input.hotelContext.propertyId ||
          reservation.guestId !== input.hotelContext.guestId ||
          reservation.roomNumber !== input.hotelContext.roomNumber ||
          (typeof reservation.roomId === "string" && input.hotelContext.roomId && reservation.roomId !== input.hotelContext.roomId)
        ) {
          throw new HttpError(403, "The selected reservation is outside your account or property scope");
        }
        if (reservation.status !== "checked_in") {
          throw new HttpError(409, "Hotel folio charges require a checked-in reservation");
        }

        if (roomRef) {
          const room = roomSnap?.data();
          if (
            !roomSnap?.exists ||
            !room ||
            room.businessId !== actor.businessId ||
            room.propertyId !== input.hotelContext.propertyId ||
            room.roomNumber !== input.hotelContext.roomNumber ||
            (typeof reservation.roomId === "string" && reservation.roomId !== roomRef.id)
          ) {
            throw new HttpError(403, "The selected room is outside the reservation scope");
          }
        }
        if (input.hotelContext.checkout && !roomRef) {
          throw new HttpError(400, "Checkout requires a room assignment");
        }
      }
      let lineTotalCents = 0;
      const canonicalItems: Array<{ productId: string; productName: string; quantity: number; unitPrice: number; previousStockQty: number; folioType?: "room_charge" | "food_beverage" | "service"; isRoomCharge: boolean }> = productSnaps.map((productSnap, index) => {
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
        const productPropertyId = String(product.propertyId || DEFAULT_PROPERTY_ID);
        if (salePropertyId && productPropertyId !== salePropertyId) {
          throw new HttpError(403, `The product ${product.name} belongs to a different property`);
        }
        if (!salePropertyId && product.propertyId) salePropertyId = productPropertyId;
        if (product.stockQty < requested.quantity) {
          throw new HttpError(409, `Not enough stock for ${product.name}`);
        }

        // Prescription validation for pharmacy products
        if (product?.isPrescriptionRequired === true) {
          throw new HttpError(400, `${product.name} requires a valid prescription. Please provide a prescription ID.`);
        }

        lineTotalCents += toCents(product.price) * requested.quantity;
        return {
          productId: productSnap.id,
          productName: product.name,
          quantity: requested.quantity,
          unitPrice: product.price,
          previousStockQty: product.stockQty,
          folioType: requested.folioType,
          isRoomCharge: false,
        };
      });

      if (input.roomCharge) {
        if (!input.hotelContext) throw new HttpError(400, "Room charges require a hotel folio context");
        canonicalItems.push({
          productId: `hotel-room-charge:${input.hotelContext.reservationId}`,
          productName: input.roomCharge.description,
          quantity: input.roomCharge.quantity,
          unitPrice: input.roomCharge.unitPrice,
          previousStockQty: 0,
          folioType: "room_charge",
          isRoomCharge: true,
        });
        lineTotalCents += toCents(input.roomCharge.unitPrice) * input.roomCharge.quantity;
      }

      const discountCents = toCents(input.discountAmount);
      if (discountCents > lineTotalCents) {
        throw new HttpError(400, "Discount cannot exceed the sale total");
      }

      const profile = profileSnap.exists ? profileSnap.data() : {};
      if (input.hotelContext && !isSuperAdmin && profile?.businessType !== "hotel") {
        throw new HttpError(403, "Hotel folio charges are available only for Hotel businesses");
      }
      if (input.hotelContext && input.hotelContext.propertyId !== profile?.propertyId && !isSuperAdmin) {
        throw new HttpError(403, "The selected room belongs to a different property");
      }
      if (input.discountAmount > 0 && actor.role === "salesperson" && profile?.allowStaffDiscounts !== true) {
        throw new HttpError(403, "Discounts are disabled for salesperson accounts. Ask the business owner to enable them in Settings.");
      }

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
      const requestedPaidCents = toCents(input.amountPaid === undefined ? amount : input.amountPaid);
      if (requestedPaidCents > amountCents) throw new HttpError(400, "Amount paid cannot exceed the sale total");
      if (input.hotelContext?.checkout && requestedPaidCents < amountCents) throw new HttpError(400, "Checkout requires the current folio charge to be settled");
      const paidAmount = fromCents(requestedPaidCents);
      const isPaid = requestedPaidCents >= amountCents;
      const now = FieldValue.serverTimestamp();
      const publicItems = canonicalItems.map(({ previousStockQty: _previousStockQty, isRoomCharge: _isRoomCharge, ...item }) => item);

      transaction.create(invoiceRef, {
        source: "pos",
        shiftId: shiftRef.id,
        userId: actor.uid,
        businessId: actor.businessId,
        clientId: input.hotelContext?.guestId || "walk-in",
        clientName: input.customerName,
        items: publicItems,
        subtotal,
        taxAmount,
        taxRate,
        taxInclusive,
        discountAmount,
        amount,
        amountPaid: paidAmount,
        status: isPaid ? "paid" : "pending",
        paymentMethod: input.paymentMethod,
        issuedAt: now,
        dueAt: isPaid ? null : now,
        ...(isPaid ? { paidAt: now } : {}),
        createdAt: now,
          ...(salePropertyId ? { propertyId: salePropertyId } : {}),
          ...(input.hotelContext ? { reservationId: input.hotelContext.reservationId, roomNumber: input.hotelContext.roomNumber, sourceModule: "hotel_room_pos" } : {}),
      });

      if (requestedPaidCents > 0) {
        transaction.create(paymentRef, {
          source: "pos",
          shiftId: shiftRef.id,
          userId: actor.uid,
          businessId: actor.businessId,
          clientId: input.hotelContext?.guestId || "walk-in",
          clientName: input.customerName,
          invoiceId: invoiceRef.id,
          method: input.paymentMethod,
          reference: input.reference,
          amount: paidAmount,
          status: "success",
          createdAt: now,
          ...(salePropertyId ? { propertyId: salePropertyId } : {}),
          ...(input.hotelContext ? { reservationId: input.hotelContext.reservationId } : {}),
        });
      }

      const paymentBreakdown = {
        ...(shift?.paymentBreakdown ?? {}),
        [input.paymentMethod]: Number(shift?.paymentBreakdown?.[input.paymentMethod] ?? 0) + paidAmount,
      };
      transaction.update(shiftRef, {
        totalSales: Number(shift?.totalSales ?? 0) + paidAmount,
        paymentBreakdown,
      });

      canonicalItems.forEach((item, index) => {
        if (item.isRoomCharge) return;
        const nextStockQty = item.previousStockQty - item.quantity;
        if (nextStockQty <= 0 && profile?.autoDeleteOutOfStock) {
          transaction.delete(productRefs[index]);
        } else {
          transaction.update(productRefs[index], { stockQty: nextStockQty });
        }
        transaction.create(movementRefs[index], {
          businessId: actor.businessId,
          ...(salePropertyId ? { propertyId: salePropertyId } : {}),
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

      if (input.hotelContext) {
        const folioLineItems = canonicalItems.map((item, index) => ({
          ref: item.isRoomCharge ? db.collection("hotelFolioItems").doc(`${input.idempotencyKey}-folio-room`) : folioRefs[index],
          item,
        }));
        folioLineItems.forEach(({ ref, item }) => transaction.create(ref, {
          businessId: actor.businessId,
          propertyId: input.hotelContext!.propertyId,
          reservationId: input.hotelContext!.reservationId,
          guestId: input.hotelContext!.guestId,
          roomNumber: input.hotelContext!.roomNumber,
          type: item.isRoomCharge ? "room_charge" : (item.folioType || "service"),
          payerType: "primary",
          description: item.productName,
          amount: fromCents(toCents(item.unitPrice) * item.quantity),
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          invoiceId: invoiceRef.id,
          postedBy: actor.uid,
          createdAt: now,
        }));
        if (taxAmount > 0) transaction.create(db.collection("hotelFolioItems").doc(`${input.idempotencyKey}-folio-tax`), {
          businessId: actor.businessId,
          propertyId: input.hotelContext.propertyId,
          reservationId: input.hotelContext.reservationId,
          guestId: input.hotelContext.guestId,
          roomNumber: input.hotelContext.roomNumber,
          type: "tax",
          payerType: "primary",
          description: `${profile?.taxLabel || "Tax"} (${taxRate}%)`,
          amount: taxAmount,
          invoiceId: invoiceRef.id,
          postedBy: actor.uid,
          createdAt: now,
        });
        if (input.hotelContext.checkout) {
          if (reservationRef) transaction.update(reservationRef, { status: "checked_out", updatedAt: now });
          if (roomRef) transaction.update(roomRef, { occupancyStatus: "vacant", status: "dirty", updatedAt: now });
        }
      }

      return {
        invoiceId: invoiceRef.id,
        amount,
        subtotal,
        taxAmount,
        discountAmount,
        amountPaid: paidAmount,
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
