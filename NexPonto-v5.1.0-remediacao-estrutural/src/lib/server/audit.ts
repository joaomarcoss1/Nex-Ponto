import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminContext } from "@/lib/server/auth";

const REDACTED_KEYS = new Set([
  "pin",
  "pin_hash",
  "password",
  "token",
  "access_token",
  "refresh_token",
  "service_role",
  "bank_account",
  "pix_key",
  "document"
]);

function sanitize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, nested]) => [
      key,
      REDACTED_KEYS.has(key.toLowerCase()) ? "[REDACTED]" : sanitize(nested)
    ])
  );
}

function hashIp(value: string | null | undefined) {
  if (!value) return null;
  const salt = process.env.AUDIT_HASH_SALT || process.env.TENANT_CONTEXT_SECRET || "nexponto-audit-v4";
  return createHash("sha256").update(`${salt}:${value}`).digest("hex");
}

export async function writeAuditLog(params: {
  supabase: SupabaseClient;
  context?: AdminContext;
  action: string;
  entity: string;
  entityId?: string | null;
  oldData?: unknown;
  newData?: unknown;
  reason?: string | null;
  requestId?: string | null;
  headers?: Headers;
}) {
  const { supabase, context, action, entity, entityId, oldData, newData } = params;
  const forwarded = params.headers?.get("x-forwarded-for")?.split(",")[0]?.trim();
  const { error } = await supabase.from("audit_logs").insert({
    tenant_id: context?.tenantId,
    membership_id: context?.membershipId || null,
    branch_id: context?.branchId || null,
    user_id: context?.userId || null,
    user_email: context?.email || "sistema",
    action,
    entity,
    entity_id: entityId || null,
    old_data: sanitize(oldData ?? null),
    new_data: sanitize(newData ?? null),
    reason: params.reason || null,
    request_id: params.requestId || null,
    ip_hash: hashIp(forwarded || params.headers?.get("x-real-ip")),
    user_agent: params.headers?.get("user-agent")?.slice(0, 500) || null
  });
  if (error) throw new Error(`Falha ao registrar auditoria: ${error.message}`);
}
