import { NextRequest, NextResponse } from "next/server";
import { verifyServerFirebaseToken } from "@/lib/firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function inspectWebhook(envVar: string, description: string) {
  const rawValue = process.env[envVar]?.trim();
  if (!rawValue) {
    return { configured: false, envVar, description, validationMessage: "No server webhook URL is configured." };
  }
  try {
    const url = new URL(rawValue);
    const isAllowedProtocol = url.protocol === "https:" || (process.env.NODE_ENV !== "production" && url.protocol === "http:");
    return {
      configured: isAllowedProtocol,
      envVar,
      description,
      validationMessage: isAllowedProtocol ? undefined : "Use an HTTPS webhook URL in production.",
    };
  } catch {
    return { configured: false, envVar, description, validationMessage: "The configured value is not a valid HTTP(S) URL." };
  }
}

export async function GET(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  try {
    await verifyServerFirebaseToken(authorization.slice("Bearer ".length));
  } catch {
    return NextResponse.json({ error: "Invalid Firebase session or missing server credentials" }, { status: 401 });
  }

  return NextResponse.json({
    email: inspectWebhook("SCHOOL_EMAIL_WEBHOOK_URL", "Receives branded admission letters and school email notifications."),
    sms: inspectWebhook("SCHOOL_SMS_WEBHOOK_URL", "Receives optional admission SMS and school SMS notifications."),
    webhookAuth: {
      configured: Boolean(process.env.SCHOOL_NOTIFICATION_WEBHOOK_SECRET),
      envVar: "SCHOOL_NOTIFICATION_WEBHOOK_SECRET",
      description: "Optional shared secret sent as x-billflow-webhook-secret to your provider adapter.",
    },
    retryScheduler: {
      configured: Boolean(process.env.CRON_SECRET),
      envVar: "CRON_SECRET",
      schedule: "Every 15 minutes",
      description: "Protected Vercel cron retries queued school notifications with a maximum of five attempts.",
    },
  });
}
