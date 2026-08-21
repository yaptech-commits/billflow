import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { enforceRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { recordAuditEvent } from "@/lib/security-events-server";

const SUPER_ADMIN_EMAIL = "wisdomasaare41@gmail.com";
const DEFAULT_PROPERTY_ID = "default_property";

function cleanText(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Unable to create teacher profile";
  const status = message === "Authentication required" || message === "Invalid or expired session"
    ? 401
    : message.startsWith("Only school administrators") || message.startsWith("Select a specific")
      ? 403
      : message.includes("already exists")
        ? 409
        : 400;
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: NextRequest) {
  try {
    const rateLimit = await enforceRateLimit(request, {
      name: "school-teacher-profile-create",
      limit: 20,
      windowMs: 15 * 60 * 1000,
    });
    if (!rateLimit.allowed) return rateLimitResponse(rateLimit);

    const authorization = request.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) {
      throw new Error("Authentication required");
    }

    let decoded;
    try {
      decoded = await getAdminAuth().verifyIdToken(authorization.slice(7), true);
    } catch {
      throw new Error("Invalid or expired session");
    }

    const body = await request.json();
    const businessId = cleanText(body.businessId, 120);
    const propertyId = cleanText(body.propertyId, 120) || DEFAULT_PROPERTY_ID;
    const displayName = cleanText(body.displayName, 120);
    const email = cleanText(body.email, 180).toLowerCase();
    const phone = cleanText(body.phone, 40);
    const employeeId = cleanText(body.employeeId, 60);
    const subjectSpecialty = cleanText(body.subjectSpecialty, 120);

    if (!businessId || businessId === "SUPER_ADMIN") {
      throw new Error("Select a specific business before creating a teacher profile");
    }
    if (!displayName || displayName.length < 2) {
      throw new Error("Enter the teacher's full name");
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error("Enter a valid teacher email address");
    }

    const db = getAdminDb();
    const isSuperAdmin = (decoded.email || "").toLowerCase() === SUPER_ADMIN_EMAIL;
    if (!isSuperAdmin) {
      const staffIndex = await db.collection("staffIndex").doc(decoded.uid).get();
      const isOwner = !staffIndex.exists;
      if (!isOwner) {
        throw new Error("Only school administrators can create teacher profiles");
      }
      if (decoded.uid !== businessId) {
        throw new Error("You can only create teachers for your own business");
      }
    }

    const businessProfile = await db.collection("businessProfiles").doc(businessId).get();
    if (!businessProfile.exists) {
      return NextResponse.json({ error: "Business profile not found" }, { status: 404 });
    }
    const business = businessProfile.data() || {};
    if (business.businessType && business.businessType !== "school" && !isSuperAdmin) {
      throw new Error("Teacher profiles are available only for school businesses");
    }

    const duplicate = await db.collection("staff")
      .where("businessId", "==", businessId)
      .where("email", "==", email)
      .limit(1)
      .get();
    if (!duplicate.empty) {
      throw new Error("A staff or teacher profile with this email already exists");
    }

    const teacherData = {
      businessId,
      propertyId,
      email,
      displayName,
      ...(phone ? { phone } : {}),
      ...(employeeId ? { employeeId } : {}),
      ...(subjectSpecialty ? { subjectSpecialty } : {}),
      staffType: "teacher" as const,
      role: "salesperson" as const,
      status: "pending" as const,
      permissions: ["/school/teachers", "/school/classes"],
      createdAt: FieldValue.serverTimestamp(),
      createdBy: decoded.uid,
    };
    const teacherRef = await db.collection("staff").add(teacherData);
    await recordAuditEvent({
      severity: "info",
      eventType: "teacher_profile_created",
      message: "A pending teacher profile was created.",
      actorUid: decoded.uid,
      actorEmail: decoded.email || undefined,
      businessId,
      propertyId,
      route: "/api/school/teachers",
      metadata: { teacherId: teacherRef.id },
    });

    return NextResponse.json({
      teacher: {
        id: teacherRef.id,
        businessId,
        propertyId,
        email,
        displayName,
        phone: phone || undefined,
        employeeId: employeeId || undefined,
        subjectSpecialty: subjectSpecialty || undefined,
        staffType: "teacher",
        role: "salesperson",
        status: "pending",
      },
    }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
