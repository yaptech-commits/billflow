/**
 * BillFlow Seed-Free Pilot Smoke Test
 * Validates that a running BillFlow instance responds correctly on critical routes
 * and health endpoints without writing or mutating any production data.
 */

import http from 'node:http';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';

async function checkRoute(path) {
  return new Promise((resolve) => {
    const url = `${BASE_URL}${path}`;
    http.get(url, (res) => {
      resolve({
        path,
        statusCode: res.statusCode,
        ok: res.statusCode >= 200 && res.statusCode < 400,
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
    '/api/health',
    '/school/portal',
    '/auth/login',
  ];

  let allPassed = true;
  for (const route of routes) {
    const result = await checkRoute(route);
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
