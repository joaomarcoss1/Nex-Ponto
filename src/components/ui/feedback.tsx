import type { ReactNode } from "react";

export function LoadingState({ title = "Carregando", description = "Aguarde um instante..." }: { title?: string; description?: string }) {
  return (
    <div role="status" aria-live="polite" className="grid min-h-40 place-items-center rounded-3xl border border-slate-200 bg-white/80 p-6 text-center dark:border-slate-700 dark:bg-slate-800/80">
      <div>
        <span className="mx-auto block h-8 w-8 animate-spin rounded-full border-4 border-brand-200 border-t-brand-700 dark:border-brand-900 dark:border-t-brand-400" />
        <p className="mt-3 font-black text-slate-950 dark:text-white">{title}</p>
        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{description}</p>
      </div>
    </div>
  );
}

export function EmptyState({ title = "Nenhum registro encontrado", description, action }: { title?: string; description?: string; action?: ReactNode }) {
  return (
    <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50/80 p-6 text-center dark:border-slate-600 dark:bg-slate-800/60">
      <p className="font-black text-slate-950 dark:text-white">{title}</p>
      {description ? <p className="mt-1 text-sm font-medium text-slate-500 dark:text-slate-400">{description}</p> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ title = "Não foi possível carregar", description, requestId, action }: { title?: string; description?: string; requestId?: string; action?: ReactNode }) {
  return (
    <div role="alert" className="rounded-3xl border border-red-200 bg-red-50 p-6 text-center text-red-950 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100">
      <p className="font-black">{title}</p>
      {description ? <p className="mt-1 text-sm font-semibold text-red-800 dark:text-red-300">{description}</p> : null}
      {requestId ? <p className="mt-2 break-all text-xs font-bold text-red-700 dark:text-red-400">Código de suporte: {requestId}</p> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function ToastMessage({ type = "success", children }: { type?: "success" | "error" | "warning" | "info"; children: ReactNode }) {
  const color = type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200" : type === "error" ? "border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/50 dark:text-red-200" : type === "warning" ? "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200" : "border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-800 dark:bg-sky-950/50 dark:text-sky-200";
  return <div role={type === "error" ? "alert" : "status"} aria-live={type === "error" ? "assertive" : "polite"} className={`mb-3 rounded-2xl border p-3 text-sm font-bold ${color}`}>{children}</div>;
}
