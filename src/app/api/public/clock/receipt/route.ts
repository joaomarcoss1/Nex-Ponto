import { NextRequest, NextResponse } from "next/server";
import { fail, ok } from "@/lib/server/http";
import { requirePublicTenant } from "@/lib/server/public-tenant";
import { verifyReceiptToken } from "@/lib/security/receipt-token";

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export async function GET(request: NextRequest) {
  try {
    const entryId = request.nextUrl.searchParams.get("entryId") || "";
    const token = request.nextUrl.searchParams.get("token") || "";
    if (!/^[0-9a-f-]{36}$/i.test(entryId) || !verifyReceiptToken(token, entryId)) {
      return fail("Comprovante inválido ou expirado.", 403, { code: "FORBIDDEN" });
    }
    const { supabase, tenant } = await requirePublicTenant(request);
    const { data: receipt, error } = await supabase
      .from("time_clock_receipts")
      .select("id,time_entry_id,nsr,receipt_hash,payload,issued_at")
      .eq("time_entry_id", entryId)
      .maybeSingle();
    if (error) return fail("Erro ao consultar o comprovante.", 500, error.message);
    if (!receipt) return fail("Comprovante não encontrado.", 404, { code: "NOT_FOUND" });

    const payload = (receipt.payload || {}) as Record<string, unknown>;
    const result = {
      product: "NexPonto",
      tenant: tenant.displayName,
      receiptId: receipt.id,
      timeEntryId: receipt.time_entry_id,
      nsr: receipt.nsr,
      action: payload.action,
      timestamp: payload.entry_timestamp,
      timezone: payload.timezone,
      employeeId: payload.employee_id,
      branchId: payload.branch_id,
      integrityHash: receipt.receipt_hash,
      issuedAt: receipt.issued_at,
      signatureStatus: "integrity_hash_only",
      notice:
        "A assinatura CAdES-ICP Brasil depende de certificado e validação jurídica externa antes do go-live.",
    };
    if (request.nextUrl.searchParams.get("format") !== "html") return ok(result);

    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Comprovante de ponto</title><style>body{font-family:system-ui;background:#eff6ff;color:#0f172a;padding:24px}.card{max-width:620px;margin:auto;background:white;border-radius:24px;padding:28px;box-shadow:0 20px 60px #0f172a22}h1{color:#0758c7}.row{padding:10px 0;border-bottom:1px solid #e2e8f0}.hash{word-break:break-all;font:12px monospace}.notice{margin-top:20px;padding:14px;background:#fff7ed;border-radius:14px;color:#9a3412}@media print{body{background:white;padding:0}.card{box-shadow:none}}</style></head><body><main class="card"><h1>Comprovante de registro de ponto</h1><div class="row"><strong>Empresa:</strong> ${escapeHtml(result.tenant)}</div><div class="row"><strong>NSR:</strong> ${escapeHtml(result.nsr)}</div><div class="row"><strong>Evento:</strong> ${escapeHtml(result.action)}</div><div class="row"><strong>Data/hora:</strong> ${escapeHtml(result.timestamp)} (${escapeHtml(result.timezone)})</div><div class="row"><strong>ID do registro:</strong> ${escapeHtml(result.timeEntryId)}</div><div class="row hash"><strong>Hash de integridade:</strong> ${escapeHtml(result.integrityHash)}</div><p class="notice">${escapeHtml(result.notice)}</p><p>Use a opção de impressão do navegador para salvar em PDF.</p></main></body></html>`;
    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "private, no-store",
        "Content-Security-Policy":
          "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
      },
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Erro ao emitir comprovante.", 500);
  }
}
