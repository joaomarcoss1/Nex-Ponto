function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function hasMfaAssurance(token: string) {
  const payload = decodeJwtPayload(token);
  if (payload?.aal === "aal2") return true;
  const methods = payload?.amr;
  return Array.isArray(methods) && methods.some((method) => {
    if (typeof method === "string") return ["mfa", "totp", "webauthn"].includes(method);
    return Boolean(method && typeof method === "object" && "method" in method && ["mfa", "totp", "webauthn"].includes(String(method.method)));
  });
}

export function requireMfaForCriticalProfiles() {
  return false;
}

