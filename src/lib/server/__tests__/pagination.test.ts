import { describe, expect, it } from "vitest";
import { fetchAllPaginated } from "@/lib/server/pagination";

describe("fetchAllPaginated", () => {
  it("loads more than the Supabase default page without gaps or duplicates", async () => {
    const rows = Array.from({ length: 6160 }, (_, index) => ({ id: index + 1 }));
    const result = await fetchAllPaginated<{ id: number }>({
      range: async (from, to) => ({ data: rows.slice(from, to + 1), error: null }),
    }, { maxRows: 7000 });

    expect(result.truncated).toBe(false);
    expect(result.rows).toHaveLength(6160);
    expect(result.rows[0].id).toBe(1);
    expect(result.rows.at(-1)?.id).toBe(6160);
    expect(new Set(result.rows.map((row) => row.id)).size).toBe(6160);
  });

  it("reports truncation instead of silently returning partial data", async () => {
    const rows = Array.from({ length: 120 }, (_, index) => ({ id: index + 1 }));
    const result = await fetchAllPaginated<{ id: number }>({
      range: async (from, to) => ({ data: rows.slice(from, to + 1), error: null }),
    }, { batchSize: 25, maxRows: 100 });

    expect(result.truncated).toBe(true);
    expect(result.rows).toHaveLength(100);
  });
});
