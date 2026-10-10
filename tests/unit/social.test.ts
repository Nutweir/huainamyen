import { describe, expect, it } from "vitest";
import { detectPlatform, platformById } from "@/utils/social";

const url = (id: string, v: string) => platformById(id)!.toUrl(v);

describe("social links", () => {
  it("builds profile URLs from a username (with or without @)", () => {
    expect(url("tiktok", "nutweir")).toBe("https://www.tiktok.com/@nutweir");
    expect(url("tiktok", "@nutweir")).toBe("https://www.tiktok.com/@nutweir");
    expect(url("instagram", "nutwe_ir")).toBe("https://www.instagram.com/nutwe_ir");
    expect(url("youtube", "nutweir")).toBe("https://www.youtube.com/@nutweir");
    expect(url("line", "nutweir")).toBe("https://line.me/ti/p/~nutweir");
  });

  it("keeps a pasted URL from the same site, refuses one from elsewhere", () => {
    expect(url("instagram", "https://www.instagram.com/nutwe_ir/")).toBe("https://www.instagram.com/nutwe_ir/");
    expect(url("instagram", "https://evil.example/x")).toBe("");
  });

  it("e-mail and website addresses, and nothing usable from junk", () => {
    expect(url("email", "hello@example.com")).toBe("mailto:hello@example.com");
    expect(url("email", "not-an-email")).toBe("");
    expect(url("website", "example.com")).toBe("https://example.com");
    expect(url("other", "javascript:alert(1)")).toBe("");
  });

  it("recognises older saved links", () => {
    expect(detectPlatform("https://www.tiktok.com/@nutwe_ir").id).toBe("tiktok");
    expect(detectPlatform("https://www.instagram.com/nutwe_ir").id).toBe("instagram");
    expect(detectPlatform("mailto:a@b.co").id).toBe("email");
    expect(detectPlatform("https://example.com").id).toBe("website");
  });
});
