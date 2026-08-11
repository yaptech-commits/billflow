"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  LayoutDashboard, FileText, Users, Ticket, 
  CreditCard, BarChart3, Settings, Package, 
  ChevronLeft, ChevronRight, ShoppingCart, Truck, UserCircle, Shield,
  LogOut, Building2, AlertCircle, Pill, BedDouble, CalendarDays, ConciergeBell, UserRound, CircleDollarSign, ChevronDown
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { getBusinesses, BusinessProfile, getBusinessProfile } from "@/lib/db";

export default function Sidebar() {
  const pathname = usePathname();
  const { role, logout, selectedBusinessId, setSelectedBusinessId, permissions, businessId } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [businesses, setBusinesses] = useState<BusinessProfile[]>([]);
  const [showBusinessSwitcher, setShowBusinessSwitcher] = useState(false);
  const [currentBusinessProfile, setCurrentBusinessProfile] = useState<BusinessProfile | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    general: true,
    pharmacy: true,
    hotel: true,
    administration: true,
  });

  useEffect(() => {
    if (role === "super_admin") {
      getBusinesses().then(setBusinesses);
    }
    if (businessId) {
      getBusinessProfile(businessId).then(setCurrentBusinessProfile);
    }
  }, [role, businessId]);

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
    { name: "Drugs", icon: Pill, path: "/drugs", roles: ["owner", "salesperson", "super_admin"], pharmacy: true },
    { name: "Room Board", icon: BedDouble, path: "/hotel/rooms", roles: ["owner", "salesperson", "super_admin"], hotel: true },
    { name: "Reservations", icon: CalendarDays, path: "/hotel/reservations", roles: ["owner", "salesperson", "super_admin"], hotel: true },
    { name: "Front Desk", icon: ConciergeBell, path: "/hotel/front-desk", roles: ["owner", "salesperson", "super_admin"], hotel: true },
    { name: "Room POS", icon: CircleDollarSign, path: "/hotel/room-pos", roles: ["owner", "salesperson", "super_admin"], hotel: true },
    { name: "Guests", icon: UserRound, path: "/hotel/guests", roles: ["owner", "salesperson", "super_admin"], hotel: true },
    { name: "Revenue & Audit", icon: BarChart3, path: "/hotel/reports", roles: ["owner", "salesperson", "super_admin"], hotel: true },
    { name: "Online Booking", icon: Ticket, path: "/hotel/booking-widget", roles: ["owner", "salesperson", "super_admin"], hotel: true },
    { name: "Clients", icon: Users, path: "/clients", roles: ["owner", "salesperson", "super_admin"] },
    { name: "Payments", icon: CreditCard, path: "/payments", roles: ["owner", "salesperson", "super_admin"] },
    { name: "Suppliers", icon: Truck, path: "/suppliers", roles: ["owner", "super_admin"] },
    { name: "Purchase Orders", icon: BarChart3, path: "/purchase-orders", roles: ["owner", "super_admin"] },
    { name: "WiFi Vouchers", icon: Ticket, path: "/vouchers", roles: ["owner", "salesperson", "super_admin"] },
    { name: "Reports", icon: BarChart3, path: "/reports", roles: ["owner", "super_admin"] },
    { name: "Expiry Alerts", icon: AlertCircle, path: "/expiry-alerts", roles: ["owner", "super_admin"] },
    { name: "Prescriptions", icon: Pill, path: "/prescriptions", roles: ["owner", "super_admin"] },
    { name: "Insurance Claims", icon: FileText, path: "/insurance-claims", roles: ["owner", "super_admin"] },
    { name: "Stock Adjustments", icon: BarChart3, path: "/stock-adjustments", roles: ["owner", "super_admin"] },
    { name: "Returns", icon: Truck, path: "/returns", roles: ["owner", "super_admin"] },
    { name: "Controlled Substances", icon: AlertCircle, path: "/controlled-substances", roles: ["owner", "super_admin"] },
    { name: "Barcodes", icon: Package, path: "/barcode-management", roles: ["owner", "super_admin"] },
    { name: "Staff", icon: UserCircle, path: "/staff", roles: ["owner", "super_admin"] },
    { name: "Settings", icon: Settings, path: "/settings", roles: ["owner", "super_admin"] },
    { name: "Admin", icon: Shield, path: "/admin", roles: ["super_admin"] },
    { name: "Admin Utilities", icon: Shield, path: "/admin-utilities", roles: ["super_admin"] },
  ];

  const filteredItems = menuItems.filter(item => {
    // Super admin can see every page. Regular accounts are narrowed by business type.
    const businessType = (currentBusinessProfile as any)?.businessType;
    const isPharmacy = businessType === "pharmacy";
    const isHotel = businessType === "hotel";
    if (role !== "super_admin" && isHotel) {
      const hotelPaths = new Set([
        "/dashboard", "/hotel/rooms", "/hotel/reservations", "/hotel/front-desk", "/hotel/guests",
        "/hotel/reports", "/hotel/booking-widget", "/hotel/room-pos", "/invoices", "/payments", "/reports", "/staff", "/settings", "/products", "/pos",
      ]);
      if (!hotelPaths.has(item.path)) return false;
    }
    if ((item as any).pharmacy && !isPharmacy && role !== "super_admin") {
      return false;
    }
    if ((item as any).hotel && !isHotel && role !== "super_admin") {
      return false;
    }
    
    if (role === "super_admin") {
      return item.roles.includes(role);
    }
    if (role === "owner") {
      if (!permissions || permissions.length === 0) {
        return item.roles.includes("owner");
      }
      return permissions.includes(item.path);
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

  const superAdminGroups = [
    {
      key: "general",
      label: "General Business",
      shortLabel: "GEN",
      description: "Core sales, billing, inventory, and reporting",
      paths: ["/dashboard", "/pos", "/invoices", "/products", "/clients", "/payments", "/suppliers", "/purchase-orders", "/vouchers", "/reports"],
    },
    {
      key: "pharmacy",
      label: "Pharmacy",
      shortLabel: "PHR",
      description: "Medicine, prescription, and stock controls",
      paths: ["/drugs", "/expiry-alerts", "/prescriptions", "/insurance-claims", "/stock-adjustments", "/returns", "/controlled-substances", "/barcode-management"],
    },
    {
      key: "hotel",
      label: "Hotel",
      shortLabel: "HTL",
      description: "Rooms, reservations, front desk, and guest operations",
      paths: ["/hotel/rooms", "/hotel/reservations", "/hotel/front-desk", "/hotel/room-pos", "/hotel/guests", "/hotel/reports", "/hotel/booking-widget"],
    },
    {
      key: "administration",
      label: "Administration",
      shortLabel: "ADM",
      description: "Users, business settings, and super-admin tools",
      paths: ["/staff", "/settings", "/admin", "/admin-utilities"],
    },
  ];

  const renderMenuItem = (item: (typeof menuItems)[number]) => {
    const active = pathname === item.path;
    const isDisabled = (role === "owner" || role === "salesperson") && permissions && permissions.length > 0 && !permissions.includes(item.path);
    return (
      <Link
        key={item.path}
        href={isDisabled ? "#" : item.path}
        onClick={(e) => isDisabled && e.preventDefault()}
        className={cn(
          "flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all group",
          active ? "bg-gold text-black font-bold" : "text-muted hover:text-white hover:bg-white/5",
          isDisabled && "opacity-50 cursor-not-allowed hover:bg-transparent hover:text-muted",
          collapsed && "justify-center px-0"
        )}
        title={isDisabled ? "You don't have permission to access this page" : item.name}
      >
        <item.icon size={20} className={cn(active ? "text-black" : "text-muted group-hover:text-gold")} />
        {!collapsed && <span>{item.name}</span>}
      </Link>
    );
  };

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
                "w-full text-left px-3 py-2 text-xs rounded-lg border transition-all flex items-center justify-between",
                selectedBusinessId === "SUPER_ADMIN" || !selectedBusinessId
                  ? "bg-gold/10 border-gold text-gold font-bold"
                  : "bg-white/5 border-border text-muted hover:bg-white/10"
              )}
            >
              <span className="truncate">
                {collapsed ? "Global" : (currentBusiness?.businessName || "Global View")}
              </span>
              <ChevronRight size={12} className={showBusinessSwitcher ? "rotate-90" : ""} />
            </button>
            {showBusinessSwitcher && (
              <div className="absolute left-0 top-[180px] w-[220px] bg-[#1a1a24] border border-border rounded-lg shadow-lg z-50 max-h-[300px] overflow-y-auto">
                <button
                  onClick={() => {
                    setSelectedBusinessId(null);
                    localStorage.removeItem("superadmin_selected_business");
                    setShowBusinessSwitcher(false);
                  }}
                  className={cn(
                    "w-full text-left px-4 py-2 text-xs hover:bg-white/5 transition-all border-b border-white/5",
                    !selectedBusinessId ? "text-gold font-bold bg-gold/5" : "text-white"
                  )}
                >
                  Global View (All Data)
                </button>
                {businesses.map(b => (
                  <button
                    key={b.businessId}
                    onClick={() => {
                      setSelectedBusinessId(b.businessId);
                      localStorage.setItem("superadmin_selected_business", b.businessId);
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

        {role === "super_admin" ? (
          <div className="space-y-3">
            {superAdminGroups.map((group) => {
              const isExpanded = expandedGroups[group.key];
              const groupHasActivePage = group.paths.includes(pathname);
              return (
                <section key={group.key} className="space-y-1">
                  <button
                    type="button"
                    onClick={() => setExpandedGroups((current) => ({ ...current, [group.key]: !current[group.key] }))}
                    className={cn(
                      "w-full flex items-center justify-between rounded-lg px-3 py-2 text-[10px] font-bold uppercase tracking-[0.14em] transition-colors",
                      groupHasActivePage ? "text-gold bg-gold/10" : "text-muted hover:text-white hover:bg-white/5",
                      collapsed && "justify-center px-0"
                    )}
                    title={group.label + ": " + group.description}
                  >
                    <span>{collapsed ? group.shortLabel : group.label}</span>
                    {!collapsed && <ChevronDown size={14} className={cn("transition-transform", isExpanded && "rotate-180")} />}
                  </button>
                  {isExpanded && (
                    <div className="space-y-1">
                      {group.paths.map((path) => {
                        const item = menuItems.find((candidate) => candidate.path === path);
                        return item ? renderMenuItem(item) : null;
                      })}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        ) : (
          filteredItems.map(renderMenuItem)
        )}
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
