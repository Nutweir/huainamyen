import { describe, expect, it } from "vitest";
import seed from "@/content/seed/huai-nam-yen.json";
import type { TripBundle } from "@/types/content";
import { checkTrip } from "@/services/publishCheck";
import { newBlock } from "@/services/factory";
import { clone } from "@/utils/format";

const bundle = seed as unknown as TripBundle;

describe("pre-publish check", () => {
  it("the migrated journal has nothing that would break for readers", () => {
    expect(checkTrip(bundle).filter(i => i.level === "error")).toEqual([]);
  });

  it("finds empty text, missing photos, waiting slots and missing alt — and says where", () => {
    const b = clone(bundle);
    const blocks = b.days[1].blocks;
    const empty = newBlock("paragraph");
    const noPhoto = newBlock("image");
    const slot = newBlock("placeholder", { label: "รูปน้ำตก" });
    blocks.push(empty, noPhoto, slot);
    // a photo shown in the story, with its description removed everywhere
    const shown = b.days[0].blocks.find(x => x.type === "image" && !x.data.item.alt && !x.data.item.hidden)!;
    if (shown.type === "image") b.media.find(m => m.id === shown.data.item.mediaId)!.alt = "";
    const issues = checkTrip(b);
    const at = (id: string) => issues.filter(i => i.where.tab === "story" && i.where.blockId === id);
    expect(at(empty.id)[0]).toMatchObject({ level: "warn", where: { day: 1 } });
    expect(at(noPhoto.id)[0].level).toBe("error");
    expect(at(slot.id)[0].message).toContain("รูปน้ำตก");
    expect(at(shown.id).some(i => i.message.includes("alt"))).toBe(true);
  });

  it("catches duplicate link anchors and missing trip basics", () => {
    const b = clone(bundle);
    const firstEvent = b.days[0].blocks.find(x => x.type === "event")!;
    b.days[1].blocks.push({ ...clone(firstEvent), id: "dup" });
    b.trip.title = "";
    const issues = checkTrip(b);
    expect(issues.filter(i => i.message.includes("ซ้ำกัน")).length).toBe(2);
    expect(issues.some(i => i.where.tab === "trip" && i.level === "error")).toBe(true);
  });

  it("warns when days are out of calendar order (e.g. swapped by accident)", () => {
    const b = clone(bundle);
    b.days.reverse();
    const w = checkTrip(b).find(i => i.message.includes("ไม่เรียงตามวันที่"));
    expect(w).toMatchObject({ level: "warn", where: { tab: "story", day: 1 } });
    expect(checkTrip(bundle).some(i => i.message.includes("ไม่เรียงตามวันที่"))).toBe(false);
  });
});
