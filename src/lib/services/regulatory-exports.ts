import { createHash } from "node:crypto";

export type RegulatoryExportEntry = {
  nsr: number | string;
  employee_id: string;
  branch_id: string;
  action: string;
  entry_timestamp: string;
  regulatory_hash: string;
};

export type RegulatoryExportKind = "afd_preview" | "aej_preview";

function normalized(value: unknown) {
  return String(value ?? "").replaceAll("|", "/").replaceAll(/\r?\n/g, " ").trim();
}

export function createRegulatoryPreview(
  kind: RegulatoryExportKind,
  tenantId: string,
  entries: RegulatoryExportEntry[],
) {
  const sorted = [...entries].sort((left, right) => Number(left.nsr) - Number(right.nsr));
  const header = [
    "NEXPONTO_REGULATORY_PREVIEW",
    `KIND=${kind.toUpperCase()}`,
    `TENANT=${normalized(tenantId)}`,
    `GENERATED_AT=${new Date().toISOString()}`,
    "LEGAL_STATUS=NOT_CADES_SIGNED_REQUIRES_EXTERNAL_VALIDATION",
  ];
  const rows = sorted.map((entry) =>
    [
      normalized(entry.nsr).padStart(12, "0"),
      normalized(entry.employee_id),
      normalized(entry.branch_id),
      normalized(entry.action),
      normalized(entry.entry_timestamp),
      normalized(entry.regulatory_hash),
    ].join("|"),
  );
  const unsigned = [...header, "NSR|EMPLOYEE_ID|BRANCH_ID|ACTION|TIMESTAMP|HASH", ...rows].join("\n");
  const checksum = createHash("sha256").update(unsigned, "utf8").digest("hex");
  return {
    content: `${unsigned}\nCHECKSUM_SHA256=${checksum}\n`,
    checksum,
    rowCount: rows.length,
    complianceStatus: "preview_requires_external_cades_and_legal_validation" as const,
  };
}
