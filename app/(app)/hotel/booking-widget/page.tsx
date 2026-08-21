"use client";

// Style reminder: preserve BillFlow's dark operational shell, restrained gold emphasis, compact spacing, readable status badges, and mobile-first table-to-stack behavior.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useHotelContext } from "@/components/hotel/HotelAccessGuard";
import HotelAccessGuard from "@/components/hotel/HotelAccessGuard";
import { createExternalChannelReservation } from "@/lib/db";
import { useAuth } from "@/lib/auth-context";
import toast from "react-hot-toast";

type BookingStatus = "pending" | "approved" | "rejected";

type OnlineBooking = {
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
  approvalStatus: BookingStatus;
  confirmationCode: string | null;
  approvedAt: string | null;
  rejectionReason: string | null;
  specialRequests: string;
  confirmationEmailStatus: "pending" | "sent" | "failed" | "queued" | null;
  confirmationEmailSentAt: string | null;
  confirmationEmailError: string | null;
  smsDeliveryStatus?: "sent" | "failed" | "queued" | "skipped" | null;
  smsDeliveryError?: string | null;
  whatsappDeliveryStatus?: "sent" | "failed" | "queued" | "skipped" | null;
  whatsappDeliveryError?: string | null;
};

type Filter = "all" | BookingStatus;

const inputClassName = "w-full mt-1 bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-gold";

function formatDate(value: string | null, includeTime = true) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GH", {
    dateStyle: "medium",
    ...(includeTime ? { timeStyle: "short" } : {}),
    timeZone: "Africa/Accra",
  }).format(date);
}

function formatShortDate(value: string | null) {
  return formatDate(value, false);
}

function statusClass(status: BookingStatus) {
  if (status === "approved") return "bg-emerald-500/15 text-emerald-300 border-emerald-400/30";
  if (status === "rejected") return "bg-red-500/15 text-red-300 border-red-400/30";
  return "bg-amber-500/15 text-amber-200 border-amber-400/30";
}

function emailStatusLabel(status: OnlineBooking["confirmationEmailStatus"]) {
  if (status === "sent") return "Confirmation sent";
  if (status === "failed") return "Delivery failed";
  if (status === "queued") return "Delivery queued";
  if (status === "pending") return "Sending confirmation";
  return "Not sent";
}

export default function HotelBookingWidgetPage() {
  return (
    <HotelAccessGuard>
      <HotelBookingWidgetContent />
    </HotelAccessGuard>
  );
}

function HotelBookingWidgetContent() {
  const { businessId, propertyId, propertyName, role } = useHotelContext();
  const { user } = useAuth();
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [checkInDate, setCheckInDate] = useState("");
  const [checkOutDate, setCheckOutDate] = useState("");
  const [roomTypeId, setRoomTypeId] = useState("Deluxe");
  const [channel, setChannel] = useState<"direct_widget" | "booking_com" | "expedia" | "airbnb">("direct_widget");
  const [specialRequests, setSpecialRequests] = useState("");
  const [bookings, setBookings] = useState<OnlineBooking[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [loadingBookings, setLoadingBookings] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isSuperAdmin = role === "super_admin";
  const hasSelectedBusiness = Boolean(businessId && businessId !== "SUPER_ADMIN");

  const loadBookings = useCallback(async (showSpinner = false) => {
    if (!user || !businessId || !propertyId || !hasSelectedBusiness) {
      setBookings([]);
      setLoadingBookings(false);
      return;
    }
    if (showSpinner) setRefreshing(true);
    try {
      const token = await user.getIdToken();
      const params = new URLSearchParams({ propertyId });
      if (isSuperAdmin) params.set("businessId", businessId);
      const response = await fetch(`/api/hotel/online-bookings?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const payload = (await response.json()) as { bookings?: OnlineBooking[]; error?: string };
      if (!response.ok) throw new Error(payload.error || "Unable to load online bookings.");
      setBookings(payload.bookings || []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to load online bookings.");
    } finally {
      setLoadingBookings(false);
      setRefreshing(false);
    }
  }, [businessId, hasSelectedBusiness, isSuperAdmin, propertyId, user]);

  useEffect(() => {
    void loadBookings();
    const interval = window.setInterval(() => void loadBookings(), 30000);
    return () => window.clearInterval(interval);
  }, [loadBookings]);

  const visibleBookings = useMemo(
    () => (filter === "all" ? bookings : bookings.filter((booking) => booking.approvalStatus === filter)),
    [bookings, filter],
  );
  const pendingCount = bookings.filter((booking) => booking.approvalStatus === "pending").length;
  const approvedCount = bookings.filter((booking) => booking.approvalStatus === "approved").length;
  const rejectedCount = bookings.filter((booking) => booking.approvalStatus === "rejected").length;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!hasSelectedBusiness) return;
    if (!checkInDate || !checkOutDate) {
      toast.error("Please select check-in and check-out dates.");
      return;
    }
    if (checkOutDate <= checkInDate) {
      toast.error("Check-out date must be after check-in date.");
      return;
    }

    setSubmitting(true);
    try {
      const result = await createExternalChannelReservation({
        businessId: businessId!,
        propertyId,
        channel,
        guestName,
        guestEmail,
        guestPhone,
        checkInDate,
        checkOutDate,
        roomTypeId,
        specialRequests,
      });
      toast.success(`Booking request received. Room ${result.roomNumber} is held pending approval.`);
      setGuestName("");
      setGuestEmail("");
      setGuestPhone("");
      setCheckInDate("");
      setCheckOutDate("");
      setSpecialRequests("");
      await loadBookings(true);
    } catch (error) {
      toast.error("Booking failed: " + (error instanceof Error ? error.message : "Please try again."));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDecision = async (booking: OnlineBooking, action: "approve" | "reject") => {
    if (!user || !businessId || !hasSelectedBusiness) return;
    let rejectionReason = "";
    if (action === "reject") {
      rejectionReason = window.prompt("Optional reason for rejecting this booking:", "Dates or room no longer available") || "Rejected by hotel staff";
    }
    setActionId(booking.id);
    try {
      const token = await user.getIdToken();
      const response = await fetch("/api/hotel/online-bookings", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          reservationId: booking.id,
          propertyId,
          ...(isSuperAdmin ? { businessId } : {}),
          ...(action === "reject" ? { rejectionReason } : {}),
        }),
      });
      const payload = (await response.json()) as { booking?: OnlineBooking; error?: string };
      if (!response.ok) throw new Error(payload.error || `Unable to ${action} booking.`);
      const result = payload.booking;
      if (action === "approve") {
        const delivery = result?.confirmationEmailStatus === "sent" ? "Confirmation emailed to the customer." : "Booking approved; share the code with the customer and review email delivery status.";
        toast.success(`Approved · ${result?.confirmationCode || "booking code generated"}. ${delivery}`);
      } else {
        toast.success("Booking rejected and released from the pending queue.");
      }
      await loadBookings(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Unable to ${action} booking.`);
    } finally {
      setActionId(null);
    }
  };

  if (isSuperAdmin && !hasSelectedBusiness) {
    return (
      <div className="max-w-3xl space-y-4">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Online Booking Operations</h1>
        <div className="card bg-surface border border-border rounded-2xl p-6">
          <p className="text-gold font-semibold">Select a hotel business first</p>
          <p className="text-muted text-sm mt-2">Use the Super Admin business selector to choose the hotel account whose online bookings you want to manage.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-gold font-semibold">Hotel operations · {propertyName}</p>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground mt-1">Online Booking Inbox</h1>
          <p className="text-sm text-muted mt-2 max-w-2xl">Review direct website and OTA requests, approve the stay, and issue a customer-ready booking code with the assigned room and exact stay times.</p>
        </div>
        <button
          type="button"
          onClick={() => void loadBookings(true)}
          disabled={refreshing}
          className="self-start lg:self-auto px-4 py-2 rounded-lg border border-border text-sm text-foreground hover:border-gold hover:text-gold transition disabled:opacity-50"
        >
          {refreshing ? "Refreshing…" : "Refresh bookings"}
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "All online requests", value: bookings.length, tone: "text-foreground" },
          { label: "Awaiting approval", value: pendingCount, tone: "text-amber-200" },
          { label: "Approved", value: approvedCount, tone: "text-emerald-300" },
          { label: "Rejected", value: rejectedCount, tone: "text-red-300" },
        ].map((metric) => (
          <div key={metric.label} className="card bg-surface border border-border rounded-xl p-4">
            <p className="text-[11px] uppercase tracking-wider text-muted">{metric.label}</p>
            <p className={`text-2xl font-bold mt-1 ${metric.tone}`}>{metric.value}</p>
          </div>
        ))}
      </div>

      <section className="card bg-surface border border-border rounded-2xl overflow-hidden">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-5 py-4 border-b border-border">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Incoming bookings</h2>
            <p className="text-xs text-muted mt-1">Auto-refreshes every 30 seconds. Approval confirms the room assignment and creates the customer code.</p>
          </div>
          <div className="flex gap-1 bg-background/70 border border-border rounded-lg p-1">
            {(["all", "pending", "approved", "rejected"] as Filter[]).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setFilter(option)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium capitalize transition ${filter === option ? "bg-gold text-black" : "text-muted hover:text-foreground"}`}
              >
                {option}
              </button>
            ))}
          </div>
        </div>

        {loadingBookings ? (
          <div className="px-5 py-12 text-sm text-muted">Loading online bookings…</div>
        ) : visibleBookings.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <p className="text-foreground font-semibold">No {filter === "all" ? "online" : filter} bookings yet</p>
            <p className="text-sm text-muted mt-1">New direct-widget and channel requests will appear here for review.</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {visibleBookings.map((booking) => (
              <article key={booking.id} className="px-5 py-5">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-foreground">{booking.guestName}</h3>
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${statusClass(booking.approvalStatus)}`}>{booking.approvalStatus}</span>
                      <span className="text-xs text-muted">{booking.bookingSourceLabel}</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-x-5 gap-y-3 mt-4">
                      <div><p className="text-[11px] uppercase tracking-wider text-muted">Booking time</p><p className="text-sm text-foreground mt-1">{formatDate(booking.bookingTime)}</p></div>
                      <div><p className="text-[11px] uppercase tracking-wider text-muted">Room</p><p className="text-sm text-foreground mt-1">{booking.roomNumber || "Pending assignment"} · {booking.roomType}</p></div>
                      <div><p className="text-[11px] uppercase tracking-wider text-muted">Check-in</p><p className="text-sm text-foreground mt-1">{formatShortDate(booking.checkInDate)}</p></div>
                      <div><p className="text-[11px] uppercase tracking-wider text-muted">Check-out</p><p className="text-sm text-foreground mt-1">{formatShortDate(booking.checkOutDate)}</p></div>
                    </div>
                    <div className="mt-4 flex flex-col sm:flex-row sm:flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
                      <span>{booking.guestEmail || "No email provided"}</span>
                      <span>{booking.guestPhone || "No phone provided"}</span>
                      {booking.specialRequests ? <span>Note: {booking.specialRequests}</span> : null}
                    </div>
                    {booking.approvalStatus === "approved" ? (
                      <div className="mt-4 flex flex-col gap-2">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                          <div className="bg-gold/10 border border-gold/30 rounded-lg px-3 py-2">
                            <p className="text-[10px] uppercase tracking-wider text-gold">Customer booking code</p>
                            <p className="font-mono font-bold tracking-[0.18em] text-gold mt-0.5">{booking.confirmationCode || "Not generated"}</p>
                          </div>
                          <div className="text-xs space-y-1">
                            <p className={booking.confirmationEmailStatus === "sent" ? "text-emerald-300" : booking.confirmationEmailStatus === "failed" ? "text-red-300" : "text-amber-200"}>
                              Email: {emailStatusLabel(booking.confirmationEmailStatus)}{booking.confirmationEmailError ? ` (${booking.confirmationEmailError})` : ""}
                            </p>
                            <p className={booking.smsDeliveryStatus === "sent" ? "text-emerald-300" : booking.smsDeliveryStatus === "failed" ? "text-red-300" : "text-muted"}>
                              SMS: {booking.smsDeliveryStatus || "queued"}{booking.smsDeliveryError ? ` (${booking.smsDeliveryError})` : ""}
                            </p>
                            <p className={booking.whatsappDeliveryStatus === "sent" ? "text-emerald-300" : booking.whatsappDeliveryStatus === "failed" ? "text-red-300" : "text-muted"}>
                              WhatsApp: {booking.whatsappDeliveryStatus || "queued"}{booking.whatsappDeliveryError ? ` (${booking.whatsappDeliveryError})` : ""}
                            </p>
                          </div>
                        </div>
                      </div>
                    ) : null}
                    {booking.approvalStatus === "rejected" && booking.rejectionReason ? <p className="text-xs text-red-300 mt-3">Reason: {booking.rejectionReason}</p> : null}
                  </div>
                  <div className="flex shrink-0 flex-row xl:flex-col gap-2">
                    {booking.approvalStatus === "pending" ? (
                      <>
                        <button
                          type="button"
                          onClick={() => void handleDecision(booking, "approve")}
                          disabled={actionId === booking.id}
                          className="px-4 py-2 rounded-lg bg-gold text-black text-sm font-semibold hover:bg-gold/90 transition disabled:opacity-50"
                        >
                          {actionId === booking.id ? "Processing…" : "Approve & issue code"}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDecision(booking, "reject")}
                          disabled={actionId === booking.id}
                          className="px-4 py-2 rounded-lg border border-red-400/30 text-red-300 text-sm font-medium hover:bg-red-500/10 transition disabled:opacity-50"
                        >
                          Reject booking
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="card bg-surface border border-border rounded-2xl p-5">
        <div className="mb-5">
          <p className="text-xs uppercase tracking-[0.18em] text-gold font-semibold">Direct widget test / staff entry</p>
          <h2 className="text-lg font-semibold text-foreground mt-1">Create an online booking request</h2>
          <p className="text-xs text-muted mt-1">Requests are held as pending until the hotel approves them above.</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><label className="text-xs text-muted font-medium">Booking source / channel</label><select value={channel} onChange={(event) => setChannel(event.target.value as typeof channel)} className={inputClassName}><option value="direct_widget">Direct website widget</option><option value="booking_com">Booking.com channel</option><option value="expedia">Expedia channel</option><option value="airbnb">Airbnb channel</option></select></div>
            <div><label className="text-xs text-muted font-medium">Room type</label><select value={roomTypeId} onChange={(event) => setRoomTypeId(event.target.value)} className={inputClassName}><option value="Deluxe">Deluxe Room</option><option value="Standard">Standard Room</option><option value="Suite">Executive Suite</option><option value="Penthouse">Penthouse</option></select></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><label className="text-xs text-muted font-medium">Check-in date</label><input type="date" required value={checkInDate} onChange={(event) => setCheckInDate(event.target.value)} className={inputClassName} /></div>
            <div><label className="text-xs text-muted font-medium">Check-out date</label><input type="date" required value={checkOutDate} onChange={(event) => setCheckOutDate(event.target.value)} className={inputClassName} /></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div><label className="text-xs text-muted font-medium">Guest full name</label><input type="text" required placeholder="e.g. Ama Serwaa" value={guestName} onChange={(event) => setGuestName(event.target.value)} className={inputClassName} /></div>
            <div><label className="text-xs text-muted font-medium">Email address</label><input type="email" required placeholder="ama@example.com" value={guestEmail} onChange={(event) => setGuestEmail(event.target.value)} className={inputClassName} /></div>
            <div><label className="text-xs text-muted font-medium">Phone number</label><input type="text" required placeholder="+233 24 000 0000" value={guestPhone} onChange={(event) => setGuestPhone(event.target.value)} className={inputClassName} /></div>
          </div>
          <div><label className="text-xs text-muted font-medium">Special requests / notes</label><textarea placeholder="High floor, extra pillows, airport pickup…" value={specialRequests} onChange={(event) => setSpecialRequests(event.target.value)} className={inputClassName} rows={2} /></div>
          <button type="submit" disabled={submitting} className="w-full sm:w-auto bg-gold text-black font-bold px-6 py-3 rounded-xl hover:bg-gold/90 transition shadow-md disabled:opacity-50">{submitting ? "Checking availability…" : "Receive booking request"}</button>
        </form>
      </section>
    </div>
  );
}
