import { createHmac, timingSafeEqual } from "node:crypto";

function tokenSecret() {
  const value =
    process.env.RECEIPT_TOKEN_SECRET ||
    process.env.DEVICE_IDENTITY_SECRET ||
    process.env.TENANT_CONTEXT_SECRET;
  if (!value || value.length < 32) throw new Error("RECEIPT_TOKEN_SECRET inválido.");
  return value;
}

function signature(payload: string) {
  return createHmac("sha256", tokenSecret()).update(payload).digest("base64url");
}

export function createReceiptToken(entryId: string, ttlSeconds = 900) {
  const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = `${entryId}.${expiresAt}`;
  return `${payload}.${signature(payload)}`;
}

export function verifyReceiptToken(token: string, entryId: string) {
  const [tokenEntryId, expiresAtValue, receivedSignature] = token.split(".");
  if (!tokenEntryId || !expiresAtValue || !receivedSignature || tokenEntryId !== entryId) return false;
  const expiresAt = Number(expiresAtValue);
  if (!Number.isSafeInteger(expiresAt) || expiresAt < Math.floor(Date.now() / 1000)) return false;
  const expectedSignature = signature(`${tokenEntryId}.${expiresAtValue}`);
  const expected = Buffer.from(expectedSignature);
  const received = Buffer.from(receivedSignature);
  return expected.length === received.length && timingSafeEqual(expected, received);
}
