/**
 * BillFlow Seed-Free Pilot Smoke Test
 * Validates that a running BillFlow instance responds correctly on critical routes
 * and health endpoints without writing or mutating any production data.
 */

import http from 'node:http';
import https from 'node:https';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';

async function checkRoute(path, expectedStatus = [200, 301, 302, 307, 308]) {
  return new Promise((resolve) => {
    const url = `${BASE_URL}${path}`;
    const client = url.startsWith('https') ? https : http;
    client.get(url, (res) => {
      const ok = expectedStatus.includes(res.statusCode);
      resolve({
        path,
        statusCode: res.statusCode,
        ok,
      });
    }).on('error', (err) => {
      resolve({
        path,
        statusCode: 0,
        ok: false,
        error: err.message,
      });
    });
  });
}

async function run() {
  console.log(`=== BillFlow Pilot Smoke Test (${BASE_URL}) ===`);
  const routes = [
    { path: '/api/health', expected: [200] },
    { path: '/school/portal', expected: [200] },
    { path: '/auth/login', expected: [200] },
    { path: '/admin', expected: [200, 302, 307] }, // Protected route should redirect or challenge unauthenticated users
  ];

  let allPassed = true;
  for (const item of routes) {
    const result = await checkRoute(item.path, item.expected);
    if (result.ok) {
      console.log(`[PASS] ${result.path} -> HTTP ${result.statusCode}`);
    } else {
      console.log(`[FAIL] ${result.path} -> HTTP ${result.statusCode} ${result.error || ''}`);
      allPassed = false;
    }
  }

  if (allPassed) {
    console.log('\n[SUCCESS] All pilot smoke test checks passed successfully without database mutations.');
    process.exit(0);
  } else {
    console.log('\n[FAIL] One or more pilot smoke test checks failed.');
    process.exit(1);
  }
}

run();
