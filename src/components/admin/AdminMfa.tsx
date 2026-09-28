"use client";

import { ArrowLeft, KeyRound, ShieldCheck, ShieldOff, Smartphone, Trash2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";
import { Button } from "@/components/ui/button";
import { Card, SectionTitle } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { createBrowserSupabaseClient } from "@/lib/client/supabase";
import { apiErrorFromPayload } from "@/lib/client/api-error";
import type { Factor } from "@supabase/supabase-js";

async function completeSession(access_token: string, refresh_token: string) {
  const response = await fetch("/api/auth/admin-mfa-complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ access_token, refresh_token }),
    cache: "no-store",
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw apiErrorFromPayload(payload, response.status, "Não foi possível concluir a confirmação.");
}

function ChallengeMode({ next }: { next: string }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [factorId, setFactorId] = useState("");
  const [preparing, setPreparing] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const supabase = await createBrowserSupabaseClient();
        const { data, error: listError } = await supabase.auth.mfa.listFactors();
        if (listError) throw listError;
        const verified = data?.totp?.find((factor) => factor.status === "verified");
        if (!active) return;
        if (!verified) throw new Error("Nenhum fator de segundo passo encontrado nesta conta.");
        setFactorId(verified.id);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Não foi possível preparar a confirmação.");
      } finally {
        if (active) setPreparing(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  async function verify() {
    if (!factorId || code.trim().length !== 6) return;
    setLoading(true);
    setError("");
    try {
      const supabase = await createBrowserSupabaseClient();
      const { data, error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: code.trim() });
      if (verifyError) throw verifyError;
      if (!data?.access_token || !data?.refresh_token) throw new Error("Código inválido. Tente novamente.");
      await completeSession(data.access_token, data.refresh_token);
      await supabase.auth.signOut({ scope: "local" });
      router.replace(next || "/admin");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Código inválido. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-brand-50/60 p-4 dark:bg-slate-900">
      <div className="grid w-full max-w-sm gap-4 rounded-3xl bg-white p-6 text-center shadow-[0_22px_70px_rgba(15,23,42,0.12)] dark:bg-slate-800">
        <BrandMark />
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-brand-50 text-brand-700 dark:bg-slate-700 dark:text-brand-300">
          <Smartphone className="h-7 w-7" />
        </div>
        <h1 className="text-xl font-black text-slate-950 dark:text-white">Confirmação de dois fatores</h1>
        <p className="text-sm font-medium text-slate-600 dark:text-slate-300">Digite o código de 6 dígitos do seu aplicativo autenticador.</p>
        {preparing ? (
          <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">Preparando...</p>
        ) : (
          <form className="grid gap-3" onSubmit={(event) => { event.preventDefault(); void verify(); }}>
            <Input
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              className="rounded-2xl text-center text-2xl font-black tracking-[0.4em]"
              maxLength={6}
              autoFocus
            />
            {error ? <p role="alert" className="rounded-2xl bg-red-50 p-3 text-sm font-bold text-red-800 dark:bg-red-950/40 dark:text-red-200">{error}</p> : null}
            <Button type="submit" size="lg" loading={loading} disabled={loading || !factorId || code.length !== 6} className="w-full rounded-2xl">
              <ShieldCheck className="h-5 w-5" />
              Confirmar
            </Button>
          </form>
        )}
      </div>
    </main>
  );
}

function ManageMode() {
  const [factors, setFactors] = useState<Factor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [enrolling, setEnrolling] = useState(false);
  const [enrollment, setEnrollment] = useState<{ factorId: string; qrCode: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [removingId, setRemovingId] = useState("");

  async function withSession<T>(run: (supabase: Awaited<ReturnType<typeof createBrowserSupabaseClient>>) => Promise<T>): Promise<T> {
    const response = await fetch("/api/auth/admin-session-token", { method: "POST", cache: "no-store" });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw apiErrorFromPayload(payload, response.status, "Não foi possível validar a sessão.");
    const supabase = await createBrowserSupabaseClient();
    const { error: sessionError } = await supabase.auth.setSession(payload);
    if (sessionError) throw new Error("Não foi possível preparar a sessão para gerenciar o MFA.");
    try {
      return await run(supabase);
    } finally {
      await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
    }
  }

  async function load() {
    setLoading(true);
    setError("");
    try {
      const list = await withSession(async (supabase) => {
        const { data, error: listError } = await supabase.auth.mfa.listFactors();
        if (listError) throw listError;
        return data?.all || [];
      });
      setFactors(list);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar os fatores de segurança.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startEnroll() {
    setError("");
    setEnrolling(true);
    try {
      const enrolled = await withSession(async (supabase) => {
        const { data, error: enrollError } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `Autenticador ${new Date().toLocaleDateString("pt-BR")}` });
        if (enrollError) throw enrollError;
        return data;
      });
      setEnrollment({ factorId: enrolled.id, qrCode: enrolled.totp.qr_code, secret: enrolled.totp.secret });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível iniciar o cadastro do segundo fator.");
      setEnrolling(false);
    }
  }

  async function confirmEnroll() {
    if (!enrollment || code.trim().length !== 6) return;
    setVerifying(true);
    setError("");
    try {
      await withSession(async (supabase) => {
        const { data, error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId: enrollment.factorId, code: code.trim() });
        if (verifyError) throw verifyError;
        if (data?.access_token && data?.refresh_token) await completeSession(data.access_token, data.refresh_token);
      });
      setEnrollment(null);
      setEnrolling(false);
      setCode("");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Código inválido. Tente novamente.");
    } finally {
      setVerifying(false);
    }
  }

  async function removeFactor(id: string) {
    setRemovingId(id);
    setError("");
    try {
      await withSession(async (supabase) => {
        const { error: unenrollError } = await supabase.auth.mfa.unenroll({ factorId: id });
        if (unenrollError) throw unenrollError;
      });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível remover o fator. Confirme com outro código antes de tentar de novo.");
    } finally {
      setRemovingId("");
    }
  }

  const verifiedFactors = factors.filter((factor) => factor.status === "verified");

  return (
    <>
      <SectionTitle
        title="Segurança e dois fatores"
        description="Um segundo código, além da senha, para proteger o acesso administrativo da sua empresa."
      />
      {error ? <p className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200">{error}</p> : null}

      {!verifiedFactors.length && !loading ? (
        <Card className="mb-4 border-amber-200 bg-amber-50/60 dark:border-amber-800 dark:bg-amber-950/20">
          <div className="flex items-start gap-3">
            <ShieldOff className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-300" />
            <div>
              <p className="font-black text-amber-950 dark:text-amber-100">Sem confirmação em duas etapas</p>
              <p className="mt-1 text-sm font-medium text-amber-900 dark:text-amber-200">Sua conta entra apenas com senha. Ative agora para proteger dados de folha e funcionários caso a senha vaze.</p>
            </div>
          </div>
        </Card>
      ) : null}

      <Card>
        {loading ? (
          <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">Carregando...</p>
        ) : (
          <div className="grid gap-3">
            {verifiedFactors.map((factor) => (
              <div key={factor.id} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">
                    <ShieldCheck className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-black text-slate-900 dark:text-white">{factor.friendly_name || "Aplicativo autenticador"}</p>
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Ativo desde {new Date(factor.created_at).toLocaleDateString("pt-BR")}</p>
                  </div>
                </div>
                <Button variant="danger" size="sm" loading={removingId === factor.id} onClick={() => void removeFactor(factor.id)}>
                  <Trash2 className="h-4 w-4" />
                  Remover
                </Button>
              </div>
            ))}
            {!verifiedFactors.length && !enrolling ? (
              <Button onClick={startEnroll}>
                <KeyRound className="h-4 w-4" />
                Ativar confirmação em duas etapas
              </Button>
            ) : null}
            {verifiedFactors.length ? (
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Para trocar de aplicativo, adicione o novo fator antes de remover o antigo.</p>
            ) : null}
            {!enrolling && verifiedFactors.length ? (
              <Button variant="ghost" onClick={startEnroll}>
                <KeyRound className="h-4 w-4" />
                Adicionar outro fator
              </Button>
            ) : null}
          </div>
        )}
      </Card>

      {enrolling && enrollment ? (
        <Card className="mt-4">
          <h3 className="font-black text-slate-950 dark:text-white">Escaneie com seu aplicativo autenticador</h3>
          <p className="mt-1 text-sm font-medium text-slate-600 dark:text-slate-300">Google Authenticator, 1Password, Authy ou similar.</p>
          <div className="mt-4 grid place-items-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`data:image/svg+xml;utf-8,${encodeURIComponent(enrollment.qrCode)}`}
              alt="QR code para configurar o autenticador"
              className="h-44 w-44 rounded-2xl border border-slate-200 bg-white p-2 dark:border-slate-700"
            />
          </div>
          <p className="mt-3 text-center text-xs font-semibold text-slate-500 dark:text-slate-400">Não consegue escanear? Digite manualmente:</p>
          <p className="mt-1 break-all rounded-xl bg-slate-50 p-2 text-center font-mono text-xs text-slate-700 dark:bg-slate-900 dark:text-slate-300">{enrollment.secret}</p>
          <Field label="Código do aplicativo">
            <Input
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              className="rounded-2xl text-center text-xl font-black tracking-[0.3em]"
              maxLength={6}
            />
          </Field>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <Button loading={verifying} disabled={code.length !== 6} onClick={confirmEnroll}>Confirmar e ativar</Button>
            <Button variant="ghost" onClick={() => { setEnrolling(false); setEnrollment(null); setCode(""); }}>Cancelar</Button>
          </div>
        </Card>
      ) : null}
    </>
  );
}

export function AdminMfa() {
  const search = useSearchParams();
  const isChallenge = search.get("desafio") === "1";
  const next = search.get("next") || "/admin";

  if (isChallenge) return <ChallengeMode next={next} />;
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(18,104,243,0.10),transparent_340px),linear-gradient(180deg,#f7faff,#f8fafc)] p-4 dark:bg-[radial-gradient(circle_at_top_left,rgba(18,104,243,0.08),transparent_340px),linear-gradient(180deg,#0b1220,#0b1220)] sm:p-8">
      <div className="mx-auto max-w-2xl">
        <Link href="/admin" className="mb-4 inline-flex items-center gap-2 text-sm font-black text-brand-700 hover:underline dark:text-brand-300">
          <ArrowLeft className="h-4 w-4" />
          Voltar ao painel
        </Link>
        <ManageMode />
      </div>
    </main>
  );
}
