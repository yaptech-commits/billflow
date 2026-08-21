import { NextRequest, NextResponse } from "next/server";
import { getAdminDb, verifyServerFirebaseToken } from "@/lib/firebase-admin";
import { enforceRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import {
  getPaystackAmountInSubunits,
  prepareOnboardingInvoice,
  sendOnboardingInvoiceEmail,
  setOnboardingEmailStatus,
  type OnboardingPaymentMethod,
} from "@/lib/onboarding-payment";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

async function authenticate(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) throw new Error("Authentication required");
  return verifyServerFirebaseToken(authorization.slice("Bearer ".length));
}

export async function POST(request: NextRequest) {
  try {
    const user = await authenticate(request);
    const rateLimit = await enforceRateLimit(request, {
      name: `onboarding-payment-initialize:${user.uid}`,
      limit: 6,
      windowMs: 15 * 60 * 1000,
    });
    if (!rateLimit.allowed) return rateLimitResponse(rateLimit);

    const body = await request.json().catch(() => ({}));
    const submittedBusinessId = String(body.businessId || "").trim();
    const businessId = submittedBusinessId === user.uid || submittedBusinessId === `biz_${user.uid}` ? user.uid : "";
    const paymentMethod = body.paymentMethod as OnboardingPaymentMethod;
    if (!businessId) return jsonError("Invalid onboarding account.", 403);
    if (paymentMethod !== "cash" && paymentMethod !== "momo") return jsonError("Choose Cash or Mobile Money.", 400);
    const cashAmount = paymentMethod === "cash" && body.cashAmount !== undefined ? Number(body.cashAmount) : undefined;

    const prepared = await prepareOnboardingInvoice({
      businessId,
      paymentMethod,
      cashAmount,
      markInvoiceEmailSending: true,
    });

    if (prepared.amount <= 0) {
      return NextResponse.json({
        status: "no_payment_required",
        businessId,
        plan: prepared.managementPlan,
        amount: 0,
        currency: prepared.currency,
      });
    }

    if (prepared.shouldSendInvoiceEmail) {
      const emailResult = await sendOnboardingInvoiceEmail({
        emailKind: "invoice",
        businessId,
        email: prepared.email,
        businessName: prepared.businessName,
        invoice: prepared.invoice || {},
        details: prepared.details,
        logoDataUrl: prepared.logoDataUrl,
        footerNote: prepared.footerNote,
        currency: prepared.currency,
      });
      await setOnboardingEmailStatus(businessId, "invoice", emailResult);
    }

    if (paymentMethod === "cash") {
      return NextResponse.json({
        status: "cash_pending",
        businessId,
        plan: prepared.managementPlan,
        amount: prepared.amount,
        cashAmount: prepared.cashAmount,
        currency: prepared.currency,
        invoiceNumber: prepared.invoiceNumber,
        email: prepared.email,
        message: "Your cash payment request is pending administrator confirmation. The onboarding invoice has been sent or queued for your email.",
      });
    }

    const secretKey = process.env.PAYSTACK_SECRET_KEY;
    if (!secretKey) return jsonError("Mobile Money onboarding payments are not configured yet. Please choose Cash or contact BillFlow Official.", 503);
    if (!prepared.invoiceId || !prepared.invoiceNumber) return jsonError("The onboarding invoice is not ready yet. Please try again.", 409);

    const reference = prepared.providerReference || `${prepared.invoiceNumber}-${Date.now()}`;
    const origin = request.nextUrl.origin;
    const callbackUrl = `${origin}/auth/onboarding-payment?businessId=${encodeURIComponent(businessId)}`;
    const initializationResponse = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: prepared.email,
        amount: getPaystackAmountInSubunits(prepared.amount),
        currency: prepared.currency || "GHS",
        reference,
        callback_url: callbackUrl,
        channels: ["mobile_money"],
        metadata: {
          purpose: "billflow_onboarding",
          businessId,
          invoiceId: prepared.invoiceId,
          plan: prepared.managementPlan,
          proBusinessScale: prepared.proBusinessScale,
        },
      }),
      cache: "no-store",
    });
    const initializationPayload = await initializationResponse.json().catch(() => null);
    if (!initializationResponse.ok || initializationPayload?.status !== true || !initializationPayload?.data?.authorization_url) {
      console.error("Paystack onboarding initialization failed", initializationPayload);
      return jsonError("Mobile Money checkout could not be started. Please try again or choose Cash.", 502);
    }

    const firestore = getAdminDb();
    await firestore.collection("invoices").doc(prepared.invoiceId).update({
      provider: "paystack",
      providerReference: initializationPayload.data.reference || reference,
      paymentMethod: "momo",
      paymentStatus: "pending",
      paymentInitializedAt: new Date(),
    });
    await firestore.collection("businessProfiles").doc(businessId).set({
      onboardingPaymentMethod: "momo",
      paymentProvider: "paystack",
      providerReference: initializationPayload.data.reference || reference,
      paymentStatus: "pending",
      updatedAt: new Date(),
    }, { merge: true });
    await firestore.collection("businesses").where("ownerUid", "==", businessId).limit(1).get().then(async (snapshot) => {
      if (!snapshot.empty) {
        await snapshot.docs[0].ref.set({
          onboardingPaymentMethod: "momo",
          paymentProvider: "paystack",
          providerReference: initializationPayload.data.reference || reference,
          paymentStatus: "pending",
        }, { merge: true });
      }
    });

    return NextResponse.json({
      status: "checkout_ready",
      businessId,
      plan: prepared.managementPlan,
      amount: prepared.amount,
      currency: prepared.currency,
      invoiceNumber: prepared.invoiceNumber,
      reference: initializationPayload.data.reference || reference,
      authorizationUrl: initializationPayload.data.authorization_url,
      accessCode: initializationPayload.data.access_code || null,
    });
  } catch (error: any) {
    console.error("Onboarding payment initialization failed:", error);
    const message = error?.message === "Authentication required" ? error.message : error?.message || "The onboarding payment could not be started.";
    return jsonError(message, message === "Authentication required" ? 401 : 400);
  }
}

export async function GET() {
  return jsonError("Use POST to start an onboarding payment.", 405);
}
