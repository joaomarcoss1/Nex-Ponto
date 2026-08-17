const baseUrl = process.env.LOAD_TEST_BASE_URL;
const fixturePath = process.env.LOAD_TEST_CLOCK_FIXTURE;
const confirmed = process.env.LOAD_TEST_CONFIRMED === "true";

if (!baseUrl || !fixturePath || !confirmed) {
  console.error("Defina LOAD_TEST_BASE_URL, LOAD_TEST_CLOCK_FIXTURE e LOAD_TEST_CONFIRMED=true somente para homologação autorizada.");
  process.exit(2);
}

const { readFileSync } = await import("node:fs");
const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
const attempts = fixture.attempts || [];
if (!Array.isArray(attempts) || attempts.length < 70) throw new Error("Fixture deve conter pelo menos 70 tentativas reais de ponto.");

const samples = [];
let success = 0;
let failed = 0;
const responses = [];
await Promise.all(attempts.slice(0, 70).map(async (attempt, index) => {
  const started = performance.now();
  try {
    const response = await fetch(new URL("/api/public/clock/register", baseUrl), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-load-test": "authorized-clock-register",
        "x-request-id": `clock-load-${Date.now()}-${index}`,
        ...(attempt.headers || {}),
      },
      body: JSON.stringify(attempt.body),
    });
    const payload = await response.json().catch(() => ({}));
    responses.push({ status: response.status, ok: response.ok, employeeId: attempt.body?.employeeId, entryId: payload?.entry?.id || null });
    if (response.ok) success += 1;
    else failed += 1;
  } catch (error) {
    failed += 1;
    responses.push({ status: 0, ok: false, error: error instanceof Error ? error.message : String(error) });
  } finally {
    samples.push(performance.now() - started);
  }
}));

samples.sort((a, b) => a - b);
const percentile = (value) => samples[Math.min(samples.length - 1, Math.floor(samples.length * value))] || 0;
const uniqueEntryIds = new Set(responses.map((item) => item.entryId).filter(Boolean));
const report = {
  target: baseUrl,
  requests: 70,
  success,
  failed,
  uniqueEntryIds: uniqueEntryIds.size,
  p50Ms: Math.round(percentile(0.5)),
  p95Ms: Math.round(percentile(0.95)),
  p99Ms: Math.round(percentile(0.99)),
  minMs: Math.round(samples[0] || 0),
  maxMs: Math.round(samples.at(-1) || 0),
};
console.log(JSON.stringify(report, null, 2));
if (failed > 0 || uniqueEntryIds.size !== success) process.exit(1);
