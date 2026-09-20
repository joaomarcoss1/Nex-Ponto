"use client";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/feedback";

export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="grid min-h-screen place-items-center bg-slate-50 p-4"><div className="w-full max-w-xl"><ErrorState title="Esta área encontrou uma falha" description="As outras áreas continuam disponíveis. Tente carregar este módulo novamente." requestId={error.digest} action={<Button onClick={reset}>Tentar novamente</Button>} /></div></main>;
}
