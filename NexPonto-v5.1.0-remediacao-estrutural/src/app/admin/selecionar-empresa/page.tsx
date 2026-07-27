"use client";

import { Building2, CheckCircle2, ChevronRight, LogOut, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BrandMark } from "@/components/BrandMark";
import { Button } from "@/components/ui/button";
import { adminFetch, clearAdminApiCache } from "@/lib/client/admin-api";
import { createBrowserSupabaseClient } from "@/lib/client/supabase";

type TenantOption = { id: string; name: string; slug: string; role: string; status: string; selected: boolean; onboardingStatus?: string };

export default function SelectTenantPage() {
  const router = useRouter();
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [selecting, setSelecting] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    adminFetch<{ tenants: TenantOption[] }>("/api/admin/tenants")
      .then((payload) => setTenants(payload.tenants || []))
      .catch((cause) => setError(cause instanceof Error ? cause.message : "Erro ao carregar empresas."))
      .finally(() => setLoading(false));
  }, []);

  async function select(tenantId: string) {
    setSelecting(tenantId);
    setError("");
    try {
      await adminFetch("/api/admin/tenants/select", { method: "POST", body: JSON.stringify({ tenantId }) });
      clearAdminApiCache();
      window.sessionStorage.removeItem("nexponto_admin_profile");
      window.sessionStorage.removeItem("nexponto_admin_profile_cached_at");
      router.replace("/admin");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível selecionar a empresa.");
    } finally {
      setSelecting("");
    }
  }

  async function signOut() {
    await createBrowserSupabaseClient().auth.signOut();
    router.replace("/admin/login");
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(18,104,243,.22),transparent_38rem),#071329] px-4 py-8">
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-3xl content-center gap-5">
        <div className="flex items-center justify-between gap-3"><BrandMark inverse /><Button variant="ghost" className="text-white hover:bg-white/10" onClick={signOut}><LogOut className="h-4 w-4" /> Sair</Button></div>
        <section className="rounded-[2rem] bg-white p-5 shadow-2xl sm:p-8">
          <div className="mb-6 flex items-start gap-4">
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-brand-50 text-brand-700"><Building2 className="h-7 w-7" /></div>
            <div><p className="text-xs font-black uppercase tracking-[.18em] text-brand-700">Contexto seguro</p><h1 className="mt-1 text-2xl font-black text-slate-950 sm:text-3xl">Selecione a empresa</h1><p className="mt-2 text-sm font-medium text-slate-600">O contexto ativo limita dados, filiais, permissões, relatórios e ações administrativas.</p></div>
          </div>
          {error ? <p className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-800">{error}</p> : null}
          <div className="grid gap-3">
            {loading ? <div className="h-28 animate-pulse rounded-3xl bg-slate-100" /> : tenants.map((tenant) => (
              <button key={tenant.id} type="button" onClick={() => select(tenant.id)} disabled={Boolean(selecting) || ["suspended", "cancelled", "archived"].includes(tenant.status)} className="group flex min-h-24 w-full items-center gap-4 rounded-3xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-55">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-brand-50 text-brand-700"><ShieldCheck className="h-6 w-6" /></div>
                <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="truncate text-base font-black text-slate-950">{tenant.name}</h2>{tenant.selected ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-black uppercase text-emerald-700"><CheckCircle2 className="h-3 w-3" /> Atual</span> : null}</div><p className="mt-1 text-xs font-bold text-slate-500">{tenant.slug} • {tenant.role.replaceAll("_", " ")} • {tenant.status}</p></div>
                <ChevronRight className="h-5 w-5 shrink-0 text-slate-400 transition group-hover:translate-x-1 group-hover:text-brand-700" />
              </button>
            ))}
            {!loading && !tenants.length ? <p className="rounded-2xl bg-amber-50 p-4 text-sm font-bold text-amber-900">Nenhum vínculo ativo foi encontrado.</p> : null}
          </div>
        </section>
      </div>
    </main>
  );
}
