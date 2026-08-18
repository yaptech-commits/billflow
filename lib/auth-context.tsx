"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { User, onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { isConfiguredSuperAdminEmail, resolveBusinessContext, StaffRole } from "@/lib/db";
import { claimParentLinks, getParentLinksForUser, ParentLink } from "@/lib/school-db";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  businessId: string | null;
  propertyId: string | null;
  role: StaffRole | "parent" | null;
  parentStudentIds: string[];
  parentLinks: ParentLink[];
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  businessId: null,
  propertyId: null,
  role: null,
  parentStudentIds: [],
  parentLinks: [],
  logout: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [propertyId, setPropertyId] = useState<string | null>(null);
  const [role, setRole] = useState<StaffRole | "parent" | null>(null);
  const [parentStudentIds, setParentStudentIds] = useState<string[]>([]);
  const [parentLinks, setParentLinks] = useState<ParentLink[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setBusinessId(null);
      setPropertyId(null);
      setParentStudentIds([]);
      setParentLinks([]);
      setRole(null);

      if (u && u.email) {
        try {
          // Super Admin resolution is intentionally first. This prevents an
          // administrative account that happens to have a guardian link from
          // being narrowed to the parent-only portal.
          const ctx = await resolveBusinessContext(u.uid, u.email);
          if (isConfiguredSuperAdminEmail(u.email) || ctx.role === "superadmin") {
            setBusinessId(ctx.businessId || "admin");
            setPropertyId(null);
            setRole("superadmin");
            setLoading(false);
            return;
          }

          // Parent access is checked after staff/owner resolution so a verified
          // Super Admin can never be redirected into the restricted portal.
          const links = await getParentLinksForUser(u.uid, u.email);
          if (links.length) {
            const currentBusinessId = links[0].businessId;
            const currentPropertyId = links[0].propertyId ?? "default_property";
            const scopedLinks = links.filter(
              (link) =>
                link.businessId === currentBusinessId &&
                (link.propertyId ?? "default_property") === currentPropertyId,
            );
            await claimParentLinks(u.uid, u.email);
            setBusinessId(currentBusinessId);
            setPropertyId(currentPropertyId);
            setParentLinks(scopedLinks);
            setParentStudentIds(Array.from(new Set(scopedLinks.map((link) => link.studentId))));
            setRole("parent");
            setLoading(false);
            return;
          }

          setBusinessId(ctx.businessId);
          setRole(ctx.role);
        } catch {
          // Fall back to treating them as an independent owner if resolution fails.
          setBusinessId(u.uid);
          setRole("owner");
        }
      } else {
        setBusinessId(null);
        setPropertyId(null);
        setRole(null);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  const logout = async () => {
    await signOut(auth);
    if (typeof window !== "undefined") window.location.assign("/auth/login");
  };

  return (
    <AuthContext.Provider
      value={{ user, loading, businessId, propertyId, role, parentStudentIds, parentLinks, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
