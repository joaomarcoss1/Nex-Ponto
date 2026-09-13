import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "nexponto_employee_portal";
const MAX_AGE_SECONDS = 8 * 60 * 60;

type EmployeeSession = { tenantId: string; employeeId: string; expiresAt: number };

function secret() {
  const configured = process.env.EMPLOYEE_SESSION_SECRET || process.env.TENANT_CONTEXT_SECRET;
  if (configured && configured.length >= 32) return configured;
  const fallback = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!fallback) throw new Error("EMPLOYEE_SESSION_SECRET não configurado.");
  return createHmac("sha256", fallback).update("nexponto-employee-session-v4").digest("hex");
}

function sign(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function createEmployeeSessionValue(tenantId: string, employeeId: string) {
  const payload = Buffer.from(JSON.stringify({ tenantId, employeeId, expiresAt: Date.now() + MAX_AGE_SECONDS * 1000 } satisfies EmployeeSession)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function readEmployeeSession(request: NextRequest): EmployeeSession | null {
  const value = request.cookies.get(COOKIE_NAME)?.value;
  if (!value) return null;
  const separator = value.lastIndexOf(".");
  if (separator <= 0) return null;
  const payload = value.slice(0, separator);
  const supplied = Buffer.from(value.slice(separator + 1));
  const expected = Buffer.from(sign(payload));
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as EmployeeSession;
    if (!parsed.tenantId || !parsed.employeeId || parsed.expiresAt <= Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function setEmployeeSession(response: NextResponse, tenantId: string, employeeId: string) {
  response.cookies.set(COOKIE_NAME, createEmployeeSessionValue(tenantId, employeeId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export function clearEmployeeSession(response: NextResponse) {
  response.cookies.set(COOKIE_NAME, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: 0 });
}
