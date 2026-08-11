"use client";

import { useState } from "react";
import { useHotelContext } from "@/components/hotel/HotelAccessGuard";
import HotelAccessGuard from "@/components/hotel/HotelAccessGuard";
import { createExternalChannelReservation } from "@/lib/db";
import toast from "react-hot-toast";

export default function HotelBookingWidgetPage() {
  return (
    <HotelAccessGuard>
      <HotelBookingWidgetContent />
    </HotelAccessGuard>
  );
}

function HotelBookingWidgetContent() {
  const { businessId, propertyId, propertyName } = useHotelContext();
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [checkInDate, setCheckInDate] = useState("");
  const [checkOutDate, setCheckOutDate] = useState("");
  const [roomTypeId, setRoomTypeId] = useState("Deluxe");
  const [channel, setChannel] = useState<"direct_widget" | "booking_com" | "expedia" | "airbnb">("direct_widget");
  const [specialRequests, setSpecialRequests] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessId) return;
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
        businessId,
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
      toast.success(`Booking confirmed! Assigned Room ${result.roomNumber}`);
      setGuestName("");
      setGuestEmail("");
      setGuestPhone("");
      setCheckInDate("");
      setCheckOutDate("");
      setSpecialRequests("");
    } catch (err: any) {
      toast.error("Booking failed: " + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Online Booking Widget & Channel Engine</h1>
        <p className="text-sm text-muted">Property: {propertyName} · Direct widget simulation & OTA channel gateway</p>
      </div>

      <div className="card bg-surface border border-border rounded-2xl p-6 shadow-md">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-muted font-medium">Booking Source / Channel</label>
              <select
                value={channel}
                onChange={e => setChannel(e.target.value as any)}
                className="w-full mt-1 bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-gold"
              >
                <option value="direct_widget">Direct Website Widget</option>
                <option value="booking_com">Booking.com Channel</option>
                <option value="expedia">Expedia Channel</option>
                <option value="airbnb">Airbnb Channel</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-muted font-medium">Room Type</label>
              <select
                value={roomTypeId}
                onChange={e => setRoomTypeId(e.target.value)}
                className="w-full mt-1 bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-gold"
              >
                <option value="Deluxe">Deluxe Room</option>
                <option value="Standard">Standard Room</option>
                <option value="Suite">Executive Suite</option>
                <option value="Penthouse">Penthouse</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-muted font-medium">Check-In Date</label>
              <input
                type="date"
                required
                value={checkInDate}
                onChange={e => setCheckInDate(e.target.value)}
                className="w-full mt-1 bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-gold"
              />
            </div>
            <div>
              <label className="text-xs text-muted font-medium">Check-Out Date</label>
              <input
                type="date"
                required
                value={checkOutDate}
                onChange={e => setCheckOutDate(e.target.value)}
                className="w-full mt-1 bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-gold"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="text-xs text-muted font-medium">Guest Full Name</label>
              <input
                type="text"
                required
                placeholder="e.g. Ama Serwaa"
                value={guestName}
                onChange={e => setGuestName(e.target.value)}
                className="w-full mt-1 bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-gold"
              />
            </div>
            <div>
              <label className="text-xs text-muted font-medium">Email Address</label>
              <input
                type="email"
                required
                placeholder="ama@example.com"
                value={guestEmail}
                onChange={e => setGuestEmail(e.target.value)}
                className="w-full mt-1 bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-gold"
              />
            </div>
            <div>
              <label className="text-xs text-muted font-medium">Phone Number</label>
              <input
                type="text"
                required
                placeholder="+233 24 000 0000"
                value={guestPhone}
                onChange={e => setGuestPhone(e.target.value)}
                className="w-full mt-1 bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-gold"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-muted font-medium">Special Requests / Notes</label>
            <textarea
              placeholder="High floor, extra pillows, airport pickup…"
              value={specialRequests}
              onChange={e => setSpecialRequests(e.target.value)}
              className="w-full mt-1 bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-gold"
              rows={2}
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-gold text-black font-bold py-3 rounded-xl hover:bg-gold/90 transition shadow-md disabled:opacity-50"
          >
            {submitting ? "Checking Availability & Booking…" : "Confirm & Book Room (Live Engine)"}
          </button>
        </form>
      </div>
    </div>
  );
}
