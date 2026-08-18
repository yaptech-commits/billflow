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
