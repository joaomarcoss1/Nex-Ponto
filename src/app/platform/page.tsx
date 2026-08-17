"use client";

import { Activity, Building2, CircleDollarSign, Plus, RefreshCw, ShieldCheck, Users, Workflow } from "lucide-react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BrandMark } from "@/components/BrandMark";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/field";
import { adminFetch } from "@/lib/client/admin-api";
import type { CreateTenantResponse } from "@/lib/contracts/tenant-onboarding";

type Overview = { cards: Record<string, number> };
type Tenant = { id: string; slug: string; display_name: string; legal_name: string; status: string; onboarding_status: string; created_at: string };

const initialForm = { legalName: "", displayName: "", slug: "", timezone: "America/Sao_Paulo", planCode: "professional", ownerName: "", ownerEmail: "" };

export default function PlatformPage() {
  const router = useRouter();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [form, setForm] = useState(initialForm);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    try {
      setLoading(true);
      const [overviewData, tenantData] = await Promise.all([
        adminFetch<Overview>("/api/platform/overview"),
        adminFetch<{ tenants: Tenant[] }>("/api/platform/tenants"),
      ]);
      setOverview(overviewData);
      setTenants(tenantData.tenants || []);
      setError("");
    } catch (cause) {
      const text = cause instanceof Error ? cause.message : "Erro ao carregar plataforma.";
      if (text.toLowerCase().includes("restrito")) router.replace("/admin");
      setError(text);
    } finally { setLoading(false); }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createTenant() {
    setLoading(true); setError(""); setMessage("");
    try {
      const result = await adminFetch<CreateTenantResponse>("/api/platform/tenants", {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify(form),
      });
      setMessage(`Empresa ${result.tenant.displayName} criada. ${result.inviteSent ? "O acesso do proprietário foi enviado." : "O cadastro ficou pendente de reenvio do acesso."}`);
      setForm(initialForm); setShowForm(false); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Erro ao criar empresa."); }
    finally { setLoading(false); }
  }

  async function startSupport(tenant: Tenant) {
    const reason = window.prompt(`Informe o motivo do acesso temporário a ${tenant.display_name}:`)?.trim() || "";
    if (reason.length < 10) {
      setError("O motivo da sessão de suporte deve ter pelo menos 10 caracteres.");
      return;
    }
    const selectedScope = window.prompt(
      "Escopo: support_read, support_operational, support_financial ou full_access",
      "support_read",
    )?.trim() || "";
    if (!["support_read", "support_operational", "support_financial", "full_access"].includes(selectedScope)) {
      setError("Selecione um escopo de suporte válido.");
      return;
    }
    const sensitive = ["support_financial", "full_access"].includes(selectedScope);
    if (sensitive && !window.confirm(`Confirma o escopo sensível ${selectedScope}? A ação será auditada.`)) return;
    try {
      setLoading(true);
      await adminFetch("/api/platform/support-sessions", {
        method: "POST",
        body: JSON.stringify({
          tenantId: tenant.id,
          reason,
          durationMinutes: 30,
          scope: [selectedScope],
          stepUpConfirmed: sensitive,
        }),
      });
      window.sessionStorage.removeItem("nexponto_admin_profile");
      window.sessionStorage.removeItem("nexponto_admin_profile_cached_at");
      router.push("/admin");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Erro ao iniciar sessão de suporte.");
    } finally {
      setLoading(false);
    }
  }

  const cards = [
    { label: "Empresas", value: overview?.cards.tenants ?? "-", icon: Building2 },
    { label: "Ativas", value: overview?.cards.activeTenants ?? "-", icon: ShieldCheck },
    { label: "Usuários vinculados", value: overview?.cards.activeMemberships ?? "-", icon: Users },
    { label: "Jobs com falha", value: overview?.cards.failedJobs ?? "-", icon: Activity },
  ];

  return (
    <main className="min-h-screen bg-slate-950 px-3 py-4 text-white sm:px-6 sm:py-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><BrandMark inverse /><p className="mt-3 text-xs font-black uppercase tracking-[.18em] text-sky-300">Administração da plataforma</p><h1 className="mt-1 text-3xl font-black">NexPonto SaaS</h1></div><div className="flex gap-2"><Button variant="ghost" className="text-white hover:bg-white/10" onClick={load}><RefreshCw className="h-4 w-4" /> Atualizar</Button><Button onClick={() => setShowForm((value) => !value)}><Plus className="h-4 w-4" /> Nova empresa</Button></div></header>
        {error ? <p className="mb-4 rounded-2xl border border-red-400/30 bg-red-500/10 p-3 text-sm font-bold text-red-100">{error}</p> : null}
        {message ? <p className="mb-4 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-3 text-sm font-bold text-emerald-100">{message}</p> : null}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{cards.map((card) => { const Icon=card.icon; return <Card key={card.label} className="border-white/10 bg-white/95 text-slate-950"><div className="flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-2xl bg-brand-50 text-brand-700"><Icon className="h-5 w-5" /></div><div><p className="text-xs font-black uppercase tracking-[.12em] text-slate-500">{card.label}</p><p className="text-2xl font-black">{card.value}</p></div></div></Card>; })}</div>

        {showForm ? <Card className="mt-5 border-white/10 bg-white text-slate-950"><div className="mb-4"><h2 className="text-xl font-black">Onboarding de nova empresa</h2><p className="text-sm font-medium text-slate-600">Cria tenant isolado, assinatura em avaliação, proprietário e checklist inicial.</p></div><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3"><Field label="Razão social"><Input value={form.legalName} onChange={(e)=>setForm({...form,legalName:e.target.value})}/></Field><Field label="Nome comercial"><Input value={form.displayName} onChange={(e)=>setForm({...form,displayName:e.target.value,slug:e.target.value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")})}/></Field><Field label="Slug"><Input value={form.slug} onChange={(e)=>setForm({...form,slug:e.target.value.toLowerCase()})}/></Field><Field label="Fuso"><Select value={form.timezone} onChange={(e)=>setForm({...form,timezone:e.target.value})}><option value="America/Sao_Paulo">Brasília/São Paulo</option><option value="America/Fortaleza">Fortaleza</option><option value="America/Manaus">Manaus</option><option value="America/Rio_Branco">Rio Branco</option></Select></Field><Field label="Plano"><Select value={form.planCode} onChange={(e)=>setForm({...form,planCode:e.target.value})}><option value="starter">Starter</option><option value="professional">Profissional</option><option value="enterprise">Enterprise</option></Select></Field><div/><Field label="Proprietário"><Input value={form.ownerName} onChange={(e)=>setForm({...form,ownerName:e.target.value})}/></Field><Field label="E-mail do proprietário"><Input type="email" value={form.ownerEmail} onChange={(e)=>setForm({...form,ownerEmail:e.target.value})}/></Field></div><div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end"><Button variant="ghost" onClick={()=>setShowForm(false)}>Cancelar</Button><Button loading={loading} onClick={createTenant}><CircleDollarSign className="h-4 w-4" /> Criar e enviar convite</Button></div></Card> : null}

        <section className="mt-5 rounded-[2rem] bg-white p-4 text-slate-950 shadow-2xl sm:p-6"><div className="mb-4 flex items-center justify-between"><div><p className="text-xs font-black uppercase tracking-[.16em] text-brand-700">Tenants</p><h2 className="text-2xl font-black">Empresas da plataforma</h2></div><Workflow className="h-6 w-6 text-brand-700" /></div><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{tenants.map((tenant)=><article key={tenant.id} className="rounded-3xl border border-slate-200 bg-slate-50 p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="truncate font-black">{tenant.display_name}</h3><p className="truncate text-xs font-bold text-slate-500">{tenant.slug}</p></div><span className="rounded-full bg-white px-2 py-1 text-[10px] font-black uppercase text-brand-700">{tenant.status}</span></div><p className="mt-3 text-sm text-slate-600">{tenant.legal_name}</p><p className="mt-2 text-xs font-bold text-slate-500">Onboarding: {tenant.onboarding_status}</p><Button className="mt-3 w-full" variant="secondary" disabled={loading || ["suspended","cancelled","archived"].includes(tenant.status)} onClick={()=>startSupport(tenant)}><ShieldCheck className="h-4 w-4" /> Acesso de suporte por 30 min</Button></article>)}{!tenants.length && !loading ? <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">Nenhuma empresa cadastrada.</p> : null}</div></section>
      </div>
    </main>
  );
}
