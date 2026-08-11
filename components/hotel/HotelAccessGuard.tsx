"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { BusinessProfile, getBusinessProfile } from "@/lib/db";

export function useHotelContext() {
  const { businessId, selectedBusinessId, role } = useAuth();
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const effectiveBusinessId = businessId || selectedBusinessId || null;

  useEffect(() => {
    let mounted = true;
    if (!effectiveBusinessId || effectiveBusinessId === "SUPER_ADMIN") {
      setProfile(null);
      setLoading(false);
      return () => { mounted = false; };
    }
    setLoading(true);
    getBusinessProfile(effectiveBusinessId)
      .then(value => { if (mounted) setProfile(value); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [effectiveBusinessId]);

  const isHotel = role === "super_admin" || profile?.businessType === "hotel";
  return {
    businessId: effectiveBusinessId,
    propertyId: profile?.propertyId || "default_property",
    propertyName: profile?.propertyName || profile?.businessName || "Main Property",
    profile,
    role,
    isHotel,
    loading,
  };
}

export default function HotelAccessGuard({ children }: { children: React.ReactNode }) {
  const { loading, isHotel } = useHotelContext();
  if (loading) return <div className="card text-muted text-sm">Loading hotel workspace…</div>;
  if (!isHotel) {
    return (
      <div className="card max-w-xl">
        <p className="text-gold font-semibold mb-2">Hotel module unavailable</p>
        <p className="text-muted text-sm">This workspace is not configured as a Hotel business. Business type changes are managed by Super Admin.</p>
      </div>
    );
  }
  return <>{children}</>;
}
