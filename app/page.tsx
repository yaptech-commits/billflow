"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      router.replace(user ? "/dashboard" : "/auth/login");
    }
  }, [user, loading, router]);

  return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <div className="text-muted text-sm animate-pulse">Loading BillFlow...</div>
    </div>
  );
}
