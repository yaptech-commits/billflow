"use client";
import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import Sidebar from "@/components/layout/Sidebar";
import Topbar from "@/components/layout/Topbar";
import { cn } from "@/lib/utils";
import { checkLowStockAndNotify, clearOldNotifications, createInvoice, createPayment } from "@/lib/db";
import { syncOfflineSales, syncOfflineInvoices, syncOfflinePayments } from "@/lib/offline-sync";
import { createPosSale } from "@/lib/pos-api";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, businessId, role, permissions } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/auth/login");
      return;
    }

    // Permission enforcement for salespeople
    if (!loading && user && role === "salesperson") {
      const publicPaths = ["/auth/login", "/auth/signup", "/auth/forgot-password"];
      if (publicPaths.includes(pathname)) return;

      // If the current page is not in their allowed list, redirect to the first allowed page
      if (!permissions.includes(pathname)) {
        const firstAllowed = permissions.length > 0 ? permissions[0] : null;
        if (firstAllowed && pathname !== firstAllowed) {
          router.replace(firstAllowed);
        } else if (!firstAllowed && pathname !== "/dashboard") {
          // If no permissions, they shouldn't really be here, but let's not loop infinitely
          // Maybe show an access denied message instead of redirecting
        }
      }
    }
  }, [user, loading, role, permissions, pathname, router]);

  useEffect(() => {
    const saved = localStorage.getItem("sidebar-collapsed");
    if (saved === "true") setSidebarCollapsed(true);

    const handleToggle = (e: any) => setSidebarCollapsed(e.detail.collapsed);
    window.addEventListener("sidebar-toggle", handleToggle);
    return () => window.removeEventListener("sidebar-toggle", handleToggle);
  }, []);

  useEffect(() => {
    if (businessId && role === "owner") {
      // Check for low stock and clear old notifications once per session/mount
      checkLowStockAndNotify(businessId);
      clearOldNotifications(businessId);
    }
  }, [businessId, role]);

  useEffect(() => {
    const syncAll = async () => {
      const isOnline = navigator.onLine && localStorage.getItem("billflow_offline_mode") !== "true";
      if (!isOnline) return;

      try {
        await Promise.all([
          syncOfflineSales(createPosSale),
          syncOfflineInvoices(createInvoice),
          syncOfflinePayments(createPayment)
        ]);
      } catch (err) {
        console.error("Auto-sync failed:", err);
      }
    };

    const interval = setInterval(syncAll, 30000); // Sync every 30 seconds
    syncAll();
    return () => clearInterval(interval);
  }, []);

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
      <div className={cn(
        "flex-1 flex flex-col transition-all duration-300",
        sidebarCollapsed ? "ml-[70px]" : "ml-[240px]"
      )}>
        <Topbar title={pageTitle[pathname] ?? "BillFlow"} />
        <main className="flex-1 p-7">{children}</main>
      </div>
    </div>
  );
}
