import { clsx } from "clsx";
import type { ReactNode } from "react";

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
