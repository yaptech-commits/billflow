import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { getPagesForBusinessType } from "@/lib/business-type-config";

export async function POST(request: NextRequest) {
  try {
    const db = getAdminDb();
    // Get all businesses
    const snapshot = await db.collection("businesses").get();

    let updated = 0;
    let skipped = 0;

    // Update each business
    for (const docSnap of snapshot.docs) {
      const business = docSnap.data();

      // Skip if already has allowedPages
      if (business.allowedPages && business.allowedPages.length > 0) {
        skipped++;
        continue;
      }

      // Get pages for business type
      const businessType = business.businessType || "general";
      const allowedPages = getPagesForBusinessType(businessType);

      // Update business with allowedPages
      await db.collection("businesses").doc(docSnap.id).update({
        allowedPages,
      });

      updated++;
    }

    return NextResponse.json({ updated, skipped, success: true });
  } catch (error) {
    console.error("Migration error:", error);
    return NextResponse.json(
      { error: "Migration failed", success: false },
      { status: 500 }
    );
  }
}
