import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';

// Custom metrics per backend
const withHudDuration = new Trend('with_hud_duration', true);
const noHudDuration = new Trend('no_hud_duration', true);
const withHudErrors = new Counter('with_hud_errors');
const noHudErrors = new Counter('no_hud_errors');

// Environment variables
const WITH_HUD_URL = __ENV.WITH_HUD_URL || 'http://with-hud.stress-test.local:3001';
const NO_HUD_URL = __ENV.NO_HUD_URL || 'http://no-hud.stress-test.local:3001';

export const options = {
  scenarios: {
    load_test: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 10 },   // Ramp up to 10 users
        { duration: '1m', target: 10 },    // Stay at 10
        { duration: '30s', target: 25 },   // Ramp up to 25
        { duration: '1m', target: 25 },    // Stay at 25
        { duration: '30s', target: 50 },   // Ramp up to 50
        { duration: '2m', target: 50 },    // Stay at 50 (peak)
        { duration: '30s', target: 0 },    // Ramp down
      ],
    },
  },
  thresholds: {
    'with_hud_duration': ['p(95)<2000'],
    'no_hud_duration': ['p(95)<2000'],
    'with_hud_errors': ['count<100'],
    'no_hud_errors': ['count<100'],
  },
};

// Helper to make parallel requests to both backends
function dualRequest(method, path, body = null, params = {}) {
  const requests = {
    with_hud: {
      method: method,
      url: `${WITH_HUD_URL}${path}`,
      body: body ? JSON.stringify(body) : null,
      params: { ...params, headers: { 'Content-Type': 'application/json' } },
    },
    no_hud: {
      method: method,
      url: `${NO_HUD_URL}${path}`,
      body: body ? JSON.stringify(body) : null,
      params: { ...params, headers: { 'Content-Type': 'application/json' } },
    },
  };

  const responses = http.batch(requests);

  // Record metrics for with-hud
  withHudDuration.add(responses.with_hud.timings.duration);
  if (responses.with_hud.status >= 400) {
    withHudErrors.add(1);
  }

  // Record metrics for no-hud
  noHudDuration.add(responses.no_hud.timings.duration);
  if (responses.no_hud.status >= 400) {
    noHudErrors.add(1);
  }

  return responses;
}

// Simulated user session
export default function () {
  const userId = `user-${__VU}-${__ITER}`;

  // 1. Browse products
  dualRequest('GET', '/products');
  sleep(0.5);

  // 2. Get categories
  dualRequest('GET', '/products/categories');
  sleep(0.3);

  // 3. View 2-4 random products
  const numProducts = Math.floor(Math.random() * 3) + 2;
  for (let i = 0; i < numProducts; i++) {
    const productId = Math.floor(Math.random() * 10) + 1;
    dualRequest('GET', `/products/${productId}`);
    sleep(0.3);
  }

  // 4. Add items to cart
  const numItems = Math.floor(Math.random() * 5) + 1;
  for (let i = 0; i < numItems; i++) {
    const productId = Math.floor(Math.random() * 10) + 1;
    const quantity = Math.floor(Math.random() * 3) + 1;
    dualRequest('POST', '/cart/add', {
      userId,
      productId,
      quantity,
    });
    sleep(0.2);
  }

  // 5. View cart
  dualRequest('GET', `/cart/${userId}`);
  sleep(0.5);

  // 6. Get AI recommendations
  dualRequest('GET', `/cart/${userId}/suggestions`);
  sleep(0.3);

  // 7. Get cart total
  dualRequest('GET', `/cart/${userId}/total`);
  sleep(0.3);

  // 8. Checkout (70% of users)
  if (Math.random() < 0.7) {
    dualRequest('POST', '/checkout', { userId });
    sleep(0.5);
  }

  // 9. Clear cart
  dualRequest('DELETE', `/cart/${userId}`);
  sleep(1);
}

export function handleSummary(data) {
  const withHud = data.metrics.with_hud_duration;
  const noHud = data.metrics.no_hud_duration;

  const summary = {
    with_hud: {
      avg: withHud?.values?.avg || 0,
      p95: withHud?.values?.['p(95)'] || 0,
      p99: withHud?.values?.['p(99)'] || 0,
      min: withHud?.values?.min || 0,
      max: withHud?.values?.max || 0,
      errors: data.metrics.with_hud_errors?.values?.count || 0,
    },
    no_hud: {
      avg: noHud?.values?.avg || 0,
      p95: noHud?.values?.['p(95)'] || 0,
      p99: noHud?.values?.['p(99)'] || 0,
      min: noHud?.values?.min || 0,
      max: noHud?.values?.max || 0,
      errors: data.metrics.no_hud_errors?.values?.count || 0,
    },
    overhead: {
      avg_ms: (withHud?.values?.avg || 0) - (noHud?.values?.avg || 0),
      avg_percent: noHud?.values?.avg > 0
        ? (((withHud?.values?.avg || 0) - noHud.values.avg) / noHud.values.avg * 100).toFixed(2)
        : 0,
      p95_ms: (withHud?.values?.['p(95)'] || 0) - (noHud?.values?.['p(95)'] || 0),
      p95_percent: noHud?.values?.['p(95)'] > 0
        ? (((withHud?.values?.['p(95)'] || 0) - noHud.values['p(95)']) / noHud.values['p(95)'] * 100).toFixed(2)
        : 0,
    },
  };

  console.log('\n' + '='.repeat(60));
  console.log('STRESS TEST RESULTS - HUD OVERHEAD COMPARISON');
  console.log('='.repeat(60));
  console.log('\nResponse Times (ms):');
  console.log('-'.repeat(40));
  console.log(`                  WITH HUD    NO HUD    OVERHEAD`);
  console.log(`  Average:        ${summary.with_hud.avg.toFixed(2).padStart(8)}    ${summary.no_hud.avg.toFixed(2).padStart(6)}    ${summary.overhead.avg_ms.toFixed(2)}ms (${summary.overhead.avg_percent}%)`);
  console.log(`  P95:            ${summary.with_hud.p95.toFixed(2).padStart(8)}    ${summary.no_hud.p95.toFixed(2).padStart(6)}    ${summary.overhead.p95_ms.toFixed(2)}ms (${summary.overhead.p95_percent}%)`);
  console.log(`  P99:            ${summary.with_hud.p99.toFixed(2).padStart(8)}    ${summary.no_hud.p99.toFixed(2).padStart(6)}`);
  console.log(`  Min:            ${summary.with_hud.min.toFixed(2).padStart(8)}    ${summary.no_hud.min.toFixed(2).padStart(6)}`);
  console.log(`  Max:            ${summary.with_hud.max.toFixed(2).padStart(8)}    ${summary.no_hud.max.toFixed(2).padStart(6)}`);
  console.log(`  Errors:         ${String(summary.with_hud.errors).padStart(8)}    ${String(summary.no_hud.errors).padStart(6)}`);
  console.log('='.repeat(60) + '\n');

  return {
    stdout: JSON.stringify(summary, null, 2),
    'summary.json': JSON.stringify(summary, null, 2),
  };
}
