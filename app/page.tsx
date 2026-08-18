"use client";
import { useEffect } from "react";
export const dynamic = 'force-dynamic';
import { useAuth } from "@/lib/auth-context";

export default function Home() {
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading) {
      window.location.assign(user ? "/dashboard" : "/auth/login");
    }
  }, [user, loading]);

  return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <div className="text-muted text-sm animate-pulse">Loading BillFlow...</div>
    </div>
  );
}
