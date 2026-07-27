"use client";

import { CalendarDays, CheckCircle2, Copy, Save, Send, ShieldAlert, Users } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, SectionTitle, StatCard } from "@/components/ui/card";
import { adminFetch } from "@/lib/client/admin-api";

interface Branch { id: string; name: string }
interface Employee { id: string; full_name: string; registration_code: string | null; role: string; sector: string | null }
interface ShiftTemplate { id: string; name: string; starts_at: string; ends_at: string; color: string; expected_daily_minutes: number; shift_template_intervals?: Array<{ expected_minutes: number; paid: boolean }> }
interface Occurrence { employee_id: string; work_date: string; shift_template_id: string | null; is_day_off: boolean; intervals?: Array<Record<string, unknown>> }
interface Publication { id: string; status: string; schedule_occurrences?: Array<Occurrence> }
interface ValidationIssue { id: string; issue_code: string; severity: "info" | "warning" | "blocking"; message: string; work_date: string | null; employee_id: string | null; details: Record<string, unknown>; status: string }
interface PlannerPayload { branch: Branch; employees: Employee[]; templates: ShiftTemplate[]; publication: Publication | null; coverageRequirements: Array<{ minimum_people: number }>; validationIssues: ValidationIssue[] }

function isoDate(date: Date) { return date.toISOString().slice(0, 10); }
function addDays(date: Date, days: number) { const next = new Date(date); next.setUTCDate(next.getUTCDate() + days); return next; }
function mondayOfCurrentWeek() { const now = new Date(); const day = now.getUTCDay(); return addDays(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())), day === 0 ? -6 : 1 - day); }
const weekDay = new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", timeZone: "UTC" });

export default function SchedulePlannerPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState("");
  const [weekStart, setWeekStart] = useState(isoDate(mondayOfCurrentWeek()));
  const [payload, setPayload] = useState<PlannerPayload | null>(null);
  const [cells, setCells] = useState<Record<string, Occurrence>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [mobileDayIndex, setMobileDayIndex] = useState(0);
  const days = useMemo(() => Array.from({ length: 7 }, (_, index) => isoDate(addDays(new Date(`${weekStart}T00:00:00Z`), index))), [weekStart]);
  const weekEnd = days[6];

  useEffect(() => {
    adminFetch<{ branches: Branch[] }>("/api/admin/branches?status=active")
      .then((data) => { setBranches(data.branches || []); setBranchId((current) => current || data.branches?.[0]?.id || ""); })
      .catch((cause: Error) => setError(cause.message));
  }, []);

  const load = useCallback(async () => {
    if (!branchId) return;
    setLoading(true); setError(""); setMessage("");
    try {
      const data = await adminFetch<PlannerPayload>(`/api/admin/schedules/planner?branchId=${branchId}&startDate=${weekStart}&endDate=${weekEnd}`);
      setPayload(data);
      const mapped: Record<string, Occurrence> = {};
      for (const occurrence of data.publication?.schedule_occurrences || []) mapped[`${occurrence.employee_id}:${occurrence.work_date}`] = occurrence;
      setCells(mapped);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Erro ao carregar planejamento."); }
    finally { setLoading(false); }
  }, [branchId, weekStart, weekEnd]);

  useEffect(() => { void load(); }, [load]);

  function setCell(employeeId: string, date: string, value: string) {
    const key = `${employeeId}:${date}`;
    setCells((current) => ({
      ...current,
      [key]: { employee_id: employeeId, work_date: date, shift_template_id: value === "off" ? null : value || null, is_day_off: value === "off", intervals: [] }
    }));
  }

  function copyFirstDay(employeeId: string) {
    const source = cells[`${employeeId}:${days[0]}`];
    if (!source) return;
    setCells((current) => {
      const next = { ...current };
      for (const date of days.slice(1)) next[`${employeeId}:${date}`] = { ...source, work_date: date };
      return next;
    });
  }

  async function save(publish: boolean) {
    if (!payload) return;
    setSaving(true); setError(""); setMessage("");
    try {
      const occurrences = payload.employees.flatMap((employee) => days.map((date) => cells[`${employee.id}:${date}`]).filter((item): item is Occurrence => Boolean(item)));
      const result = await adminFetch<{ publication: Publication }>("/api/admin/schedules/planner", {
        method: "POST",
        body: JSON.stringify({
          publication_id: payload.publication?.status === "draft" ? payload.publication.id : null,
          branch_id: branchId,
          period_start: weekStart,
          period_end: weekEnd,
          occurrences,
          publish,
          notes: publish ? "Escala semanal publicada pelo planejador" : "Rascunho salvo pelo planejador"
        })
      });
      setMessage(publish ? "Escala publicada e aplicada à jornada." : "Rascunho salvo com segurança.");
      setPayload((current) => current ? { ...current, publication: result.publication } : current);
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Erro ao salvar escala."); await load(); }
    finally { setSaving(false); }
  }

  const assigned = Object.values(cells).filter((cell) => cell.shift_template_id && !cell.is_day_off).length;
  const daysOff = Object.values(cells).filter((cell) => cell.is_day_off).length;

  return (
    <AdminShell>
      <SectionTitle title="Planejamento semanal de escalas" description="Monte, valide e publique a jornada da equipe em uma grade adaptada para desktop e celular. A escala publicada passa a ser a fonte principal do ponto." />
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <label className="grid gap-1 text-sm font-bold text-slate-700">Filial<select className="min-h-11 rounded-xl border border-slate-200 bg-white px-3" value={branchId} onChange={(event) => setBranchId(event.target.value)}>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
        <label className="grid gap-1 text-sm font-bold text-slate-700">Semana iniciando em<input type="date" className="min-h-11 rounded-xl border border-slate-200 bg-white px-3" value={weekStart} onChange={(event) => setWeekStart(event.target.value)} /></label>
        <StatCard label="Turnos atribuídos" value={assigned} hint="Células com jornada" />
        <StatCard label="Folgas definidas" value={daysOff} tone="slate" />
      </div>
      {error ? <p className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-800">{error}</p> : null}
      {message ? <p className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-800">{message}</p> : null}

      <Card className="overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4">
          <div><h2 className="flex items-center gap-2 text-lg font-black text-slate-950"><CalendarDays className="h-5 w-5 text-brand-700" /> {payload?.branch.name || "Escala semanal"}</h2><p className="text-sm text-slate-500">{weekStart} a {weekEnd} · {payload?.publication?.status ? `Versão ${payload.publication.status}` : "Nova versão"}</p></div>
          <div className="flex flex-wrap gap-2"><Button variant="ghost" onClick={() => void load()} disabled={loading}>Atualizar</Button><Button variant="ghost" loading={saving} onClick={() => void save(false)}><Save className="h-4 w-4" />Salvar rascunho</Button><Button loading={saving} onClick={() => void save(true)}><Send className="h-4 w-4" />Publicar</Button></div>
        </div>
        {loading ? <div className="grid min-h-56 place-items-center text-sm font-bold text-slate-500">Carregando planejamento...</div> : null}
        {!loading && payload ? (
          <>
            <div className="grid gap-4 p-4 lg:hidden">
              <div className="grid grid-cols-7 gap-1 rounded-2xl bg-slate-100 p-1" role="tablist" aria-label="Dias da semana">
                {days.map((date, index) => (
                  <button
                    key={date}
                    type="button"
                    role="tab"
                    aria-selected={mobileDayIndex === index}
                    className={`min-h-12 rounded-xl px-1 text-[10px] font-black uppercase leading-tight transition ${mobileDayIndex === index ? "bg-white text-brand-800 shadow-sm" : "text-slate-500"}`}
                    onClick={() => setMobileDayIndex(index)}
                  >
                    {new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`))}
                  </button>
                ))}
              </div>
              <div className="rounded-2xl border border-brand-100 bg-brand-50/60 p-3">
                <p className="text-xs font-black uppercase tracking-wider text-brand-700">Dia selecionado</p>
                <p className="mt-1 font-black text-slate-950">{weekDay.format(new Date(`${days[mobileDayIndex]}T00:00:00Z`))}</p>
                <p className="mt-1 text-xs text-slate-600">Defina o turno de cada pessoa sem precisar mover uma tabela lateralmente.</p>
              </div>
              <div className="grid gap-3">
                {payload.employees.map((employee) => {
                  const date = days[mobileDayIndex];
                  const cell = cells[`${employee.id}:${date}`];
                  const value = cell?.is_day_off ? "off" : cell?.shift_template_id || "";
                  const template = payload.templates.find((item) => item.id === cell?.shift_template_id);
                  return (
                    <article key={employee.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="mb-3 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-black text-slate-950">{employee.full_name}</p>
                          <p className="truncate text-xs font-semibold text-slate-500">{employee.role}{employee.sector ? ` · ${employee.sector}` : ""}</p>
                        </div>
                        <Badge tone={cell?.is_day_off ? "blue" : template ? "green" : "neutral"}>{cell?.is_day_off ? "Folga" : template ? template.name : "Pendente"}</Badge>
                      </div>
                      <label className="grid gap-1.5 text-sm font-bold text-slate-700">
                        Turno do dia
                        <select
                          aria-label={`Turno de ${employee.full_name} em ${date}`}
                          className="min-h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 focus:border-brand-500 focus:ring-4 focus:ring-brand-100"
                          value={value}
                          onChange={(event) => setCell(employee.id, date, event.target.value)}
                        >
                          <option value="">Não definido</option>
                          <option value="off">Folga</option>
                          {payload.templates.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.starts_at.slice(0,5)}–{item.ends_at.slice(0,5)}</option>)}
                        </select>
                      </label>
                      {mobileDayIndex === 0 ? <button type="button" className="mt-3 inline-flex min-h-10 items-center gap-1 rounded-xl px-2 text-xs font-black text-brand-700" onClick={() => copyFirstDay(employee.id)}><Copy className="h-3.5 w-3.5" />Copiar este turno para a semana</button> : null}
                    </article>
                  );
                })}
              </div>
            </div>
            <div className="hidden overflow-x-auto lg:block">
              <div className="min-w-[980px]">
                <div className="grid grid-cols-[240px_repeat(7,minmax(105px,1fr))] border-b border-slate-200 bg-slate-50">
                  <div className="p-3 text-xs font-black uppercase tracking-wider text-slate-500">Funcionário</div>
                  {days.map((date) => <div key={date} className="border-l border-slate-200 p-3 text-center text-xs font-black uppercase text-slate-600">{weekDay.format(new Date(`${date}T00:00:00Z`))}</div>)}
                </div>
                {payload.employees.map((employee) => (
                  <div key={employee.id} className="grid grid-cols-[240px_repeat(7,minmax(105px,1fr))] border-b border-slate-100 last:border-0">
                    <div className="sticky left-0 z-10 border-r border-slate-200 bg-white p-3"><p className="truncate text-sm font-black text-slate-900">{employee.full_name}</p><p className="truncate text-xs text-slate-500">{employee.role}{employee.sector ? ` · ${employee.sector}` : ""}</p><button className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-brand-700" onClick={() => copyFirstDay(employee.id)}><Copy className="h-3 w-3" />Copiar segunda</button></div>
                    {days.map((date) => { const cell = cells[`${employee.id}:${date}`]; const value = cell?.is_day_off ? "off" : cell?.shift_template_id || ""; return <div key={date} className="border-l border-slate-100 p-2"><select aria-label={`Turno de ${employee.full_name} em ${date}`} className="min-h-10 w-full rounded-xl border border-slate-200 bg-white px-2 text-xs font-bold text-slate-700" value={value} onChange={(event) => setCell(employee.id, date, event.target.value)}><option value="">Não definido</option><option value="off">Folga</option>{payload.templates.map((template) => <option key={template.id} value={template.id}>{template.name} · {template.starts_at.slice(0,5)}–{template.ends_at.slice(0,5)}</option>)}</select></div>; })}
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : null}
        {!loading && payload && !payload.employees.length ? <div className="grid min-h-48 place-items-center p-8 text-center"><div><Users className="mx-auto h-10 w-10 text-slate-300" /><p className="mt-3 font-black text-slate-700">Nenhum funcionário ativo nesta filial.</p></div></div> : null}
      </Card>
      {payload?.validationIssues?.length ? <Card className="mt-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-black text-slate-950">Validação de cobertura e conflitos</h2><p className="text-sm text-slate-500">Pendências bloqueantes impedem a publicação, mas o rascunho é preservado.</p></div><Badge tone={payload.validationIssues.some((item) => item.severity === "blocking") ? "red" : "yellow"}>{payload.validationIssues.length} pendência(s)</Badge></div>
        <div className="mt-4 grid gap-2 md:grid-cols-2">{payload.validationIssues.map((item) => <div key={item.id} className={`rounded-2xl border p-3 ${item.severity === "blocking" ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50"}`}><div className="flex items-start gap-2"><ShieldAlert className={`mt-0.5 h-4 w-4 shrink-0 ${item.severity === "blocking" ? "text-red-600" : "text-amber-600"}`} /><div><p className="text-sm font-black text-slate-900">{item.message}</p><p className="mt-1 text-xs font-semibold text-slate-500">{item.issue_code}{item.work_date ? ` · ${item.work_date}` : ""}</p></div></div></div>)}</div>
      </Card> : null}
      <div className="mt-4 flex flex-wrap gap-2 text-xs font-bold text-slate-600"><Badge tone="green"><CheckCircle2 className="mr-1 inline h-3 w-3" />Publicação versionada</Badge><Badge tone="blue">Competência fechada protegida</Badge><Badge tone="yellow">Conflitos bloqueiam publicação</Badge></div>
    </AdminShell>
  );
}
