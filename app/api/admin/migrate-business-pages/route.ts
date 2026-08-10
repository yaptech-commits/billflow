import { NextRequest, NextResponse } from "next/server";
import { collection, getDocs, updateDoc, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { getPagesForBusinessType } from "@/lib/business-type-config";

export async function POST(request: NextRequest) {
  try {
    // Get all businesses
    const businessesRef = collection(db, "businesses");
    const snapshot = await getDocs(businessesRef);

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
      await updateDoc(doc(db, "businesses", docSnap.id), {
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
