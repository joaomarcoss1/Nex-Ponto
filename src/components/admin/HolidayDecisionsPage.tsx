"use client";

import { CheckCircle2, Clock3, XCircle } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, SectionTitle } from "@/components/ui/card";
import { EmptyState, LoadingState, ToastMessage } from "@/components/ui/feedback";
import { Select, Textarea } from "@/components/ui/field";
import { adminFetch } from "@/lib/client/admin-api";

type Holiday = { id: string; title: string; holiday_date: string; branch_id: string | null; branches?: { name?: string } | null };
type Decision = { id: string; holiday_id: string; branch_id: string | null; operation_status: "pending" | "open" | "closed"; branches?: { name?: string } | null };
type Branch = { id: string; name: string };

export function HolidayDecisionsPage() {
  const [data, setData] = useState<{ holidays: Holiday[]; decisions: Decision[]; branches: Branch[]; canDecideGlobally: boolean } | null>(null);
  const [selectedBranches, setSelectedBranches] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setData(await adminFetch("/api/admin/holiday-decisions")); }
    catch (err) { setError(err instanceof Error ? err.message : "Erro ao carregar feriados."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  const decisionsByHoliday = useMemo(() => new Map((data?.decisions || []).map((item) => [`${item.holiday_id}:${item.branch_id || "global"}`, item])), [data]);

  async function decide(holiday: Holiday, status: "open" | "closed") {
    const scope = selectedBranches[holiday.id]
      ?? holiday.branch_id
      ?? (data?.canDecideGlobally ? "global" : data?.branches[0]?.id || "");
    if (!scope) {
      setError("Nenhuma filial permitida está disponível para registrar a decisão.");
      return;
    }
    setSaving(`${holiday.id}:${status}`); setError(""); setMessage("");
    try {
      const response = await adminFetch<{ message?: string }>("/api/admin/holiday-decisions", {
        method: "POST",
        body: JSON.stringify({ holiday_id: holiday.id, branch_id: scope === "global" ? null : scope, operation_status: status, notes: notes[holiday.id] || "" })
      });
      setMessage(response.message || "Decisão salva.");
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Erro ao salvar decisão."); }
    finally { setSaving(""); }
  }

  return <AdminShell><div className="grid gap-4">
    <SectionTitle title="Feriados e funcionamento" description="Defina se cada unidade funcionará. Fechamento é dispensa remunerada e nunca gera desconto automático." />
    {message ? <ToastMessage>{message}</ToastMessage> : null}
    {error ? <ToastMessage type="error">{error}</ToastMessage> : null}
    <Card className="border-amber-200 bg-amber-50"><div className="flex gap-3"><Clock3 className="h-5 w-5 shrink-0 text-amber-700" /><p className="text-sm font-bold text-amber-950">Enquanto a decisão estiver pendente, o sistema não marca falta nem desconto e bloqueia o fechamento definitivo da pré-folha.</p></div></Card>
    {loading ? <LoadingState title="Carregando calendário" /> : null}
    {!loading && !data?.holidays.length ? <EmptyState title="Nenhum feriado próximo" description="Cadastre feriados em Escalas e horários." /> : null}
    <div className="grid gap-4 xl:grid-cols-2">
      {data?.holidays.map((holiday) => {
        const scope = selectedBranches[holiday.id]
          ?? holiday.branch_id
          ?? (data.canDecideGlobally ? "global" : data.branches[0]?.id || "");
        const current = (decisionsByHoliday.get(`${holiday.id}:${scope}`)
          || decisionsByHoliday.get(`${holiday.id}:global`))?.operation_status || "pending";
        return <Card key={holiday.id} className="premium-surface">
          <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-wider text-brand-700">{holiday.holiday_date}</p><h2 className="mt-1 text-xl font-black text-slate-950">{holiday.title}</h2><p className="text-sm font-semibold text-slate-500">Cadastro: {holiday.branches?.name || "Todas as unidades"}</p></div><Badge tone={current === "open" ? "green" : current === "closed" ? "red" : "yellow"}>{current === "open" ? "Funcionará" : current === "closed" ? "Fechado" : "Pendente"}</Badge></div>
          <div className="mt-4 grid gap-3">
            <label className="grid gap-1 text-sm font-black text-slate-700"><span>Aplicar decisão em</span><Select disabled={Boolean(holiday.branch_id)} value={scope} onChange={(event) => setSelectedBranches((prev) => ({ ...prev, [holiday.id]: event.target.value }))}>{data.canDecideGlobally ? <option value="global">Todas as unidades</option> : null}{data.branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</Select></label>
            <label className="grid gap-1 text-sm font-black text-slate-700"><span>Observação opcional</span><Textarea value={notes[holiday.id] || ""} onChange={(event) => setNotes((prev) => ({ ...prev, [holiday.id]: event.target.value }))} placeholder="Ex.: decisão da direção" /></label>
            <div className="grid gap-2 sm:grid-cols-2"><Button loading={saving === `${holiday.id}:open`} onClick={() => decide(holiday, "open")}><CheckCircle2 className="h-4 w-4" />Funcionará normalmente</Button><Button variant="warning" loading={saving === `${holiday.id}:closed`} onClick={() => decide(holiday, "closed")}><XCircle className="h-4 w-4" />Unidade fechada</Button></div>
          </div>
        </Card>;
      })}
    </div>
  </div></AdminShell>;
}
