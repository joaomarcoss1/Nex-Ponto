"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { LockKeyhole } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import { PublicBottomNav } from "@/components/public/PublicBottomNav";
import { clsx } from "clsx";

export function PublicShell({
  eyebrow,
  title,
  subtitle,
  children,
  className
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <main className="relative min-h-screen overflow-x-hidden bg-[var(--background,#f5f7fb)] px-3 pb-[calc(10rem+env(safe-area-inset-bottom))] sm:px-4">
      <section className="absolute inset-x-0 top-0 h-72 overflow-hidden bg-brand-700">
        <div className="absolute -right-24 -top-28 h-72 w-72 rounded-full bg-brand-500/60" />
        <div className="absolute -bottom-24 left-0 h-48 w-[130%] rounded-[50%] bg-[var(--background,#f5f7fb)]" />
        <div className="absolute bottom-4 left-8 h-1.5 w-28 rounded-full bg-sun-400" />
      </section>

      <div className="relative mx-auto grid min-h-screen w-full max-w-xl content-start gap-5 pt-7">
        <header className="flex min-w-0 items-center justify-between gap-3 text-white">
          <BrandMark compact inverse />
          <span className="hidden shrink-0 rounded-full bg-white/14 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-sun-100 sm:inline-flex">
            {eyebrow}
          </span>
        </header>

        <section className={clsx("mt-6 min-w-0 rounded-[30px] bg-white p-4 ring-1 ring-slate-200/60 shadow-[0_24px_80px_rgba(10,31,77,0.18)] sm:mt-12 sm:p-5", className)}>
          <div className="mb-5">
            <h1 className="break-words text-2xl font-black leading-tight text-slate-900 sm:text-3xl">{title}</h1>
            <p className="mt-2 text-sm font-medium leading-6 text-slate-600">{subtitle}</p>
          </div>
          {children}
        </section>

        <div className="flex justify-center pb-4 md:pb-0">
          <Link
            href="/admin/login"
            className="group inline-flex max-w-full items-center justify-center gap-2 rounded-full border border-brand-100 bg-white/70 px-3 py-2 text-center text-xs font-bold leading-tight text-brand-900 shadow-[0_10px_30px_rgba(10,31,77,0.08)] transition hover:-translate-y-0.5 hover:border-brand-300 hover:bg-white hover:text-brand-700"
            aria-label="Acessar área administrativa"
          >
            <LockKeyhole className="h-3.5 w-3.5 opacity-70 transition group-hover:opacity-100" />
            Área administrativa
          </Link>
        </div>
      </div>

      <PublicBottomNav />
    </main>
  );
}
