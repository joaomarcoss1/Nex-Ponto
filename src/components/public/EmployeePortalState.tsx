"use client";

import { LockKeyhole, RefreshCw } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

export function EmployeePortalState({ loading, error, children, reload }: { loading: boolean; error: string; children: ReactNode; reload: () => void }) {
  if (loading) return <div className="grid gap-3" aria-live="polite"><div className="h-28 animate-pulse rounded-3xl bg-slate-100" /><div className="h-20 animate-pulse rounded-3xl bg-slate-100" /></div>;
  if (error) return <div className="rounded-3xl border border-amber-200 bg-amber-50 p-5 text-center"><LockKeyhole className="mx-auto h-8 w-8 text-amber-700" /><h2 className="mt-3 text-lg font-black text-slate-950">Acesso do funcionário necessário</h2><p className="mt-2 text-sm font-medium leading-6 text-slate-700">{error}</p><div className="mt-4 grid gap-2 sm:grid-cols-2"><Link href="/" className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-brand-600 px-4 text-sm font-black text-white">Validar no ponto</Link><Button variant="ghost" onClick={reload}><RefreshCw className="h-4 w-4" /> Tentar novamente</Button></div></div>;
  return <>{children}</>;
}
