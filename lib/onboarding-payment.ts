import { createHmac, timingSafeEqual } from "node:crypto";
import { FieldValue, type Transaction as AdminTransaction } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase-admin";
import { buildReceiptHtml } from "@/lib/print-receipt";
import {
  getManagementPlanDetails,
  normalizeManagementPlan,
  type ManagementPlan,
  type ProBusinessScale,
} from "@/lib/management-plans";

export type OnboardingPaymentMethod = "cash" | "momo";
export type EmailDeliveryStatus = "sent" | "queued" | "failed";

export const ONBOARDING_INVOICE_TYPE = "onboarding" as const;

function onboardingInvoiceId(businessId: string) {
  return `onboarding_${businessId}`;
}

function onboardingPaymentId(reference: string) {
  return `onboarding_paystack_${reference.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 120)}`;
}

function safeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function paymentReference() {
  const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  return `BF-ONB-${suffix}`.toUpperCase();
}

function normalizeScale(value: unknown): ProBusinessScale | null {
  return value === "small" ? "small" : value === "large" ? "large" : null;
}

function amountInSubunits(amount: number) {
  return Math.round(amount * 100);
}

function normalizeCashAmount(value: unknown, invoiceAmount: number) {
  if (value === undefined || value === null || value === "") return invoiceAmount;
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Enter a valid cash amount greater than zero.");
  if (amount - invoiceAmount > 0.01) throw new Error("The cash amount cannot be greater than the onboarding invoice.");
  return Math.round(amount * 100) / 100;
}

export function onboardingReferenceForBusiness(businessId: string) {
  return paymentReference() + `-${businessId.slice(-8).toUpperCase()}`;
}

export function verifyPaystackSignature(rawBody: string, signature: string | null, secretKey: string) {
  if (!signature) return false;
  const expected = createHmac("sha512", secretKey).update(rawBody).digest("hex");
  const providedBuffer = Buffer.from(signature, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  return providedBuffer.length === expectedBuffer.length && timingSafeEqual(providedBuffer, expectedBuffer);
}

type OnboardingContext = {
  businessId: string;
  ownerUid: string;
  businessName: string;
  email: string;
  managementPlan: ManagementPlan;
  proBusinessScale: ProBusinessScale | null;
  details: ReturnType<typeof getManagementPlanDetails>;
  profileData: Record<string, any>;
  registrationData: Record<string, any>;
};

async function resolveOnboardingContext(
  businessId: string,
  tx?: AdminTransaction,
): Promise<OnboardingContext> {
  const firestore = getAdminDb();
  const profileRef = firestore.collection("businessProfiles").doc(businessId);
  const directRegistrationRef = firestore.collection("businesses").doc(businessId);
  const registrationQuery = firestore.collection("businesses").where("ownerUid", "==", businessId).limit(1);

  const [profileSnap, directRegistrationSnap, registrationQuerySnap] = tx
    ? await Promise.all([tx.get(profileRef), tx.get(directRegistrationRef), tx.get(registrationQuery)])
    : await Promise.all([profileRef.get(), directRegistrationRef.get(), registrationQuery.get()]);

  const profileData = profileSnap.exists ? (profileSnap.data() as Record<string, any>) : {};
  const registrationSnap = directRegistrationSnap.exists
    ? directRegistrationSnap
    : registrationQuerySnap.empty
      ? null
      : registrationQuerySnap.docs[0];
  const registrationData = registrationSnap?.data() as Record<string, any> | undefined;

  if (!profileSnap.exists && !registrationSnap) {
    throw new Error("Registration record not found.");
  }

  const ownerUid = safeString(profileData.ownerUid || registrationData?.ownerUid || businessId);
  if (ownerUid !== businessId) throw new Error("This registration does not belong to the authenticated account.");

  const managementPlan = normalizeManagementPlan(profileData.managementPlan ?? registrationData?.managementPlan) ?? "demo";
  const proBusinessScale = normalizeScale(profileData.proBusinessScale ?? registrationData?.proBusinessScale);
  const details = getManagementPlanDetails(managementPlan, proBusinessScale || "large");
  const businessName = safeString(profileData.businessName) || safeString(registrationData?.businessName) || "BillFlow business";
  const email = safeString(profileData.email) || safeString(profileData.ownerEmail) || safeString(registrationData?.email);

  if (!email) throw new Error("A valid business email is required before payment can begin.");

  return {
    businessId,
    ownerUid,
    businessName,
    email,
    managementPlan,
    proBusinessScale,
    details,
    profileData,
    registrationData: registrationData || {},
  };
}

export async function prepareOnboardingInvoice(params: {
  businessId: string;
  paymentMethod: OnboardingPaymentMethod;
  cashAmount?: number;
  reference?: string;
  markInvoiceEmailSending?: boolean;
}) {
  const firestore = getAdminDb();
  const invoiceRef = firestore.collection("invoices").doc(onboardingInvoiceId(params.businessId));
  const profileRef = firestore.collection("businessProfiles").doc(params.businessId);
  const registrationRef = firestore.collection("businesses").doc(params.businessId);
  const registrationQuery = firestore.collection("businesses").where("ownerUid", "==", params.businessId).limit(1);

  return firestore.runTransaction(async (transaction) => {
    const [profileSnap, directRegistrationSnap, registrationQuerySnap, invoiceSnap] = await Promise.all([
      transaction.get(profileRef),
      transaction.get(registrationRef),
      transaction.get(registrationQuery),
      transaction.get(invoiceRef),
    ]);

    const profileData = profileSnap.exists ? (profileSnap.data() as Record<string, any>) : {};
    const registrationSnap = directRegistrationSnap.exists
      ? directRegistrationSnap
      : registrationQuerySnap.empty
        ? null
        : registrationQuerySnap.docs[0];
    const registrationData = (registrationSnap?.data() as Record<string, any> | undefined) || {};

    if (!profileSnap.exists && !registrationSnap) throw new Error("Registration record not found.");
    const ownerUid = safeString(profileData.ownerUid || registrationData.ownerUid || params.businessId);
    if (ownerUid !== params.businessId) throw new Error("This registration does not belong to the authenticated account.");

    const managementPlan = normalizeManagementPlan(profileData.managementPlan ?? registrationData.managementPlan) ?? "demo";
    const proBusinessScale = normalizeScale(profileData.proBusinessScale ?? registrationData.proBusinessScale);
    const details = getManagementPlanDetails(managementPlan, proBusinessScale || "large");
    const businessName = safeString(profileData.businessName) || safeString(registrationData.businessName) || "BillFlow business";
    const email = safeString(profileData.email) || safeString(profileData.ownerEmail) || safeString(registrationData.email);
    if (!email) throw new Error("A valid business email is required before payment can begin.");

    if (details.startupPrice <= 0) {
      return {
        businessId: params.businessId,
        email,
        businessName,
        managementPlan,
        proBusinessScale,
        details,
        invoiceId: null,
        invoiceNumber: null,
        amount: 0,
        cashAmount: 0,
        paymentMethod: params.paymentMethod,
        providerReference: null,
        alreadyPaid: false,
        shouldSendInvoiceEmail: false,
        invoice: null,
        logoDataUrl: safeString(profileData.logoDataUrl),
        footerNote: safeString(profileData.footerNote),
        currency: safeString(profileData.currency) || "GHS",
      };
    }

    const existingInvoice = invoiceSnap.exists ? (invoiceSnap.data() as Record<string, any>) : null;
    const existingAmount = Number(existingInvoice?.amount || 0);
    if (existingInvoice && Math.abs(existingAmount - details.startupPrice) > 0.01) {
      throw new Error("The onboarding invoice amount no longer matches the selected management plan.");
    }

    const invoiceNumber = existingInvoice?.invoiceNumber || `ONB-${params.businessId.slice(-8).toUpperCase()}`;
    const providerReference = params.reference || safeString(existingInvoice?.providerReference) || null;
    const alreadyPaid = existingInvoice?.status === "paid";
    const cashAmount = params.paymentMethod === "cash" ? normalizeCashAmount(params.cashAmount, details.startupPrice) : null;
    const shouldSendInvoiceEmail = Boolean(
      params.markInvoiceEmailSending &&
        (!existingInvoice || (existingInvoice.invoiceEmailStatus !== "sent" && existingInvoice.invoiceEmailStatus !== "sending")),
    );

    const profileUpdate: Record<string, unknown> = {
      businessId: params.businessId,
      businessName,
      email,
      ownerEmail: email,
      managementPlan,
      proBusinessScale: managementPlan === "pro" ? proBusinessScale || "large" : null,
      onboardingInvoiceId: invoiceRef.id,
      onboardingInvoiceNumber: invoiceNumber,
      onboardingPaymentMethod: params.paymentMethod,
      paymentStatus: alreadyPaid ? "paid" : "pending",
      ...(cashAmount !== null ? { cashAmountTendered: cashAmount, cashPaymentStatus: "pending" } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (!profileSnap.exists) {
      transaction.create(profileRef, {
        ...profileUpdate,
        status: "pending",
        createdAt: FieldValue.serverTimestamp(),
      });
    } else {
      transaction.update(profileRef, profileUpdate);
    }

    if (registrationSnap) {
      transaction.update(registrationSnap.ref, {
        managementPlan,
        proBusinessScale: managementPlan === "pro" ? proBusinessScale || "large" : null,
        onboardingInvoiceId: invoiceRef.id,
        onboardingInvoiceNumber: invoiceNumber,
        onboardingPaymentMethod: params.paymentMethod,
        paymentStatus: alreadyPaid ? "paid" : "pending",
        ...(providerReference ? { providerReference } : {}),
      });
    }

    const invoiceUpdate: Record<string, unknown> = {
      paymentMethod: params.paymentMethod,
      ...(providerReference ? { provider: "paystack", providerReference } : {}),
      ...(shouldSendInvoiceEmail ? { invoiceEmailStatus: "sending" } : {}),
    };

    if (!existingInvoice) {
      transaction.create(invoiceRef, {
        invoiceNumber,
        userId: params.businessId,
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
        paymentMethod: params.paymentMethod,
        ...(cashAmount !== null ? { cashAmountTendered: cashAmount, cashPaymentStatus: "pending" } : {}),
        issuedAt: FieldValue.serverTimestamp(),
        dueAt: null,
        invoiceType: ONBOARDING_INVOICE_TYPE,
        ...(providerReference ? { provider: "paystack", providerReference } : {}),
        ...(shouldSendInvoiceEmail ? { invoiceEmailStatus: "sending" } : {}),
        createdAt: FieldValue.serverTimestamp(),
      });
    } else if (!alreadyPaid) {
      transaction.update(invoiceRef, {
        ...invoiceUpdate,
        ...(cashAmount !== null ? { cashAmountTendered: cashAmount, cashPaymentStatus: "pending" } : {}),
      });
    }

    const invoice = {
      ...(existingInvoice || {}),
      invoiceNumber,
      amount: details.startupPrice,
      cashAmount,
      amountPaid: alreadyPaid ? Number(existingInvoice?.amountPaid || details.startupPrice) : Number(existingInvoice?.amountPaid || 0),
      status: alreadyPaid ? "paid" : "pending",
      paymentMethod: params.paymentMethod,
      providerReference,
      invoiceType: ONBOARDING_INVOICE_TYPE,
      ...(shouldSendInvoiceEmail ? { invoiceEmailStatus: "sending" } : {}),
    };

    return {
      businessId: params.businessId,
      email,
      businessName,
      managementPlan,
      proBusinessScale,
      details,
      invoiceId: invoiceRef.id,
      invoiceNumber,
      amount: details.startupPrice,
      cashAmount,
      paymentMethod: params.paymentMethod,
      providerReference,
      alreadyPaid,
      shouldSendInvoiceEmail,
      invoice,
      logoDataUrl: safeString(profileData.logoDataUrl),
      footerNote: safeString(profileData.footerNote),
      currency: safeString(profileData.currency) || "GHS",
    };
  });
}

export async function setOnboardingEmailStatus(
  businessId: string,
  emailKind: "invoice" | "receipt",
  result: { status: EmailDeliveryStatus; reason?: string },
) {
  const firestore = getAdminDb();
  const invoiceRef = firestore.collection("invoices").doc(onboardingInvoiceId(businessId));
  const prefix = emailKind === "receipt" ? "receiptEmail" : "invoiceEmail";
  await invoiceRef.update({
    [`${prefix}Status`]: result.status,
    ...(result.reason ? { [`${prefix}Reason`]: result.reason } : {}),
    ...(result.status === "sent" ? { [`${prefix}SentAt`]: FieldValue.serverTimestamp() } : {}),
  });
}

function receiptEmailHtml(params: {
  receiptHtml: string;
  businessName: string;
  message: string;
}) {
  return `<!doctype html><html><body style="margin:0;background:#f3f7fb;color:#111827;font-family:Arial,Helvetica,sans-serif"><div style="max-width:760px;margin:0 auto;padding:28px 16px"><div style="background:#ffffff;border:1px solid #dbe5ef;padding:24px"><p style="margin:0 0 16px;color:#1556B8;font-size:18px;font-weight:700">BillFlow · ${params.businessName}</p><p style="margin:0 0 22px;line-height:1.6">${params.message}</p><div>${params.receiptHtml}</div></div></div></body></html>`;
}

export async function sendOnboardingInvoiceEmail(params: {
  emailKind: "invoice" | "receipt";
  businessId: string;
  email: string;
  businessName: string;
  invoice: Record<string, any>;
  details: ReturnType<typeof getManagementPlanDetails>;
  logoDataUrl?: string;
  footerNote?: string;
  currency?: string;
}) {
  const isReceipt = params.emailKind === "receipt";
  const receiptHtml = buildReceiptHtml({
    documentTitle: isReceipt ? "RECEIPT" : "INVOICE",
    invoiceNumber: String(params.invoice.invoiceNumber || ""),
    issuedAt: new Date(),
    dueDate: new Date(),
    items: [{ productName: `${params.details.label} — Startup Activation`, quantity: 1, unitPrice: Number(params.invoice.amount || params.details.startupPrice) }],
    subtotal: Number(params.invoice.amount || params.details.startupPrice),
    taxAmount: 0,
    total: Number(params.invoice.amount || params.details.startupPrice),
    paymentMethod: isReceipt ? "momo" : "cash",
    amountPaid: isReceipt ? Number(params.invoice.amount || params.details.startupPrice) : 0,
    customerName: params.businessName,
    customerAddress: params.email,
    currencyCode: params.currency || "GHS",
    footerNote: params.footerNote || `Selected plan: ${params.details.label}. ${params.details.recurringDescription || ""}`.trim(),
    logoDataUrl: params.logoDataUrl,
    businessName: params.businessName,
  });
  const message = isReceipt
    ? "Your Mobile Money payment has been confirmed. Your BillFlow account has been approved and the paid invoice receipt is attached below."
    : "Your BillFlow onboarding invoice has been created. Please retain this invoice and present it when settling the startup fee by cash.";
  const html = receiptEmailHtml({ receiptHtml, businessName: params.businessName, message });
  const subject = isReceipt
    ? `BillFlow payment receipt · ${params.invoice.invoiceNumber}`
    : `BillFlow onboarding invoice · ${params.invoice.invoiceNumber}`;

  const resendKey = safeString(process.env.RESEND_API_KEY);
  const from = safeString(process.env.RESEND_FROM_EMAIL);
  if (resendKey && from) {
    try {
      const response = await fetch(process.env.RESEND_API_URL || "https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ from, to: [params.email], subject, html }),
        cache: "no-store",
      });
      if (!response.ok) {
        return { status: "failed" as const, reason: `Email provider returned HTTP ${response.status}` };
      }
      return { status: "sent" as const };
    } catch (error) {
      return { status: "failed" as const, reason: error instanceof Error ? error.message : "Email provider request failed" };
    }
  }

  const webhookUrl = safeString(process.env.SCHOOL_EMAIL_WEBHOOK_URL);
  if (webhookUrl) {
    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(safeString(process.env.SCHOOL_EMAIL_WEBHOOK_SECRET)
            ? { Authorization: `Bearer ${process.env.SCHOOL_EMAIL_WEBHOOK_SECRET}` }
            : {}),
        },
        body: JSON.stringify({
          event: "billflow.onboarding.invoice",
          emailKind: params.emailKind,
          businessId: params.businessId,
          recipientEmail: params.email,
          businessName: params.businessName,
          subject,
          html,
          invoiceNumber: params.invoice.invoiceNumber,
          amount: Number(params.invoice.amount || params.details.startupPrice),
          currency: params.currency || "GHS",
        }),
      });
      return response.ok
        ? { status: "sent" as const }
        : { status: "failed" as const, reason: `Email webhook returned HTTP ${response.status}` };
    } catch (error) {
      return { status: "failed" as const, reason: error instanceof Error ? error.message : "Email webhook request failed" };
    }
  }

  return { status: "queued" as const, reason: "No RESEND_API_KEY/RESEND_FROM_EMAIL or SCHOOL_EMAIL_WEBHOOK_URL is configured." };
}

export async function settleVerifiedOnboardingPayment(params: {
  businessId: string;
  reference: string;
  transaction: Record<string, any>;
  source: "confirm" | "webhook";
}) {
  const firestore = getAdminDb();
  const invoiceRef = firestore.collection("invoices").doc(onboardingInvoiceId(params.businessId));
  const profileRef = firestore.collection("businessProfiles").doc(params.businessId);
  const registrationQuery = firestore.collection("businesses").where("ownerUid", "==", params.businessId).limit(1);
  const paymentRef = firestore.collection("payments").doc(onboardingPaymentId(params.reference));
  const verifiedAmount = Number(params.transaction.amount || 0) / 100;
  const verifiedCurrency = safeString(params.transaction.currency) || "GHS";

  if (!Number.isFinite(verifiedAmount) || verifiedAmount <= 0) throw new Error("The confirmed onboarding amount is invalid.");
  if (verifiedCurrency.toUpperCase() !== "GHS") throw new Error("The confirmed onboarding currency does not match GHS.");

  const result = await firestore.runTransaction(async (transaction) => {
    const [invoiceSnap, profileSnap, registrationSnap, paymentSnap] = await Promise.all([
      transaction.get(invoiceRef),
      transaction.get(profileRef),
      transaction.get(registrationQuery),
      transaction.get(paymentRef),
    ]);

    if (!invoiceSnap.exists || !profileSnap.exists) throw new Error("The onboarding invoice or business profile was not found.");
    const invoice = invoiceSnap.data() as Record<string, any>;
    const profile = profileSnap.data() as Record<string, any>;
    const registration = registrationSnap.empty ? null : registrationSnap.docs[0];
    const registrationData = registration?.data() as Record<string, any> | undefined;
    const ownerUid = safeString(profile.ownerUid || registrationData?.ownerUid || params.businessId);
    if (ownerUid !== params.businessId) throw new Error("The payment does not belong to this BillFlow account.");
    if (safeString(invoice.providerReference) !== params.reference) throw new Error("The payment reference is not linked to this onboarding invoice.");
    const invoiceAmount = Number(invoice.amount || 0);
    if (!Number.isFinite(invoiceAmount) || Math.abs(invoiceAmount - verifiedAmount) > 0.01) {
      throw new Error("The confirmed payment amount does not match the onboarding invoice.");
    }
    if (invoice.status === "paid") {
      const shouldSendReceipt = invoice.receiptEmailStatus !== "sent" && invoice.receiptEmailStatus !== "sending";
      if (shouldSendReceipt) transaction.update(invoiceRef, { receiptEmailStatus: "sending" });
      return {
        alreadySettled: true,
        shouldSendReceipt,
        invoice: { ...invoice, invoiceNumber: invoice.invoiceNumber, amountPaid: invoice.amountPaid || invoiceAmount, status: "paid" },
        profile,
        businessName: safeString(profile.businessName) || "BillFlow business",
        email: safeString(profile.email) || safeString(profile.ownerEmail),
        managementPlan: normalizeManagementPlan(profile.managementPlan) || "demo",
        proBusinessScale: normalizeScale(profile.proBusinessScale),
        logoDataUrl: safeString(profile.logoDataUrl),
        footerNote: safeString(profile.footerNote),
        currency: safeString(profile.currency) || "GHS",
      };
    }

    if (profile.status === "suspended") throw new Error("This account is suspended and cannot be auto-approved by payment.");
    const managementPlan = normalizeManagementPlan(profile.managementPlan ?? registrationData?.managementPlan) || "demo";
    const proBusinessScale = normalizeScale(profile.proBusinessScale ?? registrationData?.proBusinessScale);
    const details = getManagementPlanDetails(managementPlan, proBusinessScale || "large");
    if (details.startupPrice <= 0) throw new Error("Demo Management does not require onboarding payment.");
    if (Math.abs(details.startupPrice - verifiedAmount) > 0.01) throw new Error("The payment does not match the selected management plan.");

    const approvalUpdate = {
      status: "active",
      paymentStatus: "paid",
      paymentMethod: "momo",
      paymentProvider: "paystack",
      paymentReference: params.reference,
      paymentTransactionId: String(params.transaction.id || ""),
      approvedBy: `paystack:${params.source}`,
      approvedAt: FieldValue.serverTimestamp(),
    };
    transaction.update(profileRef, approvalUpdate);
    if (registration) transaction.update(registration.ref, approvalUpdate);
    if (registration) {
      const staffRef = firestore.collection("staff").doc(`staff_${params.businessId}`);
      transaction.set(staffRef, { status: "active", businessId: params.businessId }, { merge: true });
    }
    transaction.update(invoiceRef, {
      status: "paid",
      amountPaid: invoiceAmount,
      paidAt: FieldValue.serverTimestamp(),
      paymentMethod: "momo",
      provider: "paystack",
      providerReference: params.reference,
      providerTransactionId: String(params.transaction.id || ""),
      paymentConfirmedAt: FieldValue.serverTimestamp(),
      paymentConfirmedBy: `paystack:${params.source}`,
      receiptEmailStatus: "sending",
    });
    if (!paymentSnap.exists) {
      transaction.create(paymentRef, {
        userId: params.businessId,
        businessId: params.businessId,
        clientId: `business_${params.businessId}`,
        clientName: safeString(profile.businessName) || "BillFlow business",
        invoiceId: invoiceRef.id,
        method: "momo",
        reference: params.reference,
        amount: invoiceAmount,
        status: "success",
        provider: "paystack",
        providerTransactionId: String(params.transaction.id || ""),
        source: "onboarding",
        createdAt: FieldValue.serverTimestamp(),
      });
    }

    return {
      alreadySettled: false,
      shouldSendReceipt: true,
      invoice: { ...invoice, amount: invoiceAmount, amountPaid: invoiceAmount, status: "paid", invoiceNumber: invoice.invoiceNumber },
      profile,
      businessName: safeString(profile.businessName) || "BillFlow business",
      email: safeString(profile.email) || safeString(profile.ownerEmail),
      managementPlan,
      proBusinessScale,
      logoDataUrl: safeString(profile.logoDataUrl),
      footerNote: safeString(profile.footerNote),
      currency: safeString(profile.currency) || "GHS",
    };
  });

  if (!result.email) throw new Error("The account has no email address for the payment receipt.");
  const details = getManagementPlanDetails(result.managementPlan, result.proBusinessScale || "large");
  return { ...result, details };
}

export function getPaystackAmountInSubunits(amount: number) {
  return amountInSubunits(amount);
}
