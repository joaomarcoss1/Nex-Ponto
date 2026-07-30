import { describe, expect, it } from "vitest";
import { validateUpload } from "@/lib/security/uploads";

describe("upload signatures", () => {
  it("accepts a valid PNG signature", () => {
    const bytes = new Uint8Array([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0x00]);
    expect(validateUpload(bytes, "image/png", ["image/png"]).extension).toBe("png");
  });

  it("rejects MIME spoofing", () => {
    const pdf = new Uint8Array(Buffer.from("%PDF-1.7"));
    expect(() => validateUpload(pdf, "image/png", ["image/png", "application/pdf"])).toThrow(/assinatura binária/i);
  });
});

