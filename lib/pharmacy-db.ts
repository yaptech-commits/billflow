import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  setDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  Timestamp,
  writeBatch,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "./firebase";
import {
  ProductBatch,
  InsuranceClaim,
  StockAdjustment,
  Return,
  ControlledSubstanceLog,
  ProductBarcode,
} from "./db";

// ─── BATCH MANAGEMENT ────────────────────────────────────────────────────────

export async function createBatch(batch: Omit<ProductBatch, "id" | "createdAt">) {
  const docRef = await addDoc(collection(db, "productBatches"), {
    ...batch,
    createdAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function getBatchesForProduct(businessId: string, productId: string) {
  const snap = await getDocs(
    query(
      collection(db, "productBatches"),
      where("businessId", "==", businessId),
      where("productId", "==", productId),
      orderBy("expiryDate", "asc")
    )
  );
  return snap.docs.map((d) => ({ ...d.data(), id: d.id } as ProductBatch));
}

export async function updateBatchQuantity(batchId: string, newQuantity: number) {
  await updateDoc(doc(db, "productBatches", batchId), { quantity: newQuantity });
}

export async function deleteBatch(batchId: string) {
  await deleteDoc(doc(db, "productBatches", batchId));
}

// ─── INSURANCE CLAIMS ────────────────────────────────────────────────────────

export async function createInsuranceClaim(claim: Omit<InsuranceClaim, "id" | "createdAt">) {
  const docRef = await addDoc(collection(db, "insuranceClaims"), {
    ...claim,
    createdAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function getInsuranceClaimsForBusiness(businessId: string) {
  const snap = await getDocs(
    query(
      collection(db, "insuranceClaims"),
      where("businessId", "==", businessId),
      orderBy("createdAt", "desc")
    )
  );
  return snap.docs.map((d) => ({ ...d.data(), id: d.id } as InsuranceClaim));
}

export async function updateClaimStatus(claimId: string, status: string, approvedAt?: Timestamp) {
  const updates: any = { status };
  if (approvedAt) updates.approvedAt = approvedAt;
  await updateDoc(doc(db, "insuranceClaims", claimId), updates);
}

// ─── STOCK ADJUSTMENTS ────────────────────────────────────────────────────────

export async function createStockAdjustment(adjustment: Omit<StockAdjustment, "id" | "createdAt">) {
  const docRef = await addDoc(collection(db, "stockAdjustments"), {
    ...adjustment,
    createdAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function getStockAdjustmentsForBusiness(businessId: string) {
  const snap = await getDocs(
    query(
      collection(db, "stockAdjustments"),
      where("businessId", "==", businessId),
      orderBy("createdAt", "desc")
    )
  );
  return snap.docs.map((d) => ({ ...d.data(), id: d.id } as StockAdjustment));
}

// ─── RETURNS & REFUNDS ────────────────────────────────────────────────────────

export async function createReturn(returnData: Omit<Return, "id" | "createdAt">) {
  const docRef = await addDoc(collection(db, "returns"), {
    ...returnData,
    createdAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function getReturnsForBusiness(businessId: string) {
  const snap = await getDocs(
    query(
      collection(db, "returns"),
      where("businessId", "==", businessId),
      orderBy("createdAt", "desc")
    )
  );
  return snap.docs.map((d) => ({ ...d.data(), id: d.id } as Return));
}

export async function updateReturnStatus(returnId: string, status: string, refundedAt?: Timestamp) {
  const updates: any = { status };
  if (refundedAt) updates.refundedAt = refundedAt;
  await updateDoc(doc(db, "returns", returnId), updates);
}

// ─── CONTROLLED SUBSTANCES ────────────────────────────────────────────────────

export async function createControlledSubstanceLog(log: Omit<ControlledSubstanceLog, "id" | "createdAt">) {
  const docRef = await addDoc(collection(db, "controlledSubstanceLogs"), {
    ...log,
    createdAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function getControlledSubstanceLogsForBusiness(businessId: string) {
  const snap = await getDocs(
    query(
      collection(db, "controlledSubstanceLogs"),
      where("businessId", "==", businessId),
      orderBy("dispensedAt", "desc")
    )
  );
  return snap.docs.map((d) => ({ ...d.data(), id: d.id } as ControlledSubstanceLog));
}

// ─── BARCODE MANAGEMENT ────────────────────────────────────────────────────────

export async function createProductBarcode(barcode: Omit<ProductBarcode, "id" | "createdAt">) {
  const docRef = await addDoc(collection(db, "productBarcodes"), {
    ...barcode,
    createdAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function getProductByBarcode(businessId: string, barcode: string) {
  const snap = await getDocs(
    query(
      collection(db, "productBarcodes"),
      where("businessId", "==", businessId),
      where("barcode", "==", barcode)
    )
  );
  if (snap.empty) return null;
  return snap.docs[0].data() as ProductBarcode;
}

export async function getBarcodesForProduct(businessId: string, productId: string) {
  const snap = await getDocs(
    query(
      collection(db, "productBarcodes"),
      where("businessId", "==", businessId),
      where("productId", "==", productId)
    )
  );
  return snap.docs.map((d) => ({ ...d.data(), id: d.id } as ProductBarcode));
}

export async function deleteBarcode(barcodeId: string) {
  await deleteDoc(doc(db, "productBarcodes", barcodeId));
}
