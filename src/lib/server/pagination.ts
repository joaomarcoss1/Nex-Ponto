type RangeQuery<T> = {
  range(from: number, to: number): PromiseLike<{ data: T[] | null; error: { message: string } | null }>;
};

export type FetchAllPaginatedResult<T> = {
  rows: T[];
  truncated: boolean;
};

export async function fetchAllPaginated<T>(
  query: RangeQuery<T>,
  options: { batchSize?: number; maxRows?: number; signal?: AbortSignal } = {},
): Promise<FetchAllPaginatedResult<T>> {
  const batchSize = Math.min(Math.max(options.batchSize ?? 1000, 1), 1000);
  const maxRows = Math.max(options.maxRows ?? 5000, 1);
  const rows: T[] = [];

  for (let from = 0; from < maxRows; from += batchSize) {
    if (options.signal?.aborted) throw new Error("PAGINATION_ABORTED");
    const to = Math.min(from + batchSize - 1, maxRows - 1);
    const { data, error } = await query.range(from, to);
    if (error) throw new Error(error.message);
    const batch = data || [];
    rows.push(...batch);
    if (batch.length < to - from + 1) return { rows, truncated: false };
    if (rows.length > maxRows) return { rows: rows.slice(0, maxRows), truncated: true };
  }

  return { rows: rows.slice(0, maxRows), truncated: true };
}
