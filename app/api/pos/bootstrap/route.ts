import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { errorResponseDetails, requireServerActor } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RECEIPT_PROFILE_FIELDS = [
  "businessId",
  "businessName",
  "address",
  "phone",
  "email",
  "logoDataUrl",
  "accentColor",
  "currency",
  "footerNote",
  "taxRate",
  "taxInclusive",
  "taxLabel",
  "printerWidth",
] as const;

export async function GET(request: NextRequest) {
  try {
    const actor = await requireServerActor(request);
    const db = getAdminDb();

    const [productSnap, profileSnap] = await Promise.all([
      db.collection("products").where("businessId", "==", actor.businessId).get(),
      db.collection("businessProfiles").doc(actor.businessId).get(),
    ]);

    const products = productSnap.docs
      .map((productDoc) => {
        const product = productDoc.data();
        return {
          id: productDoc.id,
          name: product.name,
          sku: product.sku ?? "",
          unit: product.unit ?? "",
          price: product.price,
          stockQty: product.stockQty,
          createdAtMillis: product.createdAt?.toMillis?.() ?? 0,
        };
      })
      .sort((a, b) => b.createdAtMillis - a.createdAtMillis)
      .map(({ createdAtMillis: _createdAtMillis, ...product }) => product);

    const rawProfile = profileSnap.exists ? profileSnap.data() ?? {} : {};
    const profile = Object.fromEntries(
      RECEIPT_PROFILE_FIELDS
        .filter((field) => rawProfile[field] !== undefined)
        .map((field) => [field, rawProfile[field]])
    );

    return NextResponse.json({ products, profile: profileSnap.exists ? profile : null });
  } catch (error) {
    const { status, message } = errorResponseDetails(error);
    return NextResponse.json({ error: message }, { status });
  }
}
