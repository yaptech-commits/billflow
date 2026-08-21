import { NextRequest, NextResponse } from "next/server";
import {
  sendOnboardingInvoiceEmail,
  settleVerifiedOnboardingPayment,
  setOnboardingEmailStatus,
  verifyPaystackSignature,
} from "@/lib/onboarding-payment";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const secretKey = process.env.PAYSTACK_SECRET_KEY;
  if (!secretKey) return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });

  const rawBody = await request.text();
  if (!verifyPaystackSignature(rawBody, request.headers.get("x-paystack-signature"), secretKey)) {
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
  }

  try {
    const payload = JSON.parse(rawBody) as Record<string, any>;
    if (payload.event !== "charge.success") return NextResponse.json({ received: true, ignored: true });
    const transaction = payload.data as Record<string, any>;
    if (!transaction || transaction.status !== "success") return NextResponse.json({ received: true, ignored: true });

    const businessId = String(transaction.metadata?.businessId || "").trim();
    const reference = String(transaction.reference || "").trim();
    if (!businessId || !reference) return NextResponse.json({ error: "Missing onboarding metadata" }, { status: 400 });

    const settled = await settleVerifiedOnboardingPayment({
      businessId,
      reference,
      transaction,
      source: "webhook",
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

    return NextResponse.json({ received: true, status: "approved", businessId, reference });
  } catch (error) {
    console.error("Paystack onboarding webhook failed:", error);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, service: "billflow-onboarding-payment-webhook" });
}
