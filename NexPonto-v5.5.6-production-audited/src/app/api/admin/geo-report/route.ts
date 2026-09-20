import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/server/auth";
import { canAccessBranch, scopeByBranch } from "@/lib/server/branch-permissions";
import { writeAuditLog } from "@/lib/server/audit";
import { fail, ok } from "@/lib/server/http";
import { createPdfBuffer, createXlsxBuffer, fileResponse, type ExportTable } from "@/lib/server/exporters";
import { getTenantExportBranding } from "@/lib/server/tenant-branding";
import { fetchAllRows } from "@/lib/server/pagination";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type GeoRow = {
  entry_timestamp: string;
  status: string;
  distance_meters: number | null;
  gps_accuracy_meters: number | null;
  inside_allowed_radius: boolean | null;
  latitude: number | null;
  longitude: number | null;
  employees?: { full_name?: string | null } | null;
  branches?: { name?: string | null } | null;
};

function geoStatus(row: GeoRow) {
  if (row.latitude === null || row.longitude === null || row.inside_allowed_radius === null) return "Sem GPS";
  if (Number(row.gps_accuracy_meters || 0) > 100) return "Precisão insuficiente";
  return row.inside_allowed_radius ? "Dentro do raio" : "Fora do raio";
}

function buildGeoTable(rows: GeoRow[]): ExportTable {
  return {
    title: "Relatório de Geolocalização",
    subtitle: "Auditoria de distância, precisão GPS e pontos fora do raio por filial.",
    summary: [
      { label: "Pontos", value: rows.length },
      { label: "Dentro do raio", value: rows.filter((row) => row.inside_allowed_radius === true).length },
      { label: "Fora do raio", value: rows.filter((row) => row.inside_allowed_radius === false).length },
      { label: "Sem GPS", value: rows.filter((row) => row.inside_allowed_radius === null || row.latitude === null || row.longitude === null).length },
      { label: "Precisão insuficiente", value: rows.filter((row) => Number(row.gps_accuracy_meters || 0) > 100).length }
    ],
    headers: ["Funcionário", "Filial", "Data/Hora", "Status do ponto", "Distância", "Precisão", "Situação GPS", "Google Maps"],
    rows: rows.map((row) => [
      row.employees?.full_name || "-",
      row.branches?.name || "-",
      new Date(row.entry_timestamp).toLocaleString("pt-BR"),
      row.status,
      row.distance_meters ? `${row.distance_meters}m` : "-",
      row.gps_accuracy_meters ? `${Math.round(Number(row.gps_accuracy_meters))}m` : "-",
      geoStatus(row),
      row.latitude && row.longitude ? `https://maps.google.com/?q=${row.latitude},${row.longitude}` : "-"
    ]),
    footer: "NexPonto — Relatório de geolocalização"
  };
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  const params = request.nextUrl.searchParams;
  const format = params.get("format") || "json";
  const page = Math.max(1, Number(params.get("page") || 1));
  const pageSize = Math.min(500, Math.max(25, Number(params.get("pageSize") || 100)));
  if (params.get("branchId") && !canAccessBranch(auth.context, params.get("branchId"))) return fail("Você não tem acesso a esta filial.", 403);
  let query = scopeByBranch(auth.supabase.from("time_entries").select("*, employees(full_name,registration_code), branches:branches!time_entries_branch_id_fkey(name)", { count: "exact" }).order("entry_timestamp", { ascending: false }), auth.context, "branch_id");
  if (params.get("branchId")) query = query.eq("branch_id", params.get("branchId"));
  if (params.get("employeeId")) query = query.eq("employee_id", params.get("employeeId"));
  if (params.get("startDate")) query = query.gte("entry_date", params.get("startDate"));
  if (params.get("endDate")) query = query.lte("entry_date", params.get("endDate"));
  if (params.get("inside") === "true") query = query.eq("inside_allowed_radius", true);
  if (params.get("inside") === "false") query = query.eq("inside_allowed_radius", false);
  let data: unknown[] = [];
  let count = 0;
  if (format === "pdf" || format === "xlsx") {
    try {
      data = await fetchAllRows<GeoRow>((from, to) => query.range(from, to), { maxRows: 1_000_000 });
      count = data.length;
    } catch (error) {
      return fail("Erro ao gerar relatório de geolocalização.", 500, error instanceof Error ? error.message : error);
    }
  } else {
    const { data: pageRows, error, count: total } = await query.range((page - 1) * pageSize, page * pageSize - 1);
    if (error) return fail("Erro ao gerar relatório de geolocalização.", 500, error.message);
    data = pageRows || [];
    count = total || 0;
  }
  const table = buildGeoTable((data || []) as GeoRow[]);
  table.branding = await getTenantExportBranding(auth.rawSupabase, auth.context.tenantId, auth.context.tenantName);
  table.footer = table.branding.footer || table.footer;
  await writeAuditLog({ supabase: auth.supabase, context: auth.context, action: `export_geo_${format}`, entity: "geo_report", newData: { rows: data?.length || 0, filters: Object.fromEntries(params.entries()) } });
  if (format === "pdf") return fileResponse(await createPdfBuffer(table), "relatorio-geolocalizacao.pdf", "application/pdf");
  if (format === "xlsx") return fileResponse(await createXlsxBuffer(table), "relatorio-geolocalizacao.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  return ok({ rows: data || [], table, pagination: { page, pageSize, total: count } });
}
