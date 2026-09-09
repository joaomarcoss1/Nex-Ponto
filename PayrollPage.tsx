"use client";

import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Lock, Plus, RefreshCw, ShieldCheck, Unlock, WalletCards } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { BrandMark } from "@/components/BrandMark";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, StatCard } from "@/components/ui/card";
import { ToastMessage } from "@/components/ui/feedback";
import { DesktopTableShell, MobileCardList, Stepper } from "@/components/ui/mobile";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { adminFetch, downloadAdminFile } from "@/lib/client/admin-api";
import { formatMoney, minutesToHourText } from "@/lib/format";

const closedStatuses = new Set(["closed", "closed_with_exceptions", "paid"]);
const statusLabels: Record<string, string> = {
  draft: "Prévia",
  incomplete_preview: "Prévia incompleta",
  checking: "Em conferência",
  ready: "Pronta",
  reviewed: "Revisada",
  closed: "Fechada",
  closed_with_exceptions: "Fechada com exceção",
  paid: "Paga",
  reopened: "Reaberta"
};
export function PayrollPage() {
  const [branches, setBranches] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [periods, setPeriods] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [selected, setSelected] = useState("");
  const [selectedItem, setSelectedItem] = useState<any | null>(null);
  const [itemEdit, setItemEdit] = useState<Record<string, any>>({});
  const [form, setForm] = useState({ title: "", period_type: "monthly", start_date: "", end_date: "", branch_id: "", employee_id: "", role: "", employment_type: "", payment_day: "", notes: "" });
  const [periodFilters, setPeriodFilters] = useState({ branchId: "", paymentDay: "", status: "" });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState<"pdf" | "xlsx" | "">("");
  const [closureReview, setClosureReview] = useState<any | null>(null);
  const [reopenReason, setReopenReason] = useState("");
  const [adminProfile, setAdminProfile] = useState<any | null>(null);
  const [branchLoading, setBranchLoading] = useState(true);
  const [branchError, setBranchError] = useState("");

  const loadPayrollOptions = useCallback(async () => {
    setBranchLoading(true);
    setBranchError("");
    try {
      const [profileData, employeeData] = await Promise.all([
        adminFetch<any>("/api/admin/me"),
        adminFetch<any>("/api/admin/options/employees?v=18"),
      ]);
      setAdminProfile(profileData.admin || null);
      setEmployees(employeeData.employees || []);

      let branchRows: any[] = [];
      try {
        const branchData = await adminFetch<any>("/api/admin/options/branches?status=all&v=18");
        branchRows = branchData.branches || [];
      } catch {
        const fallback = await adminFetch<any>("/api/admin/branches?status=all&v=18");
        branchRows = fallback.branches || [];
      }

      if (!branchRows.length) {
        throw new Error("Nenhuma filial foi encontrada. Execute a migration 017_v018_admin_performance_branches.sql no Supabase.");
      }
      setBranches(branchRows);
    } catch (err) {
      setBranchError(err instanceof Error ? err.message : "Erro ao carregar filiais e funcionários.");
    } finally {
      setBranchLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPayrollOptions();
  }, [loadPayrollOptions]);

  async function load(id?: string, filters = periodFilters) {
    try {
      const params = new URLSearchParams();
      if (id) params.set("id", id);
      if (!id && filters.branchId) params.set("branchId", filters.branchId);
      if (!id && filters.paymentDay) params.set("paymentDay", filters.paymentDay);
      if (!id && filters.status) params.set("status", filters.status);
      const data = await adminFetch<any>(`/api/admin/payroll${params.toString() ? `?${params.toString()}` : ""}`);
      setPeriods(data.periods || []);
      if (id) {
        setItems(data.items || []);
        setSelected(id);
      }
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar folha.");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function generate() {
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const data = await adminFetch<any>("/api/admin/payroll", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          branch_id: form.branch_id || null,
          employee_id: form.employee_id || null,
          payment_day: form.payment_day ? Number(form.payment_day) : null,
          request_id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`
        })
      });
      setMessage(
        data.duplicated
          ? data.message || "Já existia uma folha fechada para este filtro."
          : data.regenerated
            ? data.message || `Pré-folha recalculada com ${data.itemsCreated} item(ns).`
            : `Pré-folha gerada com ${data.itemsCreated} item(ns).`
      );
      await load(data.period.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao gerar folha.");
    } finally {
      setLoading(false);
    }
  }

  async function updateStatus(status: string, extra: Record<string, any> = {}) {
    if (!selected) return;
    setLoading(true);
    try {
      const data = await adminFetch<any>("/api/admin/payroll", {
        method: "PATCH",
        body: JSON.stringify({ id: selected, status, ...extra })
      });
      if (data.requiresClosureReview) {
        setClosureReview(data);
        setError("");
        setMessage(data.message || "A folha possui pendências antes do fechamento.");
        return;
      }
      setClosureReview(null);
      setReopenReason("");
      setMessage("Status da folha atualizado.");
      await load(selected);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao atualizar status.");
    } finally {
      setLoading(false);
    }
  }

  function beginItemEdit(item: any) {
    setSelectedItem(item);
    setItemEdit({
      expected_work_days: item.expected_work_days,
      worked_days: item.worked_days,
      approved_absences: item.approved_absences,
      discounted_absences: item.discounted_absences,
      total_late_minutes: item.total_late_minutes,
      total_early_leave_minutes: item.total_early_leave_minutes,
      overtime_minutes: item.overtime_minutes,
      extra_days: item.extra_days,
      absence_discount_amount: item.absence_discount_amount,
      overtime_amount: item.overtime_amount,
      extra_day_amount: item.extra_day_amount,
      final_amount: item.final_amount,
      notes: item.notes || ""
    });
  }

  async function saveItemEdit() {
    if (!selectedItem) return;
    setError("");
    setMessage("");
    try {
      await adminFetch("/api/admin/payroll-items", { method: "PATCH", body: JSON.stringify({ id: selectedItem.id, ...itemEdit }) });
      setMessage("Item financeiro ajustado com auditoria.");
      setSelectedItem(null);
      await load(selected);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao ajustar item.");
    }
  }

  async function exportPayroll(format: "pdf" | "xlsx") {
    if (!selected) return;
    setExporting(format);
    setError("");
    setMessage("");
    try {
      const currentPeriod = periods.find((item) => item.id === selected);
      await downloadAdminFile(`/api/admin/reports?type=payroll&format=${format}&payrollId=${selected}`, `folha-${currentPeriod?.title?.toLowerCase().replace(/[^a-z0-9]+/g, "-") || selected}.${format}`);
      setMessage(format === "pdf" ? "PDF premium da folha gerado com sucesso." : "Excel da folha gerado com sucesso.");
    } catch (err) {
      setError(err instanceof Error ? err.message : `Erro ao gerar ${format.toUpperCase()} da folha.`);
    } finally {
      setExporting("");
    }
  }

  const availableEmployees = useMemo(() => employees.filter((employee) => {
    const matchesBranch = !form.branch_id || employee.branch_id === form.branch_id;
    const matchesPaymentDay = !form.payment_day || Number(employee.payment_day || 0) === Number(form.payment_day);
    return matchesBranch && matchesPaymentDay;
  }), [employees, form.branch_id, form.payment_day]);

  const period = periods.find((item) => item.id === selected);
  const summary = useMemo(() => items.reduce(
    (acc, item) => {
      acc.total += Number(item.final_amount || 0);
      acc.discounts += Number(item.absence_discount_amount || 0);
      acc.extras += Number(item.overtime_amount || 0) + Number(item.extra_day_amount || 0);
      acc.overtime += Number(item.overtime_minutes || 0);
      acc.gross += Number(item.base_salary || item.salary_amount || item.monthly_salary || 0);
      return acc;
    },
    { total: 0, discounts: 0, extras: 0, overtime: 0, gross: 0 }
  ), [items]);
  const isIncompletePreview = period?.status === "incomplete_preview";
  const hasPendingHolidayDecision = Boolean(
    period?.closure_snapshot?.reasons?.some?.((reason: any) => reason.key === "pending_holiday_decisions" && Number(reason.count || 0) > 0)
  );
  const statusTone = period?.status === "paid" ? "green" : closedStatuses.has(period?.status) ? "blue" : isIncompletePreview ? "red" : period ? "yellow" : "neutral";
  const statusLabel = period ? statusLabels[period.status] || period.status : "Selecione uma folha";
  const isMaster = Boolean(adminProfile?.is_master || adminProfile?.role === "master_admin");
  const canManagePayroll = Boolean(adminProfile?.can_manage_payroll || adminProfile?.canViewFinancialData || adminProfile?.can_view_financial);
  const canReview = Boolean(period && canManagePayroll && !closedStatuses.has(period.status) && period.status !== "reviewed");
  const canClose = Boolean(period && canManagePayroll && !closedStatuses.has(period.status) && period.status !== "incomplete_preview");
  const canCloseWithException = Boolean(period && period.status === "incomplete_preview" && isMaster && !hasPendingHolidayDecision);
  const canMarkPaid = Boolean(period && canManagePayroll && ["closed", "closed_with_exceptions"].includes(period.status));
  const canReopen = Boolean(period && ["closed", "closed_with_exceptions", "paid"].includes(period.status) && isMaster);
  const canEditItems = Boolean(period && canManagePayroll && !closedStatuses.has(period.status));
  const selectedBranchName = period?.branch_id ? period.branches?.name || branches.find((branch) => branch.id === period.branch_id)?.name || "Filial selecionada" : "Todas as filiais permitidas";
  const criticalCount = closureReview?.checklist?.filter?.((item: any) => item.severity === "critical" && item.count > 0)?.reduce?.((sum: number, item: any) => sum + Number(item.count || 0), 0) || 0;

  return (
    <AdminShell>
      <section className="payroll-hero payroll-header-clean mb-5 overflow-hidden rounded-[1.65rem] border border-brand-100 bg-white p-4 shadow-[0_24px_70px_rgba(6,67,32,0.10)] sm:rounded-[2rem] sm:p-6">
        <div className="relative grid gap-5 xl:grid-cols-[1fr_420px] xl:items-center">
          <div className="min-w-0">
            <BrandMark />
            <div className="mt-5 max-w-3xl">
              <p className="inline-flex rounded-full bg-sun-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-brand-800 ring-1 ring-sun-200">Módulo financeiro administrativo</p>
              <h1 className="mt-3 text-[1.85rem] font-black leading-tight tracking-[-0.05em] text-brand-950 sm:text-4xl">Pré-folha administrativa</h1>
              <p className="mt-2 text-sm font-semibold leading-6 text-slate-700 sm:text-base">Página corporativa para conferência, fechamento, exportação e pagamento da folha, com dados reais do Supabase e identidade visual NexPonto.</p>
            </div>
          </div>
          <div className="payroll-status-clean grid gap-3 rounded-[1.35rem] border border-brand-100 bg-brand-950 p-4 text-white shadow-[0_18px_50px_rgba(6,67,32,0.18)]">
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-sun-400 text-brand-950"><ShieldCheck className="h-5 w-5" /></span>
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-sun-200">Status atual</p>
                <p className="truncate text-xl font-black text-white">{statusLabel}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs font-bold text-brand-50 sm:text-sm">
              <span className="rounded-2xl bg-white/10 p-3"><strong className="block text-sun-200">Unidade</strong>{selectedBranchName}</span>
              <span className="rounded-2xl bg-white/10 p-3"><strong className="block text-sun-200">Itens</strong>{items.length} funcionário(s)</span>
              <span className="rounded-2xl bg-white/10 p-3"><strong className="block text-sun-200">Período</strong>{period ? `${period.start_date} a ${period.end_date}` : "Aguardando seleção"}</span>
              <span className="rounded-2xl bg-white/10 p-3"><strong className="block text-sun-200">Líquido</strong>{formatMoney(summary.total)}</span>
            </div>
          </div>
        </div>
      </section>
      {message ? <ToastMessage>{message}</ToastMessage> : null}
      {error ? <ToastMessage type="error">{error}</ToastMessage> : null}
      <Card className="mb-4 border-brand-100 bg-gradient-to-r from-white via-brand-50/80 to-sun-50/60">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-brand-700">Fluxo de fechamento</p>
            <h2 className="text-lg font-black text-slate-950">Conferência guiada para RH e direção</h2>
          </div>
          {criticalCount > 0 ? <Badge tone="red"><AlertTriangle className="mr-1 inline h-3 w-3" /> {criticalCount} crítica(s)</Badge> : selected ? <Badge tone="green"><CheckCircle2 className="mr-1 inline h-3 w-3" /> Sem crítica carregada</Badge> : <Badge tone="neutral">Aguardando folha</Badge>}
        </div>
        <Stepper steps={["Período", "Prévia", "Checklist", "Conferência", "Exportação", "Fechamento", "Pagamento"]} current={period?.status === "paid" ? 6 : closedStatuses.has(period?.status) ? 5 : selected ? 3 : 0} />
      </Card>
      <div className="grid gap-4 xl:grid-cols-[420px_1fr]">
        <div className="grid content-start gap-4">
          <Card>
            <div className="mb-4 flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-brand-600 text-white"><WalletCards className="h-5 w-5" /></span>
              <div>
                <h2 className="font-black text-slate-950">Gerar nova folha</h2>
                <p className="text-xs font-semibold text-slate-500">Preencha o período e gere a prévia.</p>
              </div>
            </div>
            {branchError ? (
              <div className="mb-3 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-800">
                <p>{branchError}</p>
                <Button className="mt-2" size="sm" variant="secondary" onClick={loadPayrollOptions} loading={branchLoading}>Recarregar filiais</Button>
              </div>
            ) : (
              <div className="mb-3 rounded-2xl border border-brand-100 bg-brand-50 p-3 text-xs font-bold text-brand-800">
                {branchLoading ? "Carregando matriz e filiais..." : `${branches.length} unidade(s) disponível(is) para gerar e filtrar a folha.`}
              </div>
            )}
            <div className="grid gap-3">
              <Field label="Título"><Input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Ex.: Pré-folha do mês atual" /></Field>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Tipo"><Select value={form.period_type} onChange={(event) => setForm({ ...form, period_type: event.target.value })}><option value="monthly">Mensal</option><option value="biweekly">Quinzenal</option><option value="daily">Diaristas</option><option value="custom">Personalizado</option></Select></Field>
                <Field label="Filial/Matriz"><Select disabled={branchLoading || Boolean(branchError)} value={form.branch_id} onChange={(event) => setForm({ ...form, branch_id: event.target.value, employee_id: "" })}><option value="">{branchLoading ? "Carregando unidades..." : "Todas as unidades permitidas"}</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</Select></Field>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Funcionário"><Select value={form.employee_id} onChange={(event) => setForm({ ...form, employee_id: event.target.value })}><option value="">Todos do filtro</option>{availableEmployees.map((employee) => <option key={employee.id} value={employee.id}>{employee.full_name}</option>)}</Select></Field>
                <Field label="Contrato"><Select value={form.employment_type} onChange={(event) => setForm({ ...form, employment_type: event.target.value })}><option value="">Todos</option><option value="mensalista">Mensalista</option><option value="quinzenal">Quinzenal</option><option value="diarista">Diarista</option></Select></Field>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Dia de pagamento"><Select value={form.payment_day} onChange={(event) => setForm({ ...form, payment_day: event.target.value, employee_id: "" })}><option value="">Todos</option>{[5, 10, 15, 20, 25, 30].map((day) => <option key={day} value={day}>Recebem dia {day}</option>)}</Select></Field>
                <Field label="Cargo"><Input value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })} placeholder="Opcional" /></Field>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Início"><Input type="date" value={form.start_date} onChange={(event) => setForm({ ...form, start_date: event.target.value })} /></Field>
                <Field label="Fim"><Input type="date" value={form.end_date} onChange={(event) => setForm({ ...form, end_date: event.target.value })} /></Field>
              </div>
              <Field label="Observações"><Textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></Field>
              <Button loading={loading} disabled={loading || branchLoading || Boolean(branchError) || branches.length === 0} onClick={generate}><Plus className="h-4 w-4" />Gerar folha</Button>
            </div>
          </Card>
          <Card>
            <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-black text-slate-950">Pré-folhas criadas</h2>
                <p className="text-xs font-semibold text-slate-500">Filtre por matriz/filial, status ou dia de pagamento.</p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => load(undefined, periodFilters)} loading={loading}><RefreshCw className="h-4 w-4" /></Button>
            </div>
            <div className="mb-3 grid gap-2 sm:grid-cols-2">
              <Field label="Filial/Matriz"><Select disabled={branchLoading || Boolean(branchError)} value={periodFilters.branchId} onChange={(event) => setPeriodFilters({ ...periodFilters, branchId: event.target.value })}><option value="">Todas as unidades</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</Select></Field>
              <Field label="Dia pgto."><Select value={periodFilters.paymentDay} onChange={(event) => setPeriodFilters({ ...periodFilters, paymentDay: event.target.value })}><option value="">Todos</option>{[5, 10, 15, 20, 25, 30].map((day) => <option key={day} value={day}>Dia {day}</option>)}</Select></Field>
              <Field label="Status"><Select value={periodFilters.status} onChange={(event) => setPeriodFilters({ ...periodFilters, status: event.target.value })}><option value="">Todos</option><option value="draft">Prévia</option><option value="incomplete_preview">Prévia incompleta</option><option value="reviewed">Revisada</option><option value="closed">Fechada</option><option value="closed_with_exceptions">Fechada com exceção</option><option value="paid">Paga</option></Select></Field>
              <Button className="self-end" variant="secondary" onClick={() => load(undefined, periodFilters)}>Aplicar filtros</Button>
            </div>
            <div className="grid max-h-[460px] gap-2 overflow-auto pr-1">
              {periods.map((item) => (
                <button key={item.id} className={`rounded-2xl border p-3 text-left transition ${selected === item.id ? "border-brand-500 bg-brand-50 shadow-[0_14px_34px_rgba(18,104,243,0.08)]" : "border-slate-200 bg-white hover:border-brand-200"}`} onClick={() => load(item.id)}>
                  <strong className="block text-slate-950">{item.title}</strong>
                  <span className="text-sm font-semibold text-slate-600">{item.start_date} até {item.end_date}</span>
                  <span className="mt-1 block text-xs font-bold text-slate-500">{item.branches?.name || "Todas as unidades"}{item.payment_day ? ` • Dia ${item.payment_day}` : ""}</span>
                  <span className="mt-2 block"><Badge tone={item.status === "paid" ? "green" : closedStatuses.has(item.status) ? "blue" : item.status === "incomplete_preview" ? "red" : "yellow"}>{statusLabels[item.status] || item.status}</Badge></span>
                </button>
              ))}
              {!periods.length ? <p className="rounded-2xl bg-slate-50 p-4 text-sm font-bold text-slate-500">Nenhuma folha criada para os filtros aplicados.</p> : null}
            </div>
          </Card>
        </div>
        <Card className="payroll-workspace border-brand-100/80 bg-gradient-to-br from-white via-white to-brand-50/30">
          <div className="mb-5 flex flex-col justify-between gap-4 rounded-[1.35rem] border border-slate-100 bg-white/90 p-4 shadow-[0_14px_36px_rgba(15,23,42,0.04)] lg:flex-row lg:items-center">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-brand-700">Conferência financeira oficial</p>
              <h2 className="text-2xl font-black tracking-[-0.03em] text-slate-950">{period?.title || "Selecione uma folha"}</h2>
              {period ? <p className="text-sm font-semibold text-slate-600">{period.start_date} até {period.end_date} • <Badge tone={statusTone as any}>{statusLabel}</Badge></p> : null}
            </div>
            {selected ? (
              <div className="admin-action-row">
                {canReview ? <Button variant="ghost" size="sm" onClick={() => updateStatus("reviewed")} loading={loading} disabled={loading}>Revisar</Button> : null}
                {canClose ? <Button variant="ghost" size="sm" onClick={() => updateStatus("closed")} loading={loading} disabled={loading}><Lock className="h-4 w-4" />Fechar</Button> : null}
                {canCloseWithException ? <Button variant="secondary" size="sm" onClick={() => setClosureReview({ requiresClosureReview: true, allowMasterOverride: true, message: "Prévia incompleta: informe justificativa no fechamento com exceção.", checklist: [] })} loading={loading} disabled={loading}><ShieldCheck className="h-4 w-4" />Fechar com exceção</Button> : null}
                {canMarkPaid ? <Button variant="ghost" size="sm" onClick={() => updateStatus("paid")} loading={loading} disabled={loading}>Marcar paga</Button> : null}
                {canReopen ? <Button variant="ghost" size="sm" onClick={() => setClosureReview({ mode: "reopen" })} disabled={loading}><Unlock className="h-4 w-4" />Reabrir</Button> : null}
                <Button size="sm" variant="secondary" onClick={() => exportPayroll("pdf")} loading={exporting === "pdf"} disabled={Boolean(exporting)}><Download className="h-4 w-4" />PDF premium</Button>
                <Button size="sm" variant="ghost" onClick={() => exportPayroll("xlsx")} loading={exporting === "xlsx"} disabled={Boolean(exporting)}><FileSpreadsheet className="h-4 w-4" />Excel</Button>
              </div>
            ) : null}
          </div>
          {selected ? (
            <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard label="Total bruto" value={formatMoney(summary.gross)} tone="slate" />
              <StatCard label="Descontos" value={formatMoney(summary.discounts)} tone="red" />
              <StatCard label="Acréscimos" value={formatMoney(summary.extras)} tone="yellow" hint={minutesToHourText(summary.overtime)} />
              <StatCard label="Total líquido" value={formatMoney(summary.total)} tone={summary.total < 0 ? "red" : "brand"} />
            </div>
          ) : null}

          {isIncompletePreview ? (
            <div className="mb-4 rounded-3xl border-2 border-red-200 bg-red-50 p-4 text-red-950">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="text-lg font-black">Prévia incompleta — não usar para pagamento sem conferência</h3>
                  <p className="mt-1 text-sm font-semibold">Esta folha ainda está incompleta porque existem funcionários sem registros de ponto suficientes ou pendências críticas no período. Revise as ocorrências antes de fechar.</p>
                </div>
                <Badge tone="red">Bloqueio de fechamento normal</Badge>
              </div>
              {summary.total < 0 ? <p className="mt-3 rounded-2xl bg-white p-3 text-sm font-bold text-red-800">Valor líquido negativo gerado por ausência de pontos ou pendências no período.</p> : null}
              {Array.isArray(period?.closure_snapshot?.reasons) && period.closure_snapshot.reasons.length ? (
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {period.closure_snapshot.reasons.map((reason: any) => (
                    <div key={reason.key} className="rounded-2xl bg-white p-3 text-sm font-bold text-red-900 shadow-inner">
                      <span className="block text-xs uppercase tracking-wide text-red-600">{reason.count} pendência(s)</span>
                      {reason.label}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
          {closureReview ? (
            <div className="mb-4 rounded-3xl border-2 border-amber-300 bg-amber-50 p-4">
              {closureReview.mode === "reopen" ? (
                <div className="grid gap-3">
                  <h3 className="text-lg font-black text-amber-950">Motivo da reabertura</h3>
                  <p className="text-sm font-semibold text-amber-900">A reabertura altera uma folha fechada e ficará registrada na auditoria.</p>
                  <Textarea value={reopenReason} onChange={(event) => setReopenReason(event.target.value)} placeholder="Explique o motivo da reabertura" />
                  <div className="admin-action-row"><Button disabled={reopenReason.trim().length < 8 || loading} loading={loading} onClick={() => updateStatus("reopened", { reason: reopenReason })}>Confirmar reabertura</Button><Button variant="ghost" onClick={() => setClosureReview(null)}>Cancelar</Button></div>
                </div>
              ) : (
                <div className="grid gap-3">
                  <h3 className="text-lg font-black text-amber-950">Checklist de fechamento da folha</h3>
                  <p className="text-sm font-semibold text-amber-900">Resolva as pendências críticas antes de fechar. O sistema bloqueia fechamento inseguro.</p>
                  <div className="grid gap-2 md:grid-cols-2">{(closureReview.checklist || []).filter((item: any) => item.count > 0).map((item: any) => <div key={item.check_type} className="rounded-2xl border border-amber-200 bg-white p-3"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><strong className="text-sm text-slate-950">{item.label}</strong><Badge tone={item.severity === "critical" ? "red" : "yellow"}>{item.count}</Badge></div><p className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{item.severity === "critical" ? "Crítica" : item.severity === "warning" ? "Atenção" : "Informativa"}</p></div>)}</div>
                  {closureReview.holidayDecisionBlocking ? <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-900">Feriados pendentes devem ser decididos na área <strong>Feriados</strong>. Nem o administrador master pode ignorar essa decisão, pois ela define se o dia entra como jornada normal ou dispensa remunerada.</div> : null}
                  {closureReview.allowMasterOverride && !closureReview.holidayDecisionBlocking && period?.status === "incomplete_preview" ? <div className="grid gap-3"><Textarea value={reopenReason} onChange={(event) => setReopenReason(event.target.value)} placeholder="Justificativa formal para fechar com exceção" /><Button disabled={reopenReason.trim().length < 12 || loading} loading={loading} onClick={() => updateStatus("closed", { overrideReason: reopenReason })}>Confirmar fechamento com exceção</Button></div> : null}<Button variant="ghost" onClick={() => setClosureReview(null)}>Entendi, vou resolver as pendências</Button>
                </div>
              )}
            </div>
          ) : null}
          {selectedItem ? (
            <div className="mb-4 rounded-3xl border border-amber-200 bg-amber-50 p-4">
              <h3 className="font-black text-amber-950">Ajuste financeiro antes do fechamento</h3>
              <p className="mt-1 text-sm text-amber-900">{selectedItem.employee_name} • ajustes ficam registrados em auditoria.</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {[["worked_days", "Dias trabalhados"], ["discounted_absences", "Faltas descontadas"], ["total_late_minutes", "Atrasos (min)"], ["total_early_leave_minutes", "Saídas ant. (min)"], ["overtime_minutes", "Horas extras (min)"], ["extra_days", "Dias extras"], ["absence_discount_amount", "Desconto faltas"], ["overtime_amount", "Valor hora extra"], ["extra_day_amount", "Valor dia extra"], ["final_amount", "Valor final"]].map(([key, label]) => <Field key={key} label={label}><Input value={itemEdit[key] ?? ""} type="number" onChange={(event) => setItemEdit({ ...itemEdit, [key]: event.target.value })} /></Field>)}
                <Field label="Observação"><Textarea value={itemEdit.notes || ""} onChange={(event) => setItemEdit({ ...itemEdit, notes: event.target.value })} /></Field>
              </div>
              <div className="admin-action-row mt-4 mobile-stack-actions"><Button onClick={saveItemEdit}>Salvar ajuste</Button><Button variant="ghost" onClick={() => setSelectedItem(null)}>Cancelar</Button></div>
            </div>
          ) : null}
          <MobileCardList>
            {items.map((item) => (
              <article key={item.id} className="payroll-mobile-card rounded-[1.35rem] border border-brand-100 bg-gradient-to-br from-white to-brand-50/40 p-4 shadow-[0_16px_42px_rgba(6,67,32,0.08)]">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-base font-black text-slate-950">{item.employee_name}</h3>
                    <p className="mt-1 text-xs font-bold text-slate-500">{item.branch_name} • {item.role || "Cargo não informado"}</p>
                  </div>
                  <div className="rounded-2xl bg-brand-700 px-3 py-2 text-right text-white shadow-[0_12px_26px_rgba(18,104,243,0.2)]">
                    <p className="text-[10px] font-black uppercase tracking-wide text-brand-50">Líquido</p>
                    <p className="text-base font-black">{formatMoney(item.final_amount)}</p>
                  </div>
                </div>
                <div className="grid gap-2 text-sm">
                  <div className="flex justify-between rounded-2xl bg-white px-3 py-2 shadow-inner"><span className="font-bold text-slate-500">Faltas descontadas</span><strong>{item.discounted_absences}</strong></div>
                  <div className="flex justify-between rounded-2xl bg-white px-3 py-2 shadow-inner"><span className="font-bold text-slate-500">Atrasos</span><strong>{minutesToHourText(item.total_late_minutes)}</strong></div>
                  <div className="flex justify-between rounded-2xl bg-white px-3 py-2 shadow-inner"><span className="font-bold text-slate-500">Horas extras</span><strong>{minutesToHourText(item.overtime_minutes)}</strong></div>
                </div>
                <Button className="mt-3 w-full" variant="ghost" size="sm" onClick={() => beginItemEdit(item)} disabled={!canEditItems}>Detalhes / ajustar</Button>
              </article>
            ))}
            {!items.length ? <p className="rounded-2xl bg-slate-50 p-4 text-center text-sm font-bold text-slate-500">Selecione ou gere uma folha para visualizar os itens.</p> : null}
          </MobileCardList>
          <DesktopTableShell>
            <div className="admin-table-shell">
              <table className="w-full min-w-[1180px] table-fixed text-left text-sm payroll-table-premium">
                <thead><tr className="bg-brand-800 text-xs uppercase tracking-[0.08em] text-white"><th className="p-3">Funcionário</th><th className="p-3">Filial</th><th className="p-3">Previstos</th><th className="p-3">Trabalhados</th><th className="p-3">Faltas desc.</th><th className="p-3">Atrasos</th><th className="p-3">Hora extra</th><th className="p-3">Descontos</th><th className="p-3">Acréscimos</th><th className="p-3">Final</th><th className="p-3">Financeiro</th></tr></thead>
                <tbody>{items.map((item) => <tr key={item.id} className="border-b border-slate-100 odd:bg-white even:bg-brand-50/40 transition hover:bg-sun-50/60"><td className="p-3 font-bold">{item.employee_name}</td><td className="p-3">{item.branch_name}</td><td className="p-3">{item.expected_work_days}</td><td className="p-3">{item.worked_days}</td><td className="p-3">{item.discounted_absences}</td><td className="p-3">{minutesToHourText(item.total_late_minutes)}</td><td className="p-3">{minutesToHourText(item.overtime_minutes)}</td><td className="p-3">{formatMoney(item.absence_discount_amount)}</td><td className="p-3">{formatMoney(Number(item.overtime_amount || 0) + Number(item.extra_day_amount || 0))}</td><td className="p-3 font-black text-brand-800">{formatMoney(item.final_amount)}</td><td className="p-3"><Button size="sm" variant="ghost" onClick={() => beginItemEdit(item)} disabled={!canEditItems}>Editar</Button></td></tr>)}{!items.length ? <tr><td className="p-10 text-center text-slate-500" colSpan={11}>Selecione ou gere uma folha para visualizar os itens financeiros.</td></tr> : null}</tbody>
              </table>
            </div>
          </DesktopTableShell>
        </Card>
      </div>
    </AdminShell>
  );
}
