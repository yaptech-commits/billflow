"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
export const dynamic = 'force-dynamic';

import Sidebar from "@/components/layout/Sidebar";
import Topbar from "@/components/layout/Topbar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, role } = useAuth();
  const [pathname, setPathname] = useState("");

  useEffect(() => {
    setPathname(window.location.pathname);
  }, []);

  useEffect(() => {
    if (!loading && !user) window.location.replace("/auth/login");
    if (!loading && user && role === "parent" && !pathname.startsWith("/school/portal")) window.location.replace("/school/portal");
    if (!loading && user && role !== "parent" && pathname.startsWith("/school/portal")) window.location.replace("/dashboard");
  }, [user, loading, role, pathname]);

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
    "/school/portal": "Parent Portal",
    "/school/analytics": "Term Analytics",
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
