import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Reads the `aal` (Authenticator Assurance Level) claim straight out of the
 * access token's payload, without a network call. The token was already
 * cryptographically verified moments earlier via auth.getUser(token) in the
 * same request, so a plain decode here is safe — this only ever narrows an
 * already-trusted token, never widens trust based on unverified input.
 */
export function decodeAal(accessToken: string): "aal1" | "aal2" | null {
  const segments = accessToken.split(".");
  if (segments.length !== 3) return null;
  try {
    const payload = JSON.parse(Buffer.from(segments[1], "base64url").toString("utf8"));
    return payload?.aal === "aal2" ? "aal2" : payload?.aal === "aal1" ? "aal1" : null;
  } catch {
    return null;
  }
}

/**
 * True when the given auth user has at least one verified TOTP/phone factor
 * enrolled. Backed by the GoTrue admin API (auth.admin.getUserById), which is
 * the only way to read another user's factors from the server — the `auth`
 * schema itself isn't exposed through PostgREST.
 */
export async function hasVerifiedMfaFactor(supabaseAdmin: SupabaseClient, userId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (error || !data.user) return false;
  return (data.user.factors || []).some((factor) => factor.status === "verified");
}

/**
 * Force-removes every verified MFA factor for a user. Used only by the
 * account-recovery path (another admin with administrators.manage resetting
 * a locked-out colleague) — never by the user's own session, which should
 * always go through the standard self-service unenroll (auth.mfa.unenroll),
 * itself gated by Supabase on requiring an aal2 session.
 */
export async function adminResetMfaFactors(supabaseAdmin: SupabaseClient, userId: string): Promise<number> {
  const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (error || !data.user) return 0;
  const factors = data.user.factors || [];
  let removed = 0;
  for (const factor of factors) {
    const { error: deleteError } = await supabaseAdmin.auth.admin.mfa.deleteFactor({ id: factor.id, userId });
    if (!deleteError) removed += 1;
  }
  return removed;
}
