import { clsx } from "clsx";
import type { ReactNode } from "react";
import type { HTMLAttributes } from "react";

export function MobileCardList({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx("grid gap-3 md:hidden", className)}>{children}</div>;
}

export function DesktopTableShell({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx("hidden md:block", className)}>{children}</div>;
}

export function Stepper({ steps, current = 0 }: { steps: string[]; current?: number }) {
  return (
    <div className="premium-stepper overflow-x-auto pb-1">
      {steps.map((step, index) => (
        <div key={step} className={clsx("premium-step", index <= current && "premium-step-active")}>
          <span>{index + 1}</span>
          <p>{step}</p>
        </div>
      ))}
    </div>
  );
}

export function ResponsiveToolbar({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx("grid min-w-0 gap-2 sm:flex sm:flex-wrap sm:items-center sm:justify-between", className)}>{children}</div>;
}

export function ResponsiveFormGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx("grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3", className)}>{children}</div>;
}

export function HorizontalTabs({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={clsx("flex min-w-0 snap-x gap-2 overflow-x-auto overscroll-x-contain pb-2", className)} {...props}>{children}</div>;
}

export function ResponsiveModal({ open, title, children, onClose }: { open: boolean; title: string; children: ReactNode; onClose: () => void }) {
  if (!open) return null;
  return <div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-50 grid place-items-end bg-slate-950/45 p-0 backdrop-blur-sm sm:place-items-center sm:p-4" onMouseDown={onClose}>
    <section className="safe-area-bottom max-h-[92dvh] w-full overflow-y-auto overscroll-contain rounded-t-[2rem] bg-white p-4 shadow-2xl sm:max-w-3xl sm:rounded-[2rem] sm:p-6" onMouseDown={(event) => event.stopPropagation()}>
      <div className="mb-4 flex items-start justify-between gap-3"><h2 className="break-words text-xl font-black text-slate-950">{title}</h2><button type="button" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-slate-200" onClick={onClose} aria-label="Fechar">×</button></div>
      {children}
    </section>
  </div>;
}
