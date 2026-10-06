import { describe, expect, it } from "vitest";
import { sniffBytes } from "@/services/files";

const bytes = (...parts: (number[] | string)[]) => {
  const out: number[] = [];
  for (const p of parts) {
    if (typeof p === "string") out.push(...[...p].map(c => c.charCodeAt(0)));
    else out.push(...p);
  }
  while (out.length < 32) out.push(0);
  return new Uint8Array(out);
};

describe("real file type from the first bytes", () => {
  it.each([
    ["jpeg", bytes([0xff, 0xd8, 0xff, 0xe0]), "image/jpeg"],
    ["png", bytes([0x89], "PNG"), "image/png"],
    ["webp", bytes("RIFF", [0, 0, 0, 0], "WEBP"), "image/webp"],
    ["dng (tiff le)", bytes([0x49, 0x49, 0x2a, 0]), "image/x-adobe-dng"],
    ["heic", bytes([0, 0, 0, 24], "ftypheic"), "image/heic"],
    ["mp4", bytes([0, 0, 0, 24], "ftypisom"), "video/mp4"],
    ["mov", bytes([0, 0, 0, 20], "ftypqt  "), "video/quicktime"],
    ["webm", bytes([0x1a, 0x45, 0xdf, 0xa3]), "video/webm"],
  ])("%s", (_name, b, mime) => { expect(sniffBytes(b)?.mime).toBe(mime); });

  it("refuses text, html and scripts whatever their file name says", () => {
    expect(sniffBytes(bytes("<script>alert(1)</script>"))).toBeNull();
    expect(sniffBytes(bytes("<!doctype html>"))).toBeNull();
    expect(sniffBytes(bytes("%PDF-1.7"))).toBeNull();
  });
});
