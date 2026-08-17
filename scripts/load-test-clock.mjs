const baseUrl = process.env.LOAD_TEST_BASE_URL || "http://127.0.0.1:3000";
const tenant = process.env.LOAD_TEST_TENANT;
const concurrency = Number(process.env.LOAD_TEST_CONCURRENCY || 5);
const requests = Number(process.env.LOAD_TEST_REQUESTS || 25);
if (!tenant) {
  console.error("BLOQUEADOR: defina LOAD_TEST_TENANT com o slug/código de um tenant de homologação.");
  process.exit(2);
}
const durations = [];
let failures = 0;
async function probe() {
  const started = performance.now();
  const response = await fetch(new URL("/api/public/employees?q=teste", baseUrl), {
    headers: { "X-NexPonto-Tenant": tenant, "X-Load-Test": "clock-read-path" },
  });
  durations.push(performance.now() - started);
  if (!response.ok) failures += 1;
}
for (let offset = 0; offset < requests; offset += concurrency) {
  await Promise.all(Array.from({ length: Math.min(concurrency, requests - offset) }, probe));
}
durations.sort((a,b) => a-b);
const p95 = durations[Math.max(0, Math.ceil(durations.length * 0.95) - 1)];
console.log(JSON.stringify({ requests, concurrency, failures, p95Ms: Math.round(p95) }));
if (failures || p95 > Number(process.env.LOAD_TEST_P95_LIMIT_MS || 1500)) process.exit(1);
