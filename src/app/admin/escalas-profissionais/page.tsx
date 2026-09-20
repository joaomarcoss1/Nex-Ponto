"use client";

import { CalendarRange, CheckCircle2, Layers3, Plus, ShieldAlert, UsersRound } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClassName } from "@/components/ui/button";
import { Card, SectionTitle, StatCard } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { MobileCardList, DesktopTableShell } from "@/components/ui/mobile";
import { ToastMessage } from "@/components/ui/feedback";
import { adminFetch } from "@/lib/client/admin-api";

type Branch = { id: string; name: string };
type Template = { id: string; name: string; starts_at: string; ends_at: string; color: string | null };
type CycleDay = { id?: string; day_index: number; shift_template_id: string | null; is_day_off: boolean; notes?: string | null };
type Cycle = { id: string; name: string; code: string | null; cycle_type: string; cycle_length_days: number; description: string | null; validation_policy: string; effective_from: string; effective_until: string | null; schedule_cycle_days: CycleDay[] };
type Employee = { id: string; full_name: string; registration_code: string | null; branch_id: string; role: string; sector: string | null };
type Assignment = { id: string; employee_id: string; cycle_id: string; effective_from: string; employees?: { full_name?: string } | null; schedule_cycles?: { name?: string; cycle_type?: string } | null };
type Coverage = { id: string; branch_id: string; sector: string | null; role: string | null; weekday: number | null; specific_date: string | null; starts_at: string; ends_at: string; minimum_people: number; maximum_people: number | null; publish_policy: "block" | "justify" | "warn"; active: boolean };
type CyclePayload = { cycles: Cycle[]; templates: Template[]; assignments: Assignment[]; employees: Employee[] };

const weekdayLabels = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const cyclePresets: Record<string, { length: number; workIndexes: number[] }> = {
  "5x2": { length: 7, workIndexes: [0, 1, 2, 3, 4] },
  "6x1": { length: 7, workIndexes: [0, 1, 2, 3, 4, 5] },
  "12x36": { length: 2, workIndexes: [0] },
  week_ab: { length: 14, workIndexes: [0, 1, 2, 3, 4, 7, 8, 9, 10, 11] },
  rotating_sundays: { length: 14, workIndexes: [0, 1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 12, 13] },
  custom: { length: 7, workIndexes: [0, 1, 2, 3, 4] },
};

function defaultDays(type: string, templateId: string): CycleDay[] {
  const preset = cyclePresets[type] || cyclePresets.custom;
  return Array.from({ length: preset.length }, (_, dayIndex) => ({ day_index: dayIndex, shift_template_id: preset.workIndexes.includes(dayIndex) ? templateId || null : null, is_day_off: !preset.workIndexes.includes(dayIndex), notes: null }));
}

export default function ProfessionalSchedulesPageV51() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState("");
  const [payload, setPayload] = useState<CyclePayload>({ cycles: [], templates: [], assignments: [], employees: [] });
  const [coverage, setCoverage] = useState<Coverage[]>([]);
  const [tab, setTab] = useState<"cycles" | "coverage" | "assignments">("cycles");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const firstTemplate = payload.templates[0]?.id || "";
  const [cycleForm, setCycleForm] = useState({ name: "Escala 5x2", code: "5X2", cycle_type: "5x2", description: "Cinco dias trabalhados e dois dias de folga.", effective_from: new Date().toISOString().slice(0, 10), effective_until: "", validation_policy: "block", days: [] as CycleDay[] });
  const [assignmentForm, setAssignmentForm] = useState({ employee_id: "", cycle_id: "", cycle_start_date: new Date().toISOString().slice(0, 10), effective_from: new Date().toISOString().slice(0, 10), effective_until: "" });
  const [coverageForm, setCoverageForm] = useState({ sector: "", role: "", weekday: "1", specific_date: "", starts_at: "08:00", ends_at: "18:00", minimum_people: "1", maximum_people: "", publish_policy: "block", effective_from: new Date().toISOString().slice(0, 10), effective_until: "", notes: "" });

  useEffect(() => {
    adminFetch<{ branches: Branch[] }>("/api/admin/options/branches?status=active&v=51").then((data) => {
      setBranches(data.branches || []);
      setBranchId((current) => current || data.branches?.[0]?.id || "");
    }).catch((cause) => setError(cause instanceof Error ? cause.message : "Erro ao carregar filiais."));
  }, []);

  const load = useCallback(async () => {
    if (!branchId) return;
    setLoading(true);
    setError("");
    try {
      const [cycleData, coverageData] = await Promise.all([
        adminFetch<CyclePayload>(`/api/admin/schedules/cycles?branchId=${branchId}`),
        adminFetch<{ requirements: Coverage[] }>(`/api/admin/schedules/coverage?branchId=${branchId}`),
      ]);
      setPayload(cycleData);
      setCoverage(coverageData.requirements || []);
      setCycleForm((current) => current.days.length ? current : { ...current, days: defaultDays(current.cycle_type, cycleData.templates?.[0]?.id || "") });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Erro ao carregar escalas profissionais.");
    } finally { setLoading(false); }
  }, [branchId]);

  useEffect(() => { void load(); }, [load]);

  function changeCycleType(type: string) {
    const label = type === "week_ab" ? "Semana A/B" : type === "rotating_sundays" ? "Rodízio de domingos" : type.toUpperCase();
    setCycleForm((current) => ({ ...current, cycle_type: type, name: current.name || label, code: type.replace("_", "-").toUpperCase(), days: defaultDays(type, firstTemplate) }));
  }

  function updateCycleDay(index: number, value: string) {
    setCycleForm((current) => ({ ...current, days: current.days.map((day) => day.day_index === index ? { ...day, is_day_off: value === "off", shift_template_id: value === "off" ? null : value || null } : day) }));
  }

  async function saveCycle() {
    setLoading(true); setError(""); setMessage("");
    try {
      await adminFetch("/api/admin/schedules/cycles", { method: "POST", body: JSON.stringify({ ...cycleForm, effective_until: cycleForm.effective_until || null, configuration: { generated_from_preset: cycleForm.cycle_type }, days: cycleForm.days }) });
      setMessage("Ciclo versionado salvo com auditoria.");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Erro ao salvar ciclo."); }
    finally { setLoading(false); }
  }

  async function assignCycle() {
    if (!assignmentForm.employee_id || !assignmentForm.cycle_id) return setError("Selecione funcionário e ciclo.");
    setLoading(true); setError(""); setMessage("");
    try {
      await adminFetch("/api/admin/schedules/cycles", { method: "PATCH", body: JSON.stringify({ ...assignmentForm, branch_id: branchId, effective_until: assignmentForm.effective_until || null }) });
      setMessage("Ciclo atribuído sem alterar o histórico anterior.");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Erro ao atribuir ciclo."); }
    finally { setLoading(false); }
  }

  async function saveCoverage() {
    setLoading(true); setError(""); setMessage("");
    try {
      await adminFetch("/api/admin/schedules/coverage", { method: "POST", body: JSON.stringify({ ...coverageForm, branch_id: branchId, sector: coverageForm.sector || null, role: coverageForm.role || null, weekday: coverageForm.specific_date ? null : Number(coverageForm.weekday), specific_date: coverageForm.specific_date || null, minimum_people: Number(coverageForm.minimum_people), maximum_people: coverageForm.maximum_people ? Number(coverageForm.maximum_people) : null, effective_until: coverageForm.effective_until || null }) });
      setMessage("Cobertura operacional salva. A publicação respeitará a política selecionada.");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Erro ao salvar cobertura."); }
    finally { setLoading(false); }
  }

  async function deactivateCoverage(id: string) {
    setLoading(true);
    try { await adminFetch("/api/admin/schedules/coverage", { method: "DELETE", body: JSON.stringify({ id }) }); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Erro ao desativar cobertura."); }
    finally { setLoading(false); }
  }

  const blockingCoverage = useMemo(() => coverage.filter((item) => item.publish_policy === "block").length, [coverage]);

  return (
    <AdminShell>
      <div className="space-y-4 pb-28 md:pb-8">
        <SectionTitle title="Escalas profissionais" description="Ciclos 5x2, 6x1, 12x36, semana A/B, rodízio, cobertura mínima e atribuições com vigência. Regras legais permanecem parametrizadas e aguardam homologação quando aplicável." />
        {message ? <ToastMessage type="success">{message}</ToastMessage> : null}
        {error ? <ToastMessage type="error">{error}</ToastMessage> : null}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Field label="Filial"><Select value={branchId} onChange={(event) => setBranchId(event.target.value)}>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</Select></Field>
          <StatCard label="Ciclos ativos" value={payload.cycles.length} tone="blue" />
          <StatCard label="Atribuições" value={payload.assignments.length} tone="green" />
          <StatCard label="Coberturas bloqueantes" value={blockingCoverage} tone={blockingCoverage ? "yellow" : "green"} />
        </div>

        <div className="flex gap-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2">
          {([['cycles','Ciclos',Layers3],['coverage','Cobertura',UsersRound],['assignments','Atribuições',CalendarRange]] as const).map(([key,label,Icon]) => <button key={key} type="button" onClick={() => setTab(key)} className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-4 text-sm font-black transition ${tab === key ? "bg-brand-600 text-white shadow-lg" : "text-slate-600 hover:bg-slate-50"}`}><Icon className="h-4 w-4" />{label}</button>)}
          <Link href="/admin/planejamento-escalas" className={buttonClassName({ variant: "ghost", size: "md", className: "ml-auto shrink-0" })}>Abrir planejador semanal</Link>
        </div>

        {tab === "cycles" ? <div className="grid gap-4 xl:grid-cols-[430px_1fr]">
          <Card>
            <h2 className="text-lg font-black text-slate-950">Configurar ciclo</h2>
            <div className="mt-4 grid gap-3">
              <div className="grid gap-3 sm:grid-cols-2"><Field label="Nome"><Input value={cycleForm.name} onChange={(event) => setCycleForm((current) => ({ ...current, name: event.target.value }))} /></Field><Field label="Código"><Input value={cycleForm.code} onChange={(event) => setCycleForm((current) => ({ ...current, code: event.target.value }))} /></Field></div>
              <Field label="Tipo"><Select value={cycleForm.cycle_type} onChange={(event) => changeCycleType(event.target.value)}><option value="5x2">5x2</option><option value="6x1">6x1</option><option value="12x36">12x36 parametrizável</option><option value="week_ab">Semana A/B</option><option value="rotating_sundays">Rodízio de domingos</option><option value="custom">Personalizado</option></Select></Field>
              <Field label="Descrição"><Textarea value={cycleForm.description} onChange={(event) => setCycleForm((current) => ({ ...current, description: event.target.value }))} /></Field>
              <div className="grid grid-cols-2 gap-3"><Field label="Vigência inicial"><Input type="date" value={cycleForm.effective_from} onChange={(event) => setCycleForm((current) => ({ ...current, effective_from: event.target.value }))} /></Field><Field label="Vigência final"><Input type="date" value={cycleForm.effective_until} onChange={(event) => setCycleForm((current) => ({ ...current, effective_until: event.target.value }))} /></Field></div>
              <Field label="Política de validação"><Select value={cycleForm.validation_policy} onChange={(event) => setCycleForm((current) => ({ ...current, validation_policy: event.target.value }))}><option value="block">Bloquear publicação</option><option value="justify">Permitir com justificativa</option><option value="warn">Apenas alertar</option></Select></Field>
              <div className="max-h-[420px] space-y-2 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 p-3">{cycleForm.days.map((day) => <label key={day.day_index} className="grid grid-cols-[72px_1fr] items-center gap-3 rounded-xl bg-white p-2 text-sm font-bold"><span>Dia {day.day_index + 1}</span><select className="min-h-10 rounded-xl border border-slate-200 px-2" value={day.is_day_off ? "off" : day.shift_template_id || ""} onChange={(event) => updateCycleDay(day.day_index,event.target.value)}><option value="">Não definido</option><option value="off">Folga</option>{payload.templates.map((template) => <option key={template.id} value={template.id}>{template.name} · {template.starts_at.slice(0,5)}–{template.ends_at.slice(0,5)}</option>)}</select></label>)}</div>
              <Button loading={loading} onClick={saveCycle}><Plus className="h-4 w-4" /> Salvar ciclo versionado</Button>
            </div>
          </Card>
          <div className="space-y-3">{payload.cycles.map((cycle) => <Card key={cycle.id}><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><h3 className="font-black text-slate-950">{cycle.name}</h3><Badge tone="blue">{cycle.cycle_type}</Badge></div><p className="mt-1 text-sm text-slate-500">{cycle.description || "Sem descrição"}</p></div><Badge tone={cycle.validation_policy === "block" ? "red" : cycle.validation_policy === "justify" ? "yellow" : "green"}>{cycle.validation_policy === "block" ? "Bloqueante" : cycle.validation_policy === "justify" ? "Exige justificativa" : "Alerta"}</Badge></div><div className="mt-4 flex gap-1 overflow-x-auto pb-1">{[...(cycle.schedule_cycle_days || [])].sort((a,b)=>a.day_index-b.day_index).map((day) => <div key={day.day_index} className={`grid h-16 min-w-16 place-items-center rounded-xl border text-center text-[10px] font-black ${day.is_day_off ? "border-slate-200 bg-slate-100 text-slate-500" : "border-brand-200 bg-brand-50 text-brand-800"}`}><span>Dia {day.day_index+1}<br/>{day.is_day_off ? "Folga" : "Turno"}</span></div>)}</div></Card>)}{!payload.cycles.length ? <Card><p className="text-center text-sm font-semibold text-slate-500">Nenhum ciclo cadastrado.</p></Card> : null}</div>
        </div> : null}

        {tab === "coverage" ? <div className="grid gap-4 xl:grid-cols-[430px_1fr]">
          <Card><h2 className="text-lg font-black text-slate-950">Regra de cobertura</h2><div className="mt-4 grid gap-3"><div className="grid gap-3 sm:grid-cols-2"><Field label="Setor"><Input value={coverageForm.sector} onChange={(event)=>setCoverageForm((current)=>({...current,sector:event.target.value}))} placeholder="Opcional" /></Field><Field label="Cargo"><Input value={coverageForm.role} onChange={(event)=>setCoverageForm((current)=>({...current,role:event.target.value}))} placeholder="Opcional" /></Field></div><div className="grid gap-3 sm:grid-cols-2"><Field label="Dia da semana"><Select value={coverageForm.weekday} onChange={(event)=>setCoverageForm((current)=>({...current,weekday:event.target.value}))}>{weekdayLabels.map((label,index)=><option key={label} value={index}>{label}</option>)}</Select></Field><Field label="Data específica"><Input type="date" value={coverageForm.specific_date} onChange={(event)=>setCoverageForm((current)=>({...current,specific_date:event.target.value}))} /></Field></div><div className="grid grid-cols-2 gap-3"><Field label="Início"><Input type="time" value={coverageForm.starts_at} onChange={(event)=>setCoverageForm((current)=>({...current,starts_at:event.target.value}))} /></Field><Field label="Fim"><Input type="time" value={coverageForm.ends_at} onChange={(event)=>setCoverageForm((current)=>({...current,ends_at:event.target.value}))} /></Field></div><div className="grid grid-cols-2 gap-3"><Field label="Mínimo"><Input type="number" min="0" value={coverageForm.minimum_people} onChange={(event)=>setCoverageForm((current)=>({...current,minimum_people:event.target.value}))} /></Field><Field label="Máximo"><Input type="number" min="0" value={coverageForm.maximum_people} onChange={(event)=>setCoverageForm((current)=>({...current,maximum_people:event.target.value}))} /></Field></div><Field label="Política"><Select value={coverageForm.publish_policy} onChange={(event)=>setCoverageForm((current)=>({...current,publish_policy:event.target.value}))}><option value="block">Bloquear publicação</option><option value="justify">Permitir com justificativa</option><option value="warn">Apenas alertar</option></Select></Field><Button loading={loading} onClick={saveCoverage}><Plus className="h-4 w-4" />Adicionar cobertura</Button></div></Card>
          <div className="space-y-3"><MobileCardList>{coverage.map((item)=><article key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-black text-slate-950">{item.specific_date || weekdayLabels[item.weekday ?? 0]}</p><p className="text-xs font-semibold text-slate-500">{item.starts_at.slice(0,5)}–{item.ends_at.slice(0,5)} · {item.sector || "Todos os setores"} · {item.role || "Todos os cargos"}</p></div><Badge tone={item.publish_policy==='block'?'red':item.publish_policy==='justify'?'yellow':'green'}>{item.minimum_people} mínimo</Badge></div><Button className="mt-3 w-full" variant="ghost" size="sm" onClick={()=>deactivateCoverage(item.id)}>Desativar</Button></article>)}</MobileCardList><DesktopTableShell><Card className="overflow-x-auto p-0"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">Dia</th><th className="p-3">Faixa</th><th className="p-3">Escopo</th><th className="p-3">Mínimo</th><th className="p-3">Política</th><th className="p-3"></th></tr></thead><tbody>{coverage.map((item)=><tr key={item.id} className="border-t border-slate-100"><td className="p-3 font-bold">{item.specific_date || weekdayLabels[item.weekday ?? 0]}</td><td className="p-3">{item.starts_at.slice(0,5)}–{item.ends_at.slice(0,5)}</td><td className="p-3">{item.sector || "Todos"} · {item.role || "Todos"}</td><td className="p-3 font-black">{item.minimum_people}</td><td className="p-3"><Badge tone={item.publish_policy==='block'?'red':item.publish_policy==='justify'?'yellow':'green'}>{item.publish_policy}</Badge></td><td className="p-3 text-right"><Button variant="ghost" size="sm" onClick={()=>deactivateCoverage(item.id)}>Desativar</Button></td></tr>)}</tbody></table></Card></DesktopTableShell>{!coverage.length?<Card><p className="text-center text-sm font-semibold text-slate-500">Nenhuma regra de cobertura cadastrada.</p></Card>:null}</div>
        </div> : null}

        {tab === "assignments" ? <div className="grid gap-4 xl:grid-cols-[430px_1fr]">
          <Card><h2 className="text-lg font-black text-slate-950">Atribuir ciclo</h2><div className="mt-4 grid gap-3"><Field label="Funcionário"><Select value={assignmentForm.employee_id} onChange={(event)=>setAssignmentForm((current)=>({...current,employee_id:event.target.value}))}><option value="">Selecione</option>{payload.employees.map((employee)=><option key={employee.id} value={employee.id}>{employee.full_name} · {employee.role}</option>)}</Select></Field><Field label="Ciclo"><Select value={assignmentForm.cycle_id} onChange={(event)=>setAssignmentForm((current)=>({...current,cycle_id:event.target.value}))}><option value="">Selecione</option>{payload.cycles.map((cycle)=><option key={cycle.id} value={cycle.id}>{cycle.name}</option>)}</Select></Field><div className="grid grid-cols-2 gap-3"><Field label="Início do ciclo"><Input type="date" value={assignmentForm.cycle_start_date} onChange={(event)=>setAssignmentForm((current)=>({...current,cycle_start_date:event.target.value}))}/></Field><Field label="Vigência"><Input type="date" value={assignmentForm.effective_from} onChange={(event)=>setAssignmentForm((current)=>({...current,effective_from:event.target.value}))}/></Field></div><Button loading={loading} onClick={assignCycle}><CalendarRange className="h-4 w-4" />Atribuir com vigência</Button></div></Card>
          <div className="grid gap-3 md:grid-cols-2">{payload.assignments.map((assignment)=><Card key={assignment.id}><div className="flex items-start gap-3"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-brand-100 text-brand-700"><CheckCircle2 className="h-5 w-5"/></span><div><p className="font-black text-slate-950">{assignment.employees?.full_name || assignment.employee_id.slice(0,8)}</p><p className="text-sm font-semibold text-slate-500">{assignment.schedule_cycles?.name || assignment.cycle_id.slice(0,8)}</p><p className="mt-1 text-xs text-slate-400">Vigente desde {assignment.effective_from}</p></div></div></Card>)}{!payload.assignments.length?<Card><ShieldAlert className="mx-auto h-8 w-8 text-slate-300"/><p className="mt-2 text-center text-sm font-semibold text-slate-500">Nenhuma atribuição ativa.</p></Card>:null}</div>
        </div> : null}
      </div>
    </AdminShell>
  );
}
