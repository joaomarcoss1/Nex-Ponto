import { clsx } from "clsx";
import type { ReactNode } from "react";

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "green" | "yellow" | "red" | "blue" }) {
  return (
    <span
      className={clsx(
        "inline-flex max-w-full items-center rounded-full px-2.5 py-1 text-center text-xs font-bold leading-tight",
        tone === "neutral" && "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200",
        tone === "green" && "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
        tone === "yellow" && "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
        tone === "red" && "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
        tone === "blue" && "bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200"
      )}
    >
      {children}
    </span>
  );
}
