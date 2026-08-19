import { auth } from "@/lib/firebase";
import type { BusinessProfile, InvoiceLineItem, PaymentMethod, Product } from "@/lib/db";

async function authorizedRequest<T>(url: string, init?: RequestInit): Promise<T> {
  if (!auth) throw new Error("Firebase Auth is unavailable");
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

export type HotelRoomPosContext = {
  propertyId: string;
  reservationId: string;
  guestId: string;
  roomNumber: string;
  roomId?: string;
  checkout?: boolean;
};

export type PosSaleRequest = {
  idempotencyKey: string;
  shiftId: string;
  /** Active property context; the server verifies this against the authenticated actor and shift. */
  propertyId?: string;
  customerName: string;
  items: Array<{ productId: string; quantity: number; folioType?: "food_beverage" | "service" }>;
  paymentMethod: PaymentMethod;
  reference?: string;
  discountAmount?: number;
  /** Actual amount being applied now; omitted means a full POS payment for legacy sales. */
  amountPaid?: number;
  /** Optional room charge line; product inventory is not decremented for this line. */
  roomCharge?: { description: string; quantity: number; unitPrice: number };
  /** Optional hotel context; when present the same invoice/payment is also posted to the guest folio. */
  hotelContext?: HotelRoomPosContext;
};

export type PosSaleResult = {
  invoiceId: string;
  amount: number;
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  amountPaid?: number;
  items: InvoiceLineItem[];
  duplicate: boolean;
};

export async function createPosSale(data: PosSaleRequest): Promise<PosSaleResult> {
  return authorizedRequest("/api/pos/sales", {
    method: "POST",
    body: JSON.stringify(data),
  });
}
