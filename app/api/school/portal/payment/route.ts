import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase-admin";
import { verifyPortalSession } from "@/lib/portal-session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DEFAULT_PROPERTY_ID = "default_property";

type PaymentMethod = "card" | "momo";

function normalizePropertyId(value: unknown) {
  return String(value || DEFAULT_PROPERTY_ID).trim() || DEFAULT_PROPERTY_ID;
}

function paymentDocumentId(businessId: string, reference: string) {
  const scope = `${businessId}_${reference}`.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 140);
  return `paystack_${scope}`;
}

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

function metadataValue(transaction: any, key: string) {
  const direct = transaction?.metadata?.[key];
  if (direct !== undefined && direct !== null) return String(direct);
  const customField = Array.isArray(transaction?.metadata?.custom_fields)
    ? transaction.metadata.custom_fields.find((field: any) => field?.variable_name === key)
    : undefined;
  return customField?.value === undefined || customField?.value === null ? "" : String(customField.value);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const portalSession = String(body.portalSession || "").trim();
    const feeId = String(body.feeId || "").trim();
    const reference = String(body.reference || "").trim();
    const paymentMethod = body.paymentMethod as PaymentMethod;
    const requestedAmount = Number(body.amount || 0);
    const session = verifyPortalSession(portalSession);
    const studentId = session.studentId;
    const businessId = session.businessId;
    const propertyId = normalizePropertyId(session.propertyId);

    if (!portalSession || !feeId || !reference) {
      return jsonError("The fee payment request is incomplete.", 400);
    }
    if (paymentMethod !== "card" && paymentMethod !== "momo") {
      return jsonError("Choose card or mobile money for this payment.", 400);
    }
    if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) {
      return jsonError("Enter a valid fee payment amount.", 400);
    }

    const secretKey = process.env.PAYSTACK_SECRET_KEY;
    if (!secretKey) {
      return jsonError("Online fee payments are not configured for this school yet.", 503);
    }

    const verificationResponse = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });
    const verificationPayload = await verificationResponse.json().catch(() => null);
    const transaction = verificationPayload?.data;
    if (!verificationResponse.ok || verificationPayload?.status !== true || transaction?.status !== "success") {
      return jsonError("The payment provider has not confirmed this payment.", 402);
    }

    const providerStudentId = metadataValue(transaction, "student_id");
    const providerFeeId = metadataValue(transaction, "fee_id");
    if (providerStudentId !== studentId || providerFeeId !== feeId) {
      return jsonError("The confirmed payment is not linked to this student fee.", 409);
    }

    const verifiedAmount = Number(transaction.amount || 0) / 100;
    if (!Number.isFinite(verifiedAmount) || Math.abs(verifiedAmount - requestedAmount) > 0.01) {
      return jsonError("The confirmed payment amount does not match the requested amount.", 409);
    }

    const db = getAdminDb();
    const feeRef = db.collection("studentFees").doc(feeId);
    const paymentRef = db.collection("studentFeePayments").doc(paymentDocumentId(businessId, reference));
    const result = await db.runTransaction(async (transactionRunner) => {
      const feeSnap = await transactionRunner.get(feeRef);
      const paymentSnap = await transactionRunner.get(paymentRef);

      if (paymentSnap.exists) {
        const existing = paymentSnap.data() as Record<string, any>;
        if (String(existing.businessId || "") !== businessId || String(existing.studentId || "") !== studentId) {
          throw new Error("This payment reference is already linked to another record.");
        }
        return {
          alreadyProcessed: true,
          fee: {
            id: feeId,
            amount: Number(existing.feeAmount || 0),
            amountPaid: Number(existing.feeAmountPaid || 0),
            balance: Number(existing.feeBalance || 0),
            status: existing.feeStatus || "partial",
          },
        };
      }

      if (!feeSnap.exists) throw new Error("Fee record not found.");
      const fee = feeSnap.data() as Record<string, any>;
      if (String(fee.businessId || "") !== businessId || String(fee.studentId || "") !== studentId) {
        throw new Error("This fee does not belong to the selected student.");
      }
      if (normalizePropertyId(fee.propertyId) !== propertyId) {
        throw new Error("This fee is outside the selected school property.");
      }

      const amount = Number(fee.amount || 0);
      const currentPaid = Number(fee.amountPaid || 0);
      const currentBalance = Math.max(0, amount - currentPaid);
      if (currentBalance <= 0.01) {
        return {
          alreadyProcessed: true,
          fee: { id: feeId, amount, amountPaid: currentPaid, balance: 0, status: "paid" },
        };
      }
      if (verifiedAmount > currentBalance + 0.01) {
        throw new Error("The payment is greater than the remaining fee balance.");
      }

      const newPaid = Math.min(amount, currentPaid + verifiedAmount);
      const newBalance = Math.max(0, amount - newPaid);
      const newStatus = newBalance <= 0.01 ? "paid" : newPaid > 0 ? "partial" : "unpaid";
      const recordedMethod = paymentMethod === "momo" ? "Mobile Money" : "Card";

      transactionRunner.update(feeRef, {
        amountPaid: newPaid,
        status: newStatus,
        updatedAt: FieldValue.serverTimestamp(),
      });
      transactionRunner.create(paymentRef, {
        businessId,
        propertyId,
        studentId,
        studentName: fee.studentName || "",
        classGrade: fee.classGrade || "",
        feeId,
        feeTitle: fee.feeTitle || "School fees",
        amountPaid: verifiedAmount,
        paymentMethod: recordedMethod,
        term: fee.term || "Term 1",
        provider: "paystack",
        providerReference: reference,
        providerTransactionId: String(transaction.id || ""),
        feeAmount: amount,
        feeAmountPaid: newPaid,
        feeBalance: newBalance,
        feeStatus: newStatus,
        recordedAt: FieldValue.serverTimestamp(),
      });

      return {
        alreadyProcessed: false,
        fee: { id: feeId, amount, amountPaid: newPaid, balance: newBalance, status: newStatus },
      };
    });

    return NextResponse.json({ ...result, reference });
  } catch (error: any) {
    console.error("Parent Portal fee payment failed:", error);
    return jsonError(error?.message || "The fee payment could not be recorded.", 400);
  }
}

export async function GET() {
  return jsonError("Use POST to confirm a Parent Portal fee payment.", 405);
}
