import { NextRequest, NextResponse } from "next/server";
import { errorResponseDetails, requireServerActor } from "@/lib/server-auth";

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
  try {
    const actor = await requireServerActor(request);
    if (actor.role !== "owner" && actor.role !== "super_admin") {
      return NextResponse.json({ error: "Owner or super-admin access required" }, { status: 403 });
    }

    return NextResponse.json({
      email: inspectWebhook("SCHOOL_EMAIL_WEBHOOK_URL", "Receives branded admission letters and school email notifications."),
      sms: inspectWebhook("SCHOOL_SMS_WEBHOOK_URL", "Receives optional admission SMS and school SMS notifications."),
      whatsapp: inspectWebhook("SCHOOL_WHATSAPP_WEBHOOK_URL", "Receives optional WhatsApp admission letters and school notifications."),
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
  } catch (error) {
    const details = errorResponseDetails(error);
    return NextResponse.json({ error: details.message }, { status: details.status });
  }
}
