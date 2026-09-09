import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

function constantTimeMatch(received: string, expected: string) {
  if (expected.length < 32 || received.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(received), Buffer.from(expected));
}

export function isAuthorizedInternalJob(request: NextRequest) {
  const received = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  return [process.env.CRON_SECRET, process.env.INTERNAL_JOBS_SECRET]
    .filter((secret): secret is string => Boolean(secret))
    .some((secret) => constantTimeMatch(received, secret));
}
