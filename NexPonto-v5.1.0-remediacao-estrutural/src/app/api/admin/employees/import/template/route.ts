import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/server/auth";
import { createEmployeeImportTemplateBuffer } from "@/lib/services/employee-import";
import { fileResponse } from "@/lib/server/exporters";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  const buffer = await createEmployeeImportTemplateBuffer();
  return fileResponse(buffer, "modelo-importacao-funcionarios-nexponto.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
}
