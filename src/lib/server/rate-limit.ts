import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export type RateLimitResult = { allowed: boolean; remaining: number; retryAfterSeconds: number };

function normalizeKeyPart(value: string | null | undefined) {
  return String(value || "unknown").trim().toLowerCase().slice(0, 180);
}

export function privacyHash(value: string) {
  const salt = process.env.RATE_LIMIT_HASH_SALT || process.env.TENANT_CONTEXT_SECRET;
  if (!salt || salt.length < 32) {
    throw new Error("RATE_LIMIT_HASH_SALT ou TENANT_CONTEXT_SECRET deve possuir ao menos 32 caracteres.");
  }
  return createHash("sha256").update(`${salt}:${value}`).digest("hex");
}

export function rateLimitBucket(parts: Array<string | null | undefined>) {
  return privacyHash(parts.map(normalizeKeyPart).join(":"));
}

export async function consumeRateLimit(params: {
  supabase: SupabaseClient;
  bucket: string;
  limit: number;
  windowSeconds: number;
  blockSeconds?: number;
}): Promise<RateLimitResult> {
  const { data, error } = await params.supabase.rpc("consume_rate_limit", {
    p_bucket_key: params.bucket,
    p_limit: params.limit,
    p_window_seconds: params.windowSeconds,
    p_block_seconds: params.blockSeconds ?? 300
  });
  if (error) throw new Error(`RATE_LIMIT_UNAVAILABLE:${error.message}`);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("RATE_LIMIT_UNAVAILABLE:resposta vazia");
  return {
    allowed: Boolean(row.allowed),
    remaining: Number(row.remaining || 0),
    retryAfterSeconds: Number(row.retry_after_seconds || 0)
  };
}
