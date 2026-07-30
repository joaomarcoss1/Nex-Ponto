"use client";

import {
  Building2,
  CalendarDays,
  ChevronDown,
  ClipboardCheck,
  ClipboardList,
  Clock3,
  FileSpreadsheet,
  Gauge,
  Home,
  LogOut,
  Layers3,
  Menu,
  MoreHorizontal,
  Repeat,
  Settings,
  Shield,
  TimerReset,
  UserCheck,
  UserCog,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { BrandMark } from "@/components/BrandMark";
import { Button } from "@/components/ui/button";
import {
  createBrowserSupabaseClient,
  getBrowserAdminSession,
  getBrowserSupabaseConfigStatus,
} from "@/lib/client/supabase";
import { clsx } from "clsx";

const nav = [
  {
    href: "/admin",
    label: "Início",
    icon: Gauge,
    group: "inicio",
    roles: [
      "master_admin",
      "admin",
      "admin_geral",
      "rh_financeiro",
      "gerente_filial",
    ],
  },
  {
    href: "/admin/funcionarios",
    label: "Funcionários",
    icon: Users,
    group: "equipe",
    roles: [
      "master_admin",
      "admin",
      "admin_geral",
      "rh_financeiro",
      "gerente_filial",
    ],
  },
  {
    href: "/admin/funcionarios/importar",
    label: "Importar",
    icon: FileSpreadsheet,
    group: "mais",
    roles: ["master_admin", "rh_financeiro"],
  },
  {
    href: "/admin/gerencia-filial",
    label: "Gerência",
    icon: UserCheck,
    group: "equipe",
    roles: ["master_admin", "admin", "admin_geral", "gerente_filial"],
  },
  {
    href: "/admin/filiais",
    label: "Filiais",
    icon: Building2,
    group: "mais",
    roles: ["master_admin", "admin", "admin_geral"],
  },
  {
    href: "/admin/horarios",
    label: "Escalas",
    icon: CalendarDays,
    group: "equipe",
    roles: [
      "master_admin",
      "admin",
      "admin_geral",
      "rh_financeiro",
      "gerente_filial",
    ],
  },
  {
    href: "/admin/modelos-turno",
    label: "Modelos de turno",
    icon: Clock3,
    group: "equipe",
    roles: ["master_admin", "admin", "admin_geral", "rh_financeiro", "gerente_filial"],
  },
  {
    href: "/admin/planejamento-escalas",
    label: "Planejador semanal",
    icon: CalendarDays,
    group: "equipe",
    roles: ["master_admin", "admin", "admin_geral", "rh_financeiro", "gerente_filial"],
  },
  {
    href: "/admin/escalas-profissionais",
    label: "Ciclos e cobertura",
    icon: Layers3,
    group: "equipe",
    roles: ["master_admin", "admin", "admin_geral", "rh_financeiro", "gerente_filial"],
  },
  {
    href: "/admin/pontos",
    label: "Pontos",
    icon: ClipboardCheck,
    group: "ponto",
    roles: [
      "master_admin",
      "admin",
      "admin_geral",
      "rh_financeiro",
      "gerente_filial",
    ],
  },
  {
    href: "/admin/revisoes-ponto",
    label: "Revisões",
    icon: Shield,
    group: "ponto",
    roles: [
      "master_admin",
      "admin",
      "admin_geral",
      "rh_financeiro",
      "gerente_filial",
    ],
  },
  {
    href: "/admin/horas-extras",
    label: "Horas extras",
    icon: TimerReset,
    group: "ponto",
    roles: ["master_admin", "rh_financeiro"],
  },
  {
    href: "/admin/inconsistencias",
    label: "Inconsistências",
    icon: Shield,
    group: "ponto",
    roles: [
      "master_admin",
      "admin",
      "admin_geral",
      "rh_financeiro",
      "gerente_filial",
    ],
  },
  {
    href: "/admin/justificativas",
    label: "Justificativas",
    icon: FileSpreadsheet,
    group: "ponto",
    roles: [
      "master_admin",
      "admin",
      "admin_geral",
      "rh_financeiro",
      "gerente_filial",
    ],
  },
  {
    href: "/admin/feriados",
    label: "Feriados",
    icon: CalendarDays,
    group: "folha",
    roles: ["master_admin", "admin", "admin_geral", "rh_financeiro", "gerente_filial"],
  },
  {
    href: "/admin/folha",
    label: "Pré-folha",
    icon: WalletCards,
    group: "folha",
    roles: ["master_admin", "rh_financeiro"],
  },
  {
    href: "/admin/fechamento",
    label: "Fechamento",
    icon: ClipboardList,
    group: "folha",
    roles: ["master_admin", "admin", "admin_geral", "rh_financeiro"],
  },
  {
    href: "/admin/banco-de-horas",
    label: "Banco de horas",
    icon: TimerReset,
    group: "folha",
    roles: [
      "master_admin",
      "admin",
      "admin_geral",
      "rh_financeiro",
      "gerente_filial",
    ],
  },
  {
    href: "/admin/solicitacoes",
    label: "Solicitações",
    icon: Repeat,
    group: "mais",
    roles: [
      "master_admin",
      "admin",
      "admin_geral",
      "rh_financeiro",
      "gerente_filial",
    ],
  },
  {
    href: "/admin/relatorios",
    label: "Relatórios",
    icon: FileSpreadsheet,
    group: "mais",
    roles: [
      "master_admin",
      "admin",
      "admin_geral",
      "rh_financeiro",
      "gerente_filial",
    ],
  },
  {
    href: "/admin/onboarding",
    label: "Onboarding",
    icon: ClipboardList,
    group: "mais",
    roles: ["master_admin", "admin_geral"],
  },
  {
    href: "/admin/configuracoes",
    label: "Configurações",
    icon: Settings,
    group: "mais",
    roles: ["master_admin"],
  },
  {
    href: "/admin/administradores",
    label: "Admins",
    icon: UserCog,
    group: "mais",
    roles: ["master_admin"],
  },
  {
    href: "/admin/auditoria",
    label: "Auditoria",
    icon: Shield,
    group: "mais",
    roles: ["master_admin"],
  },
  {
    href: "/admin/seguranca",
    label: "Segurança e LGPD",
    icon: Shield,
    group: "mais",
    roles: ["master_admin"],
  },
];


const navGroups = [
  { key: "inicio", label: "Visão geral" },
  { key: "equipe", label: "Equipe" },
  { key: "ponto", label: "Ponto" },
  { key: "folha", label: "Financeiro" },
  { key: "mais", label: "Gestão" },
] as const;

const routePermission: Record<string, string> = {
  "/admin/funcionarios": "employee.manage",
  "/admin/funcionarios/importar": "employee.manage",
  "/admin/filiais": "branch.manage",
  "/admin/gerencia-filial": "branch.manage",
  "/admin/horarios": "schedule.manage",
  "/admin/modelos-turno": "schedule.manage",
  "/admin/planejamento-escalas": "schedule.manage",
  "/admin/escalas-profissionais": "schedule.manage",
  "/admin/pontos": "time_entry.review",
  "/admin/revisoes": "time_entry.review",
  "/admin/horas-extras": "overtime.review",
  "/admin/banco-horas": "time_bank.manage",
  "/admin/folha": "payroll.view",
  "/admin/relatorios": "reports.export",
  "/admin/configuracoes": "tenant.manage",
  "/admin/administradores": "administrators.manage",
  "/admin/auditoria": "audit.view",
  "/admin/seguranca": "audit.view",
};

type Profile = {
  role?: string;
  name?: string;
  email?: string;
  canViewFinancialData?: boolean;
  tenantId?: string;
  tenantSlug?: string;
  tenantName?: string;
  permissions?: string[];
  isPlatformSuperadmin?: boolean;
  supportSession?: { id: string; reason?: string; expiresAt?: string } | null;
};

export function AdminShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [authState, setAuthState] = useState<
    "checking" | "ready" | "redirecting"
  >("checking");
  const [authMessage, setAuthMessage] = useState(
    "Validando sessão administrativa...",
  );
  const [profile, setProfile] = useState<Profile | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    let active = true;
    const profileKey = "nexponto_admin_profile";
    const cachedAtKey = "nexponto_admin_profile_cached_at";
    const cacheTtlMs = 5 * 60_000;

    const cachedProfile = typeof window !== "undefined"
      ? window.sessionStorage.getItem(profileKey)
      : null;
    const cachedAt = typeof window !== "undefined"
      ? Number(window.sessionStorage.getItem(cachedAtKey) || 0)
      : 0;
    let hasValidCachedProfile = false;

    if (cachedProfile) {
      try {
        setProfile(JSON.parse(cachedProfile));
        setAuthState("ready");
        setAuthMessage("Sessão administrativa carregada.");
        hasValidCachedProfile = true;
      } catch {
        window.sessionStorage.removeItem(profileKey);
        window.sessionStorage.removeItem(cachedAtKey);
      }
    }
    const cacheIsFresh = Boolean(hasValidCachedProfile && cachedAt && Date.now() - cachedAt < cacheTtlMs);

    async function validateSession() {
      const config = getBrowserSupabaseConfigStatus();
      if (!config.configured) {
        if (!active) return;
        setAuthMessage(config.message);
        setAuthState("redirecting");
        router.replace("/admin/login");
        return;
      }

      try {
        const { data } = await getBrowserAdminSession();
        if (!active) return;
        if (!data.session) {
          window.sessionStorage.removeItem(profileKey);
          window.sessionStorage.removeItem(cachedAtKey);
          setAuthMessage("Sessão administrativa não encontrada. Redirecionando para o login...");
          setAuthState("redirecting");
          router.replace("/admin/login");
          return;
        }
        if (data.session.user.user_metadata?.must_change_password) {
          setAuthState("redirecting");
          router.replace("/admin/nova-senha?obrigatoria=1");
          return;
        }
        const { data: assurance } = await createBrowserSupabaseClient().auth.mfa.getAuthenticatorAssuranceLevel();
        if (
          (process.env.NODE_ENV === "production" ||
            process.env.NEXT_PUBLIC_MFA_ENFORCEMENT_ENABLED === "true" ||
            assurance?.nextLevel === "aal2") &&
          assurance?.currentLevel !== "aal2"
        ) {
          setAuthState("redirecting");
          router.replace(`/admin/seguranca-mfa?redirect=${encodeURIComponent(pathname)}`);
          return;
        }

        if (cacheIsFresh) return;

        const response = await fetch("/api/admin/me", {
          headers: { Authorization: `Bearer ${data.session.access_token}` },
          cache: "no-store",
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          const errorCode = payload?.code || payload?.details?.code;
          if (response.status === 409 && errorCode === "TENANT_SELECTION_REQUIRED") {
            setAuthState("redirecting");
            router.replace("/admin/selecionar-empresa");
            return;
          }
          if (response.status === 403 && errorCode === "MFA_REQUIRED") {
            setAuthState("redirecting");
            router.replace(`/admin/seguranca-mfa?redirect=${encodeURIComponent(pathname)}`);
            return;
          }
          throw new Error(payload?.error || "Não foi possível validar o perfil administrativo.");
        }

        const payload = await response.json();
        const adminProfile = payload.admin || null;
        if (!active) return;
        setProfile(adminProfile);
        if (adminProfile) {
          window.sessionStorage.setItem(profileKey, JSON.stringify(adminProfile));
          window.sessionStorage.setItem(cachedAtKey, String(Date.now()));
        }
        setAuthState("ready");
      } catch (error) {
        if (!active) return;
        if (cachedProfile) {
          setAuthState("ready");
          setAuthMessage("Usando a sessão em cache enquanto a conexão estabiliza.");
          return;
        }
        setAuthMessage(error instanceof Error ? error.message : "Não foi possível validar a sessão administrativa.");
        setAuthState("redirecting");
        router.replace("/admin/login");
      }
    }

    validateSession();

    return () => {
      active = false;
    };
  }, [pathname, router]);

  async function signOut() {
    window.sessionStorage.removeItem("nexponto_admin_profile");
    window.sessionStorage.removeItem("nexponto_admin_profile_cached_at");
    await createBrowserSupabaseClient().auth.signOut();
    router.replace("/admin/login");
  }

  async function exitSupport() {
    const { data } = await getBrowserAdminSession();
    if (data.session) {
      await fetch("/api/platform/support-sessions", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${data.session.access_token}` },
      });
    }
    window.sessionStorage.removeItem("nexponto_admin_profile");
    window.sessionStorage.removeItem("nexponto_admin_profile_cached_at");
    router.replace("/platform");
  }

  const visibleNav = useMemo(() => {
    const permissions = new Set(profile?.permissions || []);
    if (permissions.size) {
      return nav.filter((item) => {
        const required = routePermission[item.href];
        return !required || permissions.has("*") || permissions.has(required);
      });
    }
    const role = profile?.role || "master_admin";
    const legacyRoleByModernRole: Record<string, string> = {
      tenant_owner: "master_admin",
      tenant_admin: "admin_geral",
      hr_manager: "rh_financeiro",
      payroll_manager: "rh_financeiro",
      rh_admin: "rh_financeiro",
      rh_analyst: "admin",
      finance_admin: "rh_financeiro",
      regional_manager: "admin_geral",
      branch_manager: "gerente_filial",
      department_leader: "gerente_filial",
      auditor: "admin",
    };
    const effectiveRole = legacyRoleByModernRole[role] || role;
    return nav.filter((item) => item.roles.includes(effectiveRole));
  }, [profile?.permissions, profile?.role]);

  const bottomItems = [
    { href: "/admin", label: "Início", icon: Home },
    { href: "/admin/funcionarios", label: "Equipe", icon: Users },
    { href: "/admin/pontos", label: "Ponto", icon: ClipboardCheck },
    { href: "/admin/folha", label: "Pré-folha", icon: WalletCards },
  ].filter((item) => visibleNav.some((navItem) => navItem.href === item.href));
  const moreItems = visibleNav.filter(
    (item) => !bottomItems.some((bottom) => bottom.href === item.href),
  );

  if (authState !== "ready") {
    return (
      <main className="grid min-h-screen place-items-center bg-brand-50/60 p-4">
        <div className="grid max-w-md gap-4 rounded-3xl bg-white p-6 text-center shadow-[0_22px_70px_rgba(15,23,42,0.12)]">
          <BrandMark />
          <span className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-brand-100 border-t-brand-700" />
          <p className="text-sm font-semibold text-slate-600">{authMessage}</p>
          {authState === "redirecting" ? (
            <Link
              className="rounded-2xl bg-brand-600 px-4 py-3 text-sm font-black text-white"
              href="/admin/login"
            >
              Ir para login administrativo
            </Link>
          ) : null}
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(18,104,243,0.10),transparent_340px),linear-gradient(180deg,#f7faff,#f8fafc)]">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-72 border-r border-brand-100 bg-white/95 p-4 shadow-[18px_0_60px_rgba(15,23,42,0.04)] backdrop-blur lg:flex lg:flex-col">
        <BrandMark compact />
        <div className="mt-4 rounded-3xl border border-brand-100 bg-brand-50 p-3">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-brand-700">
            Perfil
          </p>
          <p className="truncate text-sm font-black text-brand-950">
            {profile?.name || profile?.email || "Administrador"}
          </p>
          <p className="text-xs font-semibold text-brand-700">
            {profile?.role?.replaceAll("_", " ") || "administrador"}
          </p>
          <Link href="/admin/selecionar-empresa" className="mt-2 flex items-center justify-between gap-2 rounded-2xl bg-white px-3 py-2 text-xs font-black text-brand-800 shadow-sm">
            <span className="min-w-0 truncate">{profile?.tenantName || "Empresa ativa"}</span>
            <Building2 className="h-4 w-4 shrink-0" />
          </Link>
          {profile?.isPlatformSuperadmin ? <Link href="/platform" className="mt-2 flex items-center justify-between gap-2 rounded-2xl border border-sun-200 bg-sun-50 px-3 py-2 text-xs font-black text-slate-900"><span>Plataforma NexLabs</span><Shield className="h-4 w-4" /></Link> : null}
        </div>
        <nav className="mt-4 grid flex-1 content-start gap-2 overflow-y-auto pr-1" aria-label="Navegação administrativa">
          {navGroups.map((group) => {
            const items = visibleNav.filter((item) => item.group === group.key);
            if (!items.length) return null;
            return (
              <details key={group.key} open className="group rounded-2xl">
                <summary className="flex cursor-pointer list-none items-center justify-between rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-slate-500 hover:bg-slate-50">
                  {group.label}
                  <ChevronDown className="h-3.5 w-3.5 transition group-open:rotate-180" />
                </summary>
                <div className="mt-1 grid gap-1">
                  {items.map((item) => {
                    const Icon = item.icon;
                    const active = pathname === item.href;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        prefetch={false}
                        aria-current={active ? "page" : undefined}
                        className={clsx(
                          "flex min-w-0 items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-extrabold leading-tight transition-all",
                          active
                            ? "bg-brand-600 text-white shadow-[0_14px_30px_rgba(18,104,243,0.18)]"
                            : "text-slate-700 hover:-translate-y-0.5 hover:bg-brand-50 hover:text-brand-800",
                        )}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        <span className="min-w-0 truncate">{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </details>
            );
          })}
        </nav>
        <Button className="mt-4 w-full" variant="ghost" onClick={signOut}>
          <LogOut className="h-4 w-4" />
          Sair
        </Button>
      </aside>
      <header className="sticky top-0 z-30 border-b border-brand-100 bg-white/95 px-3 py-2 shadow-[0_10px_40px_rgba(15,23,42,0.05)] backdrop-blur lg:hidden">
        <div className="flex items-center justify-between gap-3">
          <BrandMark compact />
          <div className="flex items-center gap-2">
            <Link href="/admin/selecionar-empresa" aria-label="Trocar empresa" className="grid h-9 w-9 place-items-center rounded-xl border border-brand-100 bg-brand-50 text-brand-800">
              <Building2 className="h-4 w-4" />
            </Link>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setMoreOpen(true)}
              aria-label="Abrir menu"
            >
              <Menu className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={signOut}
              aria-label="Sair"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>
      <main className="p-3 pb-24 lg:ml-72 lg:p-8">
        <div className="mx-auto max-w-[1500px]">
          {profile?.supportSession ? (
            <div role="status" className="mb-4 flex flex-col gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-950 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-black">Sessão temporária de suporte ativa</p>
                <p className="text-sm font-semibold">{profile.tenantName} • {profile.supportSession.reason || "Suporte autorizado"}</p>
                {profile.supportSession.expiresAt ? <p className="text-xs">Expira em {new Date(profile.supportSession.expiresAt).toLocaleString("pt-BR")}</p> : null}
              </div>
              <Button variant="danger" onClick={exitSupport}>Encerrar suporte</Button>
            </div>
          ) : null}
          {children}
        </div>
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-brand-100 bg-white/95 px-2 py-2 shadow-[0_-18px_60px_rgba(15,23,42,0.08)] backdrop-blur lg:hidden">
        <div className="grid grid-cols-5 gap-1">
          {bottomItems.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch={false}
                className={clsx(
                  "grid min-h-[56px] place-items-center rounded-2xl px-1 py-1 text-[10px] font-black leading-tight",
                  active
                    ? "bg-brand-600 text-white shadow-[0_12px_24px_rgba(18,104,243,0.18)]"
                    : "text-slate-600",
                )}
              >
                <Icon className="h-5 w-5" />
                <span>{item.label}</span>
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            className="grid min-h-[56px] place-items-center rounded-2xl px-1 py-1 text-[10px] font-black leading-tight text-slate-600"
          >
            <MoreHorizontal className="h-5 w-5" />
            <span>Mais</span>
          </button>
        </div>
      </nav>
      {moreOpen ? (
        <div
          className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-sm lg:hidden"
          onClick={() => setMoreOpen(false)}
        >
          <div
            className="absolute inset-x-0 bottom-0 max-h-[82vh] overflow-y-auto rounded-t-[2rem] bg-white p-4 shadow-[0_-22px_80px_rgba(15,23,42,0.25)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-brand-700">
                  Menu
                </p>
                <h2 className="text-xl font-black text-slate-950">
                  Mais opções
                </h2>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setMoreOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {moreItems.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    prefetch={false}
                    onClick={() => setMoreOpen(false)}
                    className="rounded-3xl border border-slate-200 bg-slate-50 p-4 text-sm font-black text-slate-800"
                  >
                    <Icon className="mb-3 h-5 w-5 text-brand-700" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
