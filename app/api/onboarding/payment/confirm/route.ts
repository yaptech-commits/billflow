import { NextRequest, NextResponse } from "next/server";
import { verifyServerFirebaseToken } from "@/lib/firebase-admin";
import { enforceRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import {
  settleVerifiedOnboardingPayment,
  sendOnboardingInvoiceEmail,
  setOnboardingEmailStatus,
} from "@/lib/onboarding-payment";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

export async function POST(request: NextRequest) {
  try {
    const authorization = request.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) return jsonError("Authentication required.", 401);
    const user = await verifyServerFirebaseToken(authorization.slice("Bearer ".length));
    const rateLimit = await enforceRateLimit(request, {
      name: `onboarding-payment-confirm:${user.uid}`,
      limit: 12,
      windowMs: 15 * 60 * 1000,
    });
    if (!rateLimit.allowed) return rateLimitResponse(rateLimit);

    const body = await request.json().catch(() => ({}));
    const submittedBusinessId = String(body.businessId || "").trim();
    const businessId = submittedBusinessId === user.uid || submittedBusinessId === `biz_${user.uid}` ? user.uid : "";
    const reference = String(body.reference || "").trim();
    if (!businessId) return jsonError("Invalid onboarding account.", 403);
    if (!reference) return jsonError("A payment reference is required.", 400);

    const secretKey = process.env.PAYSTACK_SECRET_KEY;
    if (!secretKey) return jsonError("Mobile Money payment verification is not configured.", 503);

    const paystackResponse = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${secretKey}` },
      cache: "no-store",
    });
    const payload = await paystackResponse.json().catch(() => null);
    if (!paystackResponse.ok || payload?.status !== true || payload?.data?.status !== "success") {
      return jsonError("Payment is not confirmed yet. Check your phone to approve payment, then try again.", 402);
    }

    const transaction = payload.data as Record<string, any>;
    const metadataBusinessId = String(transaction.metadata?.businessId || "").trim();
    if (metadataBusinessId && metadataBusinessId !== businessId) return jsonError("Payment account mismatch.", 403);
    const channel = String(transaction.channel || "").toLowerCase();
    const requestedChannels = Array.isArray(transaction.authorization?.channels) ? transaction.authorization.channels : [];
    if (channel && channel !== "mobile_money" && !requestedChannels.includes("mobile_money")) {
      return jsonError("This payment is not a Mobile Money onboarding payment.", 400);
    }

    const settled = await settleVerifiedOnboardingPayment({
      businessId,
      reference,
      transaction,
      source: "confirm",
    });
    if (settled.shouldSendReceipt) {
      const emailResult = await sendOnboardingInvoiceEmail({
        emailKind: "receipt",
        businessId,
        email: settled.email,
        businessName: settled.businessName,
        invoice: settled.invoice,
        details: settled.details,
        logoDataUrl: settled.logoDataUrl,
        footerNote: settled.footerNote,
        currency: settled.currency,
      });
      await setOnboardingEmailStatus(businessId, "receipt", emailResult);
    }

    return NextResponse.json({
      status: "approved",
      businessId,
      amount: Number(transaction.amount || 0) / 100,
      currency: String(transaction.currency || "GHS"),
      invoiceNumber: settled.invoice.invoiceNumber,
      emailStatus: settled.shouldSendReceipt ? "sent_or_queued" : "already_sent",
    });
  } catch (error: any) {
    console.error("Onboarding payment confirmation failed:", error);
    return jsonError(error?.message || "Payment confirmation failed.", 400);
  }
}

export async function GET() {
  return jsonError("Use POST to confirm an onboarding payment.", 405);
}
