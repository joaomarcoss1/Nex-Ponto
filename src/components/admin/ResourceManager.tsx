"use client";

import { Download, Edit3, FileSpreadsheet, Plus, Power, Save, Search, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, SectionTitle } from "@/components/ui/card";
import { EmptyState, LoadingState, ToastMessage } from "@/components/ui/feedback";
import { DesktopTableShell, MobileCardList, Stepper } from "@/components/ui/mobile";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { adminFetch, downloadAdminFile } from "@/lib/client/admin-api";

export type ResourceField = {
  name: string;
  label: string;
  type?: "text" | "number" | "date" | "time" | "select" | "multiselect" | "textarea" | "checkbox" | "password";
  required?: boolean;
  options?: Array<{ label: string; value: string | number | boolean }>;
  optionsEndpoint?: string;
  optionsKey?: string;
  optionLabel?: string;
  optionValue?: string;
  placeholder?: string;
  hiddenOnEdit?: boolean;
};

export type TableColumn = {
  key: string;
  label: string;
  render?: (item: any) => React.ReactNode;
};

export type ResourceFilter = {
  key: string;
  label: string;
  allLabel?: string;
  options?: Array<{ label: string; value: string | number | boolean }>;
  optionsEndpoint?: string;
  optionsKey?: string;
  optionLabel?: string;
  optionValue?: string;
};

const EMPTY_FILTERS: ResourceFilter[] = [];
const EMPTY_DEFAULT_VALUES: Record<string, unknown> = {};
const EMPTY_OMIT_FIELDS: string[] = [];

function renderPlain(value: React.ReactNode) {
  if (typeof value === "string" || typeof value === "number") return value;
  return value;
}

export function ResourceManager({
  title,
  description,
  endpoint,
  collectionKey,
  fields,
  columns,
  defaultValues = EMPTY_DEFAULT_VALUES,
  disableShell = false,
  filters = EMPTY_FILTERS,
  exportEndpoint,
  exportFileBase,
  omitFieldNamesOnSave = EMPTY_OMIT_FIELDS,
  serverPagination = false,
  pageSize = 25
}: {
  title: string;
  description?: string;
  endpoint: string;
  collectionKey: string;
  fields: ResourceField[];
  columns: TableColumn[];
  defaultValues?: Record<string, unknown>;
  disableShell?: boolean;
  filters?: ResourceFilter[];
  exportEndpoint?: string;
  exportFileBase?: string;
  omitFieldNamesOnSave?: string[];
  serverPagination?: boolean;
  pageSize?: number;
}) {
  const [items, setItems] = useState<any[]>([]);
  const [options, setOptions] = useState<Record<string, Array<{ label: string; value: string }>>>({});
  const [form, setForm] = useState<Record<string, any>>(defaultValues);
  const [editing, setEditing] = useState<any | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [confirmDeactivation, setConfirmDeactivation] = useState<any | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      let requestEndpoint = endpoint;
      if (serverPagination) {
        const url = new URL(endpoint, window.location.origin);
        url.searchParams.set("page", String(page));
        url.searchParams.set("pageSize", String(pageSize));
        if (debouncedSearch.trim()) url.searchParams.set("q", debouncedSearch.trim());
        Object.entries(filterValues).forEach(([key, value]) => {
          if (value) url.searchParams.set(exportParamKey(key), value);
        });
        requestEndpoint = `${url.pathname}${url.search}`;
      }
      const data = await adminFetch<any>(requestEndpoint);
      setItems(data[collectionKey] || []);
      if (serverPagination) setTotalRecords(Number(data.pagination?.total || 0));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar dados.");
    } finally {
      setLoading(false);
    }
  }, [collectionKey, debouncedSearch, endpoint, filterValues, page, pageSize, serverPagination]);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearch(search), 350);
    return () => window.clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!confirmDeactivation) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) setConfirmDeactivation(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [confirmDeactivation, saving]);

  const optionSources = [
    ...fields.map((field) => ({ ...field, optionStoreKey: field.name })),
    ...filters.map((filter) => ({ ...filter, name: filter.key, optionStoreKey: `filter:${filter.key}` }))
  ].filter((field) => field.optionsEndpoint);

  const optionSourcesKey = JSON.stringify(optionSources.map((field) => ({
    endpoint: field.optionsEndpoint,
    key: field.optionsKey,
    label: field.optionLabel,
    value: field.optionValue,
    store: field.optionStoreKey || field.name
  })));

  useEffect(() => {
    let cancelled = false;
    if (!optionSources.length) return () => { cancelled = true; };

    Promise.all(optionSources.map(async (field) => {
      const data = await adminFetch<any>(field.optionsEndpoint || "");
      const rows = data[field.optionsKey || "items"] || [];
      return {
        storeKey: field.optionStoreKey || field.name,
        values: rows.map((row: any) => ({
          label: row[field.optionLabel || "name"] || row.full_name || row.title,
          value: String(row[field.optionValue || "id"] ?? "")
        }))
      };
    }))
      .then((results) => {
        if (cancelled) return;
        setOptions((current) => {
          const next = { ...current };
          let changed = false;
          for (const result of results) {
            const previous = JSON.stringify(current[result.storeKey] || []);
            const incoming = JSON.stringify(result.values);
            if (previous !== incoming) {
              next[result.storeKey] = result.values;
              changed = true;
            }
          }
          return changed ? next : current;
        });
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Erro ao carregar opções do formulário.");
      });

    return () => { cancelled = true; };
    // O conteúdo serializado impede loops quando páginas passam arrays inline.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [optionSourcesKey]);

  const visibleFields = useMemo(() => fields.filter((field) => !(editing && field.hiddenOnEdit)), [editing, fields]);
  const filteredItems = useMemo(() => {
    if (serverPagination) return items;
    const term = search.trim().toLowerCase();
    return items.filter((item) => {
      const matchesSearch = !term || JSON.stringify(item).toLowerCase().includes(term);
      const matchesFilters = filters.every((filter) => {
        const selected = filterValues[filter.key];
        if (!selected) return true;
        const value = item[filter.key];
        return String(value ?? "") === String(selected);
      });
      return matchesSearch && matchesFilters;
    });
  }, [items, search, filters, filterValues, serverPagination]);

  function exportParamKey(key: string) {
    if (key === "branch_id") return "branchId";
    if (key === "payment_day") return "paymentDay";
    if (key === "employment_type") return "employmentType";
    return key;
  }

  async function exportFiltered(format: "pdf" | "xlsx") {
    if (!exportEndpoint || !exportFileBase) return;
    const params = new URLSearchParams({ format });
    if (search.trim()) params.set("q", search.trim());
    Object.entries(filterValues).forEach(([key, value]) => {
      if (value) params.set(exportParamKey(key), String(value));
    });
    const ext = format === "pdf" ? "pdf" : "xlsx";
    await downloadAdminFile(`${exportEndpoint}?${params.toString()}`, `${exportFileBase}.${ext}`);
  }

  const totalPages = Math.max(1, Math.ceil((serverPagination ? totalRecords : filteredItems.length) / pageSize));
  const pageItems = serverPagination ? filteredItems : filteredItems.slice((page - 1) * pageSize, page * pageSize);
  const displayedCount = serverPagination ? totalRecords : filteredItems.length;

  function setValue(name: string, value: unknown) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  function startCreate() {
    setEditing(null);
    setForm({ ...defaultValues });
    setShowForm(true);
    setMessage("");
    setError("");
  }

  function startEdit(item: any) {
    setEditing(item);
    setForm(item);
    setShowForm(true);
    setMessage("");
    setError("");
  }

  async function save() {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const body = editing ? { ...form, id: editing.id } : { ...form };
      omitFieldNamesOnSave.forEach((field) => { delete (body as Record<string, unknown>)[field]; });
      await adminFetch(endpoint, {
        method: editing ? "PUT" : "POST",
        body: JSON.stringify(body)
      });
      setMessage(editing ? "Registro atualizado com sucesso." : "Registro criado com sucesso.");
      setShowForm(false);
      setEditing(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function deactivate(item: any) {
    setSaving(true);
    setError("");
    try {
      await adminFetch(`${endpoint}?id=${item.id}`, { method: "DELETE" });
      setMessage("Registro desativado.");
      setConfirmDeactivation(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao desativar.");
    } finally {
      setSaving(false);
    }
  }

  const content = (
    <div className="grid gap-4">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <SectionTitle title={title} description={description} />
        <Button onClick={startCreate} className="sm:mt-3">
          <Plus className="h-4 w-4" />
          Novo registro
        </Button>
      </div>
      {message ? <ToastMessage>{message}</ToastMessage> : null}
      {error ? <ToastMessage type="error">{error}</ToastMessage> : null}
      {showForm ? (
        <Card className="mb-1">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-brand-700">{editing ? "Edição" : "Cadastro"}</p>
              <h2 className="text-xl font-black text-slate-950">{editing ? "Editar registro" : "Novo registro"}</h2>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}>
              <X className="h-4 w-4" />
              Fechar
            </Button>
          </div>
          <div className="mb-5 md:hidden">
            <Stepper steps={["Dados", "Função", "Jornada", "Pagamento", "PIN", "Revisão"]} current={editing ? 5 : 0} />
          </div>
          <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
            {visibleFields.map((field) => {
              const value = form[field.name] ?? "";
              if (field.type === "textarea") {
                return (
                  <Field key={field.name} label={field.label}>
                    <Textarea value={value} onChange={(event) => setValue(field.name, event.target.value)} placeholder={field.placeholder} />
                  </Field>
                );
              }
              if (field.type === "select") {
                const fieldOptions = field.options || options[field.name] || [];
                return (
                  <Field key={field.name} label={field.label}>
                    <Select value={String(value ?? "")} onChange={(event) => setValue(field.name, event.target.value)}>
                      <option value="">Selecione</option>
                      {fieldOptions.map((option) => (
                        <option key={String(option.value)} value={String(option.value)}>
                          {option.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                );
              }
              if (field.type === "checkbox") {
                return (
                  <label key={field.name} className="flex min-h-12 min-w-0 items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold leading-tight">
                    <input className="h-4 w-4 shrink-0" type="checkbox" checked={Boolean(value)} onChange={(event) => setValue(field.name, event.target.checked)} />
                    <span className="min-w-0 whitespace-normal">{field.label}</span>
                  </label>
                );
              }
              if (field.type === "multiselect") {
                const selected = Array.isArray(value) ? value.map(String) : String(value || "").split(",").filter(Boolean);
                const fieldOptions = field.options || options[field.name] || [];
                return (
                  <fieldset key={field.name} className="rounded-2xl border border-slate-200 bg-white p-3 lg:col-span-2">
                    <legend className="px-1 text-sm font-black text-slate-800">{field.label}</legend>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      {fieldOptions.map((option) => {
                        const optionValue = String(option.value);
                        return (
                          <label key={optionValue} className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm font-bold">
                            <input type="checkbox" checked={selected.includes(optionValue)} onChange={(event) => {
                              const next = event.target.checked ? [...new Set([...selected, optionValue])] : selected.filter((item) => item !== optionValue);
                              setValue(field.name, next);
                            }} />
                            <span>{option.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>
                );
              }
              return (
                <Field key={field.name} label={field.label}>
                  <Input
                    value={Array.isArray(value) ? value.join(",") : value}
                    type={field.type || "text"}
                    required={field.required}
                    placeholder={field.placeholder}
                    onChange={(event) => setValue(field.name, event.target.value)}
                  />
                </Field>
              );
            })}
          </div>
          <div className="admin-action-row mt-4 mobile-stack-actions">
            <Button onClick={save} loading={saving} disabled={saving}>
              <Save className="h-4 w-4" />
              Salvar
            </Button>
            <Button variant="ghost" onClick={() => setShowForm(false)} disabled={saving}>
              Cancelar
            </Button>
          </div>
        </Card>
      ) : null}
      <Card>
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-black text-slate-950">{displayedCount} registro(s)</p>
            <p className="text-xs font-semibold text-slate-500">Listagem otimizada com cards no mobile e tabela no desktop.</p>
          </div>
          <div className="grid w-full gap-2 md:max-w-3xl md:grid-cols-[1fr_auto]">
            <div className="relative min-w-0">
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <Input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} className="pl-9" placeholder="Buscar nesta lista" />
            </div>
            {filters.length ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {filters.map((filter) => {
                  const filterOptions = filter.options || options[`filter:${filter.key}`] || [];
                  return (
                    <Select
                      key={filter.key}
                      value={filterValues[filter.key] || ""}
                      onChange={(event) => { setFilterValues((current) => ({ ...current, [filter.key]: event.target.value })); setPage(1); }}
                      aria-label={filter.label}
                    >
                      <option value="">{filter.allLabel || `Todos - ${filter.label}`}</option>
                      {filterOptions.map((option) => (
                        <option key={String(option.value)} value={String(option.value)}>{option.label}</option>
                      ))}
                    </Select>
                  );
                })}
              </div>
            ) : null}
            {exportEndpoint ? (
              <div className="admin-action-row sm:col-span-2 md:col-span-1">
                <Button variant="ghost" size="sm" onClick={() => exportFiltered("pdf")}><Download className="h-4 w-4" />PDF filtrado</Button>
                <Button variant="ghost" size="sm" onClick={() => exportFiltered("xlsx")}><FileSpreadsheet className="h-4 w-4" />Excel filtrado</Button>
              </div>
            ) : null}
          </div>
        </div>
        {loading ? <LoadingState title="Carregando registros" description="Buscando dados com segurança..." /> : null}
        {!loading && !pageItems.length ? <EmptyState description="Ajuste os filtros ou crie um novo registro." /> : null}
        {!loading && pageItems.length ? (
          <>
            <MobileCardList>
              {pageItems.map((item) => (
                <article key={item.id} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_12px_34px_rgba(15,23,42,0.06)]">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-base font-black text-slate-950">{item.full_name || item.name || item.title || item.employee_name || "Registro"}</h3>
                      <p className="text-xs font-semibold text-slate-500">{item.registration_code || item.code || item.role || item.status || item.email || "Cadastro"}</p>
                    </div>
                    {"active" in item ? activeBadge(Boolean(item.active)) : null}
                  </div>
                  <div className="grid gap-2 text-sm">
                    {columns.slice(0, 4).map((column) => (
                      <div key={column.key} className="flex justify-between gap-3 rounded-2xl bg-slate-50 px-3 py-2">
                        <span className="font-bold text-slate-500">{column.label}</span>
                        <span className="min-w-0 text-right font-extrabold text-slate-900">{renderPlain(column.render ? column.render(item) : String(item[column.key] ?? "-"))}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <Button variant="ghost" size="sm" onClick={() => startEdit(item)}>
                      <Edit3 className="h-4 w-4" />
                      Editar
                    </Button>
                    {"active" in item && item.active ? (
                      <Button variant="ghost" size="sm" onClick={() => setConfirmDeactivation(item)} aria-label="Desativar registro">
                        <Power className="h-4 w-4" />
                        Desativar
                      </Button>
                    ) : null}
                  </div>
                </article>
              ))}
            </MobileCardList>
            <DesktopTableShell>
              <div className="admin-table-shell">
                <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="bg-brand-700 text-xs uppercase text-white">
                      {columns.map((column) => (
                        <th key={column.key} className="sticky top-0 z-10 bg-brand-700 px-3 py-3 text-left align-middle">
                          {column.label}
                        </th>
                      ))}
                      <th className="sticky top-0 z-10 bg-brand-700 px-3 py-3 text-left align-middle">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageItems.map((item) => (
                      <tr key={item.id} className="border-b border-slate-100 odd:bg-white even:bg-brand-50/40 transition hover:bg-sun-50/60">
                        {columns.map((column) => (
                          <td key={column.key} className="max-w-[280px] px-3 py-3 align-top">
                            {column.render ? column.render(item) : String(item[column.key] ?? "-")}
                          </td>
                        ))}
                        <td className="px-3 py-3">
                          <div className="admin-action-row">
                            <Button variant="ghost" size="sm" onClick={() => startEdit(item)}>
                              <Edit3 className="h-4 w-4" />
                              Editar
                            </Button>
                            {"active" in item && item.active ? (
                              <Button variant="ghost" size="sm" onClick={() => setConfirmDeactivation(item)} aria-label="Desativar registro">
                                <Power className="h-4 w-4" />
                                Desativar
                              </Button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </DesktopTableShell>
            {totalPages > 1 ? (
              <div className="mt-4 flex items-center justify-between gap-3 text-sm font-bold text-slate-600">
                <Button variant="ghost" size="sm" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page === 1}>Anterior</Button>
                <span>Página {page} de {totalPages}</span>
                <Button variant="ghost" size="sm" onClick={() => setPage((value) => Math.min(totalPages, value + 1))} disabled={page === totalPages}>Próxima</Button>
              </div>
            ) : null}
          </>
        ) : null}
      </Card>
      {confirmDeactivation ? (
        <div className="fixed inset-0 z-50 grid place-items-end bg-slate-950/45 p-0 backdrop-blur-sm sm:place-items-center sm:p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="deactivate-dialog-title" className="w-full max-w-md rounded-t-[2rem] bg-white p-5 shadow-[0_28px_90px_rgba(15,23,42,0.25)] sm:rounded-3xl">
            <div className="mb-4 rounded-2xl bg-red-50 p-4 text-red-900">
              <h3 id="deactivate-dialog-title" className="font-black">Desativar registro?</h3>
              <p className="mt-1 text-sm font-medium">Esta ação preserva o histórico, mas remove o registro das listas ativas.</p>
            </div>
            <p className="text-sm text-slate-600">Confirme a desativação de <strong>{confirmDeactivation.name || confirmDeactivation.full_name || confirmDeactivation.title || "registro selecionado"}</strong>.</p>
            <div className="admin-action-row mt-5 justify-end mobile-stack-actions">
              <Button variant="ghost" onClick={() => setConfirmDeactivation(null)}>Cancelar</Button>
              <Button variant="danger" loading={saving} disabled={saving} onClick={() => deactivate(confirmDeactivation)}>Desativar</Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );

  return disableShell ? content : <AdminShell>{content}</AdminShell>;
}

export function activeBadge(active: boolean) {
  return <Badge tone={active ? "green" : "red"}>{active ? "Ativo" : "Inativo"}</Badge>;
}
