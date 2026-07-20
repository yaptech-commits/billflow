import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
import { getAdminDb } from "@/lib/firebase-admin";
import { requireServerActor } from "@/lib/server-auth";

export async function GET(request: NextRequest) {
  try {
    const actor = await requireServerActor(request);
    
    // Only owners can list staff
    if (actor.role !== "owner") {
      return NextResponse.json(
        { error: "Only business owners can view staff" },
        { status: 403 }
      );
    }

    const db = getAdminDb();
    const staffSnapshot = await db
      .collection("staff")
      .where("businessId", "==", actor.businessId)
      .orderBy("createdAt", "desc")
      .get();

    const staff = staffSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    return NextResponse.json({ staff });
  } catch (error: any) {
    console.error("Error fetching staff:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch staff" },
      { status: 500 }
    );
  }
}
