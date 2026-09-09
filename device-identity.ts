import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";

export const DEVICE_IDENTITY_COOKIE = "nexponto-device";

function secret() {
  const value = process.env.DEVICE_IDENTITY_SECRET || process.env.TENANT_CONTEXT_SECRET;
  if (!value || value.length < 32) throw new Error("DEVICE_IDENTITY_SECRET inválido.");
  return value;
}

function sign(identifier: string) {
  return createHmac("sha256", secret()).update(identifier).digest("base64url");
}

export function createDeviceIdentity() {
  const identifier = randomBytes(32).toString("base64url");
  return {
    cookieValue: `${identifier}.${sign(identifier)}`,
    keyHash: createHash("sha256").update(identifier).digest("hex"),
  };
}

export function readDeviceIdentity(request: NextRequest) {
  const value = request.cookies.get(DEVICE_IDENTITY_COOKIE)?.value || "";
  const [identifier, received] = value.split(".");
  if (!identifier || !received || !/^[a-zA-Z0-9_-]{40,60}$/.test(identifier)) return null;
  const expected = sign(identifier);
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);
  if (expectedBuffer.length !== receivedBuffer.length || !timingSafeEqual(expectedBuffer, receivedBuffer)) return null;
  return {
    keyHash: createHash("sha256").update(identifier).digest("hex"),
  };
}

export function setDeviceIdentityCookie(response: NextResponse, cookieValue: string) {
  response.cookies.set(DEVICE_IDENTITY_COOKIE, cookieValue, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

export type DevicePolicyMode = "free" | "monitored" | "required";
export type DeviceStatus = "pending" | "active" | "revoked" | "blocked";

export function evaluateDevicePolicy(mode: DevicePolicyMode, status: DeviceStatus | null) {
  if (status === "blocked" || status === "revoked") {
    return { allowed: false, review: false, reason: "DEVICE_NOT_AUTHORIZED" } as const;
  }
  if (mode === "required" && status !== "active") {
    return { allowed: false, review: false, reason: "DEVICE_NOT_AUTHORIZED" } as const;
  }
  if (mode === "monitored" && status !== "active") {
    return { allowed: true, review: true, reason: "NEW_DEVICE_REVIEW" } as const;
  }
  return { allowed: true, review: false, reason: null } as const;
}

