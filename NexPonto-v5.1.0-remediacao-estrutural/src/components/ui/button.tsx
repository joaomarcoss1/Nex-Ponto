import { clsx } from "clsx";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost" | "success" | "warning";
type ButtonSize = "sm" | "md" | "lg";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
  loading?: boolean;
};

export function buttonClassName({
  variant = "primary",
  size = "md",
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
} = {}) {
  return clsx(
    "btn-safe inline-flex min-w-0 max-w-full touch-manipulation select-none items-center justify-center gap-2 rounded-xl text-center font-extrabold leading-tight tracking-[-0.01em] transition-all duration-200 focus-visible:focus-ring active:scale-[0.98] disabled:translate-y-0 disabled:cursor-not-allowed disabled:shadow-none disabled:opacity-60 [&>svg]:shrink-0",
    variant === "primary" && "bg-brand-600 text-white shadow-[0_16px_35px_rgba(18,104,243,0.22)] hover:-translate-y-0.5 hover:bg-brand-700 hover:shadow-[0_22px_45px_rgba(18,104,243,0.28)]",
    variant === "secondary" && "bg-sun-400 text-brand-950 shadow-[0_14px_30px_rgba(255,193,7,0.18)] hover:-translate-y-0.5 hover:bg-sun-300",
    variant === "success" && "bg-emerald-600 text-white shadow-[0_14px_30px_rgba(5,150,105,0.22)] hover:-translate-y-0.5 hover:bg-emerald-700",
    variant === "warning" && "bg-amber-500 text-amber-950 shadow-[0_14px_30px_rgba(245,158,11,0.2)] hover:-translate-y-0.5 hover:bg-amber-400",
    variant === "danger" && "bg-red-600 text-white shadow-[0_14px_30px_rgba(220,38,38,0.2)] hover:-translate-y-0.5 hover:bg-red-700",
    variant === "ghost" && "border border-slate-200 bg-white text-slate-700 shadow-[0_8px_22px_rgba(15,23,42,0.05)] hover:-translate-y-0.5 hover:border-brand-200 hover:bg-brand-50 hover:text-brand-800",
    size === "sm" && "min-h-9 px-3 py-2 text-xs",
    size === "md" && "min-h-11 px-4 py-2.5 text-sm",
    size === "lg" && "min-h-14 px-5 py-3 text-base",
    className
  );
}

export function Button({ className, variant = "primary", size = "md", children, loading = false, disabled, type = "button", ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClassName({ variant, size, className })}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" /> : null}
      {children}
    </button>
  );
}
