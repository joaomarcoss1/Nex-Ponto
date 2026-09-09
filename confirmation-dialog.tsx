"use client";

import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";

export function ConfirmationDialog({
  open,
  title,
  description,
  confirmLabel = "Confirmar",
  loading = false,
  destructive = false,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  loading?: boolean;
  destructive?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !loading) onCancel();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [loading, onCancel, open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] grid place-items-end bg-slate-950/50 p-0 backdrop-blur-sm sm:place-items-center sm:p-4" role="presentation" onMouseDown={() => !loading && onCancel()}>
      <section role="alertdialog" aria-modal="true" aria-labelledby="confirmation-title" aria-describedby="confirmation-description" className="safe-area-bottom w-full rounded-t-[2rem] bg-white p-5 shadow-2xl sm:max-w-md sm:rounded-[2rem] sm:p-6" onMouseDown={(event) => event.stopPropagation()}>
        <h2 id="confirmation-title" className="text-xl font-black text-slate-950">{title}</h2>
        <p id="confirmation-description" className="mt-2 text-sm font-medium leading-6 text-slate-600">{description}</p>
        <div className="mt-6 grid gap-2 sm:grid-cols-2">
          <Button ref={cancelRef} variant="ghost" disabled={loading} onClick={onCancel}>Cancelar</Button>
          <Button variant={destructive ? "danger" : "primary"} loading={loading} onClick={onConfirm}>{confirmLabel}</Button>
        </div>
      </section>
    </div>
  );
}
