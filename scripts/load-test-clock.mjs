import { randomUUID } from "node:crypto";

const baseUrl = process.env.LOAD_TEST_BASE_URL || "http://127.0.0.1:3000";
const tenant = process.env.LOAD_TEST_TENANT;
const single = process.env.LOAD_TEST_EMPLOYEE_ID && process.env.LOAD_TEST_PIN && process.env.LOAD_TEST_BRANCH_ID
  ? [{ employeeId: process.env.LOAD_TEST_EMPLOYEE_ID, pin: process.env.LOAD_TEST_PIN, branchId: process.env.LOAD_TEST_BRANCH_ID, latitude: Number(process.env.LOAD_TEST_LATITUDE), longitude: Number(process.env.LOAD_TEST_LONGITUDE) }]
  : [];
let employees = single;
if (process.env.LOAD_TEST_EMPLOYEES_JSON) {
  try { employees = JSON.parse(process.env.LOAD_TEST_EMPLOYEES_JSON); } catch { employees = []; }
}
if (!tenant || !employees.length || employees.some((item) => !item.employeeId || !item.pin || !item.branchId || !Number.isFinite(Number(item.latitude)) || !Number.isFinite(Number(item.longitude)))) {
  console.error("NOT RUN / ENV MISSING: defina tenant, funcionário(s), PIN, filial e coordenadas de uma homologação descartável.");
  process.exit(2);
}

const samples = [];
async function writeClock(employee, idempotencyKey) {
  const started = performance.now();
  let status = 0;
  let body = {};
  try {
    const response = await fetch(new URL("/api/public/clock/register", baseUrl), {
      method: "POST",
      headers: { "content-type": "application/json", "X-NexPonto-Tenant": tenant, "X-Load-Test": "clock-write-v553" },
      body: JSON.stringify({ ...employee, action: process.env.LOAD_TEST_ACTION || "start_shift", gpsAccuracyMeters: 8, deviceInfo: "nexponto-load-test", idempotencyKey }),
    });
    status = response.status;
    body = await response.json().catch(() => ({}));
  } catch (error) {
    body = { transportError: error instanceof Error ? error.message : String(error) };
  }
  samples.push({ duration: performance.now() - started, status, entryId: body?.data?.entry?.id || null, error: body?.error?.details?.technicalMessage || body?.error?.message || body?.transportError || null });
}

if (employees.length === 1) {
  const key = `load-clock-${randomUUID()}`;
  await Promise.all(Array.from({ length: Number(process.env.LOAD_TEST_SAME_EMPLOYEE_REQUESTS || 10) }, () => writeClock(employees[0], key)));
} else {
  await Promise.all(employees.slice(0, 70).map((employee) => writeClock(employee, `load-clock-${randomUUID()}`)));
}

const durations = samples.map((sample) => sample.duration).sort((a, b) => a - b);
const percentile = (ratio) => Math.round(durations[Math.max(0, Math.ceil(durations.length * ratio) - 1)] || 0);
const successfulIds = new Set(samples.filter((sample) => sample.status >= 200 && sample.status < 300 && sample.entryId).map((sample) => sample.entryId));
const result = {
  mode: employees.length === 1 ? "same_employee_idempotency" : "parallel_employees",
  requests: samples.length,
  success: samples.filter((sample) => sample.status >= 200 && sample.status < 300).length,
  expectedConflicts: samples.filter((sample) => [409, 429].includes(sample.status)).length,
  serverFailures: samples.filter((sample) => sample.status === 0 || sample.status >= 500).length,
  uniqueEntries: successfulIds.size,
  duplicateEntries: employees.length === 1 ? Math.max(0, successfulIds.size - 1) : 0,
  deadlocks: samples.filter((sample) => /deadlock/i.test(String(sample.error))).length,
  p50Ms: percentile(0.50), p95Ms: percentile(0.95), p99Ms: percentile(0.99),
  statuses: Object.fromEntries([...new Set(samples.map((sample) => sample.status))].map((status) => [status, samples.filter((sample) => sample.status === status).length])),
};
console.log(JSON.stringify(result, null, 2));
if (result.serverFailures || result.deadlocks || result.duplicateEntries) process.exit(1);
