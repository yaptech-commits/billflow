"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  LayoutDashboard, FileText, Users, Ticket, 
  CreditCard, BarChart3, Settings, Package, 
  ChevronLeft, ChevronRight, ShoppingCart, Truck, UserCircle, Shield,
  LogOut, Building2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { getBusinesses, BusinessProfile } from "@/lib/db";

export default function Sidebar() {
  const pathname = usePathname();
  const { role, logout, selectedBusinessId, setSelectedBusinessId, permissions } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [businesses, setBusinesses] = useState<BusinessProfile[]>([]);
  const [showBusinessSwitcher, setShowBusinessSwitcher] = useState(false);

  useEffect(() => {
    if (role === "super_admin") {
      getBusinesses().then(setBusinesses);
    }
  }, [role]);

  useEffect(() => {
    const saved = localStorage.getItem("sidebar-collapsed");
    if (saved === "true") setCollapsed(true);
  }, []);

  const toggle = () => {
    const newState = !collapsed;
    setCollapsed(newState);
    localStorage.setItem("sidebar-collapsed", String(newState));
    window.dispatchEvent(new CustomEvent("sidebar-toggle", { detail: { collapsed: newState } }));
  };

  const menuItems = [
    { name: "Dashboard", icon: LayoutDashboard, path: "/dashboard", roles: ["owner", "salesperson", "super_admin"] },
    { name: "POS", icon: ShoppingCart, path: "/pos", roles: ["owner", "salesperson", "super_admin"] },
    { name: "Invoices", icon: FileText, path: "/invoices", roles: ["owner", "salesperson", "super_admin"] },
    { name: "Products", icon: Package, path: "/products", roles: ["owner", "salesperson", "super_admin"] },
    { name: "Clients", icon: Users, path: "/clients", roles: ["owner", "salesperson", "super_admin"] },
    { name: "Payments", icon: CreditCard, path: "/payments", roles: ["owner", "salesperson", "super_admin"] },
    { name: "Suppliers", icon: Truck, path: "/suppliers", roles: ["owner", "super_admin"] },
    { name: "Purchase Orders", icon: BarChart3, path: "/purchase-orders", roles: ["owner", "super_admin"] },
    { name: "WiFi Vouchers", icon: Ticket, path: "/vouchers", roles: ["owner", "salesperson", "super_admin"] },
    { name: "Reports", icon: BarChart3, path: "/reports", roles: ["owner", "super_admin"] },
    { name: "Staff", icon: UserCircle, path: "/staff", roles: ["owner", "super_admin"] },
    { name: "Settings", icon: Settings, path: "/settings", roles: ["owner", "super_admin"] },
    { name: "Admin", icon: Shield, path: "/admin", roles: ["super_admin"] },
  ];

  const filteredItems = menuItems.filter(item => {
    if (role === "owner" || role === "super_admin") {
      return item.roles.includes(role);
    }
    if (role === "salesperson") {
      if (!permissions || permissions.length === 0) {
        return item.roles.includes("salesperson");
      }
      return permissions.includes(item.path);
    }
    return item.roles.includes(role || "");
  });
  const currentBusiness = businesses.find(b => b.businessId === selectedBusinessId);

  return (
    <aside className={cn(
      "fixed top-0 left-0 h-full bg-[#111118] border-right border-[#1E1E2E] z-40 transition-all duration-300 flex flex-col",
      collapsed ? "w-[70px]" : "w-[240px]"
    )}>
      <div className="p-6 mb-4 flex items-center justify-between group/logo">
        {!collapsed && (
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2">
              <img src="/billflow-logo.png" alt="BillFlow" className="w-8 h-8 object-contain" />
              <span className="font-grotesk font-bold text-white text-lg">BillFlow</span>
            </div>
            <button 
              onClick={() => logout?.()}
              className="p-1.5 text-muted hover:text-red hover:bg-red/10 rounded-lg transition-all"
              title="Log Out"
            >
              <LogOut size={18} />
            </button>
          </div>
        )}
        {collapsed && (
          <div className="relative group/collapsed">
            <img src="/billflow-logo.png" alt="BillFlow" className="w-8 h-8 object-contain mx-auto" />
            <button 
              onClick={() => logout?.()}
              className="absolute -top-1 -right-1 p-1 bg-red text-white rounded-full opacity-0 group-hover/collapsed:opacity-100 transition-opacity shadow-lg"
              title="Log Out"
            >
              <LogOut size={10} />
            </button>
          </div>
        )}
      </div>

      <nav className="flex-1 px-3 space-y-1 overflow-y-auto custom-scrollbar">
        {role === "super_admin" && (
          <div className="mb-4 px-3">
            <div className="text-[10px] font-bold text-muted uppercase tracking-wider mb-2 px-1">
              {collapsed ? "BIZ" : "Switch Business"}
            </div>
            <button
              onClick={() => setShowBusinessSwitcher(!showBusinessSwitcher)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-white/10 hover:bg-white/5 transition-all",
                collapsed && "justify-center px-0"
              )}
            >
              <Building2 size={20} className={selectedBusinessId ? "text-gold" : "text-muted"} />
              {!collapsed && (
                <div className="flex-1 text-left truncate">
                  <div className="text-xs font-bold text-white truncate">
                    {currentBusiness?.businessName || "Global View"}
                  </div>
                  <div className="text-[10px] text-muted truncate">
                    {selectedBusinessId ? "Impersonating" : "System Wide"}
                  </div>
                </div>
              )}
            </button>

            {!collapsed && showBusinessSwitcher && (
              <div className="mt-2 bg-[#1E1E2E] rounded-xl border border-white/10 overflow-hidden shadow-2xl max-h-[200px] overflow-y-auto custom-scrollbar">
                <button
                  onClick={() => {
                    setSelectedBusinessId(null);
                    setShowBusinessSwitcher(false);
                  }}
                  className={cn(
                    "w-full text-left px-4 py-2 text-xs hover:bg-white/5 transition-all",
                    !selectedBusinessId ? "text-gold font-bold bg-gold/5" : "text-white"
                  )}
                >
                  Global View (All)
                </button>
                {businesses.map(b => (
                  <button
                    key={b.businessId}
                    onClick={() => {
                      setSelectedBusinessId(b.businessId);
                      setShowBusinessSwitcher(false);
                    }}
                    className={cn(
                      "w-full text-left px-4 py-2 text-xs hover:bg-white/5 transition-all border-t border-white/5",
                      selectedBusinessId === b.businessId ? "text-gold font-bold bg-gold/5" : "text-white"
                    )}
                  >
                    {b.businessName}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {filteredItems.map((item) => {
          const active = pathname === item.path;
          return (
            <Link 
              key={item.path} 
              href={item.path}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all group",
                active ? "bg-gold text-black font-bold" : "text-muted hover:text-white hover:bg-white/5",
                collapsed && "justify-center px-0"
              )}
            >
              <item.icon size={20} className={cn(active ? "text-black" : "text-muted group-hover:text-gold")} />
              {!collapsed && <span>{item.name}</span>}
            </Link>
          );
        })}
      </nav>

      <div className="p-3 border-t border-[#1E1E2E]">
        <button 
          onClick={toggle}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-muted hover:text-white hover:bg-white/5 transition-all"
        >
          {collapsed ? <ChevronRight size={20} className="mx-auto" /> : (
            <>
              <ChevronLeft size={20} />
              <span className="text-sm">Collapse Sidebar</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
