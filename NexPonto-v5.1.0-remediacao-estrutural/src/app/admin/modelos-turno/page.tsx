"use client";

import { Clock3, Plus, Trash2 } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, SectionTitle } from "@/components/ui/card";
import { adminFetch } from "@/lib/client/admin-api";

interface Branch { id: string; name: string }
interface Interval { interval_type: string; sequence: number; planned_start: string | null; expected_minutes: number; minimum_minutes: number; maximum_minutes: number | null; paid: boolean; required: boolean; requires_clock: boolean; tolerance_minutes: number }
interface Template { id: string; branch_id: string | null; name: string; code: string | null; role: string | null; sector: string | null; starts_at: string; ends_at: string; crosses_midnight: boolean; expected_daily_minutes: number; color: string; shift_template_intervals?: Interval[] }
interface TemplateForm { id: string; branch_id: string; name: string; code: string; role: string; sector: string; starts_at: string; ends_at: string; crosses_midnight: boolean; expected_daily_minutes: number; color: string; intervals: Interval[] }

const emptyInterval = (sequence = 1): Interval => ({ interval_type: "meal", sequence, planned_start: "12:00", expected_minutes: 60, minimum_minutes: 30, maximum_minutes: 120, paid: false, required: true, requires_clock: true, tolerance_minutes: 10 });
const emptyForm: TemplateForm = { id: "", branch_id: "", name: "", code: "", role: "", sector: "", starts_at: "08:00", ends_at: "17:00", crosses_midnight: false, expected_daily_minutes: 480, color: "#1268F3", intervals: [emptyInterval()] };

export default function ShiftTemplatesPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    const [branchData, templateData] = await Promise.all([
      adminFetch<{ branches: Branch[] }>("/api/admin/branches?status=active"),
      adminFetch<{ templates: Template[] }>("/api/admin/schedules/templates")
    ]);
    setBranches(branchData.branches || []);
    setTemplates(templateData.templates || []);
  }
  useEffect(() => { void load().catch((cause: Error) => setError(cause.message)); }, []);

  const calculatedMinutes = useMemo(() => {
    const [startHour, startMinute] = form.starts_at.split(":").map(Number);
    const [endHour, endMinute] = form.ends_at.split(":").map(Number);
    let span = endHour * 60 + endMinute - (startHour * 60 + startMinute);
    if (form.crosses_midnight) span += 1440;
    const unpaid = form.intervals.filter((interval) => !interval.paid).reduce((sum, interval) => sum + Number(interval.expected_minutes || 0), 0);
    return span - unpaid;
  }, [form.starts_at, form.ends_at, form.crosses_midnight, form.intervals]);

  async function submit(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError(""); setMessage("");
    try {
      await adminFetch("/api/admin/schedules/templates", { method: "POST", body: JSON.stringify({ ...form, id: form.id || null, branch_id: form.branch_id || null }) });
      setMessage("Modelo de turno salvo e validado."); setForm(emptyForm); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Erro ao salvar modelo."); }
    finally { setSaving(false); }
  }

  function edit(template: Template) {
    setForm({
      id: template.id, branch_id: template.branch_id || "", name: template.name, code: template.code || "", role: template.role || "", sector: template.sector || "",
      starts_at: template.starts_at.slice(0,5), ends_at: template.ends_at.slice(0,5), crosses_midnight: template.crosses_midnight,
      expected_daily_minutes: template.expected_daily_minutes, color: template.color || "#1268F3", intervals: template.shift_template_intervals?.length ? template.shift_template_intervals : [emptyInterval()]
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function deactivate(id: string) {
    if (!window.confirm("Desativar este modelo? Escalas já publicadas manterão o histórico.")) return;
    await adminFetch(`/api/admin/schedules/templates?id=${id}`, { method: "DELETE" });
    await load();
  }

  return <AdminShell>
    <SectionTitle title="Modelos de turno" description="Padronize entrada, saída, turnos noturnos e múltiplos intervalos. O sistema valida a carga diária antes de salvar." />
    {error ? <p className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-800">{error}</p> : null}
    {message ? <p className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-800">{message}</p> : null}
    <div className="grid gap-5 xl:grid-cols-[420px_1fr]">
      <Card><form className="grid gap-3" onSubmit={submit}>
        <h2 className="text-lg font-black text-slate-950">{form.id ? "Editar modelo" : "Novo modelo"}</h2>
        <label className="grid gap-1 text-sm font-bold">Nome<input className="min-h-11 rounded-xl border border-slate-200 px-3" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
        <div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-sm font-bold">Código<input className="min-h-11 rounded-xl border border-slate-200 px-3" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></label><label className="grid gap-1 text-sm font-bold">Filial<select className="min-h-11 rounded-xl border border-slate-200 px-3" value={form.branch_id} onChange={(e) => setForm({ ...form, branch_id: e.target.value })}><option value="">Todas</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label></div>
        <div className="grid grid-cols-2 gap-3"><label className="grid gap-1 text-sm font-bold">Entrada<input type="time" className="min-h-11 rounded-xl border border-slate-200 px-3" value={form.starts_at} onChange={(e) => setForm({ ...form, starts_at: e.target.value })} /></label><label className="grid gap-1 text-sm font-bold">Saída<input type="time" className="min-h-11 rounded-xl border border-slate-200 px-3" value={form.ends_at} onChange={(e) => setForm({ ...form, ends_at: e.target.value })} /></label></div>
        <label className="flex min-h-11 items-center gap-3 rounded-xl border border-slate-200 px-3 text-sm font-bold"><input type="checkbox" checked={form.crosses_midnight} onChange={(e) => setForm({ ...form, crosses_midnight: e.target.checked })} />Atravessa a meia-noite</label>
        <div className="grid grid-cols-2 gap-3"><label className="grid gap-1 text-sm font-bold">Carga diária<input type="number" className="min-h-11 rounded-xl border border-slate-200 px-3" value={form.expected_daily_minutes} onChange={(e) => setForm({ ...form, expected_daily_minutes: Number(e.target.value) })} /></label><div className={`rounded-xl border p-3 text-sm font-black ${calculatedMinutes === form.expected_daily_minutes ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>Calculado<br />{calculatedMinutes} min</div></div>
        <div className="grid gap-2"><div className="flex items-center justify-between"><p className="text-sm font-black">Intervalos</p><Button size="sm" variant="ghost" onClick={() => setForm({ ...form, intervals: [...form.intervals, emptyInterval(form.intervals.length + 1)] })}><Plus className="h-4 w-4" />Adicionar</Button></div>{form.intervals.map((interval, index) => <div key={index} className="grid gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-3"><div className="grid grid-cols-2 gap-2"><label className="grid gap-1 text-xs font-bold">Início previsto<input type="time" className="min-h-10 rounded-lg border border-slate-200 px-2" value={interval.planned_start || ""} onChange={(e) => { const intervals = [...form.intervals]; intervals[index] = { ...interval, planned_start: e.target.value }; setForm({ ...form, intervals }); }} /></label><label className="grid gap-1 text-xs font-bold">Duração (min)<input type="number" className="min-h-10 rounded-lg border border-slate-200 px-2" value={interval.expected_minutes} onChange={(e) => { const intervals = [...form.intervals]; intervals[index] = { ...interval, expected_minutes: Number(e.target.value) }; setForm({ ...form, intervals }); }} /></label></div><div className="flex flex-wrap items-center gap-3 text-xs font-bold"><label><input type="checkbox" checked={interval.paid} onChange={(e) => { const intervals = [...form.intervals]; intervals[index] = { ...interval, paid: e.target.checked }; setForm({ ...form, intervals }); }} /> Remunerado</label><label><input type="checkbox" checked={interval.requires_clock} onChange={(e) => { const intervals = [...form.intervals]; intervals[index] = { ...interval, requires_clock: e.target.checked }; setForm({ ...form, intervals }); }} /> Exige marcação</label>{form.intervals.length > 1 ? <button type="button" className="ml-auto text-red-700" onClick={() => setForm({ ...form, intervals: form.intervals.filter((_, itemIndex) => itemIndex !== index).map((item, itemIndex) => ({ ...item, sequence: itemIndex + 1 })) })}><Trash2 className="h-4 w-4" /></button> : null}</div></div>)}</div>
        <Button type="submit" loading={saving} disabled={calculatedMinutes !== form.expected_daily_minutes}>{form.id ? "Salvar alterações" : "Criar modelo"}</Button>
      </form></Card>
      <div className="grid content-start gap-3">{templates.map((template) => <Card key={template.id} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex min-w-0 items-start gap-3"><div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl" style={{ backgroundColor: `${template.color}1A`, color: template.color }}><Clock3 className="h-5 w-5" /></div><div className="min-w-0"><h3 className="truncate font-black text-slate-950">{template.name}</h3><p className="text-sm font-semibold text-slate-600">{template.starts_at.slice(0,5)}–{template.ends_at.slice(0,5)} · {template.expected_daily_minutes} min</p><div className="mt-2 flex flex-wrap gap-2"><Badge tone="blue">{template.shift_template_intervals?.length || 0} intervalo(s)</Badge>{template.crosses_midnight ? <Badge tone="yellow">Turno noturno</Badge> : null}</div></div></div><div className="flex gap-2"><Button size="sm" variant="ghost" onClick={() => edit(template)}>Editar</Button><Button size="sm" variant="danger" onClick={() => void deactivate(template.id)}>Desativar</Button></div></Card>)}{!templates.length ? <Card className="grid min-h-44 place-items-center text-center text-sm font-bold text-slate-500">Nenhum modelo cadastrado.</Card> : null}</div>
    </div>
  </AdminShell>;
}
