import { NextRequest } from "next/server";
import { fail, ok } from "@/lib/server/http";
import { getClientIp, recordPinAttempt } from "@/lib/server/pin";
import { consumeRateLimit, rateLimitBucket } from "@/lib/server/rate-limit";
import { requirePublicTenant } from "@/lib/server/public-tenant";

type PublicEmployeeRow = {
  id: string;
  registration_code: string | null;
  full_name: string;
  role: string;
  branch_id: string;
  branches: { name: string } | { name: string }[] | null;
};

function firstName(fullName: string) {
  return String(fullName || "").trim().split(/\s+/)[0] || "Funcionário";
}

function maskRegistration(code?: string | null) {
  const raw = String(code || "").trim();
  if (!raw) return null;
  if (raw.length <= 2) return raw;
  return `${raw.slice(0, 2)}${"•".repeat(Math.min(4, Math.max(1, raw.length - 2)))}`;
}

function relationName(value: PublicEmployeeRow["branches"]) {
  return Array.isArray(value) ? value[0]?.name : value?.name;
}

export async function GET(request: NextRequest) {
  try {
    const query = (request.nextUrl.searchParams.get("q") || "").trim();
    const branchId = request.nextUrl.searchParams.get("branchId") || "";
    if (query.length < 2 && !branchId) return ok({ employees: [], hint: "Digite pelo menos 2 letras ou sua matrícula." });

    const { supabase, tenant } = await requirePublicTenant(request);
    const ip = getClientIp(request.headers);
    const rate = await consumeRateLimit({
      supabase,
      bucket: rateLimitBucket([tenant.id, "employee-search", ip]),
      limit: 40,
      windowSeconds: 60,
      blockSeconds: 120
    });
    if (!rate.allowed) return fail(`Muitas buscas em sequência. Tente novamente em ${rate.retryAfterSeconds}s.`, 429);

    await recordPinAttempt({
      supabase,
      attemptedName: query || branchId,
      headers: request.headers,
      deviceInfo: request.headers.get("user-agent"),
      success: true,
      reason: "public_employee_search"
    });

    let builder = supabase
      .from("employees")
      .select("id,registration_code,full_name,role,branch_id,branches:branches!employees_branch_id_fkey(name)")
      .eq("active", true)
      .order("full_name", { ascending: true })
      .limit(10);

    if (branchId) builder = builder.eq("branch_id", branchId);
    if (query) {
      const safe = query.replace(/[,%]/g, "");
      builder = builder.or(`full_name.ilike.%${safe}%,registration_code.ilike.%${safe}%`);
    }

    const { data, error } = await builder;
    if (error) return fail("Não foi possível buscar funcionários.", 500, error.message);

    const employees = ((data || []) as PublicEmployeeRow[]).map((employee) => {
      const code = String(employee.registration_code || "").trim();
      return {
        id: employee.id,
        registration_code_masked: maskRegistration(code),
        display_name: code ? `${maskRegistration(code)} • ${firstName(employee.full_name)}` : firstName(employee.full_name),
        role: employee.role,
        branch_id: employee.branch_id,
        branch_name: relationName(employee.branches)
      };
    });

    return ok({ employees });
  } catch (error) {
    return fail("A busca está temporariamente indisponível. Tente novamente.", 503, error instanceof Error ? error.message : error);
  }
}
