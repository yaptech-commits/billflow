/**
 * Migration helper to update existing businesses with auto-assigned pages
 * Run this once to backfill allowedPages for existing businesses
 */

import { collection, getDocs, updateDoc, doc } from "firebase/firestore";
import { db } from "./firebase";
import { getPagesForBusinessType } from "./business-type-config";

export async function migrateBusinessesToAutoPages() {
  try {
    const businessesRef = collection(db, "businesses");
    const snapshot = await getDocs(businessesRef);
    
    let updated = 0;
    let skipped = 0;

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

    console.log(`Migration complete: ${updated} updated, ${skipped} skipped`);
    return { updated, skipped };
  } catch (error) {
    console.error("Migration failed:", error);
    throw error;
  }
}
