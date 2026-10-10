import { describe, expect, it } from "vitest";
import seed from "@/content/seed/huai-nam-yen.json";
import type { TripBundle } from "@/types/content";
import { diffTrip, revertChange } from "@/services/diff";
import { newBlock } from "@/services/factory";
import { clone } from "@/utils/format";

const published = seed as unknown as TripBundle;

describe("changes since the last publish", () => {
  it("nothing changed → nothing listed", () => {
    expect(diffTrip(published, clone(published))).toEqual([]);
  });

  it("names trip fields with before → after (like the cover's 'With' line)", () => {
    const now = clone(published);
    now.trip.coverMeta[3] = ["With", "พี่ ๆ ร่วมทริป · 4 คน"];
    const [c] = diffTrip(published, now);
    expect(c).toMatchObject({ kind: "changed", what: "ข้อมูลบนหน้าปก", where: { tab: "trip" } });
    expect(c.before).toContain("9 คน");
    expect(c.after).toContain("4 คน");
  });

  it("finds edited, added, removed and moved blocks", () => {
    const now = clone(published);
    const blocks = now.days[0].blocks;
    const p = blocks.find(b => b.type === "paragraph")!;
    if (p.type === "paragraph") p.data.html = "ข้อความใหม่";
    const added = newBlock("paragraph", { html: "ย่อหน้าเพิ่ม" });
    blocks.push(added);
    const removed = now.days[1].blocks.splice(3, 1)[0];
    const moved = blocks.splice(5, 1)[0];
    blocks.splice(1, 0, moved);
    const changes = diffTrip(published, now);
    expect(changes.find(c => c.kind === "changed" && c.where.tab === "story" && c.where.blockId === p.id)?.after).toBe("ข้อความใหม่");
    expect(changes.find(c => c.kind === "added")?.after).toBe("ย่อหน้าเพิ่ม");
    expect(changes.some(c => c.kind === "removed" && c.where.tab === "story" && c.where.day === 1)).toBe(true);
    expect(changes.some(c => c.kind === "moved" && c.where.tab === "story" && c.where.blockId === moved.id)).toBe(true);
    expect(removed).toBeTruthy();
  });

  it("adding one block doesn't report every block after it as moved", () => {
    const now = clone(published);
    now.days[0].blocks.splice(2, 0, newBlock("paragraph", { html: "แทรก" }));
    expect(diffTrip(published, now).map(c => c.kind)).toEqual(["added"]);
  });

  it("each change can be put back on its own, leaving the rest", () => {
    const now = clone(published);
    const blocks = now.days[0].blocks;
    const p = blocks.find(b => b.type === "paragraph")!;
    if (p.type === "paragraph") p.data.html = "new text";
    const moved = blocks.splice(5, 1)[0];
    blocks.splice(1, 0, moved);
    blocks.push(newBlock("paragraph", { html: "added" }));
    now.days[1].blocks.splice(3, 1);
    now.trip.title = "other title";

    for (const kind of ["moved", "added", "removed"] as const) {
      const c = diffTrip(published, now).find(x => x.kind === kind)!;
      revertChange(published, now, c.revert!);
    }
    // only the edited paragraph and the title still differ
    expect(diffTrip(published, now).map(c => c.what).sort()).toEqual(["ชื่อทริป", "แก้ย่อหน้า · Day 1"].sort());
    for (const c of diffTrip(published, now)) revertChange(published, now, c.revert!);
    expect(diffTrip(published, now)).toEqual([]);
    expect(JSON.stringify(now.days)).toBe(JSON.stringify(published.days));
  });

  it("a photo set with the same count and layout says what changed", () => {
    const now = clone(published);
    const set = now.days.flatMap(d => d.blocks).find(b => b.type === "images" && b.data.items.length > 1)!;
    if (set.type === "images") set.data.items.reverse();
    const [c] = diffTrip(published, now);
    expect(c.after).toBe("สลับลำดับรูป");
  });
});
