import type { StaffRole } from "@/lib/db";

export const SALESPERSON_ALLOWED_ROUTES = ["/pos", "/clients"] as const;

export function isRouteAllowedForRole(pathname: string, role: StaffRole | null): boolean {
  if (role !== "salesperson") return true;

  return SALESPERSON_ALLOWED_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );
}

export function getDefaultRouteForRole(role: StaffRole | null): string {
  return role === "salesperson" ? "/pos" : "/dashboard";
}
