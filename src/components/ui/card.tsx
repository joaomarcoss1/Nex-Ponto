import { clsx } from "clsx";
import type { ReactNode } from "react";

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section
      className={clsx(
        "animate-fade-in min-w-0 rounded-[1.35rem] border border-slate-200/80 bg-[var(--surface)] p-4 shadow-[0_18px_55px_rgba(15,23,42,0.07)] backdrop-blur transition duration-200 hover:shadow-[0_22px_70px_rgba(10,31,77,0.10)] dark:border-slate-700/80 sm:rounded-3xl sm:p-5",
        className
      )}
    >
      {children}
    </section>
  );
}

export function SectionTitle({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex min-w-0 flex-col gap-3 rounded-[1.35rem] border border-brand-100 bg-gradient-to-br from-white to-brand-50/80 p-4 shadow-[0_16px_45px_rgba(10,31,77,0.06)] dark:border-brand-900 dark:from-slate-900 dark:to-slate-900 sm:flex-row sm:items-start sm:justify-between sm:rounded-3xl sm:p-5">
      <div>
        <p className="mb-2 inline-flex rounded-full bg-brand-100 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-brand-800 dark:bg-brand-900 dark:text-brand-200 sm:text-[11px]">NexPonto</p>
        <h1 className="max-w-full break-words text-[1.45rem] font-black leading-tight tracking-[-0.03em] text-slate-950 dark:text-white sm:text-2xl md:text-3xl">{title}</h1>
        {description ? <p className="mt-2 max-w-3xl text-sm font-medium leading-6 text-slate-600 dark:text-slate-400">{description}</p> : null}
      </div>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </div>
  );
}

export function StatCard({ label, value, tone = "brand", hint }: { label: string; value: ReactNode; tone?: "brand" | "green" | "red" | "yellow" | "blue" | "slate"; hint?: ReactNode }) {
  const colors = {
    brand: "from-brand-50 to-white text-brand-900 border-brand-100 dark:from-slate-900 dark:to-slate-900 dark:text-brand-200 dark:border-brand-900",
    green: "from-emerald-50 to-white text-emerald-900 border-emerald-100 dark:from-slate-900 dark:to-slate-900 dark:text-emerald-300 dark:border-emerald-900",
    red: "from-red-50 to-white text-red-900 border-red-100 dark:from-slate-900 dark:to-slate-900 dark:text-red-300 dark:border-red-900",
    yellow: "from-amber-50 to-white text-amber-900 border-amber-100 dark:from-slate-900 dark:to-slate-900 dark:text-amber-300 dark:border-amber-900",
    blue: "from-sky-50 to-white text-sky-900 border-sky-100 dark:from-slate-900 dark:to-slate-900 dark:text-sky-300 dark:border-sky-900",
    slate: "from-slate-50 to-white text-slate-900 border-slate-100 dark:from-slate-900 dark:to-slate-900 dark:text-slate-200 dark:border-slate-700"
  };
  return (
    <div className={clsx("min-w-0 rounded-2xl border bg-gradient-to-br p-4 shadow-[0_12px_34px_rgba(15,23,42,0.05)]", colors[tone])}>
      <p className="text-[10px] font-black uppercase tracking-[0.15em] opacity-75">{label}</p>
      <div className="mt-2 min-w-0 break-words text-xl font-black leading-tight tracking-[-0.04em] sm:text-2xl">{value}</div>
      {hint ? <p className="mt-1 text-xs font-semibold opacity-70">{hint}</p> : null}
    </div>
  );
}
