import type { ReactNode } from "react";

export function LoadingState({ title = "Carregando", description = "Aguarde um instante..." }: { title?: string; description?: string }) {
  return (
    <div role="status" aria-live="polite" className="grid min-h-40 place-items-center rounded-3xl border border-slate-200 bg-white/80 p-6 text-center">
      <div>
        <span className="mx-auto block h-8 w-8 animate-spin rounded-full border-4 border-brand-200 border-t-brand-700" />
        <p className="mt-3 font-black text-slate-950">{title}</p>
        <p className="text-sm font-medium text-slate-500">{description}</p>
      </div>
    </div>
  );
}

export function EmptyState({ title = "Nenhum registro encontrado", description, action }: { title?: string; description?: string; action?: ReactNode }) {
  return (
    <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50/80 p-6 text-center">
      <p className="font-black text-slate-950">{title}</p>
      {description ? <p className="mt-1 text-sm font-medium text-slate-500">{description}</p> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function ToastMessage({ type = "success", children }: { type?: "success" | "error" | "warning" | "info"; children: ReactNode }) {
  const color = type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : type === "error" ? "border-red-200 bg-red-50 text-red-800" : type === "warning" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-sky-200 bg-sky-50 text-sky-900";
  return <div role={type === "error" ? "alert" : "status"} aria-live={type === "error" ? "assertive" : "polite"} className={`mb-3 rounded-2xl border p-3 text-sm font-bold ${color}`}>{children}</div>;
}
