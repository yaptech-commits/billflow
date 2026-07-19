"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { getInitials, getAvatarColor } from "@/lib/utils";
import {
  LayoutDashboard, FileText, Users, Wifi,
  CreditCard, BarChart2, Settings, LogOut, Package, UserPlus, Truck, ClipboardList, ScanLine,
} from "lucide-react";
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

  return (
    <aside className="fixed top-0 left-0 bottom-0 w-[240px] bg-deep border-r border-border flex flex-col z-50">
      {/* Logo */}
      <div className="flex items-center px-5 py-10 border-b border-border">
        <img src="/images/lockup.png" alt="BillFlow Logo" className="h-20 w-auto" />
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-5 space-y-5 overflow-y-auto">
        {nav.map((group) => (
          <div key={group.label}>
            <p className="text-[10px] font-medium text-muted uppercase tracking-widest px-2 mb-2">{group.label}</p>
            <div className="space-y-0.5">
              {group.items.map(({ href, icon: Icon, label }) => {
                const active = pathname === href;
                return (
                  <Link
                    key={href}
                    href={href}
                    className={cn(
                      "flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
                      active
                        ? "bg-gold/10 text-gold"
                        : "text-muted hover:bg-border hover:text-surface"
                    )}
                  >
                    <Icon size={17} />
                    {label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* User */}
      <div className="px-4 py-4 border-t border-border flex items-center gap-2.5">
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-black font-grotesk font-bold text-xs flex-shrink-0"
          style={{ background: getAvatarColor(name) }}
        >
          {getInitials(name)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-surface truncate">{name}</p>
          <p className="text-[11px] text-gold">{role === "salesperson" ? "Salesperson" : "Owner"}</p>
        </div>
        <button onClick={logout} className="text-muted hover:text-red transition-colors" title="Logout">
          <LogOut size={16} />
        </button>
      </div>
    </aside>
  );
}
