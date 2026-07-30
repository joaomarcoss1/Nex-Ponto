const baseUrl = process.env.LOAD_TEST_BASE_URL;
const concurrency = Number(process.env.LOAD_TEST_CONCURRENCY || 20);
const requests = Number(process.env.LOAD_TEST_REQUESTS || 200);

if (!baseUrl || process.env.LOAD_TEST_CONFIRMED !== "true") {
  console.error(
    "Defina LOAD_TEST_BASE_URL e LOAD_TEST_CONFIRMED=true somente para um ambiente autorizado de homologação.",
  );
  process.exit(2);
}
if (!/^https?:\/\//.test(baseUrl) || concurrency < 1 || concurrency > 200 || requests < 1 || requests > 100_000) {
  throw new Error("Parâmetros de carga inválidos.");
}

const samples = [];
let cursor = 0;
let failures = 0;
async function worker() {
  while (cursor < requests) {
    cursor += 1;
    const started = performance.now();
    try {
      const response = await fetch(new URL("/api/health", baseUrl), {
        headers: { "x-load-test": "authorized-health-check" },
      });
      if (!response.ok) failures += 1;
    } catch {
      failures += 1;
    } finally {
      samples.push(performance.now() - started);
    }
  }
}
await Promise.all(Array.from({ length: concurrency }, () => worker()));
samples.sort((a, b) => a - b);
const percentile = (value) => samples[Math.min(samples.length - 1, Math.floor(samples.length * value))];
console.log(JSON.stringify({
  target: baseUrl,
  requests,
  concurrency,
  failures,
  errorRate: failures / requests,
  p50Ms: Math.round(percentile(0.5)),
  p95Ms: Math.round(percentile(0.95)),
  p99Ms: Math.round(percentile(0.99)),
}, null, 2));
if (failures / requests > 0.005) process.exit(1);
