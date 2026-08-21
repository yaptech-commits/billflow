import { randomBytes } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { errorResponseDetails, HttpError, requireServerActor } from "@/lib/server-auth";
import { recordSecurityEvent } from "@/lib/security-events-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SUPER_ADMIN_EMAIL = "wisdomasaare41@gmail.com";
const ONLINE_SOURCES = new Set([
  "online",
  "ota",
  "direct_widget",
  "booking_com",
  "expedia",
  "airbnb",
  "other",
]);
const BLOCKING_STATUSES = new Set(["pending", "booked", "checked_in"]);

type BookingAction = "approve" | "reject";

type BookingRecord = {
  id: string;
  businessId: string;
  propertyId: string;
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  roomId: string | null;
  roomNumber: string | null;
  roomType: string;
  bookingSource: string;
  bookingSourceLabel: string;
  bookingTime: string | null;
  checkInDate: string | null;
  checkOutDate: string | null;
  status: string;
  approvalStatus: "pending" | "approved" | "rejected";
  confirmationCode: string | null;
  approvedAt: string | null;
  rejectionReason: string | null;
  specialRequests: string;
  confirmationEmailStatus: "pending" | "sent" | "failed" | "queued" | null;
  confirmationEmailSentAt: string | null;
  confirmationEmailError: string | null;
};

function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function timestampToIso(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  if (typeof value === "object" && value !== null && "toDate" in value && typeof (value as { toDate?: unknown }).toDate === "function") {
    const date = (value as { toDate: () => Date }).toDate();
    return date instanceof Date && !Number.isNaN(date.getTime()) ? date.toISOString() : null;
  }
  if (typeof value === "object" && value !== null && "_seconds" in value) {
    const seconds = Number((value as { _seconds?: unknown })._seconds);
    return Number.isFinite(seconds) ? new Date(seconds * 1000).toISOString() : null;
  }
  return null;
}

function approvalStatus(data: Record<string, unknown>): BookingRecord["approvalStatus"] {
  if (data.approvalStatus === "approved" || data.approvalStatus === "rejected") return data.approvalStatus;
  if (data.status === "cancelled") return "rejected";
  if (data.status === "booked" || data.status === "checked_in" || data.status === "checked_out") return "approved";
  return "pending";
}

function sourceLabel(source: string) {
  const labels: Record<string, string> = {
    online: "Online booking",
    ota: "OTA channel",
    direct_widget: "Direct website widget",
    booking_com: "Booking.com",
    expedia: "Expedia",
    airbnb: "Airbnb",
    other: "Other online source",
  };
  return labels[source] || source.replaceAll("_", " ") || "Online source";
}

function serializeBooking(id: string, data: Record<string, unknown>): BookingRecord {
  const source = stringValue(data.bookingSource || data.source, "online");
  return {
    id,
    businessId: stringValue(data.businessId),
    propertyId: stringValue(data.propertyId, "default_property"),
    guestName: stringValue(data.guestName, "Unnamed guest"),
    guestEmail: stringValue(data.guestEmail),
    guestPhone: stringValue(data.guestPhone),
    roomId: stringValue(data.roomId) || null,
    roomNumber: stringValue(data.roomNumber) || null,
    roomType: stringValue(data.roomType || data.roomTypeId, "Unspecified"),
    bookingSource: source,
    bookingSourceLabel: sourceLabel(source),
    bookingTime: timestampToIso(data.createdAt || data.requestedAt),
    checkInDate: timestampToIso(data.checkInDate),
    checkOutDate: timestampToIso(data.checkOutDate),
    status: stringValue(data.status, "pending"),
    approvalStatus: approvalStatus(data),
    confirmationCode: stringValue(data.confirmationCode) || null,
    approvedAt: timestampToIso(data.approvedAt),
    rejectionReason: stringValue(data.rejectionReason) || null,
    specialRequests: stringValue(data.specialRequests),
    confirmationEmailStatus:
      data.confirmationEmailStatus === "pending" ||
      data.confirmationEmailStatus === "sent" ||
      data.confirmationEmailStatus === "failed" ||
      data.confirmationEmailStatus === "queued"
        ? data.confirmationEmailStatus
        : null,
    confirmationEmailSentAt: timestampToIso(data.confirmationEmailSentAt),
    confirmationEmailError: stringValue(data.confirmationEmailError) || null,
  };
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;",
    };
    return entities[character];
  });
}

function displayDate(value: string | null) {
  if (!value) return "To be confirmed";
  return new Intl.DateTimeFormat("en-GH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Accra",
  }).format(new Date(value));
}

async function deliverApprovalEmail(params: {
  businessId: string;
  businessName: string;
  guestEmail: string;
  guestName: string;
  bookingCode: string;
  roomNumber: string | null;
  roomType: string;
  bookingTime: string | null;
  checkInDate: string | null;
  checkOutDate: string | null;
}) {
  const subject = `Booking confirmed · ${params.bookingCode}`;
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#1f2937;max-width:620px;margin:0 auto">
      <h2 style="color:#c9952e;margin-bottom:8px">Booking confirmed</h2>
      <p>Dear ${escapeHtml(params.guestName)},</p>
      <p>Your reservation at <strong>${escapeHtml(params.businessName)}</strong> has been approved.</p>
      <div style="background:#f7f3ea;border:1px solid #e5d7b7;padding:18px;margin:18px 0">
        <p style="margin:0 0 8px"><strong>Booking code:</strong> ${escapeHtml(params.bookingCode)}</p>
        <p style="margin:0 0 8px"><strong>Room:</strong> ${escapeHtml(params.roomNumber || "Assigned at check-in")} (${escapeHtml(params.roomType)})</p>
        <p style="margin:0 0 8px"><strong>Booking time:</strong> ${escapeHtml(displayDate(params.bookingTime))}</p>
        <p style="margin:0 0 8px"><strong>Check-in:</strong> ${escapeHtml(displayDate(params.checkInDate))}</p>
        <p style="margin:0"><strong>Check-out:</strong> ${escapeHtml(displayDate(params.checkOutDate))}</p>
      </div>
      <p>Please present the booking code at the front desk. Contact the hotel directly if any detail needs to be corrected.</p>
      <p>Thank you,<br /><strong>${escapeHtml(params.businessName)}</strong></p>
    </div>`;

  const resendKey = stringValue(process.env.RESEND_API_KEY);
  const from = stringValue(process.env.RESEND_FROM_EMAIL);
  if (resendKey && from) {
    try {
      const response = await fetch(process.env.RESEND_API_URL || "https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: [params.guestEmail], subject, html }),
        cache: "no-store",
      });
      return response.ok
        ? { status: "sent" as const }
        : { status: "failed" as const, reason: `Email provider returned HTTP ${response.status}` };
    } catch (error) {
      return { status: "failed" as const, reason: error instanceof Error ? error.message : "Email provider request failed" };
    }
  }

  const webhookUrl = stringValue(process.env.SCHOOL_EMAIL_WEBHOOK_URL);
  if (webhookUrl) {
    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(stringValue(process.env.SCHOOL_EMAIL_WEBHOOK_SECRET)
            ? { Authorization: `Bearer ${process.env.SCHOOL_EMAIL_WEBHOOK_SECRET}` }
            : {}),
        },
        body: JSON.stringify({
          event: "billflow.hotel.booking.approved",
          businessId: params.businessId,
          recipientEmail: params.guestEmail,
          subject,
          html,
          bookingCode: params.bookingCode,
          roomNumber: params.roomNumber,
          roomType: params.roomType,
          bookingTime: params.bookingTime,
          checkInDate: params.checkInDate,
          checkOutDate: params.checkOutDate,
        }),
      });
      return response.ok
        ? { status: "sent" as const }
        : { status: "failed" as const, reason: `Email webhook returned HTTP ${response.status}` };
    } catch (error) {
      return { status: "failed" as const, reason: error instanceof Error ? error.message : "Email webhook request failed" };
    }
  }

  return { status: "queued" as const, reason: "No booking email provider is configured." };
}

function isOverlapping(start1: string, end1: string, start2: string, end2: string) {
  const startA = new Date(start1).getTime();
  const endA = new Date(end1).getTime();
  const startB = new Date(start2).getTime();
  const endB = new Date(end2).getTime();
  return Number.isFinite(startA) && Number.isFinite(endA) && Number.isFinite(startB) && Number.isFinite(endB) && startA < endB && endA > startB;
}

function roomMatchesType(room: Record<string, unknown>, roomType: string) {
  const requested = roomType.trim().toLowerCase();
  return [room.type, room.roomType, room.roomTypeId, room.name]
    .filter((value): value is string => typeof value === "string")
    .some((value) => value.trim().toLowerCase() === requested);
}

export async function GET(request: NextRequest) {
  try {
    const actor = await requireServerActor(request);
    const requestedBusinessId = request.nextUrl.searchParams.get("businessId") || "";
    const businessId = actor.email?.toLowerCase() === SUPER_ADMIN_EMAIL && requestedBusinessId ? requestedBusinessId : actor.businessId;
    const propertyId = request.nextUrl.searchParams.get("propertyId") || "default_property";
    const snapshot = await getAdminDb().collection("hotelReservations").where("businessId", "==", businessId).limit(500).get();
    const bookings = snapshot.docs
      .map((doc) => serializeBooking(doc.id, doc.data()))
      .filter((booking) => booking.propertyId === propertyId && ONLINE_SOURCES.has(booking.bookingSource))
      .sort((a, b) => (b.bookingTime || "").localeCompare(a.bookingTime || ""));

    return NextResponse.json({ bookings, generatedAt: new Date().toISOString() }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const details = errorResponseDetails(error);
    return NextResponse.json({ error: details.message }, { status: details.status, headers: { "cache-control": "no-store" } });
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireServerActor(request);
    const body = (await request.json()) as { action?: BookingAction; reservationId?: string; propertyId?: string; businessId?: string; rejectionReason?: string };
    const action = body.action;
    const reservationId = stringValue(body.reservationId);
    const propertyId = stringValue(body.propertyId, "default_property");
    const businessId = actor.email?.toLowerCase() === SUPER_ADMIN_EMAIL && stringValue(body.businessId) ? stringValue(body.businessId) : actor.businessId;
    if ((action !== "approve" && action !== "reject") || !reservationId) {
      throw new HttpError(400, "A valid booking action and reservation ID are required.");
    }

    const firestore = getAdminDb();
    const reservationRef = firestore.collection("hotelReservations").doc(reservationId);
    const result = await firestore.runTransaction(async (transaction) => {
      const reservationSnap = await transaction.get(reservationRef);
      if (!reservationSnap.exists) throw new HttpError(404, "Booking not found.");
      const data = reservationSnap.data() || {};
      if (stringValue(data.businessId) !== businessId || stringValue(data.propertyId, "default_property") !== propertyId) {
        throw new HttpError(403, "You cannot manage a booking outside your business and property.");
      }

      const currentApproval = approvalStatus(data);
      if (action === "reject") {
        if (currentApproval === "rejected") return { data, changed: false };
        if (currentApproval === "approved" && data.status !== "pending") throw new HttpError(409, "An approved booking cannot be rejected from this screen.");
        const rejectionReason = stringValue(body.rejectionReason, "Rejected by hotel staff").slice(0, 500);
        transaction.update(reservationRef, {
          status: "cancelled",
          approvalStatus: "rejected",
          rejectedAt: FieldValue.serverTimestamp(),
          rejectedBy: actor.uid,
          rejectionReason,
          updatedAt: FieldValue.serverTimestamp(),
        });
        return { data: { ...data, status: "cancelled", approvalStatus: "rejected", rejectionReason }, changed: true };
      }

      if (currentApproval === "approved" && data.confirmationCode) return { data, changed: false };
      if (currentApproval === "rejected" || data.status === "cancelled") throw new HttpError(409, "A rejected booking cannot be approved.");

      const checkInDate = timestampToIso(data.checkInDate);
      const checkOutDate = timestampToIso(data.checkOutDate);
      if (!checkInDate || !checkOutDate || new Date(checkOutDate).getTime() <= new Date(checkInDate).getTime()) {
        throw new HttpError(400, "The booking has invalid check-in or check-out dates.");
      }

      const [roomsSnap, reservationsSnap] = await Promise.all([
        transaction.get(firestore.collection("hotelRooms").where("businessId", "==", businessId)),
        transaction.get(firestore.collection("hotelReservations").where("businessId", "==", businessId)),
      ]);
      const rooms = roomsSnap.docs
        .map((roomDoc) => ({ id: roomDoc.id, ...(roomDoc.data() as Record<string, unknown>) }))
        .filter((room) => stringValue(room.propertyId, "default_property") === propertyId && roomMatchesType(room, stringValue(data.roomType || data.roomTypeId)));
      const existingReservations = reservationsSnap.docs
        .filter((doc) => doc.id !== reservationId)
        .map((doc) => doc.data())
        .filter((reservation) => stringValue(reservation.propertyId, "default_property") === propertyId && BLOCKING_STATUSES.has(stringValue(reservation.status)));
      const assignedRoomId = stringValue(data.roomId);
      const assignedRoomNumber = stringValue(data.roomNumber);
      const roomIsAvailable = (room: Record<string, unknown>) => {
        const roomId = stringValue(room.id);
        const roomNumber = stringValue(room.roomNumber);
        return !existingReservations.some((reservation) => {
          const existingRoomId = stringValue(reservation.roomId);
          const existingRoomNumber = stringValue(reservation.roomNumber);
          return (roomId && existingRoomId === roomId) || (roomNumber && existingRoomNumber === roomNumber)
            ? isOverlapping(checkInDate, checkOutDate, timestampToIso(reservation.checkInDate) || "", timestampToIso(reservation.checkOutDate) || "")
            : false;
        });
      };
      const preferredRoom = rooms.find((room) => (assignedRoomId && room.id === assignedRoomId) || (assignedRoomNumber && stringValue(room.roomNumber) === assignedRoomNumber));
      const selectedRoom = (preferredRoom && roomIsAvailable(preferredRoom) ? preferredRoom : rooms.find(roomIsAvailable)) || null;
      if (!selectedRoom) throw new HttpError(409, "No room of this type remains available for the selected dates.");

      const confirmationCode = stringValue(data.confirmationCode) || `BF-${randomBytes(4).toString("hex").toUpperCase()}`;
      transaction.update(reservationRef, {
        status: "booked",
        approvalStatus: "approved",
        confirmationCode,
        roomId: selectedRoom.id,
        roomNumber: stringValue(selectedRoom.roomNumber) || assignedRoomNumber || null,
        approvedAt: FieldValue.serverTimestamp(),
        approvedBy: actor.uid,
        confirmationEmailStatus: stringValue(data.guestEmail) ? "pending" : "queued",
        confirmationEmailError: "",
        updatedAt: FieldValue.serverTimestamp(),
      });
      return {
        data: {
          ...data,
          status: "booked",
          approvalStatus: "approved",
          confirmationCode,
          roomId: selectedRoom.id,
          roomNumber: stringValue(selectedRoom.roomNumber) || assignedRoomNumber || null,
        },
        changed: true,
      };
    });

    const booking = serializeBooking(reservationId, result.data as Record<string, unknown>);
    if (action === "approve" && booking.approvalStatus === "approved" && booking.confirmationCode && booking.guestEmail && (result.changed || booking.confirmationEmailStatus !== "sent")) {
      const businessSnap = await firestore.collection("businesses").doc(businessId).get();
      const businessName = stringValue(businessSnap.data()?.businessName || businessSnap.data()?.name, "BillFlow Hotel");
      const delivery = await deliverApprovalEmail({
        businessId,
        businessName,
        guestEmail: booking.guestEmail,
        guestName: booking.guestName,
        bookingCode: booking.confirmationCode,
        roomNumber: booking.roomNumber,
        roomType: booking.roomType,
        bookingTime: booking.bookingTime,
        checkInDate: booking.checkInDate,
        checkOutDate: booking.checkOutDate,
      });
      await reservationRef.update({
        confirmationEmailStatus: delivery.status,
        ...(delivery.status === "sent" ? { confirmationEmailSentAt: FieldValue.serverTimestamp() } : {}),
        ...(delivery.reason ? { confirmationEmailError: delivery.reason } : {}),
        updatedAt: FieldValue.serverTimestamp(),
      });
      booking.confirmationEmailStatus = delivery.status;
      booking.confirmationEmailError = delivery.reason || null;
      if (delivery.status === "sent") booking.confirmationEmailSentAt = new Date().toISOString();
    }

    await recordSecurityEvent({
      category: "system",
      severity: "info",
      eventType: action === "approve" ? "hotel_online_booking_approved" : "hotel_online_booking_rejected",
      message: action === "approve" ? "An online hotel booking was approved." : "An online hotel booking was rejected.",
      actorUid: actor.uid,
      actorEmail: actor.email ?? undefined,
      businessId,
      propertyId,
      metadata: { reservationId, confirmationCode: booking.confirmationCode, roomNumber: booking.roomNumber },
    });

    return NextResponse.json({ booking }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const details = errorResponseDetails(error);
    return NextResponse.json({ error: details.message }, { status: details.status, headers: { "cache-control": "no-store" } });
  }
}
