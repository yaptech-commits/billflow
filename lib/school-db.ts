import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  Timestamp,
  serverTimestamp,
  setDoc,
  writeBatch,
} from "firebase/firestore";
import { db, auth } from "./firebase";
import { DEFAULT_SCHOOL_NOTIFICATION_TEMPLATES } from "@/lib/school-notification-templates";

function requireSchoolDb() {
  if (!db) {
    throw new Error("Firebase database is unavailable");
  }
  return db;
}

export const DEFAULT_PROPERTY_ID = "default_property";

export interface Student {
  id?: string;
  businessId: string;
  propertyId?: string;
  admissionNumber: string;
  fullName: string;
  classGrade: string;
  guardianName: string;
  guardianPhone: string;
  guardianEmail?: string;
  status: "active" | "graduated" | "withdrawn";
  createdAt?: any;
}

export interface SchoolClass {
  id?: string;
  businessId: string;
  propertyId?: string;
  name: string;
  teacherId?: string;
  teacherName?: string;
  teacherEmail?: string;
  createdAt?: any;
  updatedAt?: any;
}

export interface FeeStructure {
  id?: string;
  businessId: string;
  propertyId?: string;
  title: string;
  classGrade: string;
  amount: number;
  dueDate: string;
  term?: string;
  createdAt?: any;
}

export interface StudentFee {
  id?: string;
  businessId: string;
  propertyId?: string;
  studentId: string;
  studentName: string;
  classGrade: string;
  feeTitle: string;
  feeStructureId?: string;
  amount: number;
  amountPaid: number;
  status: "unpaid" | "partial" | "paid";
  dueDate: string;
  term?: string;
  createdAt?: any;
}

export interface AttendanceRecord {
  id?: string;
  businessId: string;
  propertyId?: string;
  studentId: string;
  studentName: string;
  classGrade: string;
  date: string;
  term?: string;
  status: "present" | "absent" | "late" | "excused";
  remarks?: string;
  createdAt?: any;
}

export interface Assessment {
  id?: string;
  businessId: string;
  propertyId?: string;
  studentId: string;
  studentName: string;
  classGrade: string;
  term: string;
  subject: string;
  classScore: number;
  examScore: number;
  totalScore?: number;
  grade?: string;
  remarks?: string;
  createdAt?: any;
}

export interface ParentLink {
  id?: string;
  businessId: string;
  propertyId?: string;
  studentId: string;
  studentName: string;
  parentEmail: string;
  parentName?: string;
  parentPhone?: string;
  parentUid?: string;
  status: "active" | "revoked";
  createdAt?: any;
  updatedAt?: any;
}

export type SchoolNotificationChannel = "in_app" | "email" | "sms" | "push" | "whatsapp";
export type SchoolNotificationType = "attendance_absence" | "fee_assigned" | "fee_payment" | "report_card_published" | "announcement" | "admission_created";
export type SchoolNotificationStatus = "queued" | "sent" | "failed" | "read";

export interface SchoolNotificationDeliveryResult {
  status: "delivered" | "queued" | "failed";
  reason?: string;
}

export interface SchoolNotification {
  id?: string;
  businessId: string;
  propertyId?: string;
  studentId: string;
  studentName: string;
  recipientEmail?: string;
  recipientPhone?: string;
  title: string;
  message: string;
  /** Optional rich email content; plain message remains the in-app/SMS fallback. */
  html?: string;
  /** Structured context for provider delivery logs and administrative audits. */
  metadata?: Record<string, string | number | boolean | null>;
  type: SchoolNotificationType;
  channels: SchoolNotificationChannel[];
  status: SchoolNotificationStatus;
  deliveryProvider?: string;
  deliveryError?: string;
  deliveryStatus?: Record<string, SchoolNotificationDeliveryResult>;
  retryCount?: number;
  maxRetries?: number;
  nextRetryAt?: any;
  lastRetryError?: string;
  lastAttemptAt?: any;
  createdAt?: any;
  sentAt?: any;
  readAt?: any;
}

export interface SchoolNotificationPreferences {
  businessId: string;
  propertyId?: string;
  enabled: boolean;
  attendanceAbsence: boolean;
  feeAssigned: boolean;
  feePayment: boolean;
  reportCardPublished: boolean;
  /** Optional SMS copy of a newly created admission letter. */
  admissionLetterSms: boolean;
  /** Optional WhatsApp copy of a newly created admission letter. */
  admissionLetterWhatsapp: boolean;
  email: boolean;
  sms: boolean;
  push: boolean;
  whatsapp: boolean;
  inApp: boolean;
  feePaymentEmailSubject?: string;
  feePaymentEmailBody?: string;
  reportCardEmailSubject?: string;
  reportCardEmailBody?: string;
  updatedAt?: any;
}

export interface StudentTermAnalytics {
  studentId: string;
  studentName: string;
  classGrade: string;
  assessmentCount: number;
  averageScore: number;
  passRate: number;
  attendanceDays: number;
  presentDays: number;
  absentDays: number;
  lateDays: number;
  attendanceRate: number;
  subjectAverages: Record<string, number>;
}

export interface TermAnalytics {
  term: string;
  studentCount: number;
  averageScore: number;
  passRate: number;
  attendanceRate: number;
  classAverages: Record<string, number>;
  subjectAverages: Record<string, number>;
  students: StudentTermAnalytics[];
}

function scopedList<T extends { propertyId?: string }>(items: T[], propertyId?: string) {
  if (!propertyId) return items;
  return items.filter((item) => !item.propertyId || item.propertyId === propertyId);
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function notificationPreferencesId(businessId: string, propertyId?: string) {
  return `${businessId}__${propertyId || DEFAULT_PROPERTY_ID}`;
}

function parentLinkDocumentId(businessId: string, studentId: string, parentEmail: string) {
  return `${businessId}__${studentId}__${normalizeEmail(parentEmail)}`;
}

// ─── STUDENTS ────────────────────────────────────────────────────────────────

export async function createStudent(student: Omit<Student, "id" | "createdAt">) {
  // Allocate the Firestore document ID before writing so the generated Student ID
  // is collision-free without relying on client-side random numbers.
  const docRef = doc(collection(requireSchoolDb(), "students"));
  const admissionNumber = student.admissionNumber?.trim() || `STU-${docRef.id.slice(0, 8).toUpperCase()}`;
  await setDoc(docRef, {
    ...student,
    admissionNumber,
    propertyId: student.propertyId || DEFAULT_PROPERTY_ID,
    createdAt: serverTimestamp(),
  });
  return { id: docRef.id, admissionNumber };
}

export async function getStudents(businessId: string, propertyId?: string) {
  const snap = await getDocs(query(collection(requireSchoolDb(), "students"), where("businessId", "==", businessId)));
  const list = snap.docs.map((d) => ({ ...d.data(), id: d.id } as Student));
  return scopedList(list, propertyId);
}

export async function getStudentsByIds(businessId: string, studentIds: string[], propertyId?: string) {
  if (!studentIds.length) return [];
  const allowed = new Set(studentIds);
  const students = await getStudents(businessId, propertyId);
  return students.filter((student) => student.id && allowed.has(student.id));
}

export async function updateStudent(id: string, data: Partial<Student>) {
  await updateDoc(doc(requireSchoolDb(), "students", id), data);
}

function schoolClassDocumentId(businessId: string, propertyId: string, name: string) {
  const normalized = name.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "_");
  return `${businessId}__${propertyId || DEFAULT_PROPERTY_ID}__${normalized || "unassigned"}`;
}

export async function getSchoolClasses(businessId: string, propertyId?: string) {
  const snap = await getDocs(query(collection(requireSchoolDb(), "schoolClasses"), where("businessId", "==", businessId)));
  const list = snap.docs.map((item) => ({ ...item.data(), id: item.id } as SchoolClass));
  return scopedList(list, propertyId).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}

export async function saveSchoolClass(input: Omit<SchoolClass, "id" | "createdAt" | "updatedAt">) {
  const propertyId = input.propertyId || DEFAULT_PROPERTY_ID;
  const id = schoolClassDocumentId(input.businessId, propertyId, input.name);
  await setDoc(doc(requireSchoolDb(), "schoolClasses", id), {
    ...input,
    propertyId,
    name: input.name.trim(),
    updatedAt: serverTimestamp(),
  }, { merge: true });
  return id;
}

export async function createSchoolClass(input: Omit<SchoolClass, "id" | "createdAt" | "updatedAt">) {
  const name = input.name.trim();
  const propertyId = input.propertyId || DEFAULT_PROPERTY_ID;
  if (!name) throw new Error("Class name is required");
  const existing = await getSchoolClasses(input.businessId, propertyId);
  if (existing.some((item) => item.name.trim().toLowerCase() === name.toLowerCase())) {
    throw new Error("A class with this name already exists in the selected property");
  }
  return saveSchoolClass({ ...input, name, propertyId });
}

export async function updateSchoolClass(
  id: string,
  businessId: string,
  propertyId: string | undefined,
  previousName: string,
  updates: Pick<SchoolClass, "name" | "teacherId" | "teacherName" | "teacherEmail">,
) {
  const scopedClasses = await getSchoolClasses(businessId, propertyId);
  const existing = scopedClasses.find((item) => item.id === id);
  if (!existing) throw new Error("Class not found in the selected property");
  const property = propertyId || DEFAULT_PROPERTY_ID;
  const name = updates.name.trim();
  if (!name) throw new Error("Class name is required");
  if (scopedClasses.some((item) => item.id !== id && item.name.trim().toLowerCase() === name.toLowerCase())) {
    throw new Error("A class with this name already exists in the selected property");
  }

  const nextId = schoolClassDocumentId(businessId, property, name);
  await setDoc(doc(requireSchoolDb(), "schoolClasses", nextId), {
    businessId,
    propertyId: property,
    name,
    teacherId: updates.teacherId || undefined,
    teacherName: updates.teacherName || undefined,
    teacherEmail: updates.teacherEmail || undefined,
    createdAt: existing.createdAt || serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true });
  if (nextId !== id) await deleteDoc(doc(requireSchoolDb(), "schoolClasses", id));

  const oldName = previousName.trim();
  if (oldName !== name) {
    const students = await getStudents(businessId, property);
    const toRegroup = students.filter((student) => (student.classGrade?.trim() || "Unassigned") === oldName && student.id);
    await Promise.all(toRegroup.map((student) => updateDoc(doc(requireSchoolDb(), "students", student.id as string), { classGrade: name })));
  }
  return nextId;
}

export async function promoteClassStudents(businessId: string, propertyId: string | undefined, fromClass: string, toClass: string) {
  const source = fromClass.trim();
  const destination = toClass.trim();
  if (!source || !destination || source === destination) throw new Error("Choose a different destination class");
  const students = await getStudents(businessId, propertyId);
  const eligible = students.filter((student) => student.status === "active" && (student.classGrade?.trim() || "Unassigned") === source && student.id);
  await Promise.all(eligible.map((student) => updateDoc(doc(requireSchoolDb(), "students", student.id as string), {
    classGrade: destination,
    previousClassGrade: source,
    classPromotedAt: serverTimestamp(),
  })));
  return eligible.length;
}

export async function deleteStudent(id: string) {
  await deleteDoc(doc(requireSchoolDb(), "students", id));
}

// ─── FEE STRUCTURES ──────────────────────────────────────────────────────────

export async function createFeeStructure(fee: Omit<FeeStructure, "id" | "createdAt">) {
  const docRef = await addDoc(collection(requireSchoolDb(), "feeStructures"), {
    ...fee,
    propertyId: fee.propertyId || DEFAULT_PROPERTY_ID,
    createdAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function getFeeStructures(businessId: string, propertyId?: string) {
  const snap = await getDocs(query(collection(requireSchoolDb(), "feeStructures"), where("businessId", "==", businessId)));
  const list = snap.docs.map((d) => ({ ...d.data(), id: d.id } as FeeStructure));
  return scopedList(list, propertyId);
}

export async function deleteFeeStructure(id: string) {
  await deleteDoc(doc(requireSchoolDb(), "feeStructures", id));
}

// ─── STUDENT FEES / BILLING ──────────────────────────────────────────────────

export async function assignFeeToStudent(fee: Omit<StudentFee, "id" | "createdAt" | "amountPaid" | "status">) {
  const docRef = await addDoc(collection(requireSchoolDb(), "studentFees"), {
    ...fee,
    propertyId: fee.propertyId || DEFAULT_PROPERTY_ID,
    amountPaid: 0,
    status: "unpaid",
    createdAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function bulkAssignFeeToClass(params: {
  businessId: string;
  propertyId?: string;
  students: Student[];
  feeStructure: FeeStructure;
  classGrade: string;
}) {
  const propertyId = params.propertyId || DEFAULT_PROPERTY_ID;
  const existingFees = await getStudentFees(params.businessId, propertyId);
  const hasExistingAssignment = (studentId: string, feeStructure: FeeStructure) =>
    existingFees.some(
      (fee) =>
        fee.studentId === studentId &&
        (fee.term || "") === (feeStructure.term || "") &&
        (fee.feeStructureId
          ? fee.feeStructureId === feeStructure.id
          : fee.feeTitle === feeStructure.title),
    );
  const eligibleStudents = params.students.filter(
    (student) =>
      student.businessId === params.businessId &&
      (student.propertyId || DEFAULT_PROPERTY_ID) === propertyId &&
      student.classGrade === params.classGrade,
  );
  const studentsToAssign = eligibleStudents.filter((student) => {
    return Boolean(student.id) && !hasExistingAssignment(student.id || "", params.feeStructure);
  });

  for (let start = 0; start < studentsToAssign.length; start += 450) {
    const batch = writeBatch(requireSchoolDb());
    const chunk = studentsToAssign.slice(start, start + 450);
    chunk.forEach((student) => {
      const feeRef = doc(collection(requireSchoolDb(), "studentFees"));
      batch.set(feeRef, {
        businessId: params.businessId,
        propertyId,
        studentId: student.id,
        studentName: student.fullName,
        classGrade: student.classGrade,
        feeTitle: params.feeStructure.title,
        feeStructureId: params.feeStructure.id,
        amount: params.feeStructure.amount,
        amountPaid: 0,
        status: "unpaid",
        dueDate: params.feeStructure.dueDate,
        term: params.feeStructure.term || "Term 1",
        createdAt: serverTimestamp(),
      });
    });
    if (chunk.length > 0) await batch.commit();
  }

  return {
    eligibleCount: eligibleStudents.length,
    createdCount: studentsToAssign.length,
    skippedCount: eligibleStudents.length - studentsToAssign.length,
    createdStudentIds: studentsToAssign.map((student) => student.id || ""),
  };
}

export async function getStudentFees(businessId: string, propertyId?: string) {
  const snap = await getDocs(query(collection(requireSchoolDb(), "studentFees"), where("businessId", "==", businessId)));
  const list = snap.docs.map((d) => ({ ...d.data(), id: d.id } as StudentFee));
  return scopedList(list, propertyId);
}

export async function getStudentFeesByIds(businessId: string, studentIds: string[], propertyId?: string) {
  const allowed = new Set(studentIds);
  const fees = await getStudentFees(businessId, propertyId);
  return fees.filter((fee) => allowed.has(fee.studentId));
}

export async function recordStudentFeePayment(feeId: string, paymentAmount: number) {
  const ref = doc(requireSchoolDb(), "studentFees", feeId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Fee record not found");
  const data = snap.data() as StudentFee;
  const newPaid = (data.amountPaid || 0) + paymentAmount;
  const newStatus = newPaid >= data.amount ? "paid" : newPaid > 0 ? "partial" : "unpaid";
  await updateDoc(ref, { amountPaid: newPaid, status: newStatus });
  return { ...data, amountPaid: newPaid, status: newStatus } as StudentFee;
}

// ─── ATTENDANCE TRACKING ─────────────────────────────────────────────────────

export async function recordAttendance(record: Omit<AttendanceRecord, "id" | "createdAt">) {
  const docRef = await addDoc(collection(requireSchoolDb(), "attendance"), {
    ...record,
    propertyId: record.propertyId || DEFAULT_PROPERTY_ID,
    createdAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function getAttendance(businessId: string, propertyId?: string, date?: string, term?: string) {
  const snap = await getDocs(query(collection(requireSchoolDb(), "attendance"), where("businessId", "==", businessId)));
  let list = snap.docs.map((d) => ({ ...d.data(), id: d.id } as AttendanceRecord));
  list = scopedList(list, propertyId);
  if (date) list = list.filter((a) => a.date === date);
  if (term) list = list.filter((a) => !a.term || a.term === term);
  return list;
}

export async function getAttendanceByStudentIds(businessId: string, studentIds: string[], propertyId?: string, term?: string) {
  const allowed = new Set(studentIds);
  const attendance = await getAttendance(businessId, propertyId, undefined, term);
  return attendance.filter((record) => allowed.has(record.studentId));
}

export async function deleteAttendance(id: string) {
  await deleteDoc(doc(requireSchoolDb(), "attendance", id));
}

// ─── ASSESSMENTS & REPORT CARDS ──────────────────────────────────────────────

export async function saveAssessment(assessment: Omit<Assessment, "id" | "createdAt" | "totalScore" | "grade">) {
  const totalScore = Number(assessment.classScore || 0) + Number(assessment.examScore || 0);
  let grade = "F";
  if (totalScore >= 80) grade = "A";
  else if (totalScore >= 70) grade = "B";
  else if (totalScore >= 60) grade = "C";
  else if (totalScore >= 50) grade = "D";

  const docRef = await addDoc(collection(requireSchoolDb(), "assessments"), {
    ...assessment,
    propertyId: assessment.propertyId || DEFAULT_PROPERTY_ID,
    totalScore,
    grade,
    createdAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function getAssessments(businessId: string, propertyId?: string, studentId?: string, term?: string) {
  const snap = await getDocs(query(collection(requireSchoolDb(), "assessments"), where("businessId", "==", businessId)));
  let list = snap.docs.map((d) => ({ ...d.data(), id: d.id } as Assessment));
  list = scopedList(list, propertyId);
  if (studentId) list = list.filter((a) => a.studentId === studentId);
  if (term) list = list.filter((a) => a.term === term);
  return list;
}

export async function getAssessmentsByStudentIds(businessId: string, studentIds: string[], propertyId?: string, term?: string) {
  const allowed = new Set(studentIds);
  const assessments = await getAssessments(businessId, propertyId, undefined, term);
  return assessments.filter((assessment) => allowed.has(assessment.studentId));
}

export async function deleteAssessment(id: string) {
  await deleteDoc(doc(requireSchoolDb(), "assessments", id));
}

// ─── PARENT ACCESS ───────────────────────────────────────────────────────────

export async function createParentLink(link: Omit<ParentLink, "id" | "createdAt" | "updatedAt" | "status">) {
  const parentEmail = normalizeEmail(link.parentEmail);
  const existing = await getDocs(
    query(collection(requireSchoolDb(), "parentLinks"), where("businessId", "==", link.businessId))
  );
  const duplicate = existing.docs.some((item) => {
    const data = item.data() as ParentLink;
    return data.studentId === link.studentId && normalizeEmail(data.parentEmail) === parentEmail && data.status !== "revoked";
  });
  if (duplicate) throw new Error("This parent already has access to this student");

  const id = parentLinkDocumentId(link.businessId, link.studentId, parentEmail);
  await setDoc(doc(requireSchoolDb(), "parentLinks", id), {
    ...link,
    parentEmail,
    propertyId: link.propertyId || DEFAULT_PROPERTY_ID,
    status: "active",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true });
  return id;
}

export async function getParentLinksForUser(uid: string, email: string) {
  const [uidSnap, emailSnap] = await Promise.all([
    getDocs(query(collection(requireSchoolDb(), "parentLinks"), where("parentUid", "==", uid))),
    getDocs(query(collection(requireSchoolDb(), "parentLinks"), where("parentEmail", "==", normalizeEmail(email)))),
  ]);
  const byId = new Map<string, ParentLink>();
  [...uidSnap.docs, ...emailSnap.docs].forEach((item) => {
    const link = { ...item.data(), id: item.id } as ParentLink;
    if (link.status !== "revoked") byId.set(item.id, link);
  });
  return Array.from(byId.values());
}

export async function getParentLinks(businessId: string, propertyId?: string) {
  const snap = await getDocs(query(collection(requireSchoolDb(), "parentLinks"), where("businessId", "==", businessId)));
  const links = snap.docs.map((item) => ({ ...item.data(), id: item.id } as ParentLink));
  return scopedList(links.filter((link) => link.status !== "revoked"), propertyId);
}

export async function revokeParentLink(id: string) {
  await updateDoc(doc(requireSchoolDb(), "parentLinks", id), { status: "revoked", updatedAt: serverTimestamp() });
}

export async function claimParentLinks(uid: string, email: string) {
  const links = await getParentLinksForUser(uid, email);
  await Promise.all(
    links
      .filter((link) => link.parentUid !== uid && link.id)
      .map((link) => updateDoc(doc(requireSchoolDb(), "parentLinks", link.id!), { parentUid: uid, updatedAt: serverTimestamp() }))
  );
  return links;
}

// ─── SCHOOL NOTIFICATIONS ────────────────────────────────────────────────────

export async function enqueueSchoolNotification(notification: Omit<SchoolNotification, "id" | "createdAt" | "status">) {
  const docRef = await addDoc(collection(requireSchoolDb(), "schoolNotifications"), {
    ...notification,
    propertyId: notification.propertyId || DEFAULT_PROPERTY_ID,
    status: "queued",
    retryCount: 0,
    maxRetries: 5,
    createdAt: serverTimestamp(),
  });
  const notificationId = docRef.id;

  // Delivery is attempted through the server adapter. If no provider webhook is
  // configured, the notification remains queued and still appears in-app.
  try {
    const idToken = auth?.currentUser ? await auth.currentUser.getIdToken() : "";
    const response = await fetch("/api/school/notifications/dispatch", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
      },
      body: JSON.stringify({ ...notification, notificationId, propertyId: notification.propertyId || DEFAULT_PROPERTY_ID }),
    });
    const result = await response.json();
    const channelStatuses = Object.fromEntries(Object.entries(result.results || {}).map(([channel, value]) => [channel, value]));
    const retryCount = notification.retryCount || 0;
    const maxRetries = notification.maxRetries || 5;
    const queued = result.status === "queued" && retryCount < maxRetries;
    await updateDoc(docRef, {
      status: result.status === "delivered" ? "sent" : result.status === "partial_failure" ? "failed" : "queued",
      deliveryStatus: channelStatuses,
      retryCount: queued ? retryCount + 1 : retryCount,
      maxRetries,
      nextRetryAt: queued ? new Date(Date.now() + Math.min(60 * 60 * 1000, 2 ** retryCount * 5 * 60 * 1000)) : null,
      lastRetryError: queued ? "One or more delivery channels are not configured yet." : null,
      lastAttemptAt: serverTimestamp(),
      ...(result.status === "delivered" ? { sentAt: serverTimestamp() } : {}),
    });
  } catch (error) {
    const retryCount = notification.retryCount || 0;
    const maxRetries = notification.maxRetries || 5;
    const queued = retryCount < maxRetries;
    await updateDoc(docRef, {
      status: "queued",
      retryCount: queued ? retryCount + 1 : retryCount,
      maxRetries,
      nextRetryAt: queued ? new Date(Date.now() + Math.min(60 * 60 * 1000, 2 ** retryCount * 5 * 60 * 1000)) : null,
      lastRetryError: queued ? (error instanceof Error ? error.message : "Notification dispatch failed") : "Retry limit reached",
      lastAttemptAt: serverTimestamp(),
    });
  }
  return notificationId;
}

export async function getSchoolNotificationsForStudents(
  businessId: string,
  studentIds: string[],
  propertyId?: string,
  recipientEmail?: string,
) {
  const allowed = new Set(studentIds);
  const snap = await getDocs(query(collection(requireSchoolDb(), "schoolNotifications"), where("businessId", "==", businessId)));
  let list = snap.docs.map((item) => ({ ...item.data(), id: item.id } as SchoolNotification));
  list = scopedList(list, propertyId).filter((item) => allowed.has(item.studentId));
  if (recipientEmail) {
    const email = normalizeEmail(recipientEmail);
    list = list.filter((item) => !item.recipientEmail || normalizeEmail(item.recipientEmail) === email);
  }
  return list.sort((a, b) => String(b.createdAt?.toMillis?.() || b.createdAt || "").localeCompare(String(a.createdAt?.toMillis?.() || a.createdAt || "")));
}

export async function markSchoolNotificationRead(id: string) {
  await updateDoc(doc(requireSchoolDb(), "schoolNotifications", id), { status: "read", readAt: serverTimestamp() });
}

export async function getNotificationPreferences(businessId: string, propertyId?: string) {
  const ref = doc(requireSchoolDb(), "schoolNotificationPreferences", notificationPreferencesId(businessId, propertyId));
  const snap = await getDoc(ref);
  const defaults: SchoolNotificationPreferences = {
    businessId,
    propertyId: propertyId || DEFAULT_PROPERTY_ID,
    enabled: true,
    attendanceAbsence: true,
    feeAssigned: true,
    feePayment: true,
    reportCardPublished: true,
    admissionLetterSms: false,
    admissionLetterWhatsapp: false,
    email: true,
    sms: true,
    push: false,
    whatsapp: false,
    inApp: true,
    ...DEFAULT_SCHOOL_NOTIFICATION_TEMPLATES,
  };
  if (!snap.exists()) return defaults;
  return { ...defaults, ...snap.data(), businessId, propertyId: propertyId || DEFAULT_PROPERTY_ID } as SchoolNotificationPreferences;
}

export async function saveNotificationPreferences(preferences: SchoolNotificationPreferences) {
  const ref = doc(requireSchoolDb(), "schoolNotificationPreferences", notificationPreferencesId(preferences.businessId, preferences.propertyId));
  await setDoc(ref, { ...preferences, updatedAt: serverTimestamp() }, { merge: true });
}

// ─── TERM ANALYTICS ──────────────────────────────────────────────────────────

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function rounded(value: number) {
  return Math.round(value * 10) / 10;
}

export function buildTermAnalytics(
  students: Student[],
  assessments: Assessment[],
  attendance: AttendanceRecord[],
  term: string,
): TermAnalytics {
  const termAssessments = assessments.filter((assessment) => !term || assessment.term === term);
  const termAttendance = attendance.filter((record) => !term || !record.term || record.term === term);
  const rows = students.map((student) => {
    const studentAssessments = termAssessments.filter((assessment) => assessment.studentId === student.id);
    const studentAttendance = termAttendance.filter((record) => record.studentId === student.id);
    const scoreValues = studentAssessments.map((assessment) => Number(assessment.totalScore ?? assessment.classScore + assessment.examScore));
    const passed = scoreValues.filter((score) => score >= 50).length;
    const subjectGroups: Record<string, number[]> = {};
    studentAssessments.forEach((assessment) => {
      const subject = assessment.subject || "Unspecified";
      subjectGroups[subject] ||= [];
      subjectGroups[subject].push(Number(assessment.totalScore ?? assessment.classScore + assessment.examScore));
    });
    const subjectAverages = Object.fromEntries(Object.entries(subjectGroups).map(([subject, values]) => [subject, rounded(average(values))]));
    const presentDays = studentAttendance.filter((record) => record.status === "present" || record.status === "excused").length;
    const lateDays = studentAttendance.filter((record) => record.status === "late").length;
    const absentDays = studentAttendance.filter((record) => record.status === "absent").length;
    const attendanceDays = studentAttendance.length;
    return {
      studentId: student.id || "",
      studentName: student.fullName,
      classGrade: student.classGrade,
      assessmentCount: studentAssessments.length,
      averageScore: rounded(average(scoreValues)),
      passRate: scoreValues.length ? rounded((passed / scoreValues.length) * 100) : 0,
      attendanceDays,
      presentDays,
      absentDays,
      lateDays,
      attendanceRate: attendanceDays ? rounded(((presentDays + lateDays) / attendanceDays) * 100) : 0,
      subjectAverages,
    } satisfies StudentTermAnalytics;
  });

  const classGroups: Record<string, number[]> = {};
  const subjectGroups: Record<string, number[]> = {};
  rows.forEach((row) => {
    classGroups[row.classGrade] ||= [];
    if (row.assessmentCount) classGroups[row.classGrade].push(row.averageScore);
    Object.entries(row.subjectAverages).forEach(([subject, score]) => {
      subjectGroups[subject] ||= [];
      subjectGroups[subject].push(score);
    });
  });
  const scoreValues = rows.filter((row) => row.assessmentCount).map((row) => row.averageScore);
  const attendanceValues = rows.filter((row) => row.attendanceDays).map((row) => row.attendanceRate);
  const passRates = rows.filter((row) => row.assessmentCount).map((row) => row.passRate);
  return {
    term,
    studentCount: rows.length,
    averageScore: rounded(average(scoreValues)),
    passRate: rounded(average(passRates)),
    attendanceRate: rounded(average(attendanceValues)),
    classAverages: Object.fromEntries(Object.entries(classGroups).map(([classGrade, values]) => [classGrade, rounded(average(values))])),
    subjectAverages: Object.fromEntries(Object.entries(subjectGroups).map(([subject, values]) => [subject, rounded(average(values))])),
    students: rows,
  };
}

export function getAvailableTerms(assessments: Assessment[], attendance: AttendanceRecord[]) {
  return Array.from(new Set([...assessments.map((assessment) => assessment.term), ...attendance.map((record) => record.term).filter(Boolean) as string[]])).sort();
}


// ─── TERMLY STUDENT PAYMENT STATEMENTS ──────────────────────────────────────

export interface FeePaymentLogEntry {
  id?: string;
  businessId: string;
  propertyId?: string;
  studentId: string;
  studentName: string;
  classGrade: string;
  feeId: string;
  feeTitle: string;
  amountPaid: number;
  paymentMethod?: string;
  term?: string;
  recordedAt?: any;
}

export async function recordStudentFeePaymentDetailed(
  feeId: string,
  paymentAmount: number,
  paymentMethod = "Cash",
  term = "Term 1",
) {
  const ref = doc(requireSchoolDb(), "studentFees", feeId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Fee record not found");
  const data = snap.data() as StudentFee;
  const newPaid = (data.amountPaid || 0) + paymentAmount;
  const newStatus = newPaid >= data.amount ? "paid" : newPaid > 0 ? "partial" : "unpaid";
  await updateDoc(ref, { amountPaid: newPaid, status: newStatus });

  // Also record in fee payment logs for detailed statement history
  await addDoc(collection(requireSchoolDb(), "studentFeePayments"), {
    businessId: data.businessId,
    propertyId: data.propertyId || DEFAULT_PROPERTY_ID,
    studentId: data.studentId,
    studentName: data.studentName,
    classGrade: data.classGrade,
    feeId,
    feeTitle: data.feeTitle,
    amountPaid: paymentAmount,
    paymentMethod,
    term,
    recordedAt: serverTimestamp(),
  });

  return { ...data, amountPaid: newPaid, status: newStatus } as StudentFee;
}

export async function getStudentFeePayments(businessId: string, propertyId?: string, studentId?: string, term?: string) {
  const snap = await getDocs(query(collection(requireSchoolDb(), "studentFeePayments"), where("businessId", "==", businessId)));
  let list = snap.docs.map((d) => ({ ...d.data(), id: d.id } as FeePaymentLogEntry));
  list = scopedList(list, propertyId);
  if (studentId) list = list.filter((item) => item.studentId === studentId);
  if (term && term !== "All") list = list.filter((item) => !item.term || item.term === term);
  return list;
}

export interface SmsDeliveryAttempt {
  studentId: string;
  studentName: string;
  guardianPhone: string;
  status: "sent" | "failed" | "pending";
  providerRef?: string;
  reason?: string;
  timestamp?: string;
}

export interface SchoolAnnouncement {
  id?: string;
  businessId: string;
  propertyId?: string;
  title: string;
  message: string;
  targetClass?: string; // "all" or specific class name
  channels: SchoolNotificationChannel[];
  channel?: "email" | "sms" | "both";
  authorName?: string;
  smsTracking?: {
    totalRecipients: number;
    sentCount: number;
    failedCount: number;
    pendingCount?: number;
    attempts: SmsDeliveryAttempt[];
  };
  createdAt?: any;
}

export async function createSchoolAnnouncement(announcement: Omit<SchoolAnnouncement, "id" | "createdAt">) {
  const docRef = await addDoc(collection(requireSchoolDb(), "schoolAnnouncements"), {
    ...announcement,
    propertyId: announcement.propertyId || DEFAULT_PROPERTY_ID,
    createdAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function getSchoolAnnouncements(businessId: string, propertyId?: string) {
  const snap = await getDocs(query(collection(requireSchoolDb(), "schoolAnnouncements"), where("businessId", "==", businessId)));
  const list = snap.docs.map((d) => ({ ...d.data(), id: d.id } as SchoolAnnouncement));
  return scopedList(list, propertyId).sort((a, b) => String(b.createdAt?.toMillis?.() || b.createdAt || "").localeCompare(String(a.createdAt?.toMillis?.() || a.createdAt || "")));
}

export async function deleteSchoolAnnouncement(id: string) {
  await deleteDoc(doc(requireSchoolDb(), "schoolAnnouncements", id));
}
