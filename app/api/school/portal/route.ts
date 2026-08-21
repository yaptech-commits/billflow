import { NextRequest, NextResponse } from "next/server";
import type { Firestore, QueryDocumentSnapshot } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase-admin";
import { enforceRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const DEFAULT_PROPERTY_ID = "default_property";
const DEFAULT_PORTAL_ACCENT = "#4F46E5";

function safeHexColor(value: unknown) {
  const color = String(value || "").trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color : DEFAULT_PORTAL_ACCENT;
}

function normalize(value: unknown) {
  return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function serialize(value: any): any {
  if (value == null) return value;
  if (typeof value?.toDate === "function") return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(serialize);
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, serialize(item)]));
  }
  return value;
}

function inPropertyScope(item: any, propertyId: string) {
  return !item.propertyId || item.propertyId === propertyId;
}

function gradeForScore(score: number) {
  if (score >= 80) return "A";
  if (score >= 70) return "B";
  if (score >= 60) return "C";
  if (score >= 50) return "D";
  return "F";
}

function makeCandidate(student: any, id: string) {
  return {
    id,
    fullName: student.fullName || "Unnamed student",
    admissionNumber: student.admissionNumber || "",
    classGrade: student.classGrade || "Unassigned",
    status: student.status || "active",
  };
}

function matchesLookup(student: any, lookup: string) {
  const name = normalize(student.fullName);
  const admissionNumber = normalize(student.admissionNumber);
  return admissionNumber === lookup || name === lookup || (lookup.length >= 3 && name.includes(lookup));
}

async function readDashboard(db: Firestore, student: any, studentId: string) {
  const businessId = String(student.businessId || "");
  const propertyId = String(student.propertyId || DEFAULT_PROPERTY_ID);
  if (!businessId) throw new Error("Student is not linked to a business");

  const [businessSnap, profileSnap, attendanceSnap, feesSnap, assessmentsSnap, announcementsSnap] = await Promise.all([
    db.collection("businesses").doc(businessId).get(),
    // School owners save their replaceable name and logo in businessProfiles.
    db.collection("businessProfiles").doc(businessId).get(),
    db.collection("attendance").where("businessId", "==", businessId).get(),
    db.collection("studentFees").where("businessId", "==", businessId).get(),
    db.collection("assessments").where("businessId", "==", businessId).get(),
    db.collection("schoolAnnouncements").where("businessId", "==", businessId).get(),
  ]);

  const attendance = attendanceSnap.docs
    .map((item) => ({ ...item.data(), id: item.id }))
    .filter((item: any) => item.studentId === studentId && inPropertyScope(item, propertyId))
    .sort((a: any, b: any) => String(b.date || "").localeCompare(String(a.date || "")));

  const fees = feesSnap.docs
    .map((item) => {
      const data = item.data() as any;
      const amount = Number(data.amount || 0);
      const amountPaid = Number(data.amountPaid || 0);
      return {
        ...data,
        id: item.id,
        amount,
        amountPaid,
        balance: Math.max(0, amount - amountPaid),
      };
    })
    .filter((item: any) => item.studentId === studentId && inPropertyScope(item, propertyId));

  const assessments = assessmentsSnap.docs
    .map((item) => ({ ...item.data(), id: item.id }))
    .filter((item: any) => item.studentId === studentId && inPropertyScope(item, propertyId))
    .sort((a: any, b: any) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));

  const reportCardMap = new Map<string, any[]>();
  assessments.forEach((assessment: any) => {
    const term = String(assessment.term || "Unspecified term");
    const existing = reportCardMap.get(term) || [];
    existing.push(assessment);
    reportCardMap.set(term, existing);
  });

  const reportCards = Array.from(reportCardMap.entries()).map(([term, termAssessments]) => {
    const subjects = termAssessments.map((assessment: any) => {
      const totalScore = Number(assessment.totalScore ?? Number(assessment.classScore || 0) + Number(assessment.examScore || 0));
      return {
        name: assessment.subject || "Unspecified subject",
        score: totalScore,
        grade: assessment.grade || gradeForScore(totalScore),
        remarks: assessment.remarks || "",
      };
    });
    const averageScore = subjects.length
      ? subjects.reduce((sum: number, subject: any) => sum + Number(subject.score || 0), 0) / subjects.length
      : 0;
    const latest = termAssessments[0];
    return {
      id: `${studentId}-${term}`,
      term,
      classGrade: student.classGrade || "Unassigned",
      subjects,
      averageScore: Math.round(averageScore * 10) / 10,
      overallGrade: gradeForScore(averageScore),
      publishedAt: latest?.createdAt || null,
    };
  });

  const announcements = announcementsSnap.docs
    .map((item) => ({ ...item.data(), id: item.id }))
    .filter((item: any) => {
      if (!inPropertyScope(item, propertyId)) return false;
      const targetClass = normalize(item.targetClass);
      return !targetClass || targetClass === "all" || targetClass === normalize(student.classGrade);
    })
    .sort((a: any, b: any) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));

  const business = {
    ...((businessSnap.exists ? businessSnap.data() : {}) as Record<string, any>),
    ...((profileSnap.exists ? profileSnap.data() : {}) as Record<string, any>),
  };
  return serialize({
    student: {
      id: studentId,
      businessId,
      propertyId,
      admissionNumber: student.admissionNumber || "",
      fullName: student.fullName || "Unnamed student",
      classGrade: student.classGrade || "Unassigned",
      status: student.status || "active",
    },
    school: {
      name: business.businessName || business.propertyName || "BillFlow School",
      propertyName: business.propertyName || "",
      logoDataUrl: business.logoDataUrl || "",
      portalAccentColor: safeHexColor(business.portalAccentColor || business.accentColor),
      currency: business.currency || "GHS",
      paystackPublicKey: business.paystackPublicKey || "",
    },
    attendance,
    fees,
    assessments: assessments.map((assessment: any) => {
      const score = Number(assessment.totalScore ?? Number(assessment.classScore || 0) + Number(assessment.examScore || 0));
      return {
        name: assessment.subject || "Unspecified subject",
        score,
        grade: assessment.grade || gradeForScore(score),
        remarks: assessment.remarks || "",
      };
    }),
    reportCards,
    announcements,
  });
}

export async function POST(request: NextRequest) {
  try {
    const rateLimit = await enforceRateLimit(request, {
      name: "school-parent-portal-lookup",
      limit: 12,
      windowMs: 10 * 60 * 1000,
    });
    if (!rateLimit.allowed) return rateLimitResponse(rateLimit);

    const body = await request.json().catch(() => ({}));
    const lookup = normalize(body.query);
    const requestedStudentId = String(body.studentId || "").trim();

    if (lookup.length < 2) {
      return NextResponse.json({ error: "Enter a Student ID or Ward Name." }, { status: 400 });
    }

    const db = getAdminDb();
    let selected: QueryDocumentSnapshot | undefined;

    if (requestedStudentId) {
      const studentSnap = await db.collection("students").doc(requestedStudentId).get();
      if (studentSnap.exists && matchesLookup(studentSnap.data(), lookup) && studentSnap.data()?.status !== "withdrawn") {
        selected = studentSnap as QueryDocumentSnapshot;
      }
      if (!selected) {
        return NextResponse.json({ error: "That student could not be verified with the entered ID or name." }, { status: 404 });
      }
    } else {
      const snapshot = await db.collection("students").get();
      const candidates = snapshot.docs
        .filter((item) => item.data()?.status !== "withdrawn" && matchesLookup(item.data(), lookup))
        .map((item) => makeCandidate(item.data(), item.id));

      if (!candidates.length) {
        return NextResponse.json({ error: "We could not verify those details. Check the Student ID or Ward Name and try again." }, { status: 404 });
      }
      if (candidates.length > 1) {
        return NextResponse.json({
          requiresStudentId: true,
          error: "More than one student matched. Enter the Student ID to continue.",
        }, { status: 409 });
      }
      selected = snapshot.docs.find((item) => item.id === candidates[0].id);
    }

    if (!selected) return NextResponse.json({ error: "Student record not found." }, { status: 404 });
    return NextResponse.json({ dashboard: await readDashboard(db, selected.data(), selected.id) });
  } catch (error) {
    console.error("Parent Portal lookup failed:", error);
    return NextResponse.json({ error: "The Parent Portal is temporarily unavailable. Please try again." }, { status: 500 });
  }
}
