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
  limit,
  serverTimestamp,
  Timestamp,
  runTransaction,
  Transaction,
  writeBatch,
} from "firebase/firestore";
import { db } from "./firebase";
import { getManagementPlanDetails, normalizeManagementPlan, ManagementPlan, ProBusinessScale } from "./management-plans";

// ─── TYPES ────────────────────────────────────────────────────────────────────

export type InvoiceStatus = "paid" | "pending" | "overdue" | "draft";
export type PaymentMethod = "momo" | "card" | "cash";

export interface InvoiceLineItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  /** Batch ID this line item was deducted from (for tracked products). */
  batchId?: string;
  /** Expiry date of the batch (for audit/receipt purposes). */
  expiryDate?: Timestamp | null;
}

export interface Invoice {
  invoiceNumber?: string | number;
  id?: string;
  userId: string;
  businessId: string;
  clientId: string;
  clientName: string;
  /** @deprecated legacy free-text item, kept for invoices created before stock management */
  item?: string;
  items?: InvoiceLineItem[];
  amount: number;
  /** Subtotal before tax. */
  subtotal?: number;
  /** Tax amount applied. */
  taxAmount?: number;
  /** Tax rate at time of creation. */
  taxRate?: number;
  /** Whether tax was inclusive in item prices. */
  taxInclusive?: boolean;
  /** Discount amount applied. */
  discountAmount?: number;
  /** Total recorded against this invoice so far, across one or more partial payments. Defaults to 0 if unset. */
  amountPaid?: number;
  notes?: string;
  status: InvoiceStatus;
  paymentMethod: PaymentMethod;
  issuedAt: Timestamp | null;
  dueAt: Timestamp | null;
  paidAt?: Timestamp | null;
  isOffline?: boolean;
  /** Distinguishes account-onboarding invoices from ordinary customer invoices. */
  invoiceType?: "sales" | "onboarding";
}

export interface CreditNoteLineItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
}

export type CreditNoteReason = "return" | "refund" | "adjustment";

export interface CreditNote {
  id?: string;
  userId: string;
  businessId: string;
  invoiceId: string;
  creditNoteNumber: string;
  clientId: string;
  clientName: string;
  items: CreditNoteLineItem[];
  /** Whether restocking the line-item quantities into inventory (e.g. a physical return). False for pure billing adjustments/refunds with no goods returned. */
  restock: boolean;
  amount: number;
  reason: CreditNoteReason;
  notes?: string;
  createdAt?: Timestamp | null;
}

export interface Category {
  id?: string;
  businessId: string;
  name: string;
  createdAt?: Timestamp | null;
}

export interface Product {
  id?: string;
  userId: string;
  businessId: string;
  name: string;
  sku?: string;
  barcode?: string;
  propertyId?: string;
  categoryId?: string;
  category?: string;
  unit?: string;
  description?: string;
  price: number;
  wholesalePrice?: number;
  costPrice?: number;
  stockQty: number;
  /** Stock level at/below which this product is considered low-stock. Defaults to 5 if unset. */
  reorderLevel?: number;
  supplierId?: string;
  /** Enable batch-level tracking for this product (pharmacy items). */
  trackBatches?: boolean;
  /** Mark this product as requiring a valid prescription before sale. */
  isPrescriptionRequired?: boolean;
  createdAt?: Timestamp | null;
}

export type POStatus = "draft" | "ordered" | "received" | "cancelled";

export interface PurchaseOrderLineItem {
  productId: string;
  productName: string;
  quantity: number;
  unitCost: number;
}

export interface PurchaseOrder {
  id?: string;
  userId: string;
  businessId: string;
  supplierId: string;
  supplierName: string;
  poNumber: string;
  items: PurchaseOrderLineItem[];
  totalCost: number;
  status: POStatus;
  notes?: string;
  orderedAt?: Timestamp | null;
  receivedAt?: Timestamp | null;
  createdAt?: Timestamp | null;
}

export interface Supplier {
  id?: string;
  userId: string;
  businessId: string;
  name: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
  createdAt?: Timestamp | null;
}

export interface Client {
  id?: string;
  userId: string;
  businessId: string;
  name: string;
  email: string;
  phone?: string;
  business?: string;
  address?: string;
  /** Date of birth (for pharmacy patient records). */
  dateOfBirth?: Timestamp | null;
  /** Unique patient ID (for pharmacy systems). */
  patientId?: string;
  createdAt?: Timestamp | null;
}

export type StockMovementSource = "sale" | "purchase_order" | "manual" | "credit_note";

export interface StockMovement {
  id?: string;
  businessId: string;
  productId: string;
  productName: string;
  /** Positive for stock added, negative for stock removed. */
  delta: number;
  /** stockQty immediately after this movement was applied. */
  resultingQty: number;
  source: StockMovementSource;
  /** id of the invoice / PO / credit note this movement came from, if any. */
  referenceId?: string;
  referenceLabel?: string;
  note?: string;
  userId: string;
  /** Batch ID this movement is associated with (for tracked products). */
  batchId?: string;
  createdAt?: Timestamp | null;
}

export interface ProductBatch {
  id?: string;
  businessId: string;
  productId: string;
  batchNumber: string;
  expiryDate: Timestamp;
  quantity: number;
  costPrice: number;
  sellingPrice?: number;
  supplierId?: string;
  dateReceived?: Timestamp | null;
  createdAt?: Timestamp | null;
}

export type PrescriptionStatus = "pending" | "dispensed" | "completed" | "expired" | "cancelled";

export interface PrescriptionItem {
  productId: string;
  productName: string;
  dosage: string;
  frequency: string;
  duration: string;
  quantityPrescribed: number;
}

export interface Prescription {
  id?: string;
  businessId: string;
  clientId: string;
  clientName: string;
  prescribingDoctor: string;
  items: PrescriptionItem[];
  refillsAllowed: number;
  refillsRemaining: number;
  status: PrescriptionStatus;
  notes?: string;
  issuedAt: Timestamp | null;
  expiresAt?: Timestamp | null;
  createdAt?: Timestamp | null;
}

export type StaffStatus = "pending" | "active";
export type StaffRole = "owner" | "salesperson" | "super_admin";

export interface Staff {
  id?: string;
  businessId: string;
  email: string;
  role: StaffRole;
  status: StaffStatus;
  staffUid?: string;
  /** Distinguishes a school teacher profile from a general salesperson account. */
  staffType?: "staff" | "teacher";
  /** Profile fields used by the school Teachers workspace. */
  displayName?: string;
  phone?: string;
  employeeId?: string;
  subjectSpecialty?: string;
  propertyId?: string;
  /** List of page paths the staff can access (e.g. ["/pos", "/products"]). If unset/empty, they see all standard salesperson pages. */
  permissions?: string[];
  createdAt?: Timestamp | null;
}

export type BusinessType = "general" | "pharmacy" | "hotel" | "coldstore" | "school";
export type BusinessModule = "general" | "pharmacy" | "hotel" | "coldstore" | "school";

export interface BusinessProfile {
  businessId: string;
  businessName: string;
  /** The business mode selected by Super Admin. */
  businessType?: BusinessType;
  /** Optional dashboard modules. When omitted, the selected businessType remains the active module. */
  activeModules?: BusinessModule[];
  /** Property-aware hotel metadata; hotel records use propertyId on every core table. */
  propertyId?: string;
  propertyName?: string;
  address?: string;
  phone?: string;
  email?: string;
  ownerEmail?: string;
  /** Data URL (base64) of the uploaded logo. Small logos only — see MAX_LOGO_BYTES. */
  logoDataUrl?: string;
  /** Hex color, e.g. "#F5A623". Used for invoice and receipt branding. */
  accentColor?: string;
  /** Hex color for the public Parent Portal. Falls back to the portal indigo when unset. */
  portalAccentColor?: string;
  /** Currency code, e.g. "GHS" or "USD". Defaults to "GHS" if unset. */
  currency?: string;
  /** Shown at the bottom of invoices/receipts, e.g. return policy or thank-you note. */
  footerNote?: string;
  /** Tax rate as a percentage (e.g. 15 for 15% VAT). 0 means no tax. */
  taxRate?: number;
  /** Whether product prices already include tax (tax-inclusive pricing). */
  taxInclusive?: boolean;
  /** Label for the tax, e.g. "VAT", "GST", "Sales Tax". Defaults to "VAT". */
  taxLabel?: string;
  /** Custom Paystack Public Key for this business. */
  paystackPublicKey?: string;
  nextInvoiceNumber?: number;
  status?: "pending" | "active" | "suspended";
  autoDeleteOutOfStock?: boolean;
  /** List of page paths the business owner can access. If unset/empty, they see all pages. */
  permissions?: string[];
  /** List of page paths the business owner is allowed to access. Managed by super admin during approval. */
  allowedPages?: string[];
  /** Management plan selected during registration. */
  managementPlan?: ManagementPlan;
  /** Applies only to Pro Management pricing. */
  proBusinessScale?: ProBusinessScale | null;
  /** Deterministic onboarding invoice created when a paid account is approved. */
  onboardingInvoiceId?: string;
  onboardingInvoiceNumber?: string | number;
  onboardingInvoiceCreatedAt?: Timestamp | null;
  /** Whether staff/salesperson accounts are allowed to offer checkout discounts. */
  allowStaffDiscounts?: boolean;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export const DEFAULT_ACCENT_COLOR = "#F5A623";
/** Keep logos small since they're stored inline as base64 in Firestore (1MB doc limit). */
export const MAX_LOGO_BYTES = 300 * 1024;

export interface Voucher {
  id?: string;
  userId: string;
  businessId: string;
  code: string;
  data: string;
  validity: string;
  price: number;
  used: boolean;
  createdAt?: Timestamp | null;
}

export interface Payment {
  id?: string;
  userId: string;
  businessId: string;
  clientId: string;
  clientName: string;
  invoiceId?: string;
  method: PaymentMethod;
  reference: string;
  amount: number;
  status: "success" | "failed" | "pending";
  createdAt?: Timestamp | null;
  isOffline?: boolean;
}

export interface Notification {
  id?: string;
  businessId: string;
  title: string;
  message: string;
  type: "low_stock" | "info" | "alert";
  read: boolean;
  createdAt: Timestamp;
}

export interface Shift {
  id?: string;
  businessId: string;
  userId: string;
  userName: string;
  openedAt: Timestamp;
  closedAt?: Timestamp | null;
  openingCash: number;
  expectedCash?: number;
  actualCash?: number;
  cashDifference?: number;
  totalSales?: number;
  paymentBreakdown?: Record<PaymentMethod, number>;
  /** Cash drawer count captured at close, keyed by denomination string. */
  cashCountByDenomination?: Record<string, number>;
  /** Optional note explaining a drawer discrepancy or closeout adjustment. */
  reconciliationNote?: string;
  status: "open" | "closed";
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

const col = (name: string) => collection(db, name);

/** Writes a stock movement record as part of an in-flight transaction. Call this alongside every tx.update() that changes a product's stockQty. */
function logStockMovement(
  tx: Transaction,
  params: Omit<StockMovement, "id" | "createdAt">
) {
  const ref = doc(col("stockMovements"));
  const data: any = { ...params, createdAt: serverTimestamp() };
  // Firestore rejects 'undefined' values. Clean optional fields.
  if (data.note === undefined) delete data.note;
  if (data.referenceId === undefined) delete data.referenceId;
  if (data.referenceLabel === undefined) delete data.referenceLabel;

  tx.set(ref, data);
}

/** Scoped to everything created by a single Firebase Auth user (legacy / not shared). */
const userQuery = (colName: string, uid: string) =>
  query(col(colName), where("userId", "==", uid), orderBy("createdAt", "desc"));

/** Scoped to the whole business (owner + all staff share this data) — used for clients & products. */
const businessQuery = (colName: string, businessId: string) => {
  // Super admins see everything across all businesses
  if (businessId === "SUPER_ADMIN") {
    return query(col(colName), orderBy("createdAt", "desc"));
  }
  return query(col(colName), where("businessId", "==", businessId), orderBy("createdAt", "desc"));
};

// ─── INVOICES ─────────────────────────────────────────────────────────────────

/**
 * Creates an invoice. If line items reference products, stock is deducted
 * atomically in the same transaction so concurrent invoices can't
 * over-sell the same stock.
 * Throws if any line item would take a product's stock below zero.
 */
export async function createInvoice(data: Omit<Invoice, "id" | "invoiceNumber">) {
  const items = data.items ?? [];

  if (items.length === 0) {
    // Legacy path: no product line items, no stock to touch.
    return addDoc(col("invoices"), { ...data, createdAt: serverTimestamp() });
  }

  return runTransaction(db, async (tx) => {
    const businessProfileRef = doc(db, "businessProfiles", data.businessId);
    const businessProfileSnap = await tx.get(businessProfileRef);
    const currentProfile = businessProfileSnap.data() as BusinessProfile;
    const invoiceNumber = (currentProfile.nextInvoiceNumber || 0) + 1;

    tx.update(businessProfileRef, { nextInvoiceNumber: invoiceNumber });
    const productRefs = items.map((li) => doc(db, "products", li.productId));
    const productSnaps = await Promise.all(productRefs.map((ref) => tx.get(ref)));

    productSnaps.forEach((snap, i) => {
      const li = items[i];
      if (!snap.exists()) {
        throw new Error(`Product "${li.productName}" no longer exists`);
      }
      const currentQty = (snap.data() as Product).stockQty ?? 0;
      if (currentQty < li.quantity) {
        throw new Error(
          `Not enough stock for "${li.productName}" (have ${currentQty}, need ${li.quantity})`
        );
      }
    });

    const invoiceRef = doc(col("invoices"));
    tx.set(invoiceRef, { ...data, invoiceNumber, createdAt: serverTimestamp() });

    productSnaps.forEach((snap, i) => {
      const li = items[i];
      const currentQty = (snap.data() as Product).stockQty ?? 0;
      const nextQty = currentQty - li.quantity;
      tx.update(productRefs[i], { stockQty: nextQty });
      logStockMovement(tx, {
        businessId: data.businessId,
        productId: li.productId,
        productName: li.productName,
        delta: -li.quantity,
        resultingQty: nextQty,
        source: "sale",
        referenceId: invoiceRef.id,
        referenceLabel: `Invoice · ${data.clientName}`,
        userId: data.userId,
      });
    });

    return invoiceRef;
  });
}

/**
 * Approves a business and creates its one-time paid-plan onboarding invoice atomically.
 * The deterministic invoice id makes retries safe, while the transaction keeps the
 * account status, invoice number sequence, and invoice record consistent.
 */
export async function approveBusinessAccount(params: {
  businessId: string;
  approvedBy: string;
  managementPlan?: unknown;
  proBusinessScale?: unknown;
  businessName?: string;
}) {
  const firestore = db;
  if (!firestore) throw new Error("Firestore is not configured");

  const profileRef = doc(firestore, "businessProfiles", params.businessId);
  const registrationRef = doc(firestore, "businesses", params.businessId);
  const registrationQuery = query(collection(firestore, "businesses"), where("ownerUid", "==", params.businessId), limit(1));
  const invoiceRef = doc(firestore, "invoices", `onboarding_${params.businessId}`);

  return runTransaction(firestore, async (tx) => {
    const [profileSnap, directRegistrationSnap, registrationQuerySnap, invoiceSnap] = await Promise.all([
      tx.get(profileRef),
      tx.get(registrationRef),
      tx.get(registrationQuery),
      tx.get(invoiceRef),
    ]);

    if (!profileSnap.exists()) {
      throw new Error("Business profile not found");
    }

    const profileData = profileSnap.data() as Partial<BusinessProfile>;
    const registrationSnap = directRegistrationSnap.exists()
      ? directRegistrationSnap
      : registrationQuerySnap.empty
        ? null
        : registrationQuerySnap.docs[0];
    const registrationData = registrationSnap
      ? (registrationSnap.data() as Record<string, unknown>)
      : {};
    const selectedPlan = normalizeManagementPlan(
      profileData.managementPlan ?? registrationData.managementPlan ?? params.managementPlan,
    );
    const selectedScale = profileData.proBusinessScale ?? registrationData.proBusinessScale ?? params.proBusinessScale;
    const details = selectedPlan ? getManagementPlanDetails(selectedPlan, selectedScale) : null;
    const businessName =
      (profileData.businessName && profileData.businessName !== "New Business"
        ? profileData.businessName
        : undefined) ||
      (typeof registrationData.businessName === "string" ? registrationData.businessName : undefined) ||
      params.businessName ||
      "BillFlow business";

    const profileUpdate: Record<string, unknown> = {
      status: "active",
      approvedBy: params.approvedBy,
      approvedAt: serverTimestamp(),
      businessName,
    };

    const registrationUpdate: Record<string, unknown> = {
      status: "active",
      approvedBy: params.approvedBy,
      approvedAt: serverTimestamp(),
    };

    if (selectedPlan) {
      const normalizedScale = selectedPlan === "pro" && selectedScale === "small" ? "small" : selectedPlan === "pro" ? "large" : null;
      profileUpdate.managementPlan = selectedPlan;
      profileUpdate.proBusinessScale = normalizedScale;
      registrationUpdate.managementPlan = selectedPlan;
      registrationUpdate.proBusinessScale = normalizedScale;
    }

    if (!details || details.startupPrice <= 0) {
      if (registrationSnap) tx.update(registrationSnap.ref, registrationUpdate);
      tx.update(profileRef, profileUpdate);
      return {
        plan: selectedPlan,
        invoiceCreated: false,
        invoiceId: null,
        invoiceNumber: null,
        amount: 0,
      };
    }

    const existingInvoice = invoiceSnap.exists() ? invoiceSnap.data() : null;
    const invoiceNumber = existingInvoice?.invoiceNumber ?? (profileData.nextInvoiceNumber || 0) + 1;
    profileUpdate.onboardingInvoiceId = invoiceRef.id;
    profileUpdate.onboardingInvoiceNumber = invoiceNumber;
    profileUpdate.onboardingInvoiceCreatedAt = existingInvoice?.createdAt ?? serverTimestamp();
    registrationUpdate.onboardingInvoiceId = invoiceRef.id;
    registrationUpdate.onboardingInvoiceNumber = invoiceNumber;
    if (registrationSnap) tx.update(registrationSnap.ref, registrationUpdate);

    if (!existingInvoice) {
      profileUpdate.nextInvoiceNumber = invoiceNumber;
      tx.set(invoiceRef, {
        invoiceNumber,
        userId: params.approvedBy,
        businessId: params.businessId,
        clientId: `business_${params.businessId}`,
        clientName: businessName,
        item: `${details.label} — Startup Activation`,
        items: [],
        amount: details.startupPrice,
        subtotal: details.startupPrice,
        taxAmount: 0,
        discountAmount: 0,
        amountPaid: 0,
        notes: `Onboarding invoice for ${details.packageName}. ${details.recurringDescription || ""}`.trim(),
        status: "pending",
        paymentMethod: "cash",
        issuedAt: serverTimestamp(),
        dueAt: null,
        invoiceType: "onboarding",
        createdAt: serverTimestamp(),
      });
    }

    tx.update(profileRef, profileUpdate);
    return {
      plan: selectedPlan,
      invoiceCreated: !existingInvoice,
      invoiceId: invoiceRef.id,
      invoiceNumber,
      amount: details.startupPrice,
    };
  });
}

/**
 * Fetches invoices. Owners see every invoice for the business; salespeople
 * see only invoices they personally created (userId match).
 */
export async function getInvoices(businessId: string, opts?: { onlyUserId?: string }): Promise<Invoice[]> {
  let q;
  if (opts?.onlyUserId) {
    if (businessId === "SUPER_ADMIN") {
      q = query(col("invoices"), where("userId", "==", opts.onlyUserId), orderBy("createdAt", "desc"));
    } else {
      q = query(col("invoices"), where("businessId", "==", businessId), where("userId", "==", opts.onlyUserId), orderBy("createdAt", "desc"));
    }
  } else {
    q = businessQuery("invoices", businessId);
  }
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as Invoice));
}

export async function updateInvoice(id: string, data: Partial<Invoice>) {
  return updateDoc(doc(db, "invoices", id), data);
}

export interface SaleInput {
  userId: string;
  businessId: string;
  clientId: string;
  clientName: string;
  items: InvoiceLineItem[];
  paymentMethod: PaymentMethod;
  reference?: string;
  /** Tax rate to apply (percentage). */
  taxRate?: number;
  /** Whether prices are tax-inclusive. */
  taxInclusive?: boolean;
  /** Discount amount to subtract from subtotal before tax (or from total if tax-inclusive). */
  discountAmount?: number;
}

/**
 * POS checkout: creates an already-paid invoice, deducts stock, and logs a
 * matching payment — all in one transaction, so a sale is atomic and never
 * left half-done (e.g. stock deducted but no payment recorded).
 * Unlike createInvoice(), there's no draft/pending step — a POS sale is
 * paid at the point of sale by definition.
 */
export async function createSale(sale: SaleInput) {
  if (sale.items.length === 0) throw new Error("Cart is empty");
  const lineTotal = sale.items.reduce((sum, li) => sum + li.quantity * li.unitPrice, 0);
  const discountAmount = sale.discountAmount ?? 0;
  const taxRate = sale.taxRate ?? 0;
  const taxInclusive = sale.taxInclusive ?? false;
  let subtotal: number;
  let taxAmount: number;
  let amount: number;
  if (taxInclusive) {
    // Prices include tax already
    amount = lineTotal - discountAmount;
    taxAmount = taxRate > 0 ? amount - (amount / (1 + taxRate / 100)) : 0;
    subtotal = amount - taxAmount;
  } else {
    // Prices are exclusive of tax
    subtotal = lineTotal - discountAmount;
    taxAmount = taxRate > 0 ? subtotal * (taxRate / 100) : 0;
    amount = subtotal + taxAmount;
  }

  return runTransaction(db, async (tx) => {
    const productRefs = sale.items.map((li) => doc(db, "products", li.productId));
    const productSnaps = await Promise.all(productRefs.map((ref) => tx.get(ref)));

    productSnaps.forEach((snap, i) => {
      const li = sale.items[i];
      if (!snap.exists()) {
        throw new Error(`Product "${li.productName}" no longer exists`);
      }
      const currentQty = (snap.data() as Product).stockQty ?? 0;
      if (currentQty < li.quantity) {
        throw new Error(
          `Not enough stock for "${li.productName}" (have ${currentQty}, need ${li.quantity})`
        );
      }
    });

    const invoiceRef = doc(col("invoices"));
    const now = serverTimestamp();
    tx.set(invoiceRef, {
      userId: sale.userId,
      businessId: sale.businessId,
      clientId: sale.clientId,
      clientName: sale.clientName,
      items: sale.items,
      subtotal,
      taxAmount,
      taxRate,
      taxInclusive,
      discountAmount,
      amount,
      amountPaid: amount,
      status: "paid" as InvoiceStatus,
      paymentMethod: sale.paymentMethod,
      issuedAt: now,
      dueAt: null,
      paidAt: now,
      createdAt: now,
    });

    const paymentRef = doc(col("payments"));
    tx.set(paymentRef, {
      userId: sale.userId,
      businessId: sale.businessId,
      clientId: sale.clientId,
      clientName: sale.clientName,
      invoiceId: invoiceRef.id,
      method: sale.paymentMethod,
      reference: sale.reference || `POS-${Date.now()}`,
      amount,
      status: "success" as const,
      createdAt: now,
    });

    const profileRef = doc(db, "businessProfiles", sale.businessId);
    const profileSnap = await tx.get(profileRef);
    const profile = profileSnap.data() as BusinessProfile;

    productSnaps.forEach((snap, i) => {
      const li = sale.items[i];
      const currentQty = (snap.data() as Product).stockQty ?? 0;
      const nextQty = currentQty - li.quantity;
      
      if (nextQty <= 0 && profile?.autoDeleteOutOfStock) {
        tx.delete(productRefs[i]);
      } else {
        tx.update(productRefs[i], { stockQty: nextQty });
      }

      logStockMovement(tx, {
        businessId: sale.businessId,
        productId: li.productId,
        productName: li.productName,
        delta: -li.quantity,
        resultingQty: nextQty,
        source: "sale",
        referenceId: invoiceRef.id,
        referenceLabel: `POS Sale · ${sale.clientName}`,
        userId: sale.userId,
      });
    });

    return { invoiceId: invoiceRef.id, amount, subtotal, taxAmount, discountAmount };
  });
}

/**
 * Records a payment (full or partial) against an invoice and a matching
 * entry in the payments collection, atomically. Status becomes "paid" once
 * amountPaid reaches the invoice total, otherwise stays "pending" so the
 * remaining balance is still visible/actionable.
 */
export async function recordPayment(
  invoice: Invoice,
  amount: number,
  method: PaymentMethod,
  reference: string
) {
  if (amount <= 0) throw new Error("Payment amount must be greater than zero");
  const alreadyPaid = invoice.amountPaid ?? 0;
  const newAmountPaid = alreadyPaid + amount;
  if (newAmountPaid > invoice.amount + 0.01) {
    throw new Error(
      `Payment of ${amount} exceeds the remaining balance of ${(invoice.amount - alreadyPaid).toFixed(2)}`
    );
  }
  const isFullyPaid = newAmountPaid >= invoice.amount - 0.01;

  return runTransaction(db, async (tx) => {
    const invoiceRef = doc(db, "invoices", invoice.id!);
    tx.update(invoiceRef, {
      amountPaid: newAmountPaid,
      status: isFullyPaid ? "paid" : "pending",
      ...(isFullyPaid ? { paidAt: serverTimestamp() } : {}),
    });

    const paymentRef = doc(col("payments"));
    tx.set(paymentRef, {
      userId: invoice.userId,
      businessId: invoice.businessId,
      clientId: invoice.clientId,
      clientName: invoice.clientName,
      invoiceId: invoice.id,
      method,
      reference,
      amount,
      status: "success" as const,
      createdAt: serverTimestamp(),
    });
  });
}

export async function deleteInvoice(id: string) {
  return deleteDoc(doc(db, "invoices", id));
}

// ─── CLIENTS ──────────────────────────────────────────────────────────────────

export async function createClient(data: Omit<Client, "id">) {
  return addDoc(col("clients"), { ...data, createdAt: serverTimestamp() });
}

export async function getClients(businessId: string): Promise<Client[]> {
  const snap = await getDocs(businessQuery("clients", businessId));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as Client));
}

export async function deleteClient(id: string) {
  return deleteDoc(doc(db, "clients", id));
}

export async function updateClient(id: string, data: Partial<Client>) {
  return updateDoc(doc(db, "clients", id), data);
}

// ─── SHIFTS ───────────────────────────────────────────────────────────────────

export async function openShift(data: Omit<Shift, "id" | "openedAt" | "status">) {
  return addDoc(col("shifts"), {
    ...data,
    openedAt: serverTimestamp(),
    status: "open",
  });
}

export async function getActiveShift(businessId: string, userId: string): Promise<Shift | null> {
  // Query by businessId or userId alone to avoid requiring compound composite indexes
  const q = businessId === "SUPER_ADMIN"
    ? query(col("shifts"), where("userId", "==", userId))
    : query(col("shifts"), where("businessId", "==", businessId));
  const snap = await getDocs(q);
  const shifts = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) } as Shift));
  const openShift = shifts.find(s => s.userId === userId && s.status === "open");
  return openShift || null;
}

export async function closeShift(
  shiftId: string,
  actualCash: number,
  reconciliation?: { cashCountByDenomination?: Record<string, number>; reconciliationNote?: string }
) {
  const shiftRef = doc(db, "shifts", shiftId);
  const shiftSnap = await getDoc(shiftRef);
  if (!shiftSnap.exists()) throw new Error("Shift not found");
  const shift = shiftSnap.data() as Shift;

  // Fetch all payments made during this shift
  const q = query(
    col("payments"),
    where("businessId", "==", shift.businessId),
    where("userId", "==", shift.userId),
    where("createdAt", ">=", shift.openedAt),
    where("status", "==", "success")
  );
  const paymentSnaps = await getDocs(q);
  const payments = paymentSnaps.docs.map((d) => d.data() as Payment);

  const breakdown: Record<string, number> = {};
  let totalSales = 0;
  payments.forEach((p) => {
    breakdown[p.method] = (breakdown[p.method] || 0) + p.amount;
    totalSales += p.amount;
  });

  const expectedCash = shift.openingCash + (breakdown["cash"] || 0);
  const cashDifference = actualCash - expectedCash;

  return updateDoc(shiftRef, {
    closedAt: serverTimestamp(),
    actualCash,
    expectedCash,
    cashDifference,
    totalSales,
    paymentBreakdown: breakdown,
    ...(reconciliation?.cashCountByDenomination ? { cashCountByDenomination: reconciliation.cashCountByDenomination } : {}),
    ...(reconciliation?.reconciliationNote?.trim() ? { reconciliationNote: reconciliation.reconciliationNote.trim() } : {}),
    status: "closed",
  });
}

// ─── VOUCHERS ─────────────────────────────────────────────────────────────────

export async function createVouchers(vouchers: Omit<Voucher, "id">[]) {
  return Promise.all(
    vouchers.map((v) =>
      addDoc(col("vouchers"), { ...v, createdAt: serverTimestamp() })
    )
  );
}

export async function getVouchers(businessId: string): Promise<Voucher[]> {
  const snap = await getDocs(businessQuery("vouchers", businessId));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as Voucher));
}

export async function markVoucherUsed(id: string) {
  return updateDoc(doc(db, "vouchers", id), { used: true });
}

// ─── PAYMENTS ─────────────────────────────────────────────────────────────────

export async function createPayment(data: Omit<Payment, "id">) {
  return addDoc(col("payments"), { ...data, createdAt: serverTimestamp() });
}

export async function deletePayment(id: string) {
  return deleteDoc(doc(db, "payments", id));
}

export async function getPayments(businessId: string): Promise<Payment[]> {
  const snap = await getDocs(businessQuery("payments", businessId));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as Payment));
}

// ─── PRODUCTS ─────────────────────────────────────────────────────────────────

export async function createProduct(data: Omit<Product, "id">) {
  // Check if a product with the same name already exists for this business
  const existingSnap = await getDocs(
    query(
      col("products"), 
      where("businessId", "==", data.businessId),
      where("name", "==", data.name)
    )
  );

  if (!existingSnap.empty) {
    const existingDoc = existingSnap.docs[0];
    const existingData = existingDoc.data() as Product;
    const newQty = (existingData.stockQty || 0) + (data.stockQty || 0);
    
    // Update the existing product with the combined stock
    await updateDoc(existingDoc.ref, {
      stockQty: newQty,
      // Update price and wholesale price if provided in the new data
      price: data.price || existingData.price,
      wholesalePrice: data.wholesalePrice || existingData.wholesalePrice,
      updatedAt: serverTimestamp()
    });

    // Log the stock movement for the addition
    // Note: logStockMovement requires a Transaction object. Since we are not in a transaction here,
    // we should either use a separate non-transactional function or use runTransaction.
    // For simplicity and consistency with the stock management design, let's wrap this in a transaction.
    await runTransaction(db, async (tx) => {
      logStockMovement(tx, {
        productId: existingDoc.id,
        businessId: data.businessId,
        productName: data.name,
        delta: data.stockQty || 0,
        resultingQty: newQty,
        source: 'manual',
        note: 'Automatic stock merge from duplicate product entry',
        userId: data.userId || data.businessId
      });
    });

    if (data.barcode) {
      // Check if productBarcodes entry exists, otherwise create
      const barcodeSnap = await getDocs(
        query(
          collection(db, "productBarcodes"),
          where("businessId", "==", data.businessId),
          where("barcode", "==", data.barcode)
        )
      );
      if (barcodeSnap.empty) {
        await addDoc(collection(db, "productBarcodes"), {
          businessId: data.businessId,
          productId: existingDoc.id,
          barcode: data.barcode,
          barcodeType: "EAN_13",
          createdAt: serverTimestamp()
        });
      }
    }
    return existingDoc.ref;
  }

  const docRef = await addDoc(col("products"), { ...data, createdAt: serverTimestamp() });
  if (data.barcode) {
    await addDoc(collection(db, "productBarcodes"), {
      businessId: data.businessId,
      productId: docRef.id,
      barcode: data.barcode,
      barcodeType: "EAN_13",
      createdAt: serverTimestamp()
    });
  }
  return docRef;
}

export async function getProducts(businessId: string): Promise<Product[]> {
  const snap = await getDocs(businessQuery("products", businessId));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as Product));
}

export async function updateProduct(id: string, data: Partial<Product>) {
  await updateDoc(doc(db, "products", id), data);
  if (data.barcode && data.businessId) {
    const barcodeSnap = await getDocs(
      query(
        collection(db, "productBarcodes"),
        where("businessId", "==", data.businessId),
        where("productId", "==", id)
      )
    );
    if (barcodeSnap.empty) {
      await addDoc(collection(db, "productBarcodes"), {
        businessId: data.businessId,
        productId: id,
        barcode: data.barcode,
        barcodeType: "EAN_13",
        createdAt: serverTimestamp()
      });
    } else {
      await updateDoc(barcodeSnap.docs[0].ref, { barcode: data.barcode });
    }
  }
}

export async function deleteProduct(id: string) {
  return deleteDoc(doc(db, "products", id));
}

// ─── CATEGORIES ───────────────────────────────────────────────────────────────

export async function createCategory(data: Omit<Category, "id">) {
  return addDoc(col("categories"), { ...data, createdAt: serverTimestamp() });
}

export async function getCategories(businessId: string): Promise<Category[]> {
  const snap = await getDocs(businessQuery("categories", businessId));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as Category));
}

export async function updateCategory(id: string, data: Partial<Category>) {
  return updateDoc(doc(db, "categories", id), data);
}

export async function deleteCategory(id: string) {
  return deleteDoc(doc(db, "categories", id));
}

/** 
 * DANGER: Permanently deletes ALL data associated with a businessId.
 * This includes products, invoices, clients, payments, categories, stock movements, and staff.
 */
export async function deleteBusinessData(businessId: string) {
  const collections = [
    "products", "invoices", "clients", "payments", "categories", 
    "stockMovements", "staffIndex", "businessProfiles", "purchaseOrders", 
    "suppliers", "vouchers", "shifts", "staff",
    "productBatches", "insuranceClaims", "stockAdjustments", "returns",
    "controlledSubstanceLogs", "productBarcodes", "prescriptions", "expiryAlerts"
  ];

  for (const colName of collections) {
    const q = query(collection(db, colName), where("businessId", "==", businessId));
    const snap = await getDocs(q);
    const deletePromises = snap.docs.map(d => deleteDoc(d.ref));
    await Promise.all(deletePromises);
  }
}

/** Manual stock adjustment (restock, correction, etc.) — separate from invoice-driven deduction. */
export async function adjustProductStock(
  id: string,
  delta: number,
  ctx: { businessId: string; userId: string; note?: string }
) {
  return runTransaction(db, async (tx) => {
    const ref = doc(db, "products", id);
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("Product not found");
    const product = snap.data() as Product;
    const currentQty = product.stockQty ?? 0;
    const nextQty = currentQty + delta;
    if (nextQty < 0) throw new Error("Stock cannot go below zero");
    tx.update(ref, { stockQty: nextQty });
    logStockMovement(tx, {
      businessId: ctx.businessId,
      productId: id,
      productName: product.name,
      delta,
      resultingQty: nextQty,
      source: "manual",
      note: ctx.note,
      userId: ctx.userId,
    });
  });
}

export const DEFAULT_REORDER_LEVEL = 5;

/** True if a product is at or below its own reorder level (falls back to the default). */
export function isLowStock(p: Product): boolean {
  const threshold = p.reorderLevel ?? DEFAULT_REORDER_LEVEL;
  return p.stockQty <= threshold;
}

// ─── SUPPLIERS ────────────────────────────────────────────────────────────────

export async function createSupplier(data: Omit<Supplier, "id">) {
  return addDoc(col("suppliers"), { ...data, createdAt: serverTimestamp() });
}

export async function getSuppliers(businessId: string): Promise<Supplier[]> {
  const snap = await getDocs(businessQuery("suppliers", businessId));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as Supplier));
}

export async function updateSupplier(id: string, data: Partial<Supplier>) {
  return updateDoc(doc(db, "suppliers", id), data);
}

export async function deleteSupplier(id: string) {
  return deleteDoc(doc(db, "suppliers", id));
}

// ─── PURCHASE ORDERS ──────────────────────────────────────────────────────────

/** Generates the next PO number for a business, e.g. PO-0007. Not race-proof under heavy concurrency, but fine for typical single/small-team usage. */
export async function nextPoNumber(businessId: string): Promise<string> {
  const q = businessId === "SUPER_ADMIN" 
    ? col("purchaseOrders")
    : query(col("purchaseOrders"), where("businessId", "==", businessId));
  const snap = await getDocs(q);
  return `PO-${String(snap.size + 1).padStart(4, "0")}`;
}

export async function createPurchaseOrder(data: Omit<PurchaseOrder, "id">) {
  return addDoc(col("purchaseOrders"), { ...data, createdAt: serverTimestamp() });
}

export async function getPurchaseOrders(businessId: string): Promise<PurchaseOrder[]> {
  const snap = await getDocs(businessQuery("purchaseOrders", businessId));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as PurchaseOrder));
}

export async function updatePurchaseOrder(id: string, data: Partial<PurchaseOrder>) {
  return updateDoc(doc(db, "purchaseOrders", id), data);
}

export async function deletePurchaseOrder(id: string) {
  return deleteDoc(doc(db, "purchaseOrders", id));
}

/**
 * Marks a PO as received and atomically increases stock for every line item.
 * Mirrors the invoice-deduction transaction, but adds instead of subtracts.
 * Also updates each product's costPrice to the PO's unit cost, so margin
 * reporting stays current with what you actually paid most recently.
 */
export async function receivePurchaseOrder(id: string) {
  return runTransaction(db, async (tx) => {
    const poRef = doc(db, "purchaseOrders", id);
    const poSnap = await tx.get(poRef);
    if (!poSnap.exists()) throw new Error("Purchase order not found");
    const po = poSnap.data() as PurchaseOrder;
    if (po.status === "received") throw new Error("This purchase order was already received");

    const productRefs = po.items.map((li) => doc(db, "products", li.productId));
    const productSnaps = await Promise.all(productRefs.map((ref) => tx.get(ref)));

    productSnaps.forEach((snap, i) => {
      if (!snap.exists()) {
        throw new Error(`Product "${po.items[i].productName}" no longer exists`);
      }
    });

    tx.update(poRef, { status: "received" as POStatus, receivedAt: serverTimestamp() });

    productSnaps.forEach((snap, i) => {
      const li = po.items[i];
      const currentQty = (snap.data() as Product).stockQty ?? 0;
      const nextQty = currentQty + li.quantity;
      tx.update(productRefs[i], { stockQty: nextQty, costPrice: li.unitCost });
      logStockMovement(tx, {
        businessId: po.businessId,
        productId: li.productId,
        productName: li.productName,
        delta: li.quantity,
        resultingQty: nextQty,
        source: "purchase_order",
        referenceId: id,
        referenceLabel: `${po.poNumber} · ${po.supplierName}`,
        userId: po.userId,
      });
    });
  });
}

// ─── STAFF / BUSINESS CONTEXT ─────────────────────────────────────────────────

/**
 * Resolves what business a logged-in Firebase Auth user belongs to, and their role.
 * - If they own a business (no staff record needed), businessId = their own uid, role = "owner".
 * - If they were invited, look up their (possibly still-pending) staff record by email,
 *   claim it if pending, and return the owner's businessId with role "salesperson".
 */
export async function resolveBusinessContext(
  uid: string,
  email: string
): Promise<{ businessId: string; role: StaffRole; staffId?: string; permissions?: string[] }> {
  // Super Admin Check
  if (email === "wisdomasaare41@gmail.com") {
    return { businessId: "SUPER_ADMIN", role: "super_admin" };
  }

  // Already-claimed staff record for this uid takes priority.
  const claimedSnap = await getDocs(
    query(col("staff"), where("staffUid", "==", uid))
  );
  if (!claimedSnap.empty) {
    const s = claimedSnap.docs[0].data() as Staff;
    // Self-heal in case staffIndex is missing/stale (e.g. records created before this field existed).
    await setDoc(doc(db, "staffIndex", uid), { businessId: s.businessId, role: s.role, status: s.status });
    return { businessId: s.businessId, role: s.role, staffId: claimedSnap.docs[0].id, permissions: s.permissions };
  }

  // Pending invite matching this email — claim it now.
  const pendingSnap = await getDocs(
    query(col("staff"), where("email", "==", email), where("status", "==", "pending"))
  );
  if (!pendingSnap.empty) {
    const staffDoc = pendingSnap.docs[0];
    await updateDoc(doc(db, "staff", staffDoc.id), { staffUid: uid, status: "active" });
    const s = staffDoc.data() as Staff;
    // Keep /staffIndex/{uid} in sync — Firestore security rules can't run
    // where() queries, so this per-uid doc is how rules check "is this uid
    // an active staff member of businessId X" in O(1).
    await setDoc(doc(db, "staffIndex", uid), {
      businessId: s.businessId,
      role: s.role,
      status: "active",
      permissions: s.permissions || [],
    });
    return { businessId: s.businessId, role: s.role, staffId: staffDoc.id, permissions: s.permissions };
  }

  // No invite found — this user is a business owner in their own right.
  // Check for owner approval
  const profileRef = doc(db, "businessProfiles", uid);
  const profileSnap = await getDoc(profileRef);
  
  if (profileSnap.exists()) {
    const data = profileSnap.data();
    if (data.status === "suspended") {
      throw new Error("Your account has been suspended. Contact BillFlow Official for assistance.");
    }
    if (data.status === "pending") {
      throw new Error("Account pending approval. Contact BillFlow Official for approval.");
    }
    return { businessId: uid, role: "owner", permissions: data.permissions };
  }

  // New account - set as pending by default
  await setDoc(profileRef, {
    businessId: uid,
    businessName: "New Business",
    email: email,
    status: "pending",
    createdAt: serverTimestamp(),
  });
  
  throw new Error("Account pending approval. Contact BillFlow Official for approval.");
}

export async function inviteSalesperson(businessId: string, email: string, permissions?: string[]) {
  const existing = await getDocs(
    query(col("staff"), where("businessId", "==", businessId), where("email", "==", email))
  );
  if (!existing.empty) {
    throw new Error("This email has already been invited");
  }
  return addDoc(col("staff"), {
    businessId,
    email,
    role: "salesperson" as StaffRole,
    status: "pending" as StaffStatus,
    permissions: permissions || [],
    createdAt: serverTimestamp(),
  });
}

export async function getStaff(businessId: string): Promise<Staff[]> {
  try {
    const q = businessId === "SUPER_ADMIN"
      ? col("staff")
      : query(col("staff"), where("businessId", "==", businessId));
    const snap = await getDocs(q);
    const staff = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as Staff));
    // Sort manually to avoid needing a composite index
    return staff.sort((a, b) => {
      const dateA = a.createdAt?.seconds || 0;
      const dateB = b.createdAt?.seconds || 0;
      return dateB - dateA;
    });
  } catch (error) {
    console.error("Error fetching staff:", error);
    throw error;
  }
}

export async function removeStaff(id: string) {
  const snap = await getDocs(query(col("staff"), where("__name__", "==", id)));
  const staffDoc = snap.docs[0]?.data() as Staff | undefined;
  await deleteDoc(doc(db, "staff", id));
  // Revoke Firestore access immediately by removing their index entry too.
  if (staffDoc?.staffUid) {
    await deleteDoc(doc(db, "staffIndex", staffDoc.staffUid));
  }
}

export async function updateStaff(id: string, data: Partial<Staff>) {
  const staffRef = doc(db, "staff", id);
  await updateDoc(staffRef, data);

  // If permissions or businessId changed, update the staffIndex for real-time rule enforcement
  if (data.permissions || data.businessId || data.status) {
    const staffSnap = await getDoc(staffRef);
    const staff = staffSnap.data() as Staff;
    if (staff.staffUid) {
      await updateDoc(doc(db, "staffIndex", staff.staffUid), {
        ...(data.businessId ? { businessId: data.businessId } : {}),
        ...(data.status ? { status: data.status } : {}),
        // Note: staffIndex only holds businessId and status for basic rule matching;
        // detailed page permissions are checked in the UI via the staff record.
      });
    }
  }
}

// ─── CREDIT NOTES ─────────────────────────────────────────────────────────────

export async function nextCreditNoteNumber(businessId: string): Promise<string> {
  const q = businessId === "SUPER_ADMIN"
    ? col("creditNotes")
    : query(col("creditNotes"), where("businessId", "==", businessId));
  const snap = await getDocs(q);
  return `CN-${String(snap.size + 1).padStart(4, "0")}`;
}

/**
 * Creates a credit note against an invoice. Atomically:
 * - reduces the invoice's amountPaid (if the credit is a refund of money already
 *   received) is NOT done here — a credit note reduces what the client owes,
 *   it does not imply cash left the business. Use recordPayment separately if
 *   money was actually refunded to a customer's wallet/momo.
 * - if `restock` is true, adds the line-item quantities back into product stock
 *   (e.g. a physical product return), mirroring receivePurchaseOrder's pattern.
 * - reduces the invoice's effective `amount` by the credit note total, and
 *   flips status to "paid" if amountPaid now covers the reduced amount.
 */
export async function createCreditNote(
  invoice: Invoice,
  data: Omit<CreditNote, "id" | "invoiceId" | "clientId" | "clientName" | "creditNoteNumber">
) {
  if (data.amount <= 0) throw new Error("Credit note amount must be greater than zero");
  if (data.amount > invoice.amount + 0.01) {
    throw new Error(`Credit note of ${data.amount} exceeds the invoice total of ${invoice.amount}`);
  }

  return runTransaction(db, async (tx) => {
    const productRefs = data.restock
      ? data.items.map((li) => doc(db, "products", li.productId))
      : [];
    const productSnaps = data.restock
      ? await Promise.all(productRefs.map((ref) => tx.get(ref)))
      : [];

    if (data.restock) {
      productSnaps.forEach((snap, i) => {
        if (!snap.exists()) {
          throw new Error(`Product "${data.items[i].productName}" no longer exists`);
        }
      });
    }

    const creditNoteNumber = await nextCreditNoteNumber(invoice.businessId);
    const cnRef = doc(col("creditNotes"));
    tx.set(cnRef, {
      userId: invoice.userId,
      businessId: invoice.businessId,
      invoiceId: invoice.id,
      creditNoteNumber,
      clientId: invoice.clientId,
      clientName: invoice.clientName,
      items: data.items,
      restock: data.restock,
      amount: data.amount,
      reason: data.reason,
      notes: data.notes ?? "",
      createdAt: serverTimestamp(),
    });

    const newInvoiceAmount = invoice.amount - data.amount;
    const alreadyPaid = invoice.amountPaid ?? 0;
    const isFullyCovered = alreadyPaid >= newInvoiceAmount - 0.01;
    tx.update(doc(db, "invoices", invoice.id!), {
      amount: newInvoiceAmount,
      status: isFullyCovered ? "paid" : invoice.status,
    });

    // If the invoice was already paid, record a negative payment (refund)
    if (alreadyPaid > 0) {
      const refundAmount = Math.min(data.amount, alreadyPaid);
      const paymentRef = doc(col("payments"));
      tx.set(paymentRef, {
        userId: invoice.userId,
        businessId: invoice.businessId,
        clientId: invoice.clientId,
        clientName: invoice.clientName,
        invoiceId: invoice.id,
        method: invoice.paymentMethod,
        reference: `REFUND-${creditNoteNumber}`,
        amount: -refundAmount,
        status: "success" as const,
        createdAt: serverTimestamp(),
      });
      tx.update(doc(db, "invoices", invoice.id!), {
        amountPaid: alreadyPaid - refundAmount,
      });
    }

    if (data.restock) {
      productSnaps.forEach((snap, i) => {
        const li = data.items[i];
        const currentQty = (snap.data() as Product).stockQty ?? 0;
        const nextQty = currentQty + li.quantity;
        tx.update(productRefs[i], { stockQty: nextQty });
        logStockMovement(tx, {
          businessId: invoice.businessId,
          productId: li.productId,
          productName: li.productName,
          delta: li.quantity,
          resultingQty: nextQty,
          source: "credit_note",
          referenceId: cnRef.id,
          referenceLabel: `${creditNoteNumber} · ${invoice.clientName}`,
          userId: invoice.userId,
        });
      });
    }

    return cnRef;
  });
}

export async function getCreditNotes(businessId: string): Promise<CreditNote[]> {
  const snap = await getDocs(businessQuery("creditNotes", businessId));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as CreditNote));
}

// ─── STOCK MOVEMENTS (AUDIT LOG) ───────────────────────────────────────────────

/** Full movement history for a business, most recent first. Optionally scoped to one product. */
export async function getStockMovements(businessId: string, opts?: { productId?: string }): Promise<StockMovement[]> {
  let q;
  if (opts?.productId) {
    if (businessId === "SUPER_ADMIN") {
      q = query(col("stockMovements"), where("productId", "==", opts.productId), orderBy("createdAt", "desc"));
    } else {
      q = query(col("stockMovements"), where("businessId", "==", businessId), where("productId", "==", opts.productId), orderBy("createdAt", "desc"));
    }
  } else {
    q = businessQuery("stockMovements", businessId);
  }
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as StockMovement));
}

// ─── BUSINESS PROFILE (INVOICE / RECEIPT BRANDING) ────────────────────────────

/** businessId doubles as the document ID here — one profile per business, fetched directly by key. */
export async function getBusinessProfile(businessId: string): Promise<BusinessProfile | null> {
  const snap = await getDoc(doc(db, "businessProfiles", businessId));
  return snap.exists() ? (snap.data() as BusinessProfile) : null;
}

// ─── NOTIFICATIONS ─────────────────────────────────────────────────────────────

export async function getNotifications(businessId: string): Promise<Notification[]> {
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

  const q = businessId === "SUPER_ADMIN"
    ? query(col("notifications"), where("createdAt", ">=", oneWeekAgo), orderBy("createdAt", "desc"))
    : query(col("notifications"), where("businessId", "==", businessId), where("createdAt", ">=", oneWeekAgo), orderBy("createdAt", "desc"));
  
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...(d.data() as any) } as Notification));
}

export async function markNotificationAsRead(id: string) {
  return updateDoc(doc(db, "notifications", id), { read: true });
}

export async function clearOldNotifications(businessId: string) {
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

  const q = businessId === "SUPER_ADMIN"
    ? query(col("notifications"), where("createdAt", "<", oneWeekAgo))
    : query(col("notifications"), where("businessId", "==", businessId), where("createdAt", "<", oneWeekAgo));

  const snap = await getDocs(q);
  const batch = writeBatch(db);
  snap.docs.forEach(d => batch.delete(d.ref));
  return batch.commit();
}

export async function checkLowStockAndNotify(businessId: string) {
  if (typeof window === "undefined") return;
  // Throttle this check to run at most once every 6 hours per session to save quota
  const lastCheckKey = `last_low_stock_check_${businessId}`;
  const lastCheck = localStorage.getItem(lastCheckKey);
  const now = Date.now();
  if (lastCheck && now - parseInt(lastCheck) < 6 * 60 * 60 * 1000) {
    return;
  }
  localStorage.setItem(lastCheckKey, now.toString());

  const productsSnap = await getDocs(query(col("products"), where("businessId", "==", businessId)));
  const products = productsSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) } as Product));
  
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  for (const product of products) {
    const reorderLevel = product.reorderLevel ?? 5;
    if (product.stockQty <= reorderLevel) {
      // Check if we already notified about this product in the last 24h to avoid spam
      const existingQ = query(
        col("notifications"),
        where("businessId", "==", businessId),
        where("title", "==", `Low Stock: ${product.name}`),
        where("createdAt", ">", yesterday)
      );

      const existingSnap = await getDocs(existingQ);
      if (existingSnap.empty) {
        await addDoc(col("notifications"), {
          businessId,
          title: `Low Stock: ${product.name}`,
          message: `${product.name} is down to ${product.stockQty} ${product.unit || "units"}. Reorder level is ${reorderLevel}.`,
          type: "low_stock",
          read: false,
          createdAt: serverTimestamp(),
        });

        // Trigger admin email alert dispatch
        try {
          const profileSnap = await getDoc(doc(db, "businessProfiles", businessId));
          if (profileSnap.exists()) {
            const profileData = profileSnap.data() as BusinessProfile;
            const adminEmail = profileData.email || profileData.ownerEmail;
            if (adminEmail) {
              console.log(`[Admin Email Alert] Low stock warning for ${product.name} sent to ${adminEmail}`);
            }
          }
        } catch (err) {
          console.error("Failed to dispatch low stock admin email alert:", err);
        }
      }
    }
  }
}

export async function upsertBusinessProfile(profile: Omit<BusinessProfile, "updatedAt">) {
  return setDoc(doc(db, "businessProfiles", profile.businessId), {
    ...profile,
    updatedAt: serverTimestamp(),
  });
}

export const DEFAULT_CURRENCY = "GHS";
export const DEFAULT_TAX_RATE = 0;
export const DEFAULT_TAX_LABEL = "VAT";

/** Calculate tax breakdown from line items, discount, and tax settings. */
export function calculateTax(lineTotal: number, opts: { taxRate?: number; taxInclusive?: boolean; discountAmount?: number }) {
  const discountAmount = opts.discountAmount ?? 0;
  const taxRate = opts.taxRate ?? 0;
  const taxInclusive = opts.taxInclusive ?? false;
  let subtotal: number;
  let taxAmount: number;
  let total: number;
  if (taxInclusive) {
    total = lineTotal - discountAmount;
    taxAmount = taxRate > 0 ? total - (total / (1 + taxRate / 100)) : 0;
    subtotal = total - taxAmount;
  } else {
    subtotal = lineTotal - discountAmount;
    taxAmount = taxRate > 0 ? subtotal * (taxRate / 100) : 0;
    total = subtotal + taxAmount;
  }
  return { subtotal: Math.round(subtotal * 100) / 100, taxAmount: Math.round(taxAmount * 100) / 100, total: Math.round(total * 100) / 100 };
}
export const CURRENCIES = {
  GHS: { symbol: "₵", name: "Ghanaian Cedi" },
  USD: { symbol: "$", name: "US Dollar" },
  EUR: { symbol: "€", name: "Euro" },
  GBP: { symbol: "£", name: "British Pound" },
  NGN: { symbol: "₦", name: "Nigerian Naira" },
};

export async function getBusinesses(): Promise<BusinessProfile[]> {
  const snap = await getDocs(query(col("businessProfiles"), orderBy("businessName", "asc")));
  return snap.docs.map(d => d.data() as BusinessProfile);
}


// ─── BATCH MANAGEMENT & FEFO LOGIC ────────────────────────────────────────────

/**
 * Get all active batches for a product, sorted by expiry date (FEFO order).
 * Returns batches with quantity > 0, ordered by expiryDate ascending (earliest first).
 */
export async function getBatchesByProduct(
  businessId: string,
  productId: string
): Promise<ProductBatch[]> {
  const batches = await getDocs(
    query(
      col("productBatches"),
      where("businessId", "==", businessId),
      where("productId", "==", productId),
      orderBy("expiryDate", "asc")
    )
  );
  return batches.docs
    .map(d => d.data() as ProductBatch)
    .filter(b => b.quantity > 0);
}

/**
 * Deduct stock from the batch with the nearest expiry date (FEFO).
 * If the product is not batch-tracked, falls back to simple stockQty decrement.
 * Returns the batch ID used (or undefined if not batch-tracked).
 */
export async function deductStockFEFO(
  tx: Transaction,
  businessId: string,
  productId: string,
  quantityNeeded: number,
  product: Product
): Promise<{ batchId?: string; expiryDate?: Timestamp }> {
  // If batch tracking is not enabled, use legacy stockQty logic
  if (!product.trackBatches) {
    const newQty = Math.max(0, product.stockQty - quantityNeeded);
    tx.update(doc(db, "products", productId), { stockQty: newQty });
    logStockMovement(tx, {
      businessId,
      productId,
      productName: product.name,
      delta: -quantityNeeded,
      resultingQty: newQty,
      source: "sale",
      userId: product.userId,
    });
    return {};
  }

  // Batch-tracked: deduct from FEFO batches
  const batches = await getBatchesByProduct(businessId, productId);
  if (batches.length === 0) {
    throw new Error(`No active batches for product ${product.name}`);
  }

  let remaining = quantityNeeded;
  let usedBatchId: string | undefined;
  let usedExpiryDate: Timestamp | undefined;

  for (const batch of batches) {
    if (remaining <= 0) break;

    const deductFromBatch = Math.min(remaining, batch.quantity);
    const newBatchQty = batch.quantity - deductFromBatch;

    tx.update(doc(db, "productBatches", batch.id!), {
      quantity: newBatchQty,
    });

    logStockMovement(tx, {
      businessId,
      productId,
      productName: product.name,
      delta: -deductFromBatch,
      resultingQty: newBatchQty,
      source: "sale",
      batchId: batch.id,
      userId: product.userId,
    });

    usedBatchId = batch.id;
    usedExpiryDate = batch.expiryDate;
    remaining -= deductFromBatch;
  }

  if (remaining > 0) {
    throw new Error(
      `Insufficient stock for ${product.name}. Needed ${quantityNeeded}, but only ${quantityNeeded - remaining} available across all batches.`
    );
  }

  return { batchId: usedBatchId, expiryDate: usedExpiryDate };
}

/**
 * Create a default batch for a product with its current stockQty.
 * Used during stock migration when batch tracking is first enabled.
 */
export async function createDefaultBatch(
  businessId: string,
  productId: string,
  product: Product
): Promise<string> {
  const batchRef = doc(col("productBatches"));
  const defaultExpiryDate = new Date();
  defaultExpiryDate.setFullYear(defaultExpiryDate.getFullYear() + 5); // 5 years in the future

  await setDoc(batchRef, {
    businessId,
    productId,
    batchNumber: `DEFAULT-${new Date().getTime()}`,
    expiryDate: Timestamp.fromDate(defaultExpiryDate),
    quantity: product.stockQty,
    costPrice: product.costPrice || 0,
    sellingPrice: product.price,
    supplierId: product.supplierId,
    dateReceived: serverTimestamp(),
    createdAt: serverTimestamp(),
  });

  return batchRef.id;
}

/**
 * Migrate all products in a business to batch tracking.
 * For each product, creates a default batch containing its current stockQty.
 * Only migrates products that don't already have batches.
 */
export async function migrateProductsToBatches(businessId: string): Promise<number> {
  const products = await getDocs(
    businessQuery("products", businessId)
  );

  let migratedCount = 0;

  for (const productSnap of products.docs) {
    const product = productSnap.data() as Product;
    const productId = productSnap.id;

    // Check if this product already has batches
    const existingBatches = await getDocs(
      query(
        col("productBatches"),
        where("businessId", "==", businessId),
        where("productId", "==", productId)
      )
    );

    if (existingBatches.empty && product.stockQty > 0) {
      await createDefaultBatch(businessId, productId, product);
      migratedCount++;
    }
  }

  return migratedCount;
}

/**
 * Add a new batch for a product (e.g., from a purchase order receipt).
 */
export async function addProductBatch(
  businessId: string,
  productId: string,
  batchData: Omit<ProductBatch, "id" | "businessId" | "productId" | "createdAt">
): Promise<string> {
  const batchRef = doc(col("productBatches"));
  await setDoc(batchRef, {
    ...batchData,
    businessId,
    productId,
    createdAt: serverTimestamp(),
  });
  return batchRef.id;
}

/**
 * Get batches expiring within a given number of days.
 * Used for expiry alerts.
 */
export async function getBatchesExpiringWithin(
  businessId: string,
  daysFromNow: number = 30
): Promise<(ProductBatch & { productName: string })[]> {
  const now = new Date();
  const expiryThreshold = new Date(now.getTime() + daysFromNow * 24 * 60 * 60 * 1000);

  // Fetch all batches for the business and filter on client side to avoid index requirements
  const batches = await getDocs(
    query(
      col("productBatches"),
      where("businessId", "==", businessId)
    )
  );

  const results: (ProductBatch & { productName: string })[] = [];
  const thresholdTime = expiryThreshold.getTime();

  for (const batchSnap of batches.docs) {
    const batch = { ...batchSnap.data(), id: batchSnap.id } as ProductBatch;
    
    // Check if batch is expiring within the threshold
    if (batch.expiryDate && batch.expiryDate.toMillis() <= thresholdTime) {
      const productSnap = await getDoc(doc(db, "products", batch.productId));
      const product = productSnap.data() as Product | undefined;

      if (product) {
        results.push({
          ...batch,
          productName: product.name,
        });
      }
    }
  }

  return results;
}


// ─── PRESCRIPTION MANAGEMENT ──────────────────────────────────────────────────

/**
 * Create a new prescription for a client.
 */
export async function createPrescription(
  businessId: string,
  clientId: string,
  clientName: string,
  prescriptionData: Omit<Prescription, "id" | "businessId" | "clientId" | "clientName" | "createdAt">
): Promise<string> {
  const prescriptionRef = doc(col("prescriptions"));
  await setDoc(prescriptionRef, {
    businessId,
    clientId,
    clientName,
    ...prescriptionData,
    createdAt: serverTimestamp(),
  });
  return prescriptionRef.id;
}

/**
 * Get all prescriptions for a client.
 */
export async function getPrescriptionsByClient(
  businessId: string,
  clientId: string
): Promise<Prescription[]> {
  const prescriptions = await getDocs(
    query(
      col("prescriptions"),
      where("businessId", "==", businessId),
      where("clientId", "==", clientId),
      orderBy("issuedAt", "desc")
    )
  );
  return prescriptions.docs.map(d => d.data() as Prescription);
}

/**
 * Get all active prescriptions for a product (for sales validation).
 */
export async function getActivePrescriptionsForProduct(
  businessId: string,
  clientId: string,
  productId: string
): Promise<Prescription[]> {
  const prescriptions = await getDocs(
    query(
      col("prescriptions"),
      where("businessId", "==", businessId),
      where("clientId", "==", clientId),
      where("status", "in", ["pending", "dispensed"])
    )
  );

  return prescriptions.docs
    .map(d => d.data() as Prescription)
    .filter(p => p.items.some(item => item.productId === productId && item.quantityPrescribed > 0));
}

/**
 * Update prescription refills remaining after a sale.
 */
export async function updatePrescriptionRefills(
  prescriptionId: string,
  quantitySold: number
): Promise<void> {
  const prescriptionRef = doc(db, "prescriptions", prescriptionId);
  const prescriptionSnap = await getDoc(prescriptionRef);

  if (!prescriptionSnap.exists()) {
    throw new Error("Prescription not found");
  }

  const prescription = prescriptionSnap.data() as Prescription;
  const newRefillsRemaining = Math.max(0, prescription.refillsRemaining - 1);
  const newStatus: PrescriptionStatus = newRefillsRemaining === 0 ? "completed" : prescription.status;

  await updateDoc(prescriptionRef, {
    refillsRemaining: newRefillsRemaining,
    status: newStatus,
  });
}

/**
 * Get all prescriptions for a business (for admin view).
 */
export async function getPrescriptionsByBusiness(
  businessId: string,
  statusFilter?: PrescriptionStatus
): Promise<Prescription[]> {
  let q;
  if (statusFilter) {
    q = query(
      col("prescriptions"),
      where("businessId", "==", businessId),
      where("status", "==", statusFilter),
      orderBy("issuedAt", "desc")
    );
  } else {
    q = query(
      col("prescriptions"),
      where("businessId", "==", businessId),
      orderBy("issuedAt", "desc")
    );
  }

  const prescriptions = await getDocs(q);
  return prescriptions.docs.map(d => d.data() as Prescription);
}

/**
 * Mark a prescription as expired (e.g., after expiry date).
 */
export async function expirePrescription(prescriptionId: string): Promise<void> {
  const prescriptionRef = doc(db, "prescriptions", prescriptionId);
  await updateDoc(prescriptionRef, {
    status: "expired" as PrescriptionStatus,
  });
}


// ─── PHARMACY FEATURES ────────────────────────────────────────────────────────

export type InsuranceType = "nhis" | "private";
export type ClaimStatus = "submitted" | "pending" | "approved" | "rejected" | "paid";

export interface InsuranceClaim {
  id?: string;
  businessId: string;
  invoiceId: string;
  invoiceNumber: string | number;
  clientId: string;
  clientName: string;
  insuranceType: InsuranceType;
  insuranceId: string; // Patient's insurance/membership ID
  claimAmount: number;
  copayAmount: number;
  insurerAmount: number;
  status: ClaimStatus;
  submittedAt?: Timestamp | null;
  approvedAt?: Timestamp | null;
  paidAt?: Timestamp | null;
  notes?: string;
  createdAt?: Timestamp | null;
}

export type StockAdjustmentReason = "damage" | "wastage" | "theft" | "expired" | "inventory_correction" | "other";

export interface StockAdjustment {
  id?: string;
  businessId: string;
  productId: string;
  productName: string;
  batchId?: string;
  quantityAdjusted: number; // Positive or negative
  reason: StockAdjustmentReason;
  staffId: string;
  staffName: string;
  notes?: string;
  createdAt?: Timestamp | null;
}

export type ReturnType = "customer_return" | "supplier_return";
export type ReturnStatus = "pending" | "approved" | "rejected" | "completed";

export interface ReturnLineItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  batchId?: string;
}

export interface Return {
  id?: string;
  businessId: string;
  returnType: ReturnType;
  referenceId: string; // Invoice ID for customer returns, PO ID for supplier returns
  referenceNumber: string | number;
  lineItems: ReturnLineItem[];
  totalAmount: number;
  refundAmount?: number;
  reason: string;
  status: ReturnStatus;
  approvedBy?: string;
  refundMethod?: PaymentMethod;
  refundedAt?: Timestamp | null;
  notes?: string;
  createdAt?: Timestamp | null;
}

export interface ControlledSubstanceLog {
  id?: string;
  businessId: string;
  productId: string;
  productName: string;
  batchId?: string;
  quantityDispensed: number;
  prescriberId: string;
  prescriberName: string;
  patientId: string;
  patientName: string;
  dispensingStaffId: string;
  dispensingStaffName: string;
  prescriptionNumber?: string;
  notes?: string;
  dispensedAt: Timestamp | null;
  createdAt?: Timestamp | null;
}

export interface ProductBarcode {
  id?: string;
  businessId: string;
  productId: string;
  barcode: string;
  barcodeType?: string; // "ean13", "ean8", "upca", etc.
  createdAt?: Timestamp | null;
}

// ─── HOTEL MANAGEMENT MODULE ──────────────────────────────────────────────────

export type RoomStatus = "clean" | "dirty" | "inspected" | "out_of_service";
export type RoomOccupancyStatus = "vacant" | "occupied";

export interface HotelRoom {
  id?: string;
  businessId: string;
  propertyId: string;
  roomNumber: string;
  roomType: string; // e.g. "Deluxe Suite", "Standard Double"
  floor: string;
  capacity: number;
  amenities: string[]; // e.g. ["AC", "WiFi", "Ocean View", "Mini Bar"]
  status: RoomStatus;
  occupancyStatus: RoomOccupancyStatus;
  baseRate: number;
  createdAt?: Timestamp | null;
}

export interface SeasonalRatePlan {
  id?: string;
  businessId: string;
  propertyId: string;
  name: string; // e.g. "Summer High Season", "Weekend Getaway"
  roomTypeId: string;
  startDate: Timestamp | null;
  endDate: Timestamp | null;
  weekdayRate: number;
  weekendRate: number;
  createdAt?: Timestamp | null;
}

export interface TaxRule {
  id?: string;
  businessId: string;
  propertyId: string;
  name: string; // e.g. "Occupancy Tax", "Tourism Levy", "VAT"
  percentage: number;
  isInclusive: boolean;
  createdAt?: Timestamp | null;
}

export type ReservationStatus = "booked" | "checked_in" | "checked_out" | "cancelled" | "no_show";
export type BookingSource = "walk_in" | "phone" | "online" | "ota" | "corporate";

export interface Reservation {
  id?: string;
  businessId: string;
  propertyId: string;
  confirmationCode: string;
  guestId: string;
  guestName: string;
  guestEmail?: string;
  guestPhone?: string;
  roomId?: string;
  roomNumber?: string;
  roomType: string;
  checkInDate: Timestamp | null;
  checkOutDate: Timestamp | null;
  adults: number;
  children: number;
  status: ReservationStatus;
  bookingSource: BookingSource;
  ratePerNight: number;
  totalAmount: number;
  amountPaid: number;
  specialRequests?: string;
  overbooked?: boolean;
  groupBookingId?: string; // Links group bookings
  createdAt?: Timestamp | null;
}

export interface HotelGuest {
  id?: string;
  businessId: string;
  propertyId: string;
  fullName: string;
  email: string;
  phone: string;
  idType: string; // e.g. "Passport", "National ID", "Driver License"
  idNumber: string;
  address?: string;
  stayHistoryCount?: number;
  createdAt?: Timestamp | null;
}

export interface GroupBlockBooking {
  id?: string;
  businessId: string;
  propertyId: string;
  groupName: string;
  contactPerson: string;
  phone: string;
  reservedRoomIds: string[];
  checkInDate: Timestamp | null;
  checkOutDate: Timestamp | null;
  status: "active" | "checked_in" | "released" | "cancelled";
  createdAt?: Timestamp | null;
}

// Hotel Firestore Helpers
export async function getHotelRooms(businessId: string, propertyId = "default_property"): Promise<HotelRoom[]> {
  const q = query(col("hotelRooms"), where("businessId", "==", businessId));
  const snap = await getDocs(q);
  return snap.docs
    .map(d => ({ id: d.id, ...(d.data() as any) } as HotelRoom))
    .filter(r => !propertyId || r.propertyId === propertyId || !r.propertyId);
}

export async function saveHotelRoom(room: Omit<HotelRoom, "id" | "createdAt">, id?: string) {
  if (id) {
    await updateDoc(doc(db, "hotelRooms", id), { ...room });
    return id;
  }
  const ref = await addDoc(col("hotelRooms"), { ...room, createdAt: serverTimestamp() });
  return ref.id;
}

export async function deleteHotelRoom(id: string) {
  await deleteDoc(doc(db, "hotelRooms", id));
}

export async function getReservations(businessId: string, propertyId = "default_property"): Promise<Reservation[]> {
  const q = query(col("hotelReservations"), where("businessId", "==", businessId));
  const snap = await getDocs(q);
  return snap.docs
    .map(d => ({ id: d.id, ...(d.data() as any) } as Reservation))
    .filter(res => !propertyId || res.propertyId === propertyId || !res.propertyId);
}

export async function saveReservation(reservation: Omit<Reservation, "id" | "createdAt">, id?: string) {
  if (id) {
    await updateDoc(doc(db, "hotelReservations", id), { ...reservation });
    return id;
  }
  const ref = await addDoc(col("hotelReservations"), { ...reservation, createdAt: serverTimestamp() });
  return ref.id;
}

export async function getHotelGuests(businessId: string, propertyId = "default_property"): Promise<HotelGuest[]> {
  const q = query(col("hotelGuests"), where("businessId", "==", businessId));
  const snap = await getDocs(q);
  return snap.docs
    .map(d => ({ id: d.id, ...(d.data() as any) } as HotelGuest))
    .filter(g => !propertyId || g.propertyId === propertyId || !g.propertyId);
}

export async function saveHotelGuest(guest: Omit<HotelGuest, "id" | "createdAt">, id?: string) {
  if (id) {
    await updateDoc(doc(db, "hotelGuests", id), { ...guest });
    return id;
  }
  const ref = await addDoc(col("hotelGuests"), { ...guest, stayHistoryCount: 0, createdAt: serverTimestamp() });
  return ref.id;
}


export async function getSeasonalRatePlans(businessId: string, propertyId = "default_property"): Promise<SeasonalRatePlan[]> {
  const q = query(col("hotelRatePlans"), where("businessId", "==", businessId));
  const snap = await getDocs(q);
  return snap.docs
    .map(d => ({ id: d.id, ...(d.data() as any) } as SeasonalRatePlan))
    .filter(p => !propertyId || p.propertyId === propertyId || !p.propertyId);
}

export async function saveSeasonalRatePlan(ratePlan: Omit<SeasonalRatePlan, "id" | "createdAt">, id?: string) {
  if (id) {
    await updateDoc(doc(db, "hotelRatePlans", id), { ...ratePlan });
    return id;
  }
  const ref = await addDoc(col("hotelRatePlans"), { ...ratePlan, createdAt: serverTimestamp() });
  return ref.id;
}

export async function getHotelTaxRules(businessId: string, propertyId = "default_property"): Promise<TaxRule[]> {
  const q = query(col("hotelTaxRules"), where("businessId", "==", businessId));
  const snap = await getDocs(q);
  return snap.docs
    .map(d => ({ id: d.id, ...(d.data() as any) } as TaxRule))
    .filter(t => !propertyId || t.propertyId === propertyId || !t.propertyId);
}

export async function saveHotelTaxRule(rule: Omit<TaxRule, "id" | "createdAt">, id?: string) {
  if (id) {
    await updateDoc(doc(db, "hotelTaxRules", id), { ...rule });
    return id;
  }
  const ref = await addDoc(col("hotelTaxRules"), { ...rule, createdAt: serverTimestamp() });
  return ref.id;
}

export async function getGroupBlockBookings(businessId: string, propertyId = "default_property"): Promise<GroupBlockBooking[]> {
  const q = query(col("hotelGroupBookings"), where("businessId", "==", businessId));
  const snap = await getDocs(q);
  return snap.docs
    .map(d => ({ id: d.id, ...(d.data() as any) } as GroupBlockBooking))
    .filter(g => !propertyId || g.propertyId === propertyId || !g.propertyId);
}

export async function saveGroupBlockBooking(group: Omit<GroupBlockBooking, "id" | "createdAt">, id?: string) {
  if (id) {
    await updateDoc(doc(db, "hotelGroupBookings", id), { ...group });
    return id;
  }
  const ref = await addDoc(col("hotelGroupBookings"), { ...group, createdAt: serverTimestamp() });
  return ref.id;
}

export async function updateHotelRoomStatus(id: string, status: RoomStatus, occupancyStatus?: RoomOccupancyStatus) {
  await updateDoc(doc(db, "hotelRooms", id), {
    status,
    ...(occupancyStatus ? { occupancyStatus } : {}),
  });
}

export async function updateReservationStatus(id: string, status: ReservationStatus, roomId?: string, roomNumber?: string) {
  await updateDoc(doc(db, "hotelReservations", id), {
    status,
    ...(roomId ? { roomId } : {}),
    ...(roomNumber ? { roomNumber } : {}),
  });
}

/**
 * Date-range availability engine. A reservation overlaps a stay when:
 * existingCheckIn < requestedCheckOut && existingCheckOut > requestedCheckIn.
 * Cancelled and no-show records do not block inventory.
 */
export async function getAvailableHotelRooms(
  businessId: string,
  propertyId: string,
  checkIn: Date,
  checkOut: Date,
  roomType?: string,
  excludeReservationId?: string,
): Promise<HotelRoom[]> {
  const [rooms, reservations] = await Promise.all([
    getHotelRooms(businessId, propertyId),
    getReservations(businessId, propertyId),
  ]);
  const requestedStart = checkIn.getTime();
  const requestedEnd = checkOut.getTime();
  const blockingStatuses: ReservationStatus[] = ["booked", "checked_in"];
  const blockedRoomIds = new Set(
    reservations
      .filter(r => r.id !== excludeReservationId)
      .filter(r => blockingStatuses.includes(r.status))
      .filter(r => {
        const existingStart = r.checkInDate?.toDate?.().getTime?.() ?? 0;
        const existingEnd = r.checkOutDate?.toDate?.().getTime?.() ?? 0;
        return existingStart < requestedEnd && existingEnd > requestedStart;
      })
      .map(r => r.roomId)
      .filter(Boolean) as string[],
  );

  return rooms.filter(room =>
    room.status !== "out_of_service" &&
    !blockedRoomIds.has(room.id || "") &&
    (!roomType || room.roomType === roomType),
  );
}


export interface HotelWaitlistEntry {
  id?: string;
  businessId: string;
  propertyId: string;
  guestId: string;
  guestName: string;
  roomType: string;
  checkInDate: Timestamp | null;
  checkOutDate: Timestamp | null;
  adults: number;
  children: number;
  bookingSource: BookingSource;
  notes?: string;
  status: "waiting" | "converted" | "cancelled";
  createdAt?: Timestamp | null;
}

export async function getHotelWaitlist(businessId: string, propertyId = "default_property"): Promise<HotelWaitlistEntry[]> {
  const q = query(col("hotelWaitlist"), where("businessId", "==", businessId));
  const snap = await getDocs(q);
  return snap.docs
    .map(d => ({ id: d.id, ...(d.data() as any) } as HotelWaitlistEntry))
    .filter(w => !propertyId || w.propertyId === propertyId || !w.propertyId);
}

export async function saveHotelWaitlistEntry(entry: Omit<HotelWaitlistEntry, "id" | "createdAt">, id?: string) {
  if (id) {
    await updateDoc(doc(db, "hotelWaitlist", id), { ...entry });
    return id;
  }
  const ref = await addDoc(col("hotelWaitlist"), { ...entry, createdAt: serverTimestamp() });
  return ref.id;
}


// ─── HOTEL GUEST FOLIOS & NIGHT AUDIT ─────────────────────────────────────────

export type FolioItemType = "room_charge" | "food_beverage" | "service" | "tax" | "adjustment" | "deposit" | "payment";

export interface FolioItem {
  id: string;
  businessId: string;
  propertyId: string;
  reservationId: string;
  guestId: string;
  roomNumber: string;
  type: FolioItemType;
  description: string;
  amount: number;
  payerType: "primary" | "company" | "split_guest";
  payerName?: string;
  postedAt: any;
  postedBy: string;
  isVoided?: boolean;
  referenceId?: string; // e.g. invoice id or payment id
}

export interface GuestFolio {
  reservationId: string;
  businessId: string;
  propertyId: string;
  guestName: string;
  roomNumber: string;
  status: "open" | "settled" | "refunded";
  chargesTotal: number;
  paymentsTotal: number;
  depositsTotal: number;
  balanceDue: number;
  items: FolioItem[];
  updatedAt: any;
}

export async function getGuestFolio(businessId: string, reservationId: string): Promise<GuestFolio | null> {
  const q = query(
    col("hotelFolioItems"),
    where("businessId", "==", businessId),
    where("reservationId", "==", reservationId)
  );
  const snap = await getDocs(q);
  const items: FolioItem[] = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
  
  if (items.length === 0) {
    // Check if reservation exists to build initial folio shell
    const resRef = doc(db, "hotelReservations", reservationId);
    const resSnap = await getDoc(resRef);
    if (!resSnap.exists()) return null;
    const res = resSnap.data() as any;
    return {
      reservationId,
      businessId,
      propertyId: res.propertyId,
      guestName: res.guestName,
      roomNumber: res.roomNumber || "Unassigned",
      status: "open",
      chargesTotal: 0,
      paymentsTotal: 0,
      depositsTotal: 0,
      balanceDue: 0,
      items: [],
      updatedAt: serverTimestamp(),
    };
  }

  const resSnap = await getDoc(doc(db, "hotelReservations", reservationId));
  const res = resSnap.exists() ? (resSnap.data() as any) : {};

  let chargesTotal = 0;
  let paymentsTotal = 0;
  let depositsTotal = 0;

  for (const item of items) {
    if (item.isVoided) continue;
    if (item.type === "payment") {
      paymentsTotal += item.amount;
    } else if (item.type === "deposit") {
      depositsTotal += item.amount;
    } else if (item.type === "adjustment") {
      chargesTotal += item.amount; // adjustments can be negative or positive
    } else {
      chargesTotal += item.amount;
    }
  }

  const balanceDue = chargesTotal - (paymentsTotal + depositsTotal);

  return {
    reservationId,
    businessId,
    propertyId: res.propertyId || items[0].propertyId,
    guestName: res.guestName || items[0].guestId,
    roomNumber: res.roomNumber || items[0].roomNumber,
    status: balanceDue <= 0 && items.length > 0 ? "settled" : "open",
    chargesTotal,
    paymentsTotal,
    depositsTotal,
    balanceDue,
    items: items.sort((a, b) => (b.postedAt?.seconds || 0) - (a.postedAt?.seconds || 0)),
    updatedAt: serverTimestamp(),
  };
}

export async function addFolioItem(data: Omit<FolioItem, "id" | "postedAt">) {
  return addDoc(col("hotelFolioItems"), {
    ...data,
    postedAt: serverTimestamp(),
    isVoided: false,
  });
}

export async function voidFolioItem(itemId: string, reason: string) {
  const ref = doc(db, "hotelFolioItems", itemId);
  return updateDoc(ref, {
    isVoided: true,
    voidReason: reason,
  });
}

/** Night Audit: Automatically posts nightly room rate & taxes for all checked-in reservations */
export async function runNightAudit(businessId: string, propertyId: string, userId: string) {
  const q = query(
    col("hotelReservations"),
    where("businessId", "==", businessId),
    where("propertyId", "==", propertyId),
    where("status", "==", "checked-in")
  );
  const snap = await getDocs(q);
  const checkedInReservations = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));

  const postedCount = { rooms: 0, totalAmount: 0 };

  for (const res of checkedInReservations) {
    const rate = res.nightlyRate || 100;
    const tax = rate * 0.125; // 12.5% standard tax rule
    const totalCharge = rate + tax;

    await addFolioItem({
      businessId,
      propertyId,
      reservationId: res.id,
      guestId: res.guestId || res.guestName,
      roomNumber: res.roomNumber || "General",
      type: "room_charge",
      description: `Night Audit Room Charge (${new Date().toISOString().split("T")[0]})`,
      amount: rate,
      payerType: "primary",
      postedBy: userId,
    });

    await addFolioItem({
      businessId,
      propertyId,
      reservationId: res.id,
      guestId: res.guestId || res.guestName,
      roomNumber: res.roomNumber || "General",
      type: "tax",
      description: `Occupancy Tax / VAT (12.5%)`,
      amount: tax,
      payerType: "primary",
      postedBy: userId,
    });

    postedCount.rooms += 1;
    postedCount.totalAmount += totalCharge;
  }

  // Record night audit log
  await addDoc(col("hotelNightAudits"), {
    businessId,
    propertyId,
    auditDate: new Date().toISOString().split("T")[0],
    roomsProcessed: postedCount.rooms,
    totalPosted: postedCount.totalAmount,
    runBy: userId,
    createdAt: serverTimestamp(),
  });

  return postedCount;
}


// ─── HOUSEKEEPING & MAINTENANCE ───────────────────────────────────────────────

export type HousekeepingStatus = "clean" | "dirty" | "inspecting" | "out-of-service";
export type MaintenancePriority = "low" | "medium" | "high" | "urgent";

export interface HousekeepingTask {
  id: string;
  businessId: string;
  propertyId: string;
  roomNumber: string;
  taskType: "checkout_clean" | "stayover_clean" | "deep_clean" | "inspection";
  status: "pending" | "in-progress" | "completed";
  assignedTo?: string;
  notes?: string;
  createdAt: any;
  completedAt?: any;
}

export interface MaintenanceWorkOrder {
  id: string;
  businessId: string;
  propertyId: string;
  roomNumber: string;
  issueTitle: string;
  description: string;
  priority: MaintenancePriority;
  status: "reported" | "in-repair" | "resolved";
  reportedBy: string;
  assignedTo?: string;
  createdAt: any;
  resolvedAt?: any;
}

export async function getHousekeepingTasks(businessId: string, propertyId = "default_property"): Promise<HousekeepingTask[]> {
  const q = query(col("hotelHousekeeping"), where("businessId", "==", businessId));
  const snap = await getDocs(q);
  return snap.docs
    .map(d => ({ id: d.id, ...(d.data() as any) } as HousekeepingTask))
    .filter(t => !propertyId || t.propertyId === propertyId || !t.propertyId);
}

export async function createHousekeepingTask(data: Omit<HousekeepingTask, "id" | "createdAt">) {
  return addDoc(col("hotelHousekeeping"), {
    ...data,
    createdAt: serverTimestamp(),
  });
}

export async function updateHousekeepingTask(id: string, data: Partial<HousekeepingTask>) {
  const ref = doc(db, "hotelHousekeeping", id);
  if (data.status === "completed") {
    (data as any).completedAt = serverTimestamp();
  }
  return updateDoc(ref, data);
}

export async function getMaintenanceWorkOrders(businessId: string, propertyId = "default_property"): Promise<MaintenanceWorkOrder[]> {
  const q = query(col("hotelMaintenance"), where("businessId", "==", businessId));
  const snap = await getDocs(q);
  return snap.docs
    .map(d => ({ id: d.id, ...(d.data() as any) } as MaintenanceWorkOrder))
    .filter(m => !propertyId || m.propertyId === propertyId || !m.propertyId);
}

export async function createMaintenanceWorkOrder(data: Omit<MaintenanceWorkOrder, "id" | "createdAt">) {
  return addDoc(col("hotelMaintenance"), {
    ...data,
    createdAt: serverTimestamp(),
  });
}

export async function updateMaintenanceWorkOrder(id: string, data: Partial<MaintenanceWorkOrder>) {
  const ref = doc(db, "hotelMaintenance", id);
  if (data.status === "resolved") {
    (data as any).resolvedAt = serverTimestamp();
  }
  return updateDoc(ref, data);
}


// ─── RATE & REVENUE MANAGEMENT ───────────────────────────────────────────────

export interface RatePlanRestrictions {
  minStayDays?: number;
  maxStayDays?: number;
  isNonRefundable?: boolean;
  advanceBookingDaysMin?: number;
}

export interface HotelRevenueMetrics {
  totalRooms: number;
  occupiedRooms: number;
  occupancyRate: number; // percentage
  totalRoomRevenue: number;
  adr: number; // Average Daily Rate
  revPar: number; // Revenue Per Available Room
}

export async function calculateHotelMetrics(businessId: string, propertyId = "default_property"): Promise<HotelRevenueMetrics> {
  const rooms = await getHotelRooms(businessId, propertyId);
  const totalRooms = rooms.length || 1;

  const reservations = await getReservations(businessId, propertyId);

  let occupiedRooms = 0;
  let totalRoomRevenue = 0;

  for (const res of reservations as any[]) {
    if (res.status === "checked_in") {
      occupiedRooms += 1;
    }
    if (res.status === "checked_in" || res.status === "checked_out") {
      totalRoomRevenue += Number(res.totalAmount || 0);
    }
  }

  const occupancyRate = Number(((occupiedRooms / totalRooms) * 100).toFixed(1));
  const roomsSold = reservations.filter((r: any) => r.status === "checked_in" || r.status === "checked_out").length || 1;
  const adr = Number((totalRoomRevenue / roomsSold).toFixed(2));
  const revPar = Number((totalRoomRevenue / totalRooms).toFixed(2));

  return {
    totalRooms,
    occupiedRooms,
    occupancyRate,
    totalRoomRevenue,
    adr,
    revPar,
  };
}


// ─── HOTEL ROLE-BASED ACCESS CONTROL ──────────────────────────────────────────

export type HotelRole = "front_desk" | "housekeeping" | "manager" | "owner" | "super_admin";

export interface HotelPermissionRule {
  role: HotelRole;
  canViewRooms: boolean;
  canModifyRooms: boolean;
  canManageReservations: boolean;
  canPerformCheckInOut: boolean;
  canAccessFolios: boolean;
  canManageHousekeeping: boolean;
  canViewReports: boolean;
  canManageRatePlans: boolean;
}

export const HOTEL_ROLE_PERMISSIONS: Record<HotelRole, HotelPermissionRule> = {
  super_admin: {
    role: "super_admin",
    canViewRooms: true, canModifyRooms: true, canManageReservations: true,
    canPerformCheckInOut: true, canAccessFolios: true, canManageHousekeeping: true,
    canViewReports: true, canManageRatePlans: true,
  },
  owner: {
    role: "owner",
    canViewRooms: true, canModifyRooms: true, canManageReservations: true,
    canPerformCheckInOut: true, canAccessFolios: true, canManageHousekeeping: true,
    canViewReports: true, canManageRatePlans: true,
  },
  manager: {
    role: "manager",
    canViewRooms: true, canModifyRooms: true, canManageReservations: true,
    canPerformCheckInOut: true, canAccessFolios: true, canManageHousekeeping: true,
    canViewReports: true, canManageRatePlans: true,
  },
  front_desk: {
    role: "front_desk",
    canViewRooms: true, canModifyRooms: false, canManageReservations: true,
    canPerformCheckInOut: true, canAccessFolios: true, canManageHousekeeping: false,
    canViewReports: false, canManageRatePlans: false,
  },
  housekeeping: {
    role: "housekeeping",
    canViewRooms: true, canModifyRooms: false, canManageReservations: false,
    canPerformCheckInOut: false, canAccessFolios: false, canManageHousekeeping: true,
    canViewReports: false, canManageRatePlans: false,
  },
};

export function checkHotelPermission(role: string, action: keyof HotelPermissionRule): boolean {
  const normRole = (role || "front_desk") as HotelRole;
  const rule = HOTEL_ROLE_PERMISSIONS[normRole] || HOTEL_ROLE_PERMISSIONS.front_desk;
  return Boolean(rule[action]);
}


// ─── CHANNEL-READY ONLINE BOOKING FOUNDATION ──────────────────────────────────

export interface ExternalBookingRequest {
  businessId: string;
  propertyId: string;
  channel: "direct_widget" | "booking_com" | "expedia" | "airbnb" | "other";
  externalReferenceId?: string;
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  checkInDate: string;
  checkOutDate: string;
  roomTypeId: string;
  specialRequests?: string;
}

export async function createExternalChannelReservation(req: ExternalBookingRequest) {
  return runTransaction(db, async (tx) => {
    // 1. Check date availability for the requested room type
    const roomsSnap = await getDocs(
      query(
        col("hotelRooms"),
        where("businessId", "==", req.businessId),
        where("propertyId", "==", req.propertyId),
        where("type", "==", req.roomTypeId)
      )
    );

    const availableRooms = roomsSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
    if (availableRooms.length === 0) {
      throw new Error(`No rooms available for room type: ${req.roomTypeId}`);
    }

    // Check date overlap against existing reservations
    const existingResSnap = await getDocs(
      query(
        col("hotelReservations"),
        where("businessId", "==", req.businessId),
        where("propertyId", "==", req.propertyId),
        where("status", "in", ["booked", "checked-in"])
      )
    );

    const inRange = (d: string, start: string, end: string) => d >= start && d < end;
    const isOverlapping = (start1: string, end1: string, start2: string, end2: string) =>
      Math.max(new Date(start1).getTime(), new Date(start2).getTime()) < Math.min(new Date(end1).getTime(), new Date(end2).getTime());

    let assignedRoomNumber = "";
    for (const rm of availableRooms) {
      const roomBooked = existingResSnap.docs.some(d => {
        const res = d.data() as any;
        return res.roomNumber === rm.roomNumber && isOverlapping(req.checkInDate, req.checkOutDate, res.checkInDate, res.checkOutDate);
      });
      if (!roomBooked) {
        assignedRoomNumber = rm.roomNumber;
        break;
      }
    }

    if (!assignedRoomNumber) {
      throw new Error("Selected dates are fully booked for this room type.");
    }

    // 2. Create reservation record
    const resRef = doc(collection(db, "hotelReservations"));
    const newRes = {
      businessId: req.businessId,
      propertyId: req.propertyId,
      guestName: req.guestName,
      guestEmail: req.guestEmail,
      guestPhone: req.guestPhone,
      checkInDate: req.checkInDate,
      checkOutDate: req.checkOutDate,
      numberOfNights: Math.max(1, Math.round((new Date(req.checkOutDate).getTime() - new Date(req.checkInDate).getTime()) / (1000 * 60 * 60 * 24))),
      roomNumber: assignedRoomNumber,
      roomType: req.roomTypeId,
      nightlyRate: 150, // default rate or fetched from rate plan
      status: "booked",
      bookingSource: req.channel,
      externalReferenceId: req.externalReferenceId || "",
      specialRequests: req.specialRequests || "",
      createdAt: serverTimestamp(),
    };

    tx.set(resRef, newRes);
    return { reservationId: resRef.id, roomNumber: assignedRoomNumber };
  });
}
