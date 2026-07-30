"use client";

import { Building2, Edit3, MapPinned, Plus, QrCode, RefreshCw, Save, ShieldCheck, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { BranchMapEditor } from "@/components/admin/BranchMapEditor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, SectionTitle } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { adminFetch, downloadAdminPostFile } from "@/lib/client/admin-api";

const emptyForm = {
  code: "",
  name: "",
  type: "filial",
  timezone: "America/Fortaleza",
  responsible_name: "",
  phone: "",
  address: "",
  latitude: "",
  longitude: "",
  allowed_radius_meters: 250,
  google_maps_url: "",
  map_place_id: "",
  geofence_enabled: true,
  active: true
};

const weekdayLabels = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const defaultHours = weekdayLabels.map((_, weekday) => ({
  weekday,
  is_closed: weekday === 0,
  opens_at: weekday === 0 ? "" : "08:00",
  closes_at: weekday === 0 ? "" : "18:00",
  notes: ""
}));

export function BranchesPage() {
  const [branches, setBranches] = useState<any[]>([]);
  const [readiness, setReadiness] = useState<any[]>([]);
  const [form, setForm] = useState<Record<string, any>>(emptyForm);
  const [editing, setEditing] = useState<any | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [deactivateTarget, setDeactivateTarget] = useState<any | null>(null);
  const [hours, setHours] = useState<any[]>(defaultHours);
  const [hoursEffectiveFrom, setHoursEffectiveFrom] = useState(new Date().toISOString().slice(0, 10));

  async function load() {
    try {
      setLoading(true);
      const data = await adminFetch<any>(`/api/admin/branches${query ? `?q=${encodeURIComponent(query)}` : ""}`);
      setBranches(data.branches || []);
      adminFetch<any>("/api/admin/branches/readiness").then((readinessData) => setReadiness(readinessData.readiness || [])).catch(() => setReadiness([]));
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar filiais.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => branches, [branches]);

  function startCreate() {
    setEditing(null);
    setForm(emptyForm);
    setHours(defaultHours);
    setShowForm(true);
    setMessage("");
    setError("");
  }

  async function startEdit(branch: any) {
    setEditing(branch);
    setForm({ ...emptyForm, ...branch });
    try {
      const data = await adminFetch<any>(`/api/admin/branch-hours?branchId=${branch.id}`);
      const byDay = new Map((data.hours || []).map((item: any) => [Number(item.weekday), item]));
      setHours(defaultHours.map((item) => ({ ...item, ...(byDay.get(item.weekday) || {}) })));
    } catch {
      setHours(defaultHours);
    }
    setShowForm(true);
    setMessage("");
    setError("");
  }

  async function save() {
    try {
      setLoading(true);
      setError("");
      const payload = {
        ...form,
        latitude: Number(form.latitude),
        longitude: Number(form.longitude),
        allowed_radius_meters: form.allowed_radius_meters === "" || form.allowed_radius_meters === null || form.allowed_radius_meters === undefined ? 250 : Number(form.allowed_radius_meters),
        id: editing?.id
      };
      const result = await adminFetch<any>("/api/admin/branches", {
        method: editing ? "PUT" : "POST",
        body: JSON.stringify(payload)
      });
      const branchId = result.branch?.id || editing?.id;
      if (branchId) {
        await adminFetch("/api/admin/branch-hours", {
          method: "PUT",
          body: JSON.stringify({ branch_id: branchId, effective_from: hoursEffectiveFrom, reason: editing ? "Atualização da vigência e dos horários da filial" : "Configuração inicial dos horários da filial", hours })
        });
      }
      setMessage(editing ? "Filial atualizada com geolocalização." : "Filial cadastrada com geolocalização.");
      setShowForm(false);
      setEditing(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar filial.");
    } finally {
      setLoading(false);
    }
  }



  async function issueGpsValidation(branch: any) {
    try {
      setError("");
      const result = await adminFetch<any>("/api/admin/branches/gps-validation", {
        method: "POST",
        body: JSON.stringify({ branch_id: branch.id, validity_minutes: 15 }),
      });
      if (result.validation_url && navigator.clipboard) await navigator.clipboard.writeText(result.validation_url).catch(() => undefined);
      setMessage("Link presencial de GPS criado por 15 minutos e copiado quando permitido. Abra o link em um aparelho dentro da filial.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao iniciar validação presencial do GPS.");
    }
  }

  async function generateQr(branch: any) {
    try {
      setError("");
      const result = await adminFetch<any>("/api/admin/branch-qr", {
        method: "POST",
        body: JSON.stringify({ branch_id: branch.id, validity_hours: 12, replay_window_seconds: 30, format: "json" }),
      });
      if (result.clock_url && navigator.clipboard) await navigator.clipboard.writeText(result.clock_url).catch(() => undefined);
      setMessage("QR seguro gerado por 12 horas. O link foi copiado quando o navegador permitiu. O segredo é exibido somente nesta operação.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao gerar QR da filial.");
    }
  }

  async function downloadQr(branch: any) {
    try {
      setError("");
      await downloadAdminPostFile(
        "/api/admin/branch-qr",
        { branch_id: branch.id, validity_hours: 12, replay_window_seconds: 30, format: "pdf" },
        `qr-${branch.name}.pdf`,
      );
      setMessage("Novo QR rotativo gerado e baixado. O QR anterior foi revogado.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao baixar QR da filial.");
    }
  }

  async function deactivate(branch: any) {
    try {
      await adminFetch(`/api/admin/branches?id=${branch.id}`, { method: "DELETE" });
      setMessage("Filial desativada.");
      setDeactivateTarget(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao desativar filial.");
    }
  }

  return (
    <AdminShell>
      <SectionTitle title="Gestão de filiais" description="Configure unidades, horários com vigência, geofence, GPS presencial e QR rotativo para o ponto mobile." />
      {message ? <p className="mb-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-800">{message}</p> : null}
      {error ? <p className="mb-3 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-800">{error}</p> : null}


      <Card className="mb-4 border-brand-100 bg-gradient-to-br from-white to-brand-50/40">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-brand-700">Checklist operacional</p>
            <h2 className="text-xl font-black text-slate-950">Loja pronta para ponto</h2>
            <p className="text-sm font-semibold text-slate-600">Verifica GPS, geofence, funcionários, PIN, horário e remuneração antes de liberar o ponto nas unidades.</p>
          </div>
          <Button variant="secondary" onClick={load} loading={loading}><RefreshCw className="h-4 w-4" /> Atualizar checklist</Button>
        </div>
        <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-4">
          {readiness.map((item) => {
            const tone = item.readiness_status === "ready" ? "green" : item.readiness_status === "attention" ? "yellow" : "red";
            return (
              <article key={item.branch_id} className="rounded-[1.25rem] border border-slate-200 bg-white p-4 shadow-[0_12px_34px_rgba(15,23,42,0.05)]">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-base font-black text-slate-950">{item.branch_name}</h3>
                    <p className="text-xs font-bold text-slate-500">{item.employee_count} funcionário(s) • {item.progress}% concluído</p>
                  </div>
                  <Badge tone={tone as any}>{item.readiness_status === "ready" ? "Pronta" : item.readiness_status === "attention" ? "Atenção" : "Bloqueada"}</Badge>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100"><span className={`block h-full ${item.readiness_status === "ready" ? "bg-emerald-500" : item.readiness_status === "attention" ? "bg-amber-400" : "bg-red-500"}`} style={{ width: `${item.progress || 0}%` }} /></div>
                <div className="mt-3 grid gap-2">
                  {(item.checklist_items || []).filter((check: any) => !check.passed).slice(0, 4).map((check: any) => (
                    <div key={check.key} className="rounded-2xl bg-slate-50 p-2 text-xs font-bold text-slate-700">
                      <span className="block text-slate-950">{check.label}</span>
                      <span className="text-slate-500">{check.action}</span>
                    </div>
                  ))}
                  {(item.checklist_items || []).every((check: any) => check.passed) ? <p className="rounded-2xl bg-emerald-50 p-2 text-xs font-black text-emerald-800">Unidade pronta para ponto com GPS.</p> : null}
                </div>
              </article>
            );
          })}
          {!readiness.length ? <p className="rounded-2xl bg-slate-50 p-4 text-sm font-bold text-slate-500">Checklist ainda não carregado.</p> : null}
        </div>
      </Card>

      <div className="mb-4 flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
        <div className="grid w-full min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_auto] lg:max-w-xl">
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar filial" />
          <Button variant="ghost" onClick={load}><RefreshCw className="h-4 w-4" /> Atualizar</Button>
        </div>
        <Button onClick={startCreate}><Plus className="h-4 w-4" /> Nova unidade</Button>
      </div>

      {showForm ? (
        <Card className="mb-4">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-xl font-black text-slate-950">{editing ? "Editar unidade" : "Nova unidade"}</h2>
              <p className="text-sm font-semibold text-slate-600">Defina identidade, funcionamento e ponto central da unidade. O raio é validado a partir do marcador.</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}><X className="h-4 w-4" /> Fechar</Button>
          </div>
          <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
            <div className="grid content-start gap-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Código"><Input value={form.code || ""} onChange={(event) => setForm({ ...form, code: event.target.value })} placeholder="MATRIZ" /></Field>
                <Field label="Fuso horário">
                  <Select value={form.timezone || "America/Fortaleza"} onChange={(event) => setForm({ ...form, timezone: event.target.value })}>
                    <option value="America/Sao_Paulo">Brasília / São Paulo</option>
                    <option value="America/Fortaleza">Fortaleza</option>
                    <option value="America/Manaus">Manaus</option>
                    <option value="America/Rio_Branco">Rio Branco</option>
                  </Select>
                </Field>
              </div>
              <Field label="Nome da unidade"><Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></Field>
              <Field label="Tipo"><Select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}><option value="matriz">Matriz/Sede</option><option value="filial">Filial</option></Select></Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Responsável"><Input value={form.responsible_name || ""} onChange={(event) => setForm({ ...form, responsible_name: event.target.value })} /></Field>
                <Field label="Telefone"><Input value={form.phone || ""} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></Field>
              </div>
              <Field label="Endereço"><Textarea value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} /></Field>
              <Field label="Link Google Maps"><Input value={form.google_maps_url || ""} onChange={(event) => setForm({ ...form, google_maps_url: event.target.value })} placeholder="https://www.google.com/maps?q=..." /></Field>
              <label className="flex min-h-11 min-w-0 items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold leading-tight">
                <input type="checkbox" checked={Boolean(form.geofence_enabled)} onChange={(event) => setForm({ ...form, geofence_enabled: event.target.checked })} />
                Geofence ativa para validar ponto
              </label>
              <label className="flex min-h-11 min-w-0 items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold leading-tight">
                <input type="checkbox" checked={Boolean(form.active)} onChange={(event) => setForm({ ...form, active: event.target.checked })} />
                Unidade ativa
              </label>
              <Button disabled={loading} onClick={save}><Save className="h-4 w-4" /> Salvar unidade</Button>
            </div>
            <BranchMapEditor value={form} onChange={(patch) => setForm((current) => ({ ...current, ...patch }))} />
          </div>
          <div className="mt-6 border-t border-slate-200 pt-5">
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h3 className="font-black text-slate-950">Horário de funcionamento</h3>
                <p className="text-sm font-medium text-slate-600">Base para cobertura, alertas e planejamento de escalas.</p>
              </div>
              <Field label="Vigente a partir de">
                <Input type="date" value={hoursEffectiveFrom} onChange={(event) => setHoursEffectiveFrom(event.target.value)} />
              </Field>
            </div>
            <div className="grid gap-2 lg:grid-cols-2">
              {hours.map((item, index) => (
                <div key={item.weekday} className="grid items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50/70 p-3 sm:grid-cols-[3.5rem_1fr_1fr_auto]">
                  <strong className="text-sm text-slate-800">{weekdayLabels[item.weekday]}</strong>
                  <Input type="time" aria-label={`Abertura ${weekdayLabels[item.weekday]}`} disabled={item.is_closed} value={item.opens_at || ""} onChange={(event) => setHours((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, opens_at: event.target.value } : row))} />
                  <Input type="time" aria-label={`Fechamento ${weekdayLabels[item.weekday]}`} disabled={item.is_closed} value={item.closes_at || ""} onChange={(event) => setHours((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, closes_at: event.target.value } : row))} />
                  <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-600">
                    <input type="checkbox" checked={Boolean(item.is_closed)} onChange={(event) => setHours((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, is_closed: event.target.checked } : row))} />
                    Fechado
                  </label>
                </div>
              ))}
            </div>
          </div>
        </Card>
      ) : null}

      <Card>
        <div className="admin-table-shell">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="bg-brand-700 text-xs uppercase text-white">
              <tr>
                <th className="p-3">Unidade</th><th className="p-3">Tipo</th><th className="p-3">Endereço</th><th className="p-3">Geolocalização</th><th className="p-3">Raio</th><th className="p-3">Funcionários</th><th className="p-3">Status</th><th className="p-3">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((branch) => (
                <tr key={branch.id} className="border-b border-slate-100 odd:bg-white even:bg-brand-50/40 transition hover:bg-sun-50/60">
                  <td className="max-w-[220px] p-3 font-black text-slate-950"><span className="inline-flex min-w-0 items-center gap-2"><Building2 className="h-4 w-4 shrink-0 text-brand-700" /><span className="text-safe">{branch.name}</span></span></td>
                  <td className="p-3"><Badge tone={branch.type === "matriz" ? "blue" : "green"}>{branch.type === "matriz" ? "Matriz" : "Filial"}</Badge></td>
                  <td className="max-w-[280px] p-3 text-slate-600">{branch.address}</td>
                  <td className="p-3"><span className="grid gap-1"><strong>{Number(branch.latitude).toFixed(5)}, {Number(branch.longitude).toFixed(5)}</strong><span className="text-xs text-slate-500">{branch.geofence_enabled ? "Geofence ativa" : "Geofence desativada"}</span><Badge tone={branch.gps_ready || branch.geolocation_status === "confirmed" ? "green" : "yellow"}>{branch.gps_ready || branch.geolocation_status === "confirmed" ? "GPS confirmado" : "GPS pendente"}</Badge></span></td>
                  <td className="p-3 font-bold">{branch.allowed_radius_meters || 900}m</td>
                  <td className="p-3">{branch.employee_count ?? 0}</td>
                  <td className="p-3"><Badge tone={branch.active ? "green" : "red"}>{branch.active ? "Ativa" : "Inativa"}</Badge></td>
                  <td className="p-3"><div className="admin-action-row"><Button size="sm" variant="ghost" onClick={() => startEdit(branch)}><Edit3 className="h-4 w-4" /> Editar</Button>{branch.google_maps_url ? <a href={branch.google_maps_url} target="_blank" rel="noreferrer" className="btn-safe inline-flex min-h-9 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-center text-xs font-extrabold leading-tight text-slate-700 shadow-sm transition hover:bg-brand-50"><MapPinned className="h-4 w-4 shrink-0" /> Mapa</a> : null}<Button size="sm" variant="ghost" onClick={() => issueGpsValidation(branch)}><ShieldCheck className="h-4 w-4" /> Validar GPS</Button><Button size="sm" variant="ghost" onClick={() => generateQr(branch)}><QrCode className="h-4 w-4" /> Gerar QR</Button><Button size="sm" variant="ghost" onClick={() => downloadQr(branch)}><QrCode className="h-4 w-4" /> Novo PDF QR</Button>{branch.active ? <Button size="sm" variant="danger" onClick={() => setDeactivateTarget(branch)}>Desativar</Button> : null}</div></td>
                </tr>
              ))}
              {!filtered.length ? <tr><td className="p-10 text-center text-slate-500" colSpan={8}>Nenhuma unidade encontrada.</td></tr> : null}
            </tbody>
          </table>
        </div>
        <div className="mt-4 rounded-2xl border border-brand-100 bg-brand-50 p-3 text-sm font-semibold text-brand-900">
          <ShieldCheck className="mr-2 inline h-4 w-4" /> A validação do ponto usa latitude/longitude, raio configurado, distância calculada e precisão do GPS registrada em cada batida.
        </div>
      </Card>

      {deactivateTarget ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[28px] bg-white p-5 shadow-[0_32px_100px_rgba(0,0,0,0.24)]">
            <h2 className="text-xl font-black text-slate-950">Desativar unidade?</h2>
            <p className="mt-2 text-sm font-semibold text-slate-600">{deactivateTarget.name} ficará inativa para novos cadastros e validações futuras.</p>
            <div className="admin-action-row mt-4 justify-end mobile-stack-actions">
              <Button variant="ghost" onClick={() => setDeactivateTarget(null)}>Cancelar</Button>
              <Button variant="danger" onClick={() => deactivate(deactivateTarget)}>Desativar</Button>
            </div>
          </div>
        </div>
      ) : null}
    </AdminShell>
  );
}
