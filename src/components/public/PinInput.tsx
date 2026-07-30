"use client";

import { clsx } from "clsx";

export function PinInput({ value, onChange, disabled = false }: { value: string; onChange: (value: string) => void; disabled?: boolean }) {
  const digits = value.padEnd(4, " ").slice(0, 4).split("");
  return (
    <div className="grid min-w-0 gap-2">
      <span className="text-sm font-bold text-slate-700">PIN</span>
      <div className="grid min-w-0 grid-cols-4 gap-2">
        {digits.map((digit, index) => (
          <div
            key={index}
            className={clsx(
              "grid aspect-square min-w-0 place-items-center rounded-2xl border bg-white text-xl font-black shadow-sm transition",
              digit.trim() ? "border-brand-500 text-brand-800 ring-4 ring-brand-100" : "border-slate-200 text-slate-300"
            )}
          >
            {digit.trim() ? "•" : ""}
          </div>
        ))}
      </div>
      <input
        aria-label="PIN de 4 dígitos"
        disabled={disabled}
        inputMode="numeric"
        maxLength={4}
        value={value}
        onChange={(event) => onChange(event.target.value.replace(/\D/g, "").slice(0, 4))}
        className="sr-only"
      />
      <input
        disabled={disabled}
        inputMode="numeric"
        maxLength={4}
        value={value}
        onChange={(event) => onChange(event.target.value.replace(/\D/g, "").slice(0, 4))}
        placeholder="Digite os 4 números"
        type="password"
        className="min-h-11 w-full min-w-0 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-center text-lg font-black tracking-[0.22em] text-slate-900 outline-none transition placeholder:tracking-normal placeholder:text-sm placeholder:font-semibold focus:border-brand-500 focus:bg-white focus:ring-4 focus:ring-brand-100"
      />
    </div>
  );
}
