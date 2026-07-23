import { auth } from "@/lib/firebase";
import type { BusinessProfile, InvoiceLineItem, PaymentMethod, Product } from "@/lib/db";

async function authorizedRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const user = auth.currentUser;
  if (!user) throw new Error("You must be signed in");

  const token = await user.getIdToken();
  try {
    const response = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(init?.headers ?? {}),
      },
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const errorMsg = payload.error || `HTTP ${response.status}: ${response.statusText}`;
      console.error(`[POS API Error] ${url}:`, errorMsg, payload);
      throw new Error(errorMsg);
    }
    return payload as T;
  } catch (error: any) {
    if (error instanceof Error && error.message.includes("HTTP")) {
      throw error;
    }
    console.error(`[POS API Network Error] ${url}:`, error);
    throw new Error(`Network error: ${error?.message || "Request failed"}`);
  }
}

export async function getPosBootstrap(): Promise<{
  products: Product[];
  profile: BusinessProfile | null;
}> {
  return authorizedRequest("/api/pos/bootstrap");
}

export type PosSaleRequest = {
  idempotencyKey: string;
  shiftId: string;
  customerName: string;
  items: Array<{ productId: string; quantity: number }>;
  paymentMethod: PaymentMethod;
  reference?: string;
  discountAmount?: number;
};

export type PosSaleResult = {
  invoiceId: string;
  amount: number;
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  items: InvoiceLineItem[];
  duplicate: boolean;
};

export async function createPosSale(data: PosSaleRequest): Promise<PosSaleResult> {
  return authorizedRequest("/api/pos/sales", {
    method: "POST",
    body: JSON.stringify(data),
  });
}
