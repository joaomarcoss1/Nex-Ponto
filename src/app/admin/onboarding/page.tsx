"use client";

import { Building2, CheckCircle2, Circle, Palette, QrCode, Settings2, ShieldCheck, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { Button } from "@/components/ui/button";
import { Card, SectionTitle } from "@/components/ui/card";
import { adminFetch } from "@/lib/client/admin-api";

const labels: Record<string, { title: string; description: string; icon: typeof Circle }> = {
  company: { title: "Empresa", description: "Dados básicos e contexto multiempresa.", icon: Building2 },
  branding: { title: "Identidade", description: "Nome, cores e materiais da empresa.", icon: Palette },
  first_branch: { title: "Primeira filial", description: "Unidade ativa com timezone e geofence.", icon: Building2 },
  operating_hours: { title: "Funcionamento", description: "Sete dias configurados com vigência.", icon: Settings2 },
  clock_policy: { title: "Política de ponto", description: "GPS, QR, tolerâncias e horário fora da operação.", icon: ShieldCheck },
  admin_team: { title: "Equipe administrativa", description: "Responsáveis e permissões configurados.", icon: Users },
  gps_test: { title: "Teste presencial de GPS", description: "Ao menos uma filial confirmada no local.", icon: ShieldCheck },
  qr_test: { title: "QR seguro", description: "QR temporário emitido e testado.", icon: QrCode },
  activation: { title: "Ativação", description: "Liberação do tenant após todas as evidências.", icon: CheckCircle2 },
};

type Payload = { tenant: { display_name: string; status: string; onboarding_status: string }; steps: Array<{ step_key: string; status: string }>; readiness: Record<string, boolean> };

export default function OnboardingPage() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  async function load() { try { setLoading(true); setPayload(await adminFetch<Payload>("/api/admin/onboarding")); setError(""); } catch (cause) { setError(cause instanceof Error ? cause.message : "Erro ao carregar onboarding."); } finally { setLoading(false); } }
  useEffect(() => { load(); }, []);
  const steps = useMemo(() => Object.keys(labels).map((key) => ({ key, ...labels[key], ready: key === "activation" ? payload?.tenant?.status === "active" : Boolean(payload?.readiness?.[key]), status: payload?.steps?.find((step) => step.step_key === key)?.status || "pending" })), [payload]);
  const progress = Math.round((steps.filter((step) => step.ready || step.status === "completed").length / steps.length) * 100);
  async function complete(key: string) { try { setLoading(true); setError(""); await adminFetch("/api/admin/onboarding", { method: "PUT", body: JSON.stringify({ stepKey: key, status: "completed", evidence: { source: "operational_check", checkedAt: new Date().toISOString() } }) }); setMessage(key === "activation" ? "Empresa ativada." : "Etapa registrada com evidência."); await load(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível concluir a etapa."); } finally { setLoading(false); } }
  return <AdminShell><SectionTitle title="Onboarding da empresa" description="Checklist técnico e operacional antes da ativação do tenant." />{error ? <p className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-800">{error}</p> : null}{message ? <p className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-800">{message}</p> : null}<Card className="mb-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-black uppercase tracking-[.16em] text-brand-700">{payload?.tenant?.display_name || "Empresa"}</p><h2 className="text-2xl font-black text-slate-950">{progress}% configurado</h2><p className="text-sm font-medium text-slate-600">Status: {payload?.tenant?.status || "carregando"}</p></div><div className="h-3 w-full overflow-hidden rounded-full bg-slate-100 sm:max-w-sm"><span className="block h-full rounded-full bg-brand-600 transition-all" style={{ width: `${progress}%` }} /></div></div></Card><div className="grid gap-3 lg:grid-cols-2">{steps.map((step) => { const Icon=step.icon; const completed=step.ready || step.status === "completed"; return <Card key={step.key} className={completed ? "border-emerald-200 bg-emerald-50/30" : ""}><div className="flex items-start gap-3"><div className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${completed ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}><Icon className="h-5 w-5" /></div><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><h3 className="font-black text-slate-950">{step.title}</h3>{completed ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <Circle className="h-5 w-5 text-slate-300" />}</div><p className="mt-1 text-sm font-medium text-slate-600">{step.description}</p>{!completed ? <Button className="mt-3" size="sm" variant={step.key === "activation" ? "primary" : "secondary"} loading={loading} onClick={() => complete(step.key)}>{step.key === "activation" ? "Ativar empresa" : "Validar evidência"}</Button> : null}</div></div></Card>; })}</div></AdminShell>;
}
