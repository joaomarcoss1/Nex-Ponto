import { clsx } from "clsx";
import type { ReactNode } from "react";

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "green" | "yellow" | "red" | "blue" }) {
  return (
    <span
      className={clsx(
        "inline-flex max-w-full items-center rounded-full px-2.5 py-1 text-center text-xs font-bold leading-tight",
        tone === "neutral" && "bg-slate-100 text-slate-700",
        tone === "green" && "bg-emerald-100 text-emerald-800",
        tone === "yellow" && "bg-amber-100 text-amber-800",
        tone === "red" && "bg-red-100 text-red-800",
        tone === "blue" && "bg-sky-100 text-sky-800"
      )}
    >
      {children}
    </span>
  );
}
