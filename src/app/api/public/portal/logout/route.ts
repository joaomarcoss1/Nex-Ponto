import { NextRequest } from "next/server";
import { clearEmployeeSession } from "@/lib/server/employee-session";
import { ok } from "@/lib/server/http";
export async function POST(_request: NextRequest) { const response = ok({ signedOut: true }); clearEmployeeSession(response); return response; }
