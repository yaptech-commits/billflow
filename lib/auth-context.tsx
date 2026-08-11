"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { User, onAuthStateChanged, signOut } from "firebase/auth";
import { auth, isFirebaseConfigured } from "@/lib/firebase";
import { resolveBusinessContext, StaffRole } from "@/lib/db";
import { useRouter } from "next/navigation";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  businessId: string | null; // Effective business ID (selected or SUPER_ADMIN for super admins)
  realBusinessId: string | null; // Actual business ID of the logged-in user
  selectedBusinessId: string | null;
  setSelectedBusinessId: (id: string | null) => void;
  role: StaffRole | null;
  permissions: string[];
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
  logout: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [realBusinessId, setRealBusinessId] = useState<string | null>(null);
  const [selectedBusinessId, setSelectedBusinessId] = useState<string | null>(null);
  const [role, setRole] = useState<StaffRole | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
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
      if (u && u.email) {
        try {
          const ctx = await resolveBusinessContext(u.uid, u.email);
          setRealBusinessId(ctx.businessId);
          setRole(ctx.role);
          setPermissions(ctx.permissions || []);
          
          // For super admins, check if there's a saved selected business
          if (ctx.role === "super_admin") {
            const saved = localStorage.getItem("superadmin_selected_business");
            if (saved) setSelectedBusinessId(saved);
          }
        } catch (err: any) {
          // If it's an approval error, log out and let the login page show the message
          if (err.message?.includes("Contact BillFlow Official")) {
            await signOut(auth);
            router.push(`/auth/login?error=${encodeURIComponent(err.message)}`);
          } else {
            // Fall back to treating them as an independent owner if resolution fails for other reasons.
            setRealBusinessId(u.uid);
            setRole("owner");
            setPermissions([]);
          }
        }
      } else {
        setRealBusinessId(null);
        setRole(null);
        setPermissions([]);
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
    await signOut(auth);
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
      logout 
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
