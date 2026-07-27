"use client";

import { Download, FileUp, ShieldCheck, UploadCloud } from "lucide-react";
import { useState } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, SectionTitle } from "@/components/ui/card";
import { adminFetch, downloadAdminFile, downloadAdminPostFile } from "@/lib/client/admin-api";

export function EmployeeImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function preview() {
    if (!file) return setError("Selecione um arquivo Excel, CSV ou PDF.");
    const form = new FormData();
    form.append("file", file);
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const data = await adminFetch<any>("/api/admin/employees/import/preview", { method: "POST", body: form });
      setRows(data.rows || []);
      setMessage(`Prévia carregada: ${data.summary?.valid || 0} linha(s) válidas e ${data.summary?.errors || 0} com erro.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao ler arquivo.");
    } finally {
      setLoading(false);
    }
  }

  async function commit() {
    if (!rows.length) return setError("Carregue uma prévia antes de confirmar.");
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const data = await adminFetch<any>("/api/admin/employees/import/commit", { method: "POST", body: JSON.stringify({ rows }) });
      setRows(data.rows || []);
      setMessage("Importação concluída. Confira os PINs gerados e exporte o relatório antes de sair da tela.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao importar funcionários.");
    } finally {
      setLoading(false);
    }
  }

  async function exportReport(format: "pdf" | "xlsx") {
    if (!rows.length) return setError("Não há linhas para exportar.");
    const ext = format === "pdf" ? "pdf" : "xlsx";
    await downloadAdminPostFile("/api/admin/employees/import/commit", { rows, format, reportOnly: true }, `relatorio-importacao-funcionarios.${ext}`);
  }

  async function downloadTemplate() {
    await downloadAdminFile("/api/admin/employees/import/template", "modelo-importacao-funcionarios.xlsx");
  }

  return (
    <AdminShell>
      <SectionTitle title="Importar funcionários" description="Cadastre equipes completas por Excel, CSV ou PDF assistido, gere PIN de 4 dígitos automaticamente e produza relatório de conferência." />
      {message ? <p className="mb-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-800">{message}</p> : null}
      {error ? <p className="mb-3 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-800">{error}</p> : null}

      <Card className="mb-4">
        <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="grid gap-3">
            <div className="rounded-3xl border border-dashed border-brand-300 bg-brand-50 p-5">
              <UploadCloud className="h-8 w-8 text-brand-700" />
              <h2 className="mt-3 text-xl font-black text-slate-950">Enviar arquivo de funcionários</h2>
              <p className="mt-1 text-sm font-semibold text-slate-600">Use o modelo oficial para evitar erros. PDF é importação assistida e sempre exige revisão antes de salvar.</p>
              <input className="mt-4 w-full rounded-2xl border border-slate-200 bg-white p-3 text-sm" type="file" accept=".xlsx,.xls,.csv,.pdf" onChange={(event) => setFile(event.target.files?.[0] || null)} />
            </div>
            <div className="admin-action-row mobile-stack-actions">
              <Button onClick={preview} disabled={loading || !file}><FileUp className="h-4 w-4" /> Gerar prévia</Button>
              <Button variant="ghost" onClick={downloadTemplate}><Download className="h-4 w-4" /> Baixar modelo</Button>
            </div>
          </div>
          <div className="grid gap-3 rounded-3xl border border-slate-200 bg-white p-4">
            <h3 className="font-black text-slate-950">Fluxo seguro</h3>
            <div className="grid gap-2 text-sm font-semibold text-slate-600">
              <p><ShieldCheck className="mr-2 inline h-4 w-4 text-brand-700" /> PIN continua com 4 dígitos e é salvo com hash.</p>
              <p><ShieldCheck className="mr-2 inline h-4 w-4 text-brand-700" /> PIN gerado aparece somente no relatório inicial.</p>
              <p><ShieldCheck className="mr-2 inline h-4 w-4 text-brand-700" /> Duplicidades por matrícula/documento aparecem na prévia.</p>
              <p><ShieldCheck className="mr-2 inline h-4 w-4 text-brand-700" /> Importação registra auditoria para LGPD e RH.</p>
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-xl font-black text-slate-950">Prévia da importação</h2>
            <p className="text-sm font-semibold text-slate-500">Corrija o arquivo se houver erro. As linhas válidas podem ser criadas ou atualizadas.</p>
          </div>
          <div className="admin-action-row mobile-stack-actions">
            <Button onClick={() => commit()} disabled={loading || !rows.length}>Confirmar importação</Button>
            <Button variant="ghost" onClick={() => exportReport("pdf")} disabled={!rows.length}>PDF</Button>
            <Button variant="ghost" onClick={() => exportReport("xlsx")} disabled={!rows.length}>Excel</Button>
          </div>
        </div>
        <div className="admin-table-shell">
          <table className="w-full min-w-[1120px] text-left text-sm">
            <thead className="bg-brand-700 text-xs uppercase text-white">
              <tr><th className="p-3">Linha</th><th className="p-3">Matrícula</th><th className="p-3">Funcionário</th><th className="p-3">Filial</th><th className="p-3">Cargo</th><th className="p-3">Ação</th><th className="p-3">PIN</th><th className="p-3">Status</th><th className="p-3">Avisos/erros</th></tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={`${row.rowNumber}-${index}`} className="border-b border-slate-100 odd:bg-white even:bg-brand-50/40">
                  <td className="p-3 font-bold">{row.rowNumber}</td>
                  <td className="p-3">{row.registration_code || "-"}</td>
                  <td className="p-3 font-black text-slate-950">{row.full_name || "-"}</td>
                  <td className="p-3">{row.branch_name || "-"}</td>
                  <td className="p-3">{row.role || "-"}</td>
                  <td className="p-3"><Badge tone={row.action === "update" ? "blue" : row.action === "skip" ? "red" : "green"}>{row.action || "create"}</Badge></td>
                  <td className="p-3 font-black text-brand-800">{row.generated_pin || row.pin || "Será gerado"}</td>
                  <td className="p-3"><Badge tone={row.errors?.length ? "red" : "green"}>{row.errors?.length ? "Erro" : "OK"}</Badge></td>
                  <td className="max-w-[360px] p-3 text-xs font-semibold text-slate-600">{[...(row.errors || []), ...(row.warnings || [])].join(" | ") || "-"}</td>
                </tr>
              ))}
              {!rows.length ? <tr><td colSpan={9} className="p-10 text-center text-slate-500">Envie um arquivo para visualizar a prévia.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </Card>
    </AdminShell>
  );
}
