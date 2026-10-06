import { describe, expect, it } from "vitest";
import { safeHref, safeMapEmbed, sanitizeInline, sanitizeNotes } from "@/utils/sanitize";

describe("sanitizeInline (story text)", () => {
  it("keeps emphasis, line breaks and safe links", () => {
    expect(sanitizeInline('<b>หนา</b> <i>เอียง</i><br><a href="https://example.com">ลิงก์</a>'))
      .toBe('<b>หนา</b> <i>เอียง</i><br><a href="https://example.com" target="_blank" rel="noopener noreferrer">ลิงก์</a>');
  });
  it("removes scripts, event handlers and javascript: links", () => {
    const out = sanitizeInline('<img src=x onerror="alert(1)"><script>alert(1)</script><a href="javascript:alert(1)">x</a><b onclick="x()">ok</b>');
    expect(out).not.toMatch(/script|onerror|onclick|javascript:|<img/i);
    expect(out).toContain("<b>ok</b>");
  });
  it("drops block tags but keeps their Thai text", () => {
    expect(sanitizeInline("<div><h1>หัวข้อ</h1></div>")).toBe("หัวข้อ");
  });
});

describe("sanitizeNotes (travel notes)", () => {
  it("allows lists and the tip aside, strips unknown classes, styles and frames", () => {
    const out = sanitizeNotes('<ul><li class="tip evil" style="color:red">ข้อ</li></ul><aside class="tip">t</aside><iframe src="x"></iframe>');
    expect(out).toBe('<ul><li class="tip">ข้อ</li></ul><aside class="tip">t</aside>');
  });
});

describe("URL guards", () => {
  it("contacts accept web, phone and e-mail only", () => {
    expect(safeHref("tel:0803852146")).toBe("tel:0803852146");
    expect(safeHref("https://huainamyen.netlify.app/")).toBe("https://huainamyen.netlify.app/");
    expect(safeHref("javascript:alert(1)")).toBe("");
    expect(safeHref("data:text/html,x")).toBe("");
  });
  it("map frames accept Google Maps embeds only", () => {
    expect(safeMapEmbed("https://www.google.com/maps/embed?pb=!1m18")).toBe("https://www.google.com/maps/embed?pb=!1m18");
    expect(safeMapEmbed("https://evil.example/maps/embed?x")).toBe("");
    expect(safeMapEmbed("javascript:alert(1)")).toBe("");
  });
});
