"use client";

import {
  Building2,
  Check,
  ImageUp,
  MapPin,
  Palette,
  Save,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { Button } from "@/components/ui/button";
import { Card, SectionTitle } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { adminFetch } from "@/lib/client/admin-api";

type Tab = "identity" | "appearance" | "clock" | "reports";
type Settings = Record<string, string | number | boolean | undefined>;

const defaults: Settings = {
  app_name: "NexPonto",
  app_short_name: "NexPonto",
  app_tagline: "Gestão inteligente de jornadas",
  logo_url: "/nexponto-logo.svg",
  mark_url: "/nexponto-mark.svg",
  primary_color: "#1268F3",
  secondary_color: "#F4B51C",
  accent_color: "#22A5F5",
  background_color: "#F5F7FB",
  surface_color: "#FFFFFF",
  late_tolerance_minutes: 10,
  early_leave_tolerance_minutes: 10,
  default_radius_meters: 250,
  max_gps_accuracy_meters: 80,
  overtime_multiplier: 1.5,
  holiday_decision_notification_days: 7,
  lunch_tolerance_minutes: 10,
  payroll_pdf_max_detailed_rows: 300,
  payroll_pdf_block_rows: 1500,
  daily_rate_calculation: "expected_work_days",
  require_review_on_poor_gps_accuracy: true,
  allow_different_branch_with_authorization: true,
  allow_outside_radius_review: false,
  auto_approve_overtime: false,
  google_maps_enabled: true,
  block_clock_without_confirmed_branch_gps: true,
  require_qr_for_clock: false,
  block_poor_gps_accuracy: false,
  payroll_block_critical_pending: true,
};

const tabs = [
  { id: "identity" as const, label: "Identidade", icon: Building2 },
  { id: "appearance" as const, label: "Aparência", icon: Palette },
  { id: "clock" as const, label: "Ponto e regras", icon: MapPin },
  { id: "reports" as const, label: "Folha e relatórios", icon: SlidersHorizontal },
];

const allowedKeys = Object.keys(defaults).concat([
  "company_name",
  "company_document",
  "company_address",
  "report_footer",
]);

export function SettingsPage() {
  const [settings, setSettings] = useState<Settings>(defaults);
  const [tab, setTab] = useState<Tab>("identity");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<"logo" | "mark" | null>(null);

  useEffect(() => {
    adminFetch<{ settings: Settings }>("/api/admin/settings")
      .then((data) => setSettings({ ...defaults, ...(data.settings || {}) }))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const preview = useMemo(
    () => ({
      name: String(settings.app_name ?? defaults.app_name),
      tagline: String(settings.app_tagline ?? defaults.app_tagline),
      mark: String(settings.mark_url ?? defaults.mark_url),
      primary: String(settings.primary_color ?? defaults.primary_color),
      secondary: String(settings.secondary_color ?? defaults.secondary_color),
      background: String(settings.background_color ?? defaults.background_color),
      surface: String(settings.surface_color ?? defaults.surface_color),
    }),
    [settings],
  );

  function setValue(key: string, value: string | number | boolean) {
    setMessage("");
    setSettings((current) => ({ ...current, [key]: value }));
  }

  async function uploadAsset(slot: "logo" | "mark", file?: File) {
    if (!file) return;
    setUploading(slot);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("slot", slot);
      const data = await adminFetch<{ url: string; slot: "logo_url" | "mark_url" }>(
        "/api/admin/branding/logo",
        { method: "POST", body: form },
      );
      setSettings((current) => ({ ...current, [data.slot]: data.url }));
      setMessage("Imagem enviada. Salve as configurações para concluir.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível enviar a imagem.");
    } finally {
      setUploading(null);
    }
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      const payload = Object.fromEntries(
        allowedKeys
          .filter((key) => settings[key] !== undefined)
          .map((key) => [key, settings[key]]),
      );
      const data = await adminFetch<{ settings: Settings }>("/api/admin/settings", {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      setSettings({ ...defaults, ...data.settings });
      window.dispatchEvent(
        new CustomEvent("nexponto-branding-updated", { detail: data.settings }),
      );
      setMessage("Configurações aplicadas com sucesso em todo o sistema.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar configurações.");
    } finally {
      setSaving(false);
    }
  }

  const checkbox = (key: string, label: string, description: string) => (
    <label className="flex min-h-20 cursor-pointer gap-3 rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-brand-300 hover:bg-brand-50/40">
      <input
        type="checkbox"
        className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--brand)]"
        checked={Boolean(settings[key])}
        onChange={(event) => setValue(key, event.target.checked)}
      />
      <span>
        <strong className="block text-sm text-slate-900">{label}</strong>
        <span className="mt-1 block text-xs font-medium leading-5 text-slate-500">{description}</span>
      </span>
    </label>
  );

  return (
    <AdminShell>
      <SectionTitle
        title="Personalização e políticas"
        description="Controle a marca white-label, as regras do ponto e os parâmetros operacionais sem alterar o código."
      />

      {message ? (
        <p role="status" className="mb-4 flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-800">
          <Check className="h-4 w-4" /> {message}
        </p>
      ) : null}
      {error ? <p role="alert" className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-800">{error}</p> : null}

      <div className="mb-4 grid gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm sm:grid-cols-2 xl:grid-cols-4">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 text-sm font-extrabold transition ${
              tab === id ? "bg-brand-600 text-white shadow-lg shadow-brand-600/20" : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(290px,.7fr)]">
        <Card className="min-h-[32rem]">
          {loading ? <div className="h-80 animate-pulse rounded-2xl bg-slate-100" /> : null}

          {!loading && tab === "identity" ? (
            <div className="grid gap-5">
              <div>
                <h2 className="text-lg font-black text-slate-950">Identidade do produto</h2>
                <p className="mt-1 text-sm text-slate-500">A marca é atualizada no login, aplicativo, menu e título do navegador.</p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Nome do sistema">
                  <Input value={String(settings.app_name ?? "")} onChange={(event) => setValue("app_name", event.target.value)} />
                </Field>
                <Field label="Nome curto" hint="Usado no ícone instalado e em espaços reduzidos.">
                  <Input value={String(settings.app_short_name ?? "")} onChange={(event) => setValue("app_short_name", event.target.value)} />
                </Field>
                <Field label="Frase institucional">
                  <Input value={String(settings.app_tagline ?? "")} onChange={(event) => setValue("app_tagline", event.target.value)} />
                </Field>
                <Field label="Empresa emissora">
                  <Input value={String(settings.company_name ?? "")} onChange={(event) => setValue("company_name", event.target.value)} />
                </Field>
                <Field label="Documento da empresa">
                  <Input value={String(settings.company_document ?? "")} onChange={(event) => setValue("company_document", event.target.value)} />
                </Field>
                <Field label="Endereço da empresa">
                  <Input value={String(settings.company_address ?? "")} onChange={(event) => setValue("company_address", event.target.value)} />
                </Field>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {(["logo", "mark"] as const).map((slot) => (
                  <label key={slot} className="group grid cursor-pointer place-items-center rounded-2xl border border-dashed border-brand-300 bg-brand-50/50 p-5 text-center transition hover:border-brand-500 hover:bg-brand-50">
                    <ImageUp className="mb-2 h-6 w-6 text-brand-600" />
                    <strong className="text-sm text-slate-900">{slot === "logo" ? "Logotipo horizontal" : "Símbolo compacto"}</strong>
                    <span className="mt-1 text-xs text-slate-500">PNG, JPEG ou WebP, até 2 MB</span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="sr-only"
                      disabled={uploading !== null}
                      onChange={(event) => uploadAsset(slot, event.target.files?.[0])}
                    />
                    {uploading === slot ? <span className="mt-2 text-xs font-bold text-brand-700">Enviando…</span> : null}
                  </label>
                ))}
              </div>
            </div>
          ) : null}

          {!loading && tab === "appearance" ? (
            <div className="grid gap-5">
              <div>
                <h2 className="text-lg font-black text-slate-950">Paleta white-label</h2>
                <p className="mt-1 text-sm text-slate-500">As cores são aplicadas ao vivo e preservam contraste para uso corporativo.</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {[
                  ["primary_color", "Cor principal"],
                  ["secondary_color", "Cor de destaque"],
                  ["accent_color", "Cor auxiliar"],
                  ["background_color", "Fundo do aplicativo"],
                  ["surface_color", "Superfícies e cartões"],
                ].map(([key, label]) => (
                  <Field key={key} label={label}>
                    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-2">
                      <input
                        type="color"
                        className="h-10 w-14 cursor-pointer rounded-lg border-0 bg-transparent p-0"
                        value={String(settings[key] ?? defaults[key])}
                        onChange={(event) => setValue(key, event.target.value.toUpperCase())}
                      />
                      <Input
                        className="border-0 font-mono uppercase focus:ring-0"
                        value={String(settings[key] ?? defaults[key])}
                        onChange={(event) => setValue(key, event.target.value)}
                      />
                    </div>
                  </Field>
                ))}
              </div>
              <Button
                variant="ghost"
                onClick={() => setSettings((current) => ({
                  ...current,
                  primary_color: defaults.primary_color,
                  secondary_color: defaults.secondary_color,
                  accent_color: defaults.accent_color,
                  background_color: defaults.background_color,
                  surface_color: defaults.surface_color,
                }))}
              >
                <Sparkles className="h-4 w-4" /> Restaurar paleta NexLabs
              </Button>
            </div>
          ) : null}

          {!loading && tab === "clock" ? (
            <div className="grid gap-5">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <NumberField label="Tolerância de atraso (min)" settingKey="late_tolerance_minutes" settings={settings} setValue={setValue} min={0} max={240} />
                <NumberField label="Saída antecipada (min)" settingKey="early_leave_tolerance_minutes" settings={settings} setValue={setValue} min={0} max={240} />
                <NumberField label="Tolerância do almoço (min)" settingKey="lunch_tolerance_minutes" settings={settings} setValue={setValue} min={0} max={240} />
                <NumberField label="Raio padrão (m)" settingKey="default_radius_meters" settings={settings} setValue={setValue} min={10} max={10000} />
                <NumberField label="Precisão máxima GPS (m)" settingKey="max_gps_accuracy_meters" settings={settings} setValue={setValue} min={5} max={5000} />
                <NumberField label="Aviso de feriado (dias)" settingKey="holiday_decision_notification_days" settings={settings} setValue={setValue} min={1} max={60} />
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {checkbox("block_clock_without_confirmed_branch_gps", "Exigir GPS confirmado", "Impede registro quando a filial ainda não possui coordenadas homologadas.")}
                {checkbox("require_qr_for_clock", "Exigir QR físico da filial", "O colaborador deve abrir o ponto pelo QR ativo daquela unidade.")}
                {checkbox("block_poor_gps_accuracy", "Bloquear GPS impreciso", "Bloqueia o registro quando a precisão excede o limite configurado.")}
                {checkbox("require_review_on_poor_gps_accuracy", "Revisar GPS impreciso", "Quando não bloqueado, encaminha o ponto para análise.")}
                {checkbox("allow_outside_radius_review", "Aceitar fora do raio para revisão", "Registra a ocorrência sem tratá-la como válida automaticamente.")}
                {checkbox("allow_different_branch_with_authorization", "Filial diferente com autorização", "Respeita autorizações temporárias e vigentes do colaborador.")}
                {checkbox("google_maps_enabled", "Mapa operacional", "Permite usar a visualização por mapa nas telas administrativas.")}
              </div>
            </div>
          ) : null}

          {!loading && tab === "reports" ? (
            <div className="grid gap-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <NumberField label="Multiplicador de hora extra" settingKey="overtime_multiplier" settings={settings} setValue={setValue} min={0} max={10} step={0.1} />
                <Field label="Cálculo da diária">
                  <Select value={String(settings.daily_rate_calculation ?? defaults.daily_rate_calculation)} onChange={(event) => setValue("daily_rate_calculation", event.target.value)}>
                    <option value="expected_work_days">Dias previstos no período</option>
                    <option value="business_days">Dias úteis</option>
                    <option value="fixed_30">Salário dividido por 30</option>
                  </Select>
                </Field>
                <NumberField label="Máximo detalhado no PDF" settingKey="payroll_pdf_max_detailed_rows" settings={settings} setValue={setValue} min={1} max={10000} />
                <NumberField label="Bloqueio máximo do PDF" settingKey="payroll_pdf_block_rows" settings={settings} setValue={setValue} min={1} max={50000} />
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {checkbox("auto_approve_overtime", "Aprovar hora extra automaticamente", "Use apenas quando a política interna não exigir conferência individual.")}
                {checkbox("payroll_block_critical_pending", "Bloquear folha com pendências críticas", "Impede fechamento enquanto houver inconsistências operacionais.")}
              </div>
              <Field label="Rodapé dos relatórios">
                <Textarea value={String(settings.report_footer ?? "")} onChange={(event) => setValue("report_footer", event.target.value)} />
              </Field>
              <div className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
                <p><strong>Governança:</strong> alterações ficam registradas na auditoria. Fechamento de folha e regras legais ainda exigem homologação contábil e jurídica.</p>
              </div>
            </div>
          ) : null}
        </Card>

        <aside className="space-y-4 xl:sticky xl:top-5 xl:self-start">
          <div
            className="premium-surface overflow-hidden rounded-3xl border p-5 shadow-[0_22px_70px_rgba(10,31,77,.14)]"
            style={{ background: preview.background, borderColor: `${preview.primary}33` }}
          >
            <p className="text-[10px] font-black uppercase tracking-[.2em] text-slate-500">Prévia em tempo real</p>
            <div className="mt-4 rounded-2xl p-4 shadow-lg" style={{ background: preview.surface }}>
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={preview.mark} alt="" className="h-12 w-12 rounded-xl object-contain" />
                <div>
                  <p className="text-lg font-black tracking-tight text-slate-950">{preview.name}</p>
                  <p className="text-xs font-semibold text-slate-500">{preview.tagline}</p>
                </div>
              </div>
              <button
                type="button"
                className="mt-5 min-h-11 w-full rounded-xl px-4 text-sm font-black text-white shadow-lg"
                style={{ background: `linear-gradient(135deg, ${preview.primary}, ${String(settings.accent_color ?? defaults.accent_color)})` }}
              >
                Ação principal
              </button>
              <div className="mt-3 h-1.5 rounded-full" style={{ background: preview.secondary }} />
            </div>
          </div>

          <Button className="w-full" size="lg" loading={saving} onClick={save}>
            <Save className="h-5 w-5" /> Salvar e publicar
          </Button>
          <p className="px-2 text-center text-xs font-medium leading-5 text-slate-500">
            As alterações visuais são publicadas para web e aplicativo instalado.
          </p>
        </aside>
      </div>
    </AdminShell>
  );
}

function NumberField({
  label,
  settingKey,
  settings,
  setValue,
  min,
  max,
  step = 1,
}: {
  label: string;
  settingKey: string;
  settings: Settings;
  setValue: (key: string, value: number) => void;
  min: number;
  max: number;
  step?: number;
}) {
  return (
    <Field label={label}>
      <Input
        type="number"
        min={min}
        max={max}
        step={step}
        value={Number(settings[settingKey] ?? 0)}
        onChange={(event) => setValue(settingKey, Number(event.target.value))}
      />
    </Field>
  );
}
