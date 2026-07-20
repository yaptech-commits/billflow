import { describe, expect, it } from "vitest";
import {
  getDefaultRouteForRole,
  isRouteAllowedForRole,
  SALESPERSON_ALLOWED_ROUTES,
} from "../lib/access-control";

describe("salesperson route policy", () => {
  it("allows only POS and Clients routes", () => {
    expect(SALESPERSON_ALLOWED_ROUTES).toEqual(["/pos", "/clients"]);
    expect(isRouteAllowedForRole("/pos", "salesperson")).toBe(true);
    expect(isRouteAllowedForRole("/clients", "salesperson")).toBe(true);
    expect(isRouteAllowedForRole("/clients/customer-1", "salesperson")).toBe(true);
  });

  it.each([
    "/dashboard",
    "/products",
    "/suppliers",
    "/purchase-orders",
    "/reports",
    "/settings",
    "/staff",
    "/invoices",
    "/payments",
    "/vouchers",
    "/credit-notes",
    "/anything-new",
  ])("denies salesperson access to %s", (pathname) => {
    expect(isRouteAllowedForRole(pathname, "salesperson")).toBe(false);
  });

  it("preserves owner access and role-specific landing routes", () => {
    expect(isRouteAllowedForRole("/settings", "owner")).toBe(true);
    expect(getDefaultRouteForRole("owner")).toBe("/dashboard");
    expect(getDefaultRouteForRole("salesperson")).toBe("/pos");
  });
});
