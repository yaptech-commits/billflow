/**
 * Business Type to Pages/Features Mapping
 * Automatically assigns pages and features based on business type during registration
 */

export type BusinessType = "general" | "pharmacy" | "hotel" | "coldstore" | "school";

export interface BusinessTypeConfig {
  label: string;
  description: string;
  pages: string[];
  features: string[];
}

export const BUSINESS_TYPE_CONFIG: Record<BusinessType, BusinessTypeConfig> = {
  general: {
    label: "General Business",
    description: "Retail, wholesale, or general commerce",
    pages: [
      "/dashboard",
      "/pos",
      "/invoices",
      "/products",
      "/clients",
      "/payments",
      "/suppliers",
      "/purchase-orders",
      "/vouchers",
      "/reports",
      "/staff",
      "/settings",
    ],
    features: ["pos", "invoicing", "inventory", "clients", "payments", "suppliers"],
  },
  pharmacy: {
    label: "Pharmacy",
    description: "Pharmaceutical retail with controlled substances",
    pages: [
      "/dashboard",
      "/pos",
      "/invoices",
      "/products",
      "/drugs",
      "/clients",
      "/payments",
      "/suppliers",
      "/purchase-orders",
      "/vouchers",
      "/reports",
      "/expiry-alerts",
      "/prescriptions",
      "/insurance-claims",
      "/stock-adjustments",
      "/returns",
      "/controlled-substances",
      "/barcode-management",
      "/staff",
      "/settings",
    ],
    features: [
      "pos",
      "invoicing",
      "inventory",
      "batch-tracking",
      "expiry-alerts",
      "prescriptions",
      "insurance-claims",
      "stock-adjustments",
      "returns",
      "controlled-substances",
      "barcode-scanning",
      "clients",
      "payments",
      "suppliers",
    ],
  },
  hotel: {
    label: "Hotel",
    description: "Hotel, hospitality, and accommodation services",
    pages: [
      "/dashboard",
      "/pos",
      "/invoices",
      "/products",
      "/clients",
      "/payments",
      "/reports",
      "/staff",
      "/settings",
    ],
    features: ["pos", "invoicing", "room-management", "clients", "payments", "reporting"],
  },
  coldstore: {
    label: "Coldstore",
    description: "Cold storage and temperature-controlled warehouse",
    pages: [
      "/dashboard",
      "/invoices",
      "/products",
      "/clients",
      "/payments",
      "/suppliers",
      "/purchase-orders",
      "/reports",
      "/expiry-alerts",
      "/stock-adjustments",
      "/returns",
      "/barcode-management",
      "/staff",
      "/settings",
    ],
    features: [
      "invoicing",
      "inventory",
      "batch-tracking",
      "expiry-alerts",
      "temperature-monitoring",
      "stock-adjustments",
      "returns",
      "barcode-scanning",
      "clients",
      "payments",
      "suppliers",
    ],
  },
  school: {
    label: "School",
    description: "Educational institution",
    pages: [
      "/dashboard",
      "/invoices",
      "/products",
      "/clients",
      "/payments",
      "/reports",
      "/staff",
      "/settings",
    ],
    features: [
      "invoicing",
      "inventory",
      "student-management",
      "fee-collection",
      "reporting",
      "staff-management",
    ],
  },
};

/**
 * Get pages for a business type
 */
export function getPagesForBusinessType(businessType: BusinessType): string[] {
  return BUSINESS_TYPE_CONFIG[businessType]?.pages || BUSINESS_TYPE_CONFIG.general.pages;
}

/**
 * Get features for a business type
 */
export function getFeaturesForBusinessType(businessType: BusinessType): string[] {
  return BUSINESS_TYPE_CONFIG[businessType]?.features || BUSINESS_TYPE_CONFIG.general.features;
}

/**
 * Get business type config
 */
export function getBusinessTypeConfig(businessType: BusinessType): BusinessTypeConfig {
  return BUSINESS_TYPE_CONFIG[businessType] || BUSINESS_TYPE_CONFIG.general;
}
