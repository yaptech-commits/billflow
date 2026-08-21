import { createHash } from "node:crypto";

import { FieldValue, Timestamp } from "firebase-admin/firestore";

import { getAdminDb } from "@/lib/firebase-admin";

export type RateLimitConfig = {
  /** Stable name for the protected operation, not a secret. */
  name: string;
  /** Maximum requests accepted within the rolling window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
};

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
};

function requestAddress(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip")?.trim() || "unknown";
}

function bucketId(request: Request, config: RateLimitConfig) {
  const material = `${config.name}:${requestAddress(request)}`;
  return createHash("sha256").update(material).digest("hex").slice(0, 40);
}

/**
 * Server-only, Firestore-backed request limiter. The counter is shared across
 * serverless instances, and only a one-way address hash is persisted.
 */
export async function enforceRateLimit(
  request: Request,
  config: RateLimitConfig,
): Promise<RateLimitResult> {
  const nowMs = Date.now();
  const ref = getAdminDb().collection("rateLimits").doc(bucketId(request, config));
  const result = await getAdminDb().runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const existing = snapshot.exists ? snapshot.data() || {} : {};
    const expiresAt = existing.expiresAt instanceof Timestamp ? existing.expiresAt.toMillis() : 0;
    const currentCount = Number(existing.count || 0);
    const withinWindow = expiresAt > nowMs;
    const count = withinWindow ? currentCount + 1 : 1;
    const nextExpiry = withinWindow ? expiresAt : nowMs + config.windowMs;

    transaction.set(ref, {
      name: config.name,
      count,
      expiresAt: Timestamp.fromMillis(nextExpiry),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return {
      count,
      retryAfterSeconds: Math.max(1, Math.ceil((nextExpiry - nowMs) / 1000)),
    };
  });

  return {
    allowed: result.count <= config.limit,
    limit: config.limit,
    remaining: Math.max(0, config.limit - result.count),
    retryAfterSeconds: result.retryAfterSeconds,
  };
}

export function rateLimitResponse(result: RateLimitResult) {
  return new Response(JSON.stringify({
    error: "Too many requests. Please wait and try again.",
    retryAfterSeconds: result.retryAfterSeconds,
  }), {
    status: 429,
    headers: {
      "content-type": "application/json",
      "retry-after": String(result.retryAfterSeconds),
      "cache-control": "no-store",
    },
  });
}
