"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  LayoutDashboard, FileText, Users, Ticket, 
  CreditCard, BarChart3, Settings, Package, 
  ChevronLeft, ChevronRight, ShoppingCart, Truck, UserCircle, Shield,
  LogOut
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";

export default function Sidebar() {
  const pathname = usePathname();
  const { role, permissions, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

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
    { name: "Dashboard", icon: LayoutDashboard, path: "/dashboard", roles: ["owner", "salesperson"] },
    { name: "POS", icon: ShoppingCart, path: "/pos", roles: ["owner", "salesperson"] },
    { name: "Invoices", icon: FileText, path: "/invoices", roles: ["owner", "salesperson"] },
    { name: "Products", icon: Package, path: "/products", roles: ["owner", "salesperson"] },
    { name: "Clients", icon: Users, path: "/clients", roles: ["owner", "salesperson"] },
    { name: "Payments", icon: CreditCard, path: "/payments", roles: ["owner", "salesperson"] },
    { name: "Suppliers", icon: Truck, path: "/suppliers", roles: ["owner", "salesperson"] },
    { name: "Purchase Orders", icon: BarChart3, path: "/purchase-orders", roles: ["owner", "salesperson"] },
    { name: "WiFi Vouchers", icon: Ticket, path: "/vouchers", roles: ["owner", "salesperson"] },
    { name: "Reports", icon: BarChart3, path: "/reports", roles: ["owner", "salesperson"] },
    { name: "Staff", icon: UserCircle, path: "/staff", roles: ["owner"] },
    { name: "Settings", icon: Settings, path: "/settings", roles: ["owner"] },
    { name: "Admin", icon: Shield, path: "/admin", roles: ["super_admin"] },
  ];

  const filteredItems = menuItems.filter(item => {
    if (role === "super_admin") return item.roles.includes("super_admin");
    if (role === "owner") return item.roles.includes("owner");
    if (role === "salesperson") {
      // Salespeople can only see pages they have explicit permission for.
      // If permissions array is empty/missing, they see nothing by default (safer).
      return item.roles.includes("salesperson") && permissions.includes(item.path);
    }
    return false;
  });

  return (
    <aside className={cn(
      "fixed top-0 left-0 h-full bg-[#111118] border-right border-[#1E1E2E] z-40 transition-all duration-300 flex flex-col",
      collapsed ? "w-[70px]" : "w-[240px]"
    )}>
      <div className="p-6 mb-4 flex items-center justify-between group/logo">
        {!collapsed && (
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gold rounded-lg flex items-center justify-center text-black font-bold">B</div>
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
            <div className="w-8 h-8 bg-gold rounded-lg flex items-center justify-center text-black font-bold mx-auto">B</div>
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
