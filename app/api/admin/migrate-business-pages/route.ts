import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { BusinessType, getPagesForBusinessType } from "@/lib/business-type-config";
import { errorResponseDetails, requireServerSuperAdmin } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BATCH_SIZE = 400;
const BUSINESS_TYPES = new Set<BusinessType>(["general", "pharmacy", "hotel", "coldstore", "school"]);

function isBusinessType(value: unknown): value is BusinessType {
  return typeof value === "string" && BUSINESS_TYPES.has(value as BusinessType);
}

export async function POST(request: NextRequest) {
  try {
    await requireServerSuperAdmin(request);
    const db = getAdminDb();
    const snapshot = await db.collection("businesses").get();

    let updated = 0;
    let skipped = 0;
    let batch = db.batch();
    let pendingWrites = 0;

    for (const docSnap of snapshot.docs) {
      const business = docSnap.data() as Record<string, any>;
      if (Array.isArray(business.allowedPages) && business.allowedPages.length > 0) {
        skipped++;
        continue;
      }

      const businessType = isBusinessType(business.businessType) ? business.businessType : "general";
      batch.update(docSnap.ref, { allowedPages: getPagesForBusinessType(businessType) });
      pendingWrites++;
      updated++;

      if (pendingWrites >= BATCH_SIZE) {
        await batch.commit();
        batch = db.batch();
        pendingWrites = 0;
      }
    }

    if (pendingWrites > 0) await batch.commit();
    return NextResponse.json({ updated, skipped, success: true });
  } catch (error) {
    const { status, message } = errorResponseDetails(error);
    if (status >= 500) console.error("Business-pages migration failed:", error);
    return NextResponse.json({ error: message, success: false }, { status });
  }
}
