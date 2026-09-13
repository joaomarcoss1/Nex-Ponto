"use client";

import { KeyRound, ShieldCheck } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { BrandMark } from "@/components/BrandMark";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { createBrowserSupabaseClient } from "@/lib/client/supabase";

export function AdminNewPassword() {
  const router = useRouter();
  const search = useSearchParams();
  const required = search.get("obrigatoria") === "1";
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;
    createBrowserSupabaseClient()
      .then((supabase) => {
        if (!active) return;
        supabase.auth.getSession().then(({ data }) => {
          if (active) setReady(Boolean(data.session));
        });
        const { data } = supabase.auth.onAuthStateChange((event, session) => {
          if (active && (event === "PASSWORD_RECOVERY" || session)) setReady(true);
        });
        unsubscribe = () => data.subscription.unsubscribe();
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : "Não foi possível preparar o ambiente.");
      });
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, []);

  async function updatePassword() {
    setError("");
    if (password.length < 10 || !/[A-Za-zÀ-ÿ]/.test(password) || !/\d/.test(password)) {
      setError("Use pelo menos 10 caracteres, incluindo letra e número.");
      return;
    }
    if (password !== confirmation) {
      setError("A confirmação não corresponde à nova senha.");
      return;
    }
    setLoading(true);
    try {
      const supabase = await createBrowserSupabaseClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error("Link expirado ou sessão não encontrada. Solicite uma nova recuperação.");
      const response = await fetch("/api/auth/admin-password-change", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ password, confirmation }),
        cache: "no-store",
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || "Não foi possível atualizar a senha.");
      window.sessionStorage.removeItem("nexponto_admin_profile");
      window.sessionStorage.removeItem("nexponto_admin_profile_cached_at");
      await supabase.auth.signOut({ scope: "local" });
      router.replace("/admin/login?senha=alterada");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível atualizar a senha.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[radial-gradient(circle_at_top,#D9EAFF,transparent_38rem),#F5F7FB] px-4 py-8">
      <section className="w-full max-w-md rounded-[2rem] border border-brand-100 bg-white p-6 shadow-[0_28px_90px_rgba(10,31,77,.16)]">
        <BrandMark />
        <div className="mt-7 grid h-14 w-14 place-items-center rounded-2xl bg-brand-50 text-brand-700">
          {required ? <ShieldCheck className="h-7 w-7" /> : <KeyRound className="h-7 w-7" />}
        </div>
        <h1 className="mt-5 text-3xl font-black tracking-tight text-slate-950">
          {required ? "Defina sua senha pessoal" : "Crie uma nova senha"}
        </h1>
        <p className="mt-2 text-sm font-medium leading-6 text-slate-600">
          {required ? "A troca é obrigatória no primeiro acesso." : "O link de recuperação abre uma sessão segura e temporária."}
        </p>
        <div className="mt-6 grid gap-4">
          <Field label="Nova senha" hint="Mínimo de 10 caracteres, com letra e número.">
            <Input type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} />
          </Field>
          <Field label="Confirmar nova senha">
            <Input type="password" autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
          </Field>
          {!ready ? <p className="rounded-2xl bg-amber-50 p-3 text-sm font-bold text-amber-900">Validando o link seguro…</p> : null}
          {error ? <p role="alert" className="rounded-2xl bg-red-50 p-3 text-sm font-bold text-red-800">{error}</p> : null}
          <Button size="lg" className="w-full" loading={loading} disabled={!ready || !password || !confirmation} onClick={updatePassword}>
            Salvar nova senha
          </Button>
        </div>
      </section>
    </main>
  );
}
