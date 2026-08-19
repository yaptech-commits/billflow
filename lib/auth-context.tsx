"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { User, onAuthStateChanged, signOut } from "firebase/auth";
import { auth, isFirebaseConfigured } from "@/lib/firebase";
import { resolveBusinessContext, StaffRole } from "@/lib/db";
import { claimParentLinks, getParentLinksForUser, ParentLink } from "@/lib/school-db";
import { useRouter } from "next/navigation";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  businessId: string | null; // Effective business ID (selected or SUPER_ADMIN for super admins)
  realBusinessId: string | null; // Actual business ID of the logged-in user
  selectedBusinessId: string | null;
  setSelectedBusinessId: (id: string | null) => void;
  role: StaffRole | "parent" | null;
  permissions: string[];
  propertyId: string | null;
  parentStudentIds: string[];
  parentLinks: ParentLink[];
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  businessId: null,
  realBusinessId: null,
  selectedBusinessId: null,
  setSelectedBusinessId: () => {},
  role: null,
  permissions: [],
  propertyId: null,
  parentStudentIds: [],
  parentLinks: [],
  logout: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [realBusinessId, setRealBusinessId] = useState<string | null>(null);
  const [selectedBusinessId, setSelectedBusinessId] = useState<string | null>(null);
  const [role, setRole] = useState<StaffRole | "parent" | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [propertyId, setPropertyId] = useState<string | null>(null);
  const [parentStudentIds, setParentStudentIds] = useState<string[]>([]);
  const [parentLinks, setParentLinks] = useState<ParentLink[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const businessId = role === "super_admin" 
    ? (selectedBusinessId || "SUPER_ADMIN") 
    : realBusinessId;

  useEffect(() => {
    if (!isFirebaseConfigured || !auth) {
      setLoading(false);
      return;
    }

    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setPropertyId(null);
      setParentStudentIds([]);
      setParentLinks([]);
      if (u && u.email) {
        try {
          const ctx = await resolveBusinessContext(u.uid, u.email);

          // Resolve Super Admin first so a privileged oversight account is never
          // narrowed into a parent-only portal by a linked student record.
          if (ctx.role === "super_admin") {
            setRealBusinessId(ctx.businessId);
            setRole(ctx.role);
            setPermissions(ctx.permissions || []);
            setPropertyId(null);
            const saved = localStorage.getItem("superadmin_selected_business");
            if (saved) setSelectedBusinessId(saved);
          } else {
            const links = await getParentLinksForUser(u.uid, u.email);
            if (links.length && ctx.role === "owner" && ctx.businessId === u.uid) {
              const scopedLinks = links.filter((link) => link.businessId === links[0].businessId);
              await claimParentLinks(u.uid, u.email);
              setRealBusinessId(scopedLinks[0].businessId);
              setPropertyId(scopedLinks[0].propertyId || "default_property");
              setParentLinks(scopedLinks);
              setParentStudentIds(Array.from(new Set(scopedLinks.map((link) => link.studentId))));
              setRole("parent");
              setPermissions([]);
              setLoading(false);
              return;
            }
            setRealBusinessId(ctx.businessId);
            setRole(ctx.role);
            setPermissions(ctx.permissions || []);
            setPropertyId((ctx as { propertyId?: string }).propertyId || "default_property");
          }
        } catch (err: any) {
          // If it's an approval error, log out and let the login page show the message
          if (err.message?.includes("Contact BillFlow Official")) {
            if (auth) {
              await signOut(auth);
            }
            router.push(`/auth/login?error=${encodeURIComponent(err.message)}`);
          } else {
            // Fall back to treating them as an independent owner if resolution fails for other reasons.
            setRealBusinessId(u.uid);
            setRole("owner");
            setPermissions([]);
            setPropertyId("default_property");
            setParentStudentIds([]);
            setParentLinks([]);
          }
        }
      } else {
        setRealBusinessId(null);
        setRole(null);
        setPermissions([]);
        setPropertyId(null);
        setParentStudentIds([]);
        setParentLinks([]);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  const handleSetSelectedBusinessId = (id: string | null) => {
    setSelectedBusinessId(id);
    if (id) {
      localStorage.setItem("superadmin_selected_business", id);
    } else {
      localStorage.removeItem("superadmin_selected_business");
    }
  };

  const logout = async () => {
    if (auth) {
      await signOut(auth);
    }
    localStorage.removeItem("superadmin_selected_business");
    router.push("/auth/login");
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      loading, 
      businessId, 
      realBusinessId,
      selectedBusinessId,
      setSelectedBusinessId: handleSetSelectedBusinessId,
      role, 
      permissions,
      propertyId,
      parentStudentIds,
      parentLinks,
      logout
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
