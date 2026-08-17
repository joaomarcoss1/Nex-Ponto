import { describe, expect, it } from "vitest";
import { accessibleForeground, brandingCssVariables, safeHex } from "@/lib/branding/theme";

describe("branding theme", () => {
  it("keeps the institutional blue as a safe default", () => {
    const variables = brandingCssVariables({});
    expect(variables["--brand"]).toBe("#1268F3");
    expect(variables["--success"]).not.toBe(variables["--brand"]);
  });

  it("does not let legacy green branding replace the institutional palette", () => {
    expect(brandingCssVariables({ primary_color: "#16803C" })["--brand"]).toBe("#1268F3");
  });

  it("rejects malformed color values", () => {
    expect(safeHex("green", "#1268F3")).toBe("#1268F3");
    expect(safeHex("#abcdef", "#1268F3")).toBe("#ABCDEF");
  });

  it("selects a readable foreground", () => {
    expect(accessibleForeground("#FFFFFF")).toBe("#0F172A");
    expect(accessibleForeground("#0A1F4D")).toBe("#FFFFFF");
  });
});
