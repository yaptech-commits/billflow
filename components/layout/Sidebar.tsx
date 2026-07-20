"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { getInitials, getAvatarColor } from "@/lib/utils";
import {
  LayoutDashboard, FileText, Users, Wifi,
  CreditCard, BarChart2, Settings, LogOut, Package, UserPlus, Truck, ClipboardList, ScanLine,
  ChevronLeft, ChevronRight, ShieldCheck
} from "lucide-react";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import type { StaffRole } from "@/lib/db";

function getNav(role: StaffRole | null, permissions: string[]) {
  const isAllowed = (href: string) => {
    if (role === "owner") return true;
    if (!permissions || permissions.length === 0) {
      // Default salesperson access if no specific permissions set
      return ["/pos", "/invoices", "/clients", "/products", "/dashboard"].includes(href);
    }
    return permissions.includes(href);
  };

  const businessItems = [
    { href: "/reports",  icon: BarChart2, label: "Reports" },
    ...(role === "owner" ? [{ href: "/staff", icon: UserPlus, label: "Staff" }] : []),
    { href: "/settings", icon: Settings,  label: "Settings" },
  ].filter(item => isAllowed(item.href));

  const groups = [
    ...(role === "super_admin" ? [{ label: "Admin", items: [{ href: "/admin", icon: ShieldCheck, label: "Super Admin" }] }] : []),
    { label: "Main", items: [
      { href: "/pos",        icon: ScanLine,          label: "Point of Sale" },
      { href: "/dashboard",  icon: LayoutDashboard,   label: "Dashboard" },
      { href: "/invoices",   icon: FileText,          label: "Invoices" },
      { href: "/clients",    icon: Users,             label: "Clients" },
      { href: "/products",   icon: Package,           label: "Products" },
      { href: "/vouchers",   icon: Wifi,              label: "Vouchers" },
      { href: "/payments",   icon: CreditCard,        label: "Payments" },
    ].filter(item => isAllowed(item.href)) },
    { label: "Inventory", items: [
      { href: "/suppliers",       icon: Truck,          label: "Suppliers" },
      { href: "/purchase-orders", icon: ClipboardList,  label: "Purchase Orders" },
    ].filter(item => isAllowed(item.href)) },
    { label: "Business", items: businessItems },
  ];

  return groups.filter(g => g.items.length > 0);
}

export default function Sidebar() {
  const pathname = usePathname();
  const { user, role, permissions, logout } = useAuth();
  const name = user?.displayName ?? user?.email ?? "User";
  const nav = getNav(role, permissions);

  const [collapsed, setCollapsed] = useState(false);

  // Persistence of sidebar state
  useEffect(() => {
    const saved = localStorage.getItem("sidebar-collapsed");
    if (saved === "true") setCollapsed(true);
  }, []);

  const toggleCollapse = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem("sidebar-collapsed", String(next));
    // Dispatch custom event for layout adjustment
    window.dispatchEvent(new CustomEvent("sidebar-toggle", { detail: { collapsed: next } }));
  };

  return (
    <aside className={cn(
      "fixed top-0 left-0 bottom-0 bg-deep border-r border-border flex flex-col z-50 transition-all duration-300",
      collapsed ? "w-[70px]" : "w-[240px]"
    )}>
      {/* Collapse Button */}
      <button 
        onClick={toggleCollapse}
        className="absolute -right-3 top-10 w-6 h-6 bg-border border border-border rounded-full flex items-center justify-center text-muted hover:text-gold transition-colors z-10"
      >
        {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
      </button>

      {/* Logo */}
      <div className={cn(
        "flex items-center border-b border-border transition-all duration-300 overflow-hidden",
        collapsed ? "px-4 py-8 justify-center" : "px-5 py-8"
      )}>
        <img 
          src="/images/lockup.png" 
          alt="BillFlow Logo" 
          className={cn("transition-all duration-300", collapsed ? "h-6 w-auto" : "h-12 w-auto")} 
        />
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-5 space-y-5 overflow-y-auto overflow-x-hidden">
        {nav.map((group) => (
          <div key={group.label}>
            {!collapsed && (
              <p className="text-[10px] font-medium text-muted uppercase tracking-widest px-2 mb-2 truncate">{group.label}</p>
            )}
            <div className="space-y-0.5">
              {group.items.map(({ href, icon: Icon, label }) => {
                const active = pathname === href;
                return (
                  <Link
                    key={href}
                    href={href}
                    title={collapsed ? label : ""}
                    className={cn(
                      "flex items-center gap-2.5 rounded-lg text-sm font-medium transition-all",
                      collapsed ? "px-0 justify-center py-3" : "px-3 py-2.5",
                      active
                        ? "bg-gold/10 text-gold"
                        : "text-muted hover:bg-border hover:text-surface"
                    )}
                  >
                    <Icon size={18} className="flex-shrink-0" />
                    {!collapsed && <span className="truncate">{label}</span>}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* User */}
      <div className={cn(
        "py-4 border-t border-border flex items-center transition-all duration-300 overflow-hidden",
        collapsed ? "px-0 justify-center" : "px-4 gap-2.5"
      )}>
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-black font-grotesk font-bold text-xs flex-shrink-0"
          style={{ background: getAvatarColor(name) }}
        >
          {getInitials(name)}
        </div>
        {!collapsed && (
          <>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-surface truncate">{name}</p>
              <p className="text-[11px] text-gold">{role === "salesperson" ? "Salesperson" : "Owner"}</p>
            </div>
            <button onClick={logout} className="text-muted hover:text-red transition-colors" title="Logout">
              <LogOut size={16} />
            </button>
          </>
        )}
      </div>
    </aside>
  );
}
