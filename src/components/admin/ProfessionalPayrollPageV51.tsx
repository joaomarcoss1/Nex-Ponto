"use client";

import { AlertTriangle, BadgeCheck, Calculator, CheckCircle2, FileSpreadsheet, History, LockKeyhole, RefreshCw, ShieldCheck, WalletCards } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, StatCard } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { DesktopTableShell, MobileCardList, Stepper } from "@/components/ui/mobile";
import { ToastMessage } from "@/components/ui/feedback";
import { adminFetch, downloadAdminPostFile } from "@/lib/client/admin-api";
import { formatMoney } from "@/lib/format";

type BranchOption = { id: string; name: string };
type PayrollPeriod = { id: string; title: string; start_date: string; end_date: string; branch_id: string | null; status: string; period_type: string };
type PayrollRun = { id: string; payroll_period_id: string; branch_id: string | null; version: number; status: string; calculation_mode: string; summary: Record<string, unknown>; created_at: string };
type RubricRow = { id: string; employee_id: string; rubric_code: string; rubric_name: string; rubric_type: string; final_value: number | string; formula_snapshot: Record<string, unknown> };
type DivergenceRow = { id: string; employee_id: string | null; code: string; severity: "info" | "warning" | "critical"; message: string; status: string };
type ProfessionalResponse = { periods: PayrollPeriod[]; runs: PayrollRun[]; rubrics: RubricRow[]; divergences: DivergenceRow[] };
type DivergenceDecision = "acknowledged" | "resolved" | "accepted_exception";

const steps = ["Competência", "Apuração", "Cálculo", "Conferência", "RH", "Financeiro", "Fechamento", "Exportação"];
const statusOrder: Record<string, number> = { draft: 0, attendance_pending: 1, calculated: 2, checking: 3, hr_approved: 4, financial_approved: 5, closed: 6, closed_with_exceptions: 6, exported: 7, paid: 7 };
const statusLabel: Record<string, string> = {
  draft: "Rascunho",
  attendance_pending: "Apuração pendente",
  calculated: "Calculada",
  checking: "Em conferência",
  hr_approved: "Aprovada pelo RH",
  financial_approved: "Aprovada pelo financeiro",
  closed: "Fechada",
  closed_with_exceptions: "Fechada com exceções",
  exported: "Exportada",
  paid: "Paga",
  reopened: "Reaberta",
};

function numberSummary(summary: Record<string, unknown>, key: string) {
  const value = summary[key];
  return typeof value === "number" ? value : Number(value || 0);
}

export function ProfessionalPayrollPageV51() {
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [periods, setPeriods] = useState<PayrollPeriod[]>([]);
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [rubrics, setRubrics] = useState<RubricRow[]>([]);
  const [divergences, setDivergences] = useState<DivergenceRow[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState("");
  const [selectedRunId, setSelectedRunId] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [reason, setReason] = useState("Conferência concluída conforme regras homologadas");
  const [periodForm, setPeriodForm] = useState({ title: "", start_date: "", end_date: "", branch_id: "", period_type: "monthly" });

  const selectedRun = runs.find((run) => run.id === selectedRunId) || null;
  const selectedPeriod = periods.find((period) => period.id === (selectedRun?.payroll_period_id || selectedPeriodId)) || null;

  const load = useCallback(async (runId?: string) => {
    const params = new URLSearchParams();
    if (runId) params.set("runId", runId);
    const [data, branchData] = await Promise.all([
      adminFetch<ProfessionalResponse>(`/api/admin/payroll/professional${params.toString() ? `?${params}` : ""}`),
      adminFetch<{ branches: BranchOption[] }>("/api/admin/options/branches?status=all&v=51"),
    ]);
    setPeriods(data.periods || []);
    setRuns(data.runs || []);
    setRubrics(data.rubrics || []);
    setDivergences(data.divergences || []);
    setBranches(branchData.branches || []);
  }, []);

  useEffect(() => {
    load().catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Erro ao carregar a pré-folha profissional."));
  }, [load]);

  async function runAction(payload: Record<string, unknown>, successMessage: string) {
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const response = await adminFetch<{ run?: PayrollRun; period?: PayrollPeriod }>("/api/admin/payroll/professional", { method: "POST", body: JSON.stringify(payload) });
      const runId = response.run?.id || selectedRunId;
      if (response.period?.id) setSelectedPeriodId(response.period.id);
      if (response.run?.id) setSelectedRunId(response.run.id);
      await load(runId || undefined);
      setMessage(successMessage);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "A operação não pôde ser concluída.");
    } finally {
      setLoading(false);
    }
  }

  async function createPeriod() {
    await runAction({ action: "create_period", ...periodForm, branch_id: periodForm.branch_id || null }, "Competência criada sem alterar períodos anteriores.");
  }

  async function createRun() {
    if (!selectedPeriodId) return setError("Selecione uma competência.");
    const period = periods.find((item) => item.id === selectedPeriodId);
    await runAction({ action: "create", payroll_period_id: selectedPeriodId, branch_id: period?.branch_id || null, calculation_mode: "parallel_simulation", idempotency_key: `${selectedPeriodId}:parallel:v51` }, "Processamento em simulação paralela criado.");
  }

  async function calculate() {
    if (!selectedRunId) return setError("Selecione um processamento.");
    await runAction({ action: "calculate", run_id: selectedRunId }, "Cálculo profissional concluído com memória e divergências.");
  }

  async function transition(targetStatus: string) {
    if (!selectedRunId) return setError("Selecione um processamento.");
    await runAction({ action: "transition", run_id: selectedRunId, target_status: targetStatus, reason }, `Etapa alterada para ${statusLabel[targetStatus] || targetStatus}.`);
  }

  async function resolveDivergence(divergenceId: string, decision: DivergenceDecision) {
    if (reason.trim().length < 10) return setError("Informe um motivo com pelo menos 10 caracteres.");
    await runAction({ action: "resolve_divergence", divergence_id: divergenceId, decision, reason }, decision === "accepted_exception" ? "Exceção aceita com auditoria." : "Divergência resolvida com auditoria.");
  }

  async function exportRun(format: "pdf" | "xlsx") {
    if (!selectedRunId || !selectedRun) return setError("Selecione um processamento calculado.");
    setLoading(true); setError(""); setMessage("");
    try {
      const extension = format;
      const name = (selectedPeriod?.title || "pre-folha").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-");
      await downloadAdminPostFile("/api/admin/reports/professional", { run_id: selectedRunId, format, idempotency_key: `${selectedRunId}:${format}:${selectedRun.version}` }, `pre-folha-${name}-v${selectedRun.version}.${extension}`);
      setMessage(`${format.toUpperCase()} profissional gerado com checksum e auditoria.`);
    } catch (exportError) { setError(exportError instanceof Error ? exportError.message : "Erro ao gerar exportação."); }
    finally { setLoading(false); }
  }

  async function selectRun(runId: string) {
    setSelectedRunId(runId);
    setLoading(true);
    try { await load(runId); } catch (loadError) { setError(loadError instanceof Error ? loadError.message : "Erro ao abrir o processamento."); } finally { setLoading(false); }
  }

  const summary = selectedRun?.summary || {};
  const unresolvedCritical = divergences.filter((item) => item.severity === "critical" && !["resolved", "accepted_exception"].includes(item.status)).length;
  const acceptedCritical = divergences.filter((item) => item.severity === "critical" && item.status === "accepted_exception").length;
  const critical = unresolvedCritical + acceptedCritical;
  const warning = divergences.filter((item) => item.severity === "warning" && item.status === "open").length;
  const groupedRubrics = useMemo(() => {
    const grouped = new Map<string, RubricRow[]>();
    for (const rubric of rubrics) grouped.set(rubric.employee_id, [...(grouped.get(rubric.employee_id) || []), rubric]);
    return [...grouped.entries()];
  }, [rubrics]);
  const currentStep = selectedRun ? statusOrder[selectedRun.status] ?? 0 : 0;
  const canClose = selectedRun?.status === "financial_approved" && unresolvedCritical === 0 && acceptedCritical === 0;
  const canCloseWithExceptions = selectedRun?.status === "financial_approved" && unresolvedCritical === 0 && acceptedCritical > 0;

  return (
    <AdminShell>
      <div className="space-y-4 pb-28 md:pb-8">
        <section className="overflow-hidden rounded-[1.75rem] bg-gradient-to-br from-[#07162f] via-[#0b2d61] to-[#1152a7] p-5 text-white shadow-[0_30px_90px_rgba(5,25,65,0.25)] sm:p-7">
          <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em]"><ShieldCheck className="h-3.5 w-3.5" /> Motor de pré-folha v5.2</p>
              <h1 className="mt-4 text-3xl font-black tracking-[-0.04em] sm:text-4xl">Pré-folha e conferência de jornada</h1>
              <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-blue-100 sm:text-base">Modo de simulação e homologação. Não substitui a folha oficial ou a conferência contábil e jurídica.</p>
            </div>
            <div className="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur">
              <p className="text-[10px] font-black uppercase tracking-[0.15em] text-blue-200">Processamento atual</p>
              <p className="mt-2 text-lg font-black">{selectedRun ? statusLabel[selectedRun.status] || selectedRun.status : "Nenhum selecionado"}</p>
              <p className="mt-1 text-xs font-semibold text-blue-200">{selectedPeriod?.title || "Selecione uma competência"}</p>
            </div>
          </div>
        </section>

        <Stepper steps={steps} current={currentStep} />
        {message ? <ToastMessage type="success">{message}</ToastMessage> : null}
        {error ? <ToastMessage type="error">{error}</ToastMessage> : null}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <StatCard label="Funcionários" value={numberSummary(summary, "employees")} tone="blue" />
          <StatCard label="Proventos" value={formatMoney(numberSummary(summary, "earnings"))} tone="green" />
          <StatCard label="Descontos" value={formatMoney(numberSummary(summary, "deductions"))} tone="red" />
          <StatCard label="Líquido" value={formatMoney(numberSummary(summary, "net"))} tone={numberSummary(summary, "net") < 0 ? "red" : "brand"} />
          <StatCard label="Pendências críticas" value={critical} tone={critical ? "red" : "green"} hint={`${warning} alerta(s)`} />
        </div>

        <div className="grid gap-4 xl:grid-cols-[380px_1fr]">
          <div className="space-y-4">
            <Card>
              <div className="flex items-start gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-brand-100 text-brand-700"><WalletCards className="h-5 w-5" /></span>
                <div><h2 className="font-black text-slate-950">Nova competência</h2><p className="text-xs font-medium leading-5 text-slate-500">Cria o período sem apagar ou recalcular folhas anteriores.</p></div>
              </div>
              <div className="mt-4 grid gap-3">
                <Field label="Título"><Input value={periodForm.title} onChange={(event) => setPeriodForm((current) => ({ ...current, title: event.target.value }))} placeholder="Julho de 2026" /></Field>
                <div className="grid grid-cols-2 gap-3"><Field label="Início"><Input type="date" value={periodForm.start_date} onChange={(event) => setPeriodForm((current) => ({ ...current, start_date: event.target.value }))} /></Field><Field label="Fim"><Input type="date" value={periodForm.end_date} onChange={(event) => setPeriodForm((current) => ({ ...current, end_date: event.target.value }))} /></Field></div>
                <Field label="Filial"><Select value={periodForm.branch_id} onChange={(event) => setPeriodForm((current) => ({ ...current, branch_id: event.target.value }))}><option value="">Consolidado permitido</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</Select></Field>
                <Button loading={loading} onClick={createPeriod} disabled={!periodForm.title || !periodForm.start_date || !periodForm.end_date}><FileSpreadsheet className="h-4 w-4" /> Criar competência</Button>
              </div>
            </Card>

            <Card>
              <h2 className="font-black text-slate-950">Processamento</h2>
              <div className="mt-3 grid gap-3">
                <Field label="Competência"><Select value={selectedPeriodId} onChange={(event) => setSelectedPeriodId(event.target.value)}><option value="">Selecione</option>{periods.map((period) => <option key={period.id} value={period.id}>{period.title} · {period.start_date} a {period.end_date}</option>)}</Select></Field>
                <Button variant="ghost" loading={loading} onClick={createRun} disabled={!selectedPeriodId}><History className="h-4 w-4" /> Criar simulação paralela</Button>
                <Field label="Execução"><Select value={selectedRunId} onChange={(event) => selectRun(event.target.value)}><option value="">Selecione</option>{runs.map((run) => <option key={run.id} value={run.id}>v{run.version} · {statusLabel[run.status] || run.status}</option>)}</Select></Field>
                <Button loading={loading} onClick={calculate} disabled={!selectedRunId}><Calculator className="h-4 w-4" /> Calcular com memória</Button>
              </div>
            </Card>

            <Card>
              <h2 className="font-black text-slate-950">Aprovação segura</h2>
              <Field label="Motivo da decisão"><Textarea value={reason} onChange={(event) => setReason(event.target.value)} /></Field>
              <div className="mt-3 grid gap-2">
                {selectedRun?.status === "calculated" ? <Button variant="ghost" onClick={() => transition("checking")} loading={loading}>Enviar para conferência</Button> : null}
                {selectedRun?.status === "checking" ? <Button variant="success" onClick={() => transition("hr_approved")} loading={loading}><BadgeCheck className="h-4 w-4" /> Aprovar RH</Button> : null}
                {selectedRun?.status === "hr_approved" ? <Button variant="success" onClick={() => transition("financial_approved")} loading={loading}><CheckCircle2 className="h-4 w-4" /> Aprovar financeiro</Button> : null}
                {selectedRun?.status === "financial_approved" ? <Button variant={canClose ? "primary" : "warning"} onClick={() => transition(canClose ? "closed" : "closed_with_exceptions")} loading={loading} disabled={!canClose && !canCloseWithExceptions}><LockKeyhole className="h-4 w-4" /> {canClose ? "Fechar competência" : canCloseWithExceptions ? "Fechar com exceções aceitas" : "Resolva as pendências críticas"}</Button> : null}
                {selectedRun && ["calculated","checking","hr_approved","financial_approved","closed","closed_with_exceptions","exported","paid"].includes(selectedRun.status) ? <div className="grid grid-cols-2 gap-2"><Button variant="ghost" onClick={() => exportRun("pdf")} loading={loading}>PDF</Button><Button variant="ghost" onClick={() => exportRun("xlsx")} loading={loading}>Excel</Button></div> : null}
              </div>
            </Card>
          </div>

          <div className="space-y-4">
            <Card>
              <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-black text-slate-950">Divergências automáticas</h2><p className="text-sm font-medium text-slate-500">Pendências críticas impedem o fechamento normal.</p></div><Button variant="ghost" size="sm" onClick={() => load(selectedRunId || undefined)} loading={loading}><RefreshCw className="h-4 w-4" /> Atualizar</Button></div>
              {!divergences.length ? <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-800"><CheckCircle2 className="mr-2 inline h-4 w-4" /> Nenhuma divergência carregada.</div> : <div className="mt-4 grid gap-2">{divergences.map((item) => <div key={item.id} className={`rounded-2xl border p-4 ${item.severity === "critical" ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50"}`}><div className="flex items-start gap-3"><AlertTriangle className={`mt-0.5 h-5 w-5 shrink-0 ${item.severity === "critical" ? "text-red-600" : "text-amber-600"}`} /><div><div className="flex flex-wrap items-center gap-2"><p className="font-black text-slate-900">{item.message}</p><Badge tone={item.severity === "critical" ? "red" : "yellow"}>{item.code}</Badge></div><p className="mt-1 text-xs font-semibold text-slate-500">Status: {item.status}</p>{!["resolved", "accepted_exception"].includes(item.status) ? <div className="mt-3 flex flex-wrap gap-2"><Button size="sm" variant="ghost" loading={loading} onClick={() => resolveDivergence(item.id, "resolved")}>Marcar resolvida</Button>{item.severity === "critical" ? <Button size="sm" variant="warning" loading={loading} onClick={() => resolveDivergence(item.id, "accepted_exception")}>Aceitar exceção</Button> : null}</div> : null}</div></div></div>)}</div>}
            </Card>

            <Card>
              <h2 className="text-lg font-black text-slate-950">Como este valor foi calculado</h2>
              <p className="mt-1 text-sm font-medium text-slate-500">Rubricas versionadas, valor aprovado, origem e memória de cálculo.</p>
              <DesktopTableShell className="mt-4 overflow-x-auto rounded-2xl border border-slate-200">
                <table className="w-full min-w-[780px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="p-3">Funcionário</th><th className="p-3">Rubrica</th><th className="p-3">Tipo</th><th className="p-3 text-right">Valor</th><th className="p-3">Memória</th></tr></thead><tbody>{rubrics.map((rubric) => <tr key={rubric.id} className="border-t border-slate-100"><td className="p-3 font-mono text-xs">{rubric.employee_id.slice(0, 8)}</td><td className="p-3 font-bold">{rubric.rubric_name}<p className="text-xs font-medium text-slate-400">{rubric.rubric_code}</p></td><td className="p-3">{rubric.rubric_type}</td><td className="p-3 text-right font-black">{formatMoney(Number(rubric.final_value || 0))}</td><td className="max-w-[260px] p-3 text-xs text-slate-500">{JSON.stringify(rubric.formula_snapshot).slice(0, 150)}</td></tr>)}</tbody></table>
              </DesktopTableShell>
              <MobileCardList className="mt-4">{groupedRubrics.map(([employeeId, rows]) => <article key={employeeId} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400">Funcionário {employeeId.slice(0, 8)}</p><div className="mt-3 grid gap-2">{rows.map((rubric) => <div key={rubric.id} className="flex items-start justify-between gap-3 border-t border-slate-100 pt-2 first:border-0 first:pt-0"><div><p className="text-sm font-black text-slate-900">{rubric.rubric_name}</p><p className="text-xs font-semibold text-slate-500">{rubric.rubric_code}</p></div><p className={`text-sm font-black ${rubric.rubric_type === "deduction" ? "text-red-600" : "text-emerald-700"}`}>{formatMoney(Number(rubric.final_value || 0))}</p></div>)}</div></article>)}</MobileCardList>
              {!rubrics.length ? <div className="mt-4 rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm font-semibold text-slate-500">Selecione e calcule um processamento para visualizar a memória.</div> : null}
            </Card>
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
