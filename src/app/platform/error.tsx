"use client";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/feedback";

export default function PlatformError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="grid min-h-screen place-items-center bg-slate-950 p-4"><div className="w-full max-w-xl"><ErrorState title="Falha no módulo Master" description="Nenhuma alteração foi confirmada por esta tela. Recarregue o módulo." requestId={error.digest} action={<Button onClick={reset}>Recarregar</Button>} /></div></main>;
}
