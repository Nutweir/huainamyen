import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import seed from "@/content/seed/huai-nam-yen.json";
import type { TripBundle } from "@/types/content";
import { groupDay, anchorsOf } from "@/utils/story";
import { buildSnapshot, parseImport, exportBundle, referencedMedia, sanitizeBundle } from "@/services/snapshot";
import { clone } from "@/utils/format";

const bundle = seed as unknown as TripBundle;

describe("migrated journal (source of truth: the static site)", () => {
  it("keeps the original dates, days and moments", () => {
    expect(bundle.trip.startDate).toBe("2026-10-03");
    expect(bundle.trip.endDate).toBe("2026-10-04");
    expect(bundle.days.map(d => d.date)).toEqual(["2026-10-03", "2026-10-04"]);
    expect(bundle.days.flatMap(d => d.blocks).filter(b => b.type === "event")).toHaveLength(17);
  });
  it("every photo and clip the story uses exists, and its file is in public/", () => {
    const ids = new Set(bundle.media.map(m => m.id));
    for (const id of referencedMedia(bundle)) expect(ids.has(id), `missing media ${id}`).toBe(true);
    for (const m of bundle.media) {
      expect(existsSync(resolve("public", m.path)), m.path).toBe(true);
      for (const v of Object.values(m.variants)) expect(existsSync(resolve("public", v)), v).toBe(true);
    }
  });
  it("old links still have their anchors", () => {
    const anchors = anchorsOf(bundle.days);
    for (const a of ["day-01", "day-02", "d1-0700", "waterfall"]) expect(anchors).toContain(a);
  });
  it("groups each day into its timeline moments", () => {
    const g = groupDay(bundle.days[0]);
    expect(g.sections.length).toBe(bundle.days[0].blocks.filter(b => b.type === "event").length);
  });
});

describe("publishing and export", () => {
  it("a snapshot drops hidden photos, private originals and unused media", () => {
    const b = clone(bundle);
    const img = b.days[0].blocks.find(x => x.type === "image")!;
    if (img.type === "image") img.data.item.hidden = true;
    b.media.push({ ...b.media[0], id: "unused-asset", originalPath: "originals/x" });
    const snap = buildSnapshot(b);
    expect(snap.days[0].blocks.some(x => x.id === img.id)).toBe(false);
    expect(snap.media.some(m => m.id === "unused-asset")).toBe(false);
    expect(snap.media.every(m => m.originalPath === null)).toBe(true);
  });
  it("saving and importing strip injected HTML", () => {
    const b = clone(bundle);
    const p = b.days[0].blocks.find(x => x.type === "paragraph")!;
    if (p.type === "paragraph") p.data.html = 'ok<img src=x onerror="alert(1)"><script>x</script>';
    const clean = sanitizeBundle(b).days[0].blocks.find(x => x.id === p.id)!;
    expect(JSON.stringify(clean)).not.toMatch(/onerror|<script|<img/);
    const back = parseImport(exportBundle(b));
    expect(JSON.stringify(back)).not.toMatch(/onerror|<script/);
    expect(back.trip.title).toBe(bundle.trip.title);
  });
  it("refuses files that are not trip exports", () => {
    expect(() => parseImport('{"hello":1}')).toThrow();
  });
});
