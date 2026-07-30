"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { createBrowserSupabaseClient } from "@/lib/client/supabase";

type Factor = { id: string; friendly_name?: string; status?: string };

function MfaSecurityContent() {
  const router = useRouter();
  const params = useSearchParams();
  const redirect = params.get("redirect")?.startsWith("/") ? params.get("redirect")! : "/admin";
  const [factor, setFactor] = useState<Factor | null>(null);
  const [challengeId, setChallengeId] = useState("");
  const [qrCode, setQrCode] = useState("");
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function prepare() {
      const supabase = createBrowserSupabaseClient();
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) {
        router.replace("/admin/login");
        return;
      }
      const { data: assurance } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (assurance?.currentLevel === "aal2") {
        router.replace(redirect);
        return;
      }
      const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
      if (listError) throw listError;
      const existing = factors.totp.find((item) => item.status === "verified") || null;
      if (existing) {
        const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
          factorId: existing.id,
        });
        if (challengeError) throw challengeError;
        if (active) {
          setFactor(existing);
          setChallengeId(challenge.id);
        }
      } else {
        for (const pendingFactor of factors.totp.filter((item) => item.status !== "verified")) {
          await supabase.auth.mfa.unenroll({ factorId: pendingFactor.id });
        }
        const { data: enrollment, error: enrollError } = await supabase.auth.mfa.enroll({
          factorType: "totp",
          friendlyName: "NexPonto administrativo",
        });
        if (enrollError) throw enrollError;
        const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
          factorId: enrollment.id,
        });
        if (challengeError) throw challengeError;
        if (active) {
          setFactor({ id: enrollment.id, friendly_name: "NexPonto administrativo" });
          setChallengeId(challenge.id);
          setQrCode(enrollment.totp.qr_code);
          setSecret(enrollment.totp.secret);
        }
      }
      if (active) setLoading(false);
    }
    prepare().catch((cause) => {
      if (active) {
        setError(cause instanceof Error ? cause.message : "Erro ao preparar o MFA.");
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, [redirect, router]);

  async function verify() {
    if (!factor || code.length !== 6) return;
    setLoading(true);
    setError("");
    const supabase = createBrowserSupabaseClient();
    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId: factor.id,
      challengeId,
      code,
    });
    if (verifyError) {
      setError("Código inválido ou expirado. Confira o relógio do aparelho e tente novamente.");
      const { data: nextChallenge } = await supabase.auth.mfa.challenge({ factorId: factor.id });
      setChallengeId(nextChallenge?.id || "");
      setLoading(false);
      return;
    }
    window.sessionStorage.removeItem("nexponto_admin_profile");
    router.replace(redirect);
    router.refresh();
  }

  return (
    <main className="grid min-h-screen place-items-center bg-brand-50 p-4">
      <section className="w-full max-w-lg rounded-[2rem] bg-white p-6 shadow-[0_28px_90px_rgba(10,31,77,.16)]">
        <BrandMark />
        <div className="mt-6 flex items-start gap-3">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-brand-100 text-brand-800">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-black uppercase tracking-[.16em] text-brand-700">Segurança obrigatória</p>
            <h1 className="text-2xl font-black text-slate-950">Verificação em duas etapas</h1>
            <p className="mt-1 text-sm font-medium text-slate-600">
              Use um aplicativo autenticador. O NexPonto exige AAL2 para perfis administrativos e master.
            </p>
          </div>
        </div>
        {qrCode ? (
          <div className="mt-5 grid place-items-center rounded-3xl border border-brand-100 bg-brand-50 p-4">
            {/* O QR é um SVG/data URL emitido e assinado pelo Supabase Auth. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrCode} alt="QR para configurar o aplicativo autenticador" className="h-52 w-52 rounded-xl bg-white p-2" />
            <p className="mt-3 text-center text-xs font-bold text-slate-600">
              Se não puder ler o QR, use a chave: <span className="break-all font-mono text-brand-900">{secret}</span>
            </p>
          </div>
        ) : null}
        <div className="mt-5 grid gap-4">
          <Field label="Código de 6 dígitos">
            <Input
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              className="text-center text-2xl tracking-[.35em]"
            />
          </Field>
          <Button size="lg" className="w-full" loading={loading} disabled={loading || code.length !== 6} onClick={verify}>
            Confirmar e acessar
          </Button>
          {error ? <p className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-800">{error}</p> : null}
        </div>
      </section>
    </main>
  );
}

export default function MfaSecurityPage() {
  return (
    <Suspense fallback={<main className="grid min-h-screen place-items-center bg-brand-50 font-bold text-brand-900">Preparando verificação segura...</main>}>
      <MfaSecurityContent />
    </Suspense>
  );
}
