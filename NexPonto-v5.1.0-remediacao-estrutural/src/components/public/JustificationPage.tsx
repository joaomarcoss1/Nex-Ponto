"use client";
import { publicFetch } from "@/lib/client/public-api";

import { FileUp, Send } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { EmployeeSearch } from "@/components/public/EmployeeSearch";
import { PinInput } from "@/components/public/PinInput";
import { PublicShell } from "@/components/public/PublicShell";
import type { PublicEmployee } from "@/types/domain";

export function JustificationPage() {
  const [employee, setEmployee] = useState<PublicEmployee | null>(null);
  const [pin, setPin] = useState("");
  const [absenceDate, setAbsenceDate] = useState("");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (!employee || pin.length !== 4) {
      setError("Selecione seu nome e informe o PIN.");
      return;
    }
    const formData = new FormData();
    formData.set("employeeId", employee.id);
    formData.set("pin", pin);
    formData.set("absenceDate", absenceDate);
    formData.set("justificationText", text);
    if (file) formData.set("attachment", file);
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const response = await publicFetch("/api/public/justifications", {
        method: "POST",
        body: formData
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Erro ao enviar justificativa.");
      setMessage(payload.message);
      setText("");
      setFile(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao enviar justificativa.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <PublicShell eyebrow="Justificar" title="Justificar falta" subtitle="Envie uma solicitação com anexo para revisão do RH.">
      <div className="grid gap-4">
        <EmployeeSearch selected={employee} onSelect={setEmployee} />
        <PinInput value={pin} onChange={setPin} disabled={loading} />
        <Field label="Data da falta">
          <Input type="date" value={absenceDate} onChange={(event) => setAbsenceDate(event.target.value)} className="rounded-2xl" />
        </Field>
        <Field label="Justificativa">
          <Textarea value={text} onChange={(event) => setText(event.target.value)} placeholder="Descreva o motivo da falta" className="rounded-2xl" />
        </Field>
        <label className="grid cursor-pointer gap-2 rounded-3xl border-2 border-dashed border-brand-200 bg-brand-50 p-4 text-center transition hover:border-brand-500">
          <FileUp className="mx-auto h-8 w-8 text-brand-700" />
          <span className="text-sm font-black text-brand-900">{file ? file.name : "Anexar PDF, JPG, PNG ou WEBP"}</span>
          <span className="text-xs font-semibold text-brand-700">{file ? `${Math.round(file.size / 1024)} KB selecionado` : "Tamanho máximo validado pela API"}</span>
          <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="sr-only" onChange={(event) => setFile(event.target.files?.[0] || null)} />
        </label>
        <Button size="lg" disabled={loading || !absenceDate || text.trim().length < 8} onClick={submit} className="w-full rounded-2xl">
          <Send className="h-5 w-5" />
          Enviar para revisão
        </Button>
        {message ? <p className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-800">{message}</p> : null}
        {error ? <p className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-800">{error}</p> : null}
      </div>
    </PublicShell>
  );
}
