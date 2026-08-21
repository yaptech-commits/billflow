import fs from "node:fs";
import path from "node:path";

const root = process.env.BILLFLOW_ROOT || process.cwd();
const failures = [];
const warnings = [];

function read(relativePath) {
  const fullPath = path.join(root, relativePath);
  if (!fs.existsSync(fullPath)) return null;
  return fs.readFileSync(fullPath, "utf8");
}

function pass(message) {
  console.log(`[PASS] ${message}`);
}

function fail(message) {
  failures.push(message);
  console.error(`[FAIL] ${message}`);
}

function warn(message) {
  warnings.push(message);
  console.warn(`[WARN] ${message}`);
}

console.log("=== BillFlow Production Readiness Verification ===");

const requiredFiles = [
  "app/(app)/admin/page.tsx",
  "app/(app)/school/teachers/page.tsx",
  "app/(app)/school/classes/page.tsx",
  "app/(app)/school/students/page.tsx",
  "app/school/portal/page.tsx",
  "app/api/school/teachers/route.ts",
  "app/api/school/portal/route.ts",
  "app/api/school/portal/payment/route.ts",
  "app/api/admin/security-events/route.ts",
  "app/api/health/route.ts",
  "lib/security-events-server.ts",
  "lib/server-auth.ts",
  "lib/db.ts",
  "lib/rate-limit.ts",
  "firestore.rules",
  "vercel.json",
];

for (const relativePath of requiredFiles) {
  if (read(relativePath) !== null) pass(`Required path exists: ${relativePath}`);
  else fail(`Missing required path: ${relativePath}`);
}

const packageSource = read("package.json");
if (packageSource) {
  try {
    const packageJson = JSON.parse(packageSource);
    if (packageJson.scripts?.build === "next build") pass("Production build script is configured");
    else fail("package.json does not expose the expected Next.js production build script");
    if (packageJson.scripts?.["verify:readiness"] === "node scripts/verify-production-readiness.mjs") {
      pass("Readiness verification is wired into package scripts");
    } else {
      fail("Readiness verification is not wired into package scripts");
    }
  } catch {
    fail("package.json is not valid JSON");
  }
}

const vercelSource = read("vercel.json");
if (vercelSource) {
  try {
    const vercel = JSON.parse(vercelSource);
    const cronJobs = Array.isArray(vercel.crons) ? vercel.crons : [];
    if (!cronJobs.length) warn("No Vercel cron jobs are configured");
    for (const job of cronJobs) {
      if (job.schedule === "*/15 * * * *") {
        fail(`Hobby-incompatible 15-minute cron remains configured for ${job.path || "unknown route"}`);
      } else if (job.schedule === "0 0 * * *") {
        pass(`Hobby-compatible daily cron configured for ${job.path || "unknown route"}`);
      } else {
        warn(`Review cron schedule ${job.schedule || "missing"} for ${job.path || "unknown route"}`);
      }
    }
  } catch {
    fail("vercel.json is not valid JSON");
  }
}

const portalRoute = read("app/api/school/portal/route.ts");
if (portalRoute?.includes("enforceRateLimit") && portalRoute?.includes("school-parent-portal-lookup")) {
  pass("Parent Portal lookup uses the shared rate limiter");
} else {
  fail("Parent Portal lookup is missing shared rate limiting");
}

const paymentRoute = read("app/api/school/portal/payment/route.ts");
if (paymentRoute?.includes("enforceRateLimit") && paymentRoute?.includes("school-parent-portal-payment")) {
  pass("Parent Portal payment confirmation uses the shared rate limiter");
} else {
  fail("Parent Portal payment confirmation is missing shared rate limiting");
}

const teacherRoute = read("app/api/school/teachers/route.ts");
if (teacherRoute?.includes('staffType: "teacher"') && teacherRoute?.includes('status: "pending"')) {
  pass("Teacher creation preserves pending staff lifecycle semantics");
} else {
  fail("Teacher creation is missing pending staff lifecycle semantics");
}

const securityRoute = read("app/api/admin/security-events/route.ts");
if (
  securityRoute?.includes("SUPER_ADMIN_EMAIL") &&
  securityRoute?.includes("verifyIdToken") &&
  securityRoute?.includes("unauthorized_security_monitor_access")
) pass("Security events route is protected by Super Admin authorization");
else fail("Security events route is missing Super Admin authorization");

const rules = read("firestore.rules");
if (rules?.includes("rateLimits")) {
  if (/match \/rateLimits\/{[^}]+}[\s\S]*allow (write|read|read, write):\s*if\s+false/.test(rules)) {
    pass("Rate-limit records are not client-writable");
  } else {
    warn("Review Firestore rules to ensure rate-limit records remain server-only");
  }
}

const healthRoute = read("app/api/health/route.ts");
if (healthRoute?.includes("Cache-Control") && healthRoute?.includes("getAdminDb")) {
  pass("Non-sensitive production health endpoint is configured");
} else {
  fail("Production health endpoint is missing safe liveness checks");
}

const roadmap = read("production-readiness-roadmap.md");
if (roadmap) pass("Production-readiness roadmap is documented");
else warn("Production-readiness roadmap document is missing");

console.log(`\nCompleted with ${failures.length} failure(s) and ${warnings.length} warning(s).`);
if (failures.length) process.exit(1);
console.log("[SUCCESS] BillFlow passed the automated production-readiness checks.");
