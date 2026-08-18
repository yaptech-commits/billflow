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
} from "firebase/firestore";
import { db } from "./firebase";

export interface Student {
  id?: string;
  businessId: string;
  propertyId?: string;
  admissionNumber: string;
  fullName: string;
  classGrade: string; // e.g. "Grade 10", "Form 3"
  guardianName: string;
  guardianPhone: string;
  guardianEmail?: string;
  status: "active" | "graduated" | "withdrawn";
  createdAt?: any;
}

export interface FeeStructure {
  id?: string;
  businessId: string;
  propertyId?: string;
  title: string; // e.g. "First Term Tuition", "Development Levy"
  classGrade: string; // "All" or specific class
  amount: number;
  dueDate: string;
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
  amount: number;
  amountPaid: number;
  status: "unpaid" | "partial" | "paid";
  dueDate: string;
  createdAt?: any;
}

// ─── STUDENTS ───────────────────────────────────────────────────────────────

export async function createStudent(student: Omit<Student, "id" | "createdAt">) {
  const docRef = await addDoc(collection(db, "students"), {
    ...student,
    createdAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function getStudents(businessId: string, propertyId?: string) {
  const snap = await getDocs(
    query(collection(db, "students"), where("businessId", "==", businessId))
  );
  const list = snap.docs.map((d) => ({ ...d.data(), id: d.id } as Student));
  if (propertyId) {
    return list.filter((s) => !s.propertyId || s.propertyId === propertyId);
  }
  return list;
}

export async function updateStudent(id: string, data: Partial<Student>) {
  await updateDoc(doc(db, "students", id), data);
}

export async function deleteStudent(id: string) {
  await deleteDoc(doc(db, "students", id));
}

// ─── FEE STRUCTURES ──────────────────────────────────────────────────────────

export async function createFeeStructure(fee: Omit<FeeStructure, "id" | "createdAt">) {
  const docRef = await addDoc(collection(db, "feeStructures"), {
    ...fee,
    createdAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function getFeeStructures(businessId: string, propertyId?: string) {
  const snap = await getDocs(
    query(collection(db, "feeStructures"), where("businessId", "==", businessId))
  );
  const list = snap.docs.map((d) => ({ ...d.data(), id: d.id } as FeeStructure));
  if (propertyId) {
    return list.filter((f) => !f.propertyId || f.propertyId === propertyId);
  }
  return list;
}

export async function deleteFeeStructure(id: string) {
  await deleteDoc(doc(db, "feeStructures", id));
}

// ─── STUDENT FEES / BILLING ──────────────────────────────────────────────────

export async function assignFeeToStudent(fee: Omit<StudentFee, "id" | "createdAt" | "amountPaid" | "status">) {
  const docRef = await addDoc(collection(db, "studentFees"), {
    ...fee,
    amountPaid: 0,
    status: "unpaid",
    createdAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function getStudentFees(businessId: string, propertyId?: string) {
  const snap = await getDocs(
    query(collection(db, "studentFees"), where("businessId", "==", businessId))
  );
  const list = snap.docs.map((d) => ({ ...d.data(), id: d.id } as StudentFee));
  if (propertyId) {
    return list.filter((f) => !f.propertyId || f.propertyId === propertyId);
  }
  return list;
}

export async function recordStudentFeePayment(feeId: string, paymentAmount: number) {
  const ref = doc(db, "studentFees", feeId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Fee record not found");
  const data = snap.data() as StudentFee;
  const newPaid = (data.amountPaid || 0) + paymentAmount;
  const newStatus = newPaid >= data.amount ? "paid" : newPaid > 0 ? "partial" : "unpaid";
  await updateDoc(ref, {
    amountPaid: newPaid,
    status: newStatus,
  });
}

// ─── ATTENDANCE TRACKING ──────────────────────────────────────────────────────

export interface AttendanceRecord {
  id?: string;
  businessId: string;
  propertyId?: string;
  studentId: string;
  studentName: string;
  classGrade: string;
  date: string; // "YYYY-MM-DD"
  status: "present" | "absent" | "late" | "excused";
  remarks?: string;
  createdAt?: any;
}

export async function recordAttendance(record: Omit<AttendanceRecord, "id" | "createdAt">) {
  const docRef = await addDoc(collection(db, "attendance"), {
    ...record,
    createdAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function getAttendance(businessId: string, propertyId?: string, date?: string) {
  const snap = await getDocs(
    query(collection(db, "attendance"), where("businessId", "==", businessId))
  );
  let list = snap.docs.map((d) => ({ ...d.data(), id: d.id } as AttendanceRecord));
  if (propertyId) {
    list = list.filter((a) => !a.propertyId || a.propertyId === propertyId);
  }
  if (date) {
    list = list.filter((a) => a.date === date);
  }
  return list;
}

export async function deleteAttendance(id: string) {
  await deleteDoc(doc(db, "attendance", id));
}

// ─── ASSESSMENTS & REPORT CARDS ──────────────────────────────────────────────

export interface Assessment {
  id?: string;
  businessId: string;
  propertyId?: string;
  studentId: string;
  studentName: string;
  classGrade: string;
  term: string; // e.g. "Term 1, 2026"
  subject: string; // e.g. "Mathematics", "English", "Science"
  classScore: number; // out of 40 or 30
  examScore: number; // out of 60 or 70
  totalScore?: number; // calculated (classScore + examScore)
  grade?: string; // A, B, C, D, F
  remarks?: string;
  createdAt?: any;
}

export async function saveAssessment(assessment: Omit<Assessment, "id" | "createdAt" | "totalScore" | "grade">) {
  const totalScore = Number(assessment.classScore || 0) + Number(assessment.examScore || 0);
  let grade = "F";
  if (totalScore >= 80) grade = "A";
  else if (totalScore >= 70) grade = "B";
  else if (totalScore >= 60) grade = "C";
  else if (totalScore >= 50) grade = "D";

  const docRef = await addDoc(collection(db, "assessments"), {
    ...assessment,
    totalScore,
    grade,
    createdAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function getAssessments(businessId: string, propertyId?: string, studentId?: string, term?: string) {
  const snap = await getDocs(
    query(collection(db, "assessments"), where("businessId", "==", businessId))
  );
  let list = snap.docs.map((d) => ({ ...d.data(), id: d.id } as Assessment));
  if (propertyId) {
    list = list.filter((a) => !a.propertyId || a.propertyId === propertyId);
  }
  if (studentId) {
    list = list.filter((a) => a.studentId === studentId);
  }
  if (term) {
    list = list.filter((a) => a.term === term);
  }
  return list;
}

export async function deleteAssessment(id: string) {
  await deleteDoc(doc(db, "assessments", id));
}
