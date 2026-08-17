import { createHash } from "node:crypto";

type AllowedMime = "image/jpeg" | "image/png" | "image/webp" | "application/pdf";

const EXTENSIONS: Record<AllowedMime, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

function detectedMime(bytes: Uint8Array): AllowedMime | null {
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && [0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a].every((value, index) => bytes[index] === value)) return "image/png";
  if (bytes.length >= 12 && Buffer.from(bytes.slice(0, 4)).toString("ascii") === "RIFF" && Buffer.from(bytes.slice(8, 12)).toString("ascii") === "WEBP") return "image/webp";
  if (bytes.length >= 5 && Buffer.from(bytes.slice(0, 5)).toString("ascii") === "%PDF-") return "application/pdf";
  return null;
}

export function validateUpload(bytes: Uint8Array, declaredMime: string, allowed: readonly AllowedMime[]) {
  const detected = detectedMime(bytes);
  if (!detected || detected !== declaredMime || !allowed.includes(detected)) {
    throw new Error("A assinatura binária do arquivo não corresponde a um formato permitido.");
  }
  return {
    mime: detected,
    extension: EXTENSIONS[detected],
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

