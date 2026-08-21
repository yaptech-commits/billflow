// Style reminder: Keep plan data presentation-ready for the existing BillFlow dark admin surfaces and branded signup flow.

export type ManagementPlan = "pro" | "standard" | "demo";
export type ProBusinessScale = "large" | "small";

export interface ManagementPlanDetails {
  key: ManagementPlan;
  label: string;
  packageName: string;
  startupPrice: number;
  recurringLabel?: string;
  recurringPrice?: number;
  recurringDescription?: string;
}

export const MANAGEMENT_PLAN_DETAILS: Record<ManagementPlan, ManagementPlanDetails> = {
  pro: {
    key: "pro",
    label: "Pro Management",
    packageName: "Lifetime Activation (Monthly Database Upgrade)",
    startupPrice: 3500,
    recurringLabel: "Monthly Database Upgrade",
    recurringDescription: "Large scale: 500 GH₵ / month · Small scale: 300 GH₵ / month",
  },
  standard: {
    key: "standard",
    label: "Standard Management",
    packageName: "Monthly Renewal",
    startupPrice: 1500,
    recurringLabel: "Monthly Renewal",
    recurringPrice: 300,
    recurringDescription: "300 GH₵ / month",
  },
  demo: {
    key: "demo",
    label: "Demo Management",
    packageName: "Demo access",
    startupPrice: 0,
  },
};

export function normalizeManagementPlan(value: unknown): ManagementPlan | null {
  return value === "pro" || value === "standard" || value === "demo" ? value : null;
}

export function getManagementPlanDetails(
  plan: unknown,
  scale: unknown = "large",
): ManagementPlanDetails & { recurringPrice?: number } {
  const normalizedPlan = normalizeManagementPlan(plan) ?? "demo";
  const details = MANAGEMENT_PLAN_DETAILS[normalizedPlan];

  if (normalizedPlan !== "pro") return details;

  const recurringPrice = scale === "small" ? 300 : 500;
  return {
    ...details,
    recurringPrice,
    recurringDescription: `${scale === "small" ? "Small scale" : "Large scale"}: ${recurringPrice} GH₵ / month`,
  };
}

export function formatPlanPrice(amount: number): string {
  return `${amount.toLocaleString("en-GH")} GH₵`;
}
