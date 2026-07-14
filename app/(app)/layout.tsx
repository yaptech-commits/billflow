"use client";
import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import Sidebar from "@/components/layout/Sidebar";
import Topbar from "@/components/layout/Topbar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) router.replace("/auth/login");
  }, [user, loading, router]);

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-muted text-sm animate-pulse">Loading...</div>
      </div>
    );
  }

  const pageTitle: Record<string, string> = {
    "/dashboard": "Dashboard",
    "/invoices": "Invoices",
    "/clients": "Clients",
    "/vouchers": "WiFi Vouchers",
    "/payments": "Payments",
    "/reports": "Reports",
    "/settings": "Settings",
  };

  return (
    <div className="flex min-h-screen bg-black">
      <Sidebar />
      <div className="flex-1 flex flex-col ml-[240px]">
        <Topbar title={pageTitle[pathname] ?? "BillFlow"} />
        <main className="flex-1 p-7">{children}</main>
      </div>
    </div>
  );
}
