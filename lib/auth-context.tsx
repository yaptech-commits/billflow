"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { User, onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { resolveBusinessContext, StaffRole } from "@/lib/db";
import { useRouter } from "next/navigation";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  businessId: string | null;
  role: StaffRole | null;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  businessId: null,
  role: null,
  logout: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [role, setRole] = useState<StaffRole | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u && u.email) {
        try {
          const ctx = await resolveBusinessContext(u.uid, u.email);
          setBusinessId(ctx.businessId);
          setRole(ctx.role);
        } catch {
          // Fall back to treating them as an independent owner if resolution fails.
          setBusinessId(u.uid);
          setRole("owner");
        }
      } else {
        setBusinessId(null);
        setRole(null);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  const logout = async () => {
    await signOut(auth);
    router.push("/auth/login");
  };

  return (
    <AuthContext.Provider value={{ user, loading, businessId, role, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
