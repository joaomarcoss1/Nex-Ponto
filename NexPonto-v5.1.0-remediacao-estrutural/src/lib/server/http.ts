import { NextResponse } from "next/server";

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function fail(message: string, status = 400, details?: unknown) {
  const payload: { error: string; details?: unknown } = { error: message };
  if (process.env.NODE_ENV !== "production" && details !== undefined) payload.details = details;
  return NextResponse.json(payload, { status });
}

export async function readJson<T = Record<string, unknown>>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new Error("Corpo JSON inválido.");
  }
}

export function searchParam(request: Request, name: string) {
  return new URL(request.url).searchParams.get(name);
}
