import { auth } from "@/lib/firebase";
import type { BusinessProfile, InvoiceLineItem, PaymentMethod, Product } from "@/lib/db";

async function authorizedRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const user = auth.currentUser;
  if (!user) throw new Error("You must be signed in");

  const token = await user.getIdToken();
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
    throw new Error(payload.error || "Request failed");
  }
  return payload as T;
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
