import crypto from "node:crypto";

const SESSION_TTL_SECONDS = 15 * 60;

type PortalSessionPayload = {
  studentId: string;
  businessId: string;
  propertyId: string;
  iat: number;
  exp: number;
};

function getSecret() {
  const secret = process.env.PORTAL_SESSION_SECRET || process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("PORTAL_SESSION_SECRET or JWT_SECRET must be configured with at least 32 characters.");
  }
  return secret;
}

function encode(value: string) {
  return Buffer.from(value).toString("base64url");
}

function decode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function sign(value: string) {
  return crypto.createHmac("sha256", getSecret()).update(value).digest("base64url");
}

export function createPortalSession(input: Omit<PortalSessionPayload, "iat" | "exp">) {
  const now = Math.floor(Date.now() / 1000);
  const payload: PortalSessionPayload = { ...input, iat: now, exp: now + SESSION_TTL_SECONDS };
  const encodedPayload = encode(JSON.stringify(payload));
  return `${encodedPayload}.${sign(encodedPayload)}`;
}

export function verifyPortalSession(token: unknown): PortalSessionPayload {
  const raw = String(token || "");
  const [encodedPayload, providedSignature] = raw.split(".");
  if (!encodedPayload || !providedSignature || providedSignature.length > 200) {
    throw new Error("Invalid Parent Portal session.");
  }

  const expectedSignature = sign(encodedPayload);
  const providedBuffer = Buffer.from(providedSignature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (providedBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(providedBuffer, expectedBuffer)) {
    throw new Error("Invalid Parent Portal session.");
  }

  let payload: Partial<PortalSessionPayload>;
  try {
    payload = JSON.parse(decode(encodedPayload));
  } catch {
    throw new Error("Invalid Parent Portal session.");
  }

  const now = Math.floor(Date.now() / 1000);
  if (
    typeof payload.studentId !== "string" || !payload.studentId ||
    typeof payload.businessId !== "string" || !payload.businessId ||
    typeof payload.propertyId !== "string" || !payload.propertyId ||
    typeof payload.iat !== "number" || typeof payload.exp !== "number" ||
    payload.exp <= now || payload.iat > now + 30 || payload.exp - payload.iat > SESSION_TTL_SECONDS
  ) {
    throw new Error("Expired or malformed Parent Portal session.");
  }

  return payload as PortalSessionPayload;
}
