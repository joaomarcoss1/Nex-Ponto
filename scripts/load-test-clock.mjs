import { performance } from "node:perf_hooks";

const baseUrl = process.env.LOAD_TEST_BASE_URL;
const tenantCode = process.env.LOAD_TEST_TENANT_CODE;
const employeeIds = (process.env.LOAD_TEST_EMPLOYEE_IDS || "").split(",").map((value) => value.trim()).filter(Boolean);
const pin = process.env.LOAD_TEST_PIN;
const total = Number(process.env.LOAD_TEST_TOTAL_CLOCKS || 200);
const concurrency = Number(process.env.LOAD_TEST_CONCURRENCY || 20);

if (!baseUrl || !tenantCode || !employeeIds.length || !pin) {
  console.error("Configure LOAD_TEST_BASE_URL, LOAD_TEST_TENANT_CODE, LOAD_TEST_EMPLOYEE_IDS e LOAD_TEST_PIN.");
  process.exit(1);
}

const latencies = [];
let errors = 0;
let completed = 0;

async function clock(index) {
  const employeeId = employeeIds[index % employeeIds.length];
  const started = performance.now();
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/public/clock/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-tenant-code": tenantCode,
      "idempotency-key": `load-test:${Date.now()}:${index}`,
    },
    body: JSON.stringify({
      employeeId,
      pin,
      action: "start_shift",
      latitude: -3.7319,
      longitude: -38.5267,
      gpsAccuracyMeters: 20,
      clientTimestamp: new Date().toISOString(),
      deviceInfo: { mode: "load-test", worker: index % concurrency },
    }),
  });
  latencies.push(performance.now() - started);
  if (!response.ok) errors += 1;
  completed += 1;
}

async function worker(offset) {
  for (let index = offset; index < total; index += concurrency) {
    await clock(index);
  }
}

await Promise.all(Array.from({ length: concurrency }, (_, index) => worker(index)));
latencies.sort((a, b) => a - b);
const percentile = (p) => latencies[Math.min(latencies.length - 1, Math.floor((p / 100) * latencies.length))] || 0;
const result = {
  scenario: "clock-register-real-endpoint",
  total,
  concurrency,
  completed,
  errors,
  errorRate: completed ? errors / completed : 1,
  p50Ms: Math.round(percentile(50)),
  p95Ms: Math.round(percentile(95)),
  p99Ms: Math.round(percentile(99)),
  executedAt: new Date().toISOString(),
};
console.log(JSON.stringify(result, null, 2));
if (result.errorRate > 0.005 || result.p95Ms > 2000) process.exit(1);
