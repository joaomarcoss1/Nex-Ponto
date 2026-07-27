import bcrypt from "bcryptjs";
import type { SupabaseClient } from "@supabase/supabase-js";

export function assertPin(pin: unknown) {
  if (typeof pin !== "string" || !/^\d{4}$/.test(pin)) {
    throw new Error("Informe um PIN válido com 4 dígitos.");
  }
  return pin;
}

export async function hashPin(pin: string) {
  assertPin(pin);
  return bcrypt.hash(pin, 12);
}

export async function verifyPin(pin: string, hash: string) {
  assertPin(pin);
  return bcrypt.compare(pin, hash);
}

export function getClientIp(headers: Headers) {
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip") ||
    headers.get("cf-connecting-ip") ||
    "unknown"
  );
}

export async function recordPinAttempt(params: {
  supabase: SupabaseClient;
  employeeId?: string | null;
  attemptedName?: string | null;
  headers?: Headers;
  deviceInfo?: string | null;
  success: boolean;
  reason?: string;
}) {
  const { error } = await params.supabase.from("pin_attempt_logs").insert({
    employee_id: params.employeeId || null,
    attempted_name: params.attemptedName || null,
    ip_address: params.headers ? getClientIp(params.headers) : null,
    device_info: params.deviceInfo || null,
    success: params.success,
    reason: params.reason || null
  });
  if (error) throw new Error(`PIN_AUDIT_UNAVAILABLE:${error.message}`);
}

export async function isPinTemporarilyBlocked(params: {
  supabase: SupabaseClient;
  employeeId: string;
  minutes?: number;
  maxFailures?: number;
}) {
  const windowMinutes = params.minutes ?? 10;
  const maxFailures = params.maxFailures ?? 8;
  const since = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();
  const { count, error } = await params.supabase
    .from("pin_attempt_logs")
    .select("id", { count: "exact", head: true })
    .eq("employee_id", params.employeeId)
    .eq("success", false)
    .gte("created_at", since);
  if (error) throw new Error(`PIN_LOCKOUT_UNAVAILABLE:${error.message}`);
  return Number(count || 0) >= maxFailures;
}

export function getPinBlockMessage() {
  return "Muitas tentativas incorretas. Aguarde alguns minutos e tente novamente.";
}

export function getGenericPinErrorMessage() {
  return "Não foi possível validar os dados. Verifique as informações e tente novamente.";
}
