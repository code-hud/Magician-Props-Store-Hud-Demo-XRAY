const http = require('http');

const WITH_HUD_URL = process.env.WITH_HUD_URL || 'http://with-hud.stress-test.local:3001';
const NO_HUD_URL = process.env.NO_HUD_URL || 'http://no-hud.stress-test.local:3001';
const REQUESTS_PER_SECOND = parseInt(process.env.REQUESTS_PER_SECOND || '10', 10);
const INTERVAL_MS = 1000 / REQUESTS_PER_SECOND;

// Stats
let stats = {
  withHud: { count: 0, totalMs: 0, errors: 0 },
  noHud: { count: 0, totalMs: 0, errors: 0 }
};

// Endpoints to test
const ENDPOINTS = [
  { method: 'GET', path: '/products' },
  { method: 'GET', path: '/products/categories' },
  { method: 'GET', path: '/products/1' },
  { method: 'GET', path: '/products/2' },
  { method: 'GET', path: '/products/3' },
];

function makeRequest(baseUrl, endpoint) {
  return new Promise((resolve) => {
    const start = Date.now();
    const url = new URL(endpoint.path, baseUrl);

    const req = http.request({
      hostname: url.hostname,
      port: url.port || 3001,
      path: url.pathname,
      method: endpoint.method,
      timeout: 10000,
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          success: res.statusCode < 400,
          duration: Date.now() - start,
          status: res.statusCode
        });
      });
    });

    req.on('error', () => {
      resolve({ success: false, duration: Date.now() - start, status: 0 });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ success: false, duration: Date.now() - start, status: 0 });
    });

    req.end();
  });
}

async function sendParallelRequests() {
  const endpoint = ENDPOINTS[Math.floor(Math.random() * ENDPOINTS.length)];

  // Send to BOTH backends at the EXACT same time
  const [withHudResult, noHudResult] = await Promise.all([
    makeRequest(WITH_HUD_URL, endpoint),
    makeRequest(NO_HUD_URL, endpoint)
  ]);

  // Update stats
  stats.withHud.count++;
  stats.withHud.totalMs += withHudResult.duration;
  if (!withHudResult.success) stats.withHud.errors++;

  stats.noHud.count++;
  stats.noHud.totalMs += noHudResult.duration;
  if (!noHudResult.success) stats.noHud.errors++;

  // Log each request pair
  const diff = withHudResult.duration - noHudResult.duration;
  const diffPct = noHudResult.duration > 0 ? ((diff / noHudResult.duration) * 100).toFixed(1) : 0;

  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    endpoint: `${endpoint.method} ${endpoint.path}`,
    withHud: { ms: withHudResult.duration, status: withHudResult.status },
    noHud: { ms: noHudResult.duration, status: noHudResult.status },
    diff: { ms: diff, pct: `${diffPct}%` }
  }));
}

// Print summary every 30 seconds
setInterval(() => {
  const withHudAvg = stats.withHud.count > 0 ? (stats.withHud.totalMs / stats.withHud.count).toFixed(2) : 0;
  const noHudAvg = stats.noHud.count > 0 ? (stats.noHud.totalMs / stats.noHud.count).toFixed(2) : 0;
  const overheadMs = (withHudAvg - noHudAvg).toFixed(2);
  const overheadPct = noHudAvg > 0 ? ((overheadMs / noHudAvg) * 100).toFixed(2) : 0;

  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY (last 30 seconds)');
  console.log('='.repeat(60));
  console.log(`WITH HUD:    avg=${withHudAvg}ms  requests=${stats.withHud.count}  errors=${stats.withHud.errors}`);
  console.log(`NO HUD:      avg=${noHudAvg}ms  requests=${stats.noHud.count}  errors=${stats.noHud.errors}`);
  console.log(`OVERHEAD:    ${overheadMs}ms (${overheadPct}%)`);
  console.log('='.repeat(60) + '\n');

  // Reset stats
  stats = {
    withHud: { count: 0, totalMs: 0, errors: 0 },
    noHud: { count: 0, totalMs: 0, errors: 0 }
  };
}, 30000);

// Start continuous load
console.log(`Starting continuous load generator`);
console.log(`  WITH_HUD_URL: ${WITH_HUD_URL}`);
console.log(`  NO_HUD_URL: ${NO_HUD_URL}`);
console.log(`  REQUESTS_PER_SECOND: ${REQUESTS_PER_SECOND}`);
console.log('');

setInterval(sendParallelRequests, INTERVAL_MS);
