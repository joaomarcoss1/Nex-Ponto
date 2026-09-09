type LogLevel = "info" | "warn" | "error";

const sensitiveKey = /pin|password|secret|token|authorization|cookie|salary|document|cpf/i;

function sanitize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, nested]) => [
      key,
      sensitiveKey.test(key) ? "[REDACTED]" : sanitize(nested),
    ]),
  );
}

export function structuredLog(
  level: LogLevel,
  event: string,
  details: Record<string, unknown> = {},
) {
  const payload = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    service: "nexponto-web",
    event,
    ...(sanitize(details) as Record<string, unknown>),
  });
  if (level === "error") console.error(payload);
  else if (level === "warn") console.warn(payload);
  else console.info(payload);
}
