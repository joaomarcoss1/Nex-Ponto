"use client";
import { publicFetch } from "@/lib/client/public-api";
import { apiErrorFromPayload } from "@/lib/client/api-error";

import { Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Field, Input } from "@/components/ui/field";
import type { PublicEmployee } from "@/types/domain";

export function EmployeeSearch({
  selected,
  onSelect,
  branchId = ""
}: {
  selected: PublicEmployee | null;
  onSelect: (employee: PublicEmployee | null) => void;
  branchId?: string;
}) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [employees, setEmployees] = useState<PublicEmployee[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const cache = useRef(new Map<string, PublicEmployee[]>());
  const requestSequence = useRef(0);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const controller = new AbortController();
    const requestId = ++requestSequence.current;
    const term = debounced;
    setError("");
    if (term.length < 2) {
      setEmployees([]);
      setLoading(false);
      return () => controller.abort();
    }
    const cacheKey = `${branchId || "all"}:${term.toLowerCase()}`;
    if (cache.current.has(cacheKey)) {
      setEmployees(cache.current.get(cacheKey) || []);
      setLoading(false);
      return () => controller.abort();
    }
    setLoading(true);
    publicFetch(`/api/public/employees?q=${encodeURIComponent(term)}${branchId ? `&branchId=${encodeURIComponent(branchId)}` : ""}`, { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw apiErrorFromPayload(data, response.status, "Não foi possível buscar funcionários.");
        if (requestSequence.current !== requestId) return;
        const rows = data.employees || [];
        cache.current.set(cacheKey, rows);
        setEmployees(rows);
      })
      .catch((err) => {
        if (requestSequence.current === requestId && err?.name !== "AbortError") setError(err instanceof Error ? err.message : "Erro ao buscar funcionários.");
      })
      .finally(() => { if (requestSequence.current === requestId) setLoading(false); });
    return () => {
      controller.abort();
      if (requestSequence.current === requestId) requestSequence.current += 1;
    };
  }, [debounced, branchId]);

  function clear() {
    setQuery("");
    setDebounced("");
    setEmployees([]);
    onSelect(null);
  }

  return (
    <div className="grid gap-3">
      <Field label="Buscar funcionário" hint="Digite matrícula ou pelo menos 2 letras do nome. A matrícula é a forma mais rápida.">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-3 h-5 w-5 text-slate-400" />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} className="h-14 rounded-2xl pl-10 pr-12 text-base font-bold" placeholder="Matrícula ou nome" inputMode="search" autoComplete="off" />
          {query || selected ? (
            <button type="button" onClick={clear} className="absolute right-2 top-2 grid h-10 w-10 place-items-center rounded-full bg-slate-100 text-slate-500" aria-label="Limpar busca">
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </Field>
      {selected ? (
        <button type="button" onClick={() => onSelect(null)} className="rounded-2xl border-2 border-brand-500 bg-brand-50 p-4 text-left shadow-[0_14px_34px_rgba(18,104,243,0.08)]">
          <strong className="block text-lg leading-tight text-brand-900">{selected.display_name || selected.full_name}</strong>
          <span className="text-sm font-semibold text-slate-600">{selected.registration_code_masked ? `${selected.registration_code_masked} • ` : ""}{selected.role} • {selected.branch_name}</span>
        </button>
      ) : (
        <div className="grid max-h-72 gap-2 overflow-auto pr-1">
          {debounced.length < 2 ? <p className="rounded-2xl border border-slate-200 bg-white p-3 text-sm font-bold text-slate-500">Comece pela matrícula ou digite pelo menos 2 letras.</p> : null}
          {loading ? <p className="rounded-2xl bg-brand-50 p-3 text-sm font-black text-brand-800">Buscando funcionários...</p> : null}
          {error ? <p className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-900">{error}</p> : null}
          {employees.map((employee) => (
            <button type="button" key={employee.id} onClick={() => onSelect(employee)} className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-[0_10px_28px_rgba(15,23,42,0.04)] transition hover:border-brand-500 hover:bg-brand-50">
              <strong className="block text-slate-950">{employee.display_name || employee.full_name}</strong>
              <span className="text-sm font-semibold text-slate-600">{employee.registration_code_masked ? `${employee.registration_code_masked} • ` : ""}{employee.role} • {employee.branch_name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
