type PageResult<T> = {
  data: T[] | null;
  error: { message: string } | null;
};

export class PaginationLimitError extends Error {
  constructor(readonly maxRows: number) {
    super(`A consulta excedeu o limite operacional seguro de ${maxRows} registros.`);
    this.name = "PaginationLimitError";
  }
}

export class PaginationTimeoutError extends Error {
  constructor(readonly timeoutMs: number) {
    super(`A página da consulta excedeu ${timeoutMs}ms.`);
    this.name = "PaginationTimeoutError";
  }
}

async function pageWithTimeout<T>(request: PromiseLike<PageResult<T>>, timeoutMs: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(request),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new PaginationTimeoutError(timeoutMs)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Busca todas as páginas de uma consulta PostgREST sem depender do limite
 * padrão do projeto Supabase. O chamador continua responsável pelo escopo de
 * tenant e pelos filtros antes de aplicar range().
 */
export async function fetchAllRows<T>(
  requestPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
  options: { pageSize?: number; maxRows?: number; timeoutMs?: number } = {},
) {
  const pageSize = Math.min(1000, Math.max(100, options.pageSize ?? 1000));
  const maxRows = Math.max(pageSize, options.maxRows ?? 100_000);
  const timeoutMs = Math.min(120_000, Math.max(1_000, options.timeoutMs ?? 30_000));
  const rows: T[] = [];
  for (let from = 0; from < maxRows; from += pageSize) {
    const { data, error } = await pageWithTimeout(requestPage(from, from + pageSize - 1), timeoutMs);
    if (error) throw new Error(error.message);
    const page = data || [];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
  throw new PaginationLimitError(maxRows);
}

/** Pagina cada lote de IDs sem construir URLs PostgREST excessivamente longas. */
export async function fetchAllRowsByValues<T>(
  values: readonly string[],
  requestPage: (valueChunk: string[], from: number, to: number) => PromiseLike<PageResult<T>>,
  options: { pageSize?: number; maxRows?: number; chunkSize?: number; timeoutMs?: number } = {},
) {
  const uniqueValues = [...new Set(values.filter(Boolean))];
  if (!uniqueValues.length) return [];
  const chunkSize = Math.min(200, Math.max(20, options.chunkSize ?? 100));
  const maxRows = options.maxRows ?? 500_000;
  const rows: T[] = [];
  for (let index = 0; index < uniqueValues.length; index += chunkSize) {
    const chunk = uniqueValues.slice(index, index + chunkSize);
    const remaining = maxRows - rows.length;
    if (remaining <= 0) throw new PaginationLimitError(maxRows);
    const page = await fetchAllRows<T>(
      (from, to) => requestPage(chunk, from, to),
      { pageSize: options.pageSize, maxRows: remaining, timeoutMs: options.timeoutMs },
    );
    rows.push(...page);
  }
  return rows;
}
