import { describe, expect, it } from "vitest";
import { createRegulatoryPreview } from "@/lib/services/regulatory-exports";

describe("createRegulatoryPreview", () => {
  it("ordena por NSR e emite checksum determinístico sobre o conteúdo", () => {
    const result = createRegulatoryPreview("afd_preview", "tenant-a", [
      {
        nsr: 2,
        employee_id: "employee-2",
        branch_id: "branch",
        action: "end_shift",
        entry_timestamp: "2026-07-29T18:00:00Z",
        regulatory_hash: "hash-2",
      },
      {
        nsr: 1,
        employee_id: "employee-1",
        branch_id: "branch",
        action: "start_shift",
        entry_timestamp: "2026-07-29T09:00:00Z",
        regulatory_hash: "hash-1",
      },
    ]);
    expect(result.rowCount).toBe(2);
    expect(result.content.indexOf("employee-1")).toBeLessThan(result.content.indexOf("employee-2"));
    expect(result.content).toContain(`CHECKSUM_SHA256=${result.checksum}`);
    expect(result.complianceStatus).toContain("requires_external");
  });
});
