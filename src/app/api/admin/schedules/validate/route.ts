import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/server/auth";
import { assertCanAccessBranch } from "@/lib/server/branch-permissions";
import { fail, ok, readJson } from "@/lib/server/http";

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  const parsed = z.object({ publication_id: z.string().uuid() }).safeParse(await readJson<unknown>(request));
  if (!parsed.success) return fail("Informe a publicação.", 422);
  const { data: publication, error: findError } = await auth.supabase.from("schedule_publications").select("id,branch_id").eq("id", parsed.data.publication_id).maybeSingle();
  if (findError || !publication) return fail("Publicação não encontrada.", 404, findError?.message);
  const branchError = assertCanAccessBranch(auth.context, publication.branch_id);
  if (branchError) return branchError;
  const { data, error } = await auth.rawSupabase.rpc("validate_schedule_publication_v51", { p_tenant_id: auth.context.tenantId, p_publication_id: publication.id });
  if (error) return fail("Erro ao validar escala.", 422, error.message);
  return ok({ validation: data });
}
