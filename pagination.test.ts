import { describe, expect, it } from "vitest";
import { fetchAllRows, fetchAllRowsByValues, PaginationLimitError } from "@/lib/server/pagination";

describe("complete PostgREST pagination", () => {
  it("processes 100,000 rows without default-limit truncation", async () => {
    const source = Array.from({ length: 100_000 }, (_, id) => ({ id }));
    const rows = await fetchAllRows((from, to) => Promise.resolve({ data: source.slice(from, to + 1), error: null }), { maxRows: 101_000 });
    expect(rows).toHaveLength(100_000);
    expect(rows.at(-1)?.id).toBe(99_999);
  });

  it("chunks large ID lists and preserves every row", async () => {
    const ids = Array.from({ length: 10_000 }, (_, index) => `employee-${index}`);
    const rows = await fetchAllRowsByValues(ids, (chunk, from, to) => Promise.resolve({ data: chunk.slice(from, to + 1).map((id) => ({ id })), error: null }), { chunkSize: 100, pageSize: 100, maxRows: 20_000 });
    expect(rows).toHaveLength(10_000);
    expect(new Set(rows.map((row) => row.id)).size).toBe(10_000);
  });

  it.each([500, 1_500, 5_000, 10_001])("returns all %i report rows without silent truncation", async (total) => {
    const source = Array.from({ length: total }, (_, id) => ({ id }));
    const rows = await fetchAllRows((from, to) => Promise.resolve({ data: source.slice(from, to + 1), error: null }), { maxRows: total + 1 });
    expect(rows).toHaveLength(total);
    expect(new Set(rows.map((row) => row.id)).size).toBe(total);
  });

  it("fails explicitly instead of returning a partial result at the safety cap", async () => {
    const source = Array.from({ length: 1_500 }, (_, id) => ({ id }));
    await expect(fetchAllRows((from, to) => Promise.resolve({ data: source.slice(from, to + 1), error: null }), { maxRows: 1_000 }))
      .rejects.toBeInstanceOf(PaginationLimitError);
  });
});
