"use client";

import { ArrowLeft, MailCheck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { BrandMark } from "@/components/BrandMark";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { createBrowserSupabaseClient, getBrowserSupabaseConfigStatus } from "@/lib/client/supabase";

export function AdminPasswordRecovery() {
  const config = getBrowserSupabaseConfigStatus();
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function recover() {
    setLoading(true);
    setError("");
    setMessage("");
    try {
      if (!config.configured) throw new Error(config.message);
      const redirectTo = `${process.env.NEXT_PUBLIC_APP_URL || window.location.origin}/admin/nova-senha`;
      const { error: resetError } = await createBrowserSupabaseClient().auth.resetPasswordForEmail(email, { redirectTo });
      if (resetError) throw resetError;
      setMessage("Enviamos as instruções de recuperação para o e-mail informado.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível enviar a recuperação.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#f5f7f6] px-4 py-8">
      <section className="absolute inset-x-0 top-0 h-72 overflow-hidden bg-brand-700">
        <div className="absolute -right-24 -top-28 h-72 w-72 rounded-full bg-brand-500/60" />
        <div className="absolute -bottom-24 left-0 h-48 w-[130%] rounded-[50%] bg-[#f5f7f6]" />
      </section>
      <div className="relative z-10 mx-auto grid min-h-screen max-w-md content-start gap-8 pt-4">
        <div className="flex items-center justify-between">
          <BrandMark compact inverse />
          <Link href="/admin/login" className="grid h-12 w-12 place-items-center rounded-full bg-white text-brand-800 shadow-soft">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </div>
        <section className="mt-12 rounded-[30px] bg-white p-6 shadow-[0_24px_80px_rgba(6,67,32,0.18)]">
          <h1 className="text-3xl font-black text-slate-950">Recupere sua senha</h1>
          <p className="mt-2 text-sm font-medium leading-6 text-slate-600">Informe seu e-mail administrativo para receber as instruções de acesso.</p>
          <div className="mt-6 grid gap-4">
            {!config.configured ? <p className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-900">{config.message}</p> : null}
            <Field label="E-mail">
              <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="admin@empresa.com" className="rounded-2xl" />
            </Field>
            <Button size="lg" onClick={recover} disabled={loading || !email || !config.configured} className="rounded-2xl">
              <MailCheck className="h-5 w-5" />
              Enviar instruções
            </Button>
          </div>
          {message ? <p className="mt-4 rounded-2xl bg-emerald-50 p-3 text-sm font-bold text-emerald-800">{message}</p> : null}
          {error ? <p className="mt-4 rounded-2xl bg-red-50 p-3 text-sm font-bold text-red-800">{error}</p> : null}
        </section>
      </div>
    </main>
  );
}
