"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BrandMark } from "@/components/BrandMark";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { ToastMessage } from "@/components/ui/feedback";

interface SetupStatus {
  setupAvailable?: boolean;
  tenantName?: string;
  configuredEmail?: string | null;
  error?: string;
}

export default function Page() {
  const router = useRouter();
  const [available, setAvailable] = useState<boolean | null>(null);
  const [tenantName, setTenantName] = useState("Empresa principal");
  const [configuredEmail, setConfiguredEmail] = useState<string | null>(null);
  const [form, setForm] = useState({ email: "", password: "", setupToken: "", name: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/admin/bootstrap-master", { cache: "no-store" })
      .then(async (response) => ({ response, data: (await response.json()) as SetupStatus }))
      .then(({ response, data }) => {
        if (!response.ok) throw new Error(data.error || "Falha ao verificar a configuração inicial.");
        setAvailable(Boolean(data.setupAvailable));
        setTenantName(data.tenantName || "Empresa principal");
        setConfiguredEmail(data.configuredEmail || null);
        if (!data.setupAvailable) setTimeout(() => router.replace("/admin/login"), 1500);
      })
      .catch((cause) => {
        setAvailable(false);
        setError(cause instanceof Error ? cause.message : "Falha ao verificar a configuração inicial.");
      });
  }, [router]);

  async function submit() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/bootstrap-master", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Falha na ativação.");
      router.replace("/admin/login?setup=success");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha na ativação.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 p-4">
      <section className="w-full max-w-lg rounded-[2rem] bg-white p-6 shadow-xl sm:p-8">
        <BrandMark />
        <h1 className="mt-6 text-2xl font-black text-slate-950">Configuração inicial</h1>
        <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
          Crie a primeira empresa e o proprietário responsável por <strong>{tenantName}</strong>. Este fluxo fica bloqueado após a ativação.
        </p>
        {configuredEmail ? <p className="mt-2 text-xs font-bold text-slate-500">E-mail autorizado: {configuredEmail}</p> : null}
        {available === false ? <ToastMessage type="warning">A configuração inicial está bloqueada. Redirecionando ao login.</ToastMessage> : null}
        {error ? <ToastMessage type="error">{error}</ToastMessage> : null}
        {available ? (
          <div className="mt-5 grid gap-4">
            <Field label="Nome do proprietário">
              <Input autoComplete="name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
            </Field>
            <Field label="E-mail administrativo">
              <Input autoComplete="email" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
            </Field>
            <Field label="Senha administrativa">
              <Input autoComplete="new-password" type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} />
              <span className="text-xs font-semibold leading-5 text-slate-500">Use no mínimo 10 caracteres, com letra e número. A senha não é armazenada no projeto.</span>
            </Field>
            <Field label="Token temporário de configuração">
              <Input autoComplete="off" type="password" value={form.setupToken} onChange={(event) => setForm({ ...form, setupToken: event.target.value })} />
            </Field>
            <Button className="min-h-12" loading={loading} onClick={submit}>Criar empresa e proprietário</Button>
          </div>
        ) : null}
        <Link className="mt-5 block text-center text-sm font-black text-brand-700" href="/admin/login">Voltar ao login</Link>
      </section>
    </main>
  );
}
