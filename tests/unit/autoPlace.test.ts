import { describe, expect, it } from "vitest";
import seed from "@/content/seed/huai-nam-yen.json";
import type { MediaAsset, TripBundle } from "@/types/content";
import { eventOptions, insertIndex, propose } from "@/services/autoPlace";

const bundle = seed as unknown as TripBundle;
const photo = (takenDate: string | null, takenTime: string | null) => ({ ...bundle.media[0], id: `p-${takenDate}-${takenTime}`, takenDate, takenTime }) as MediaAsset;
const eventTitle = (id: string | null) => {
  for (const d of bundle.days) for (const b of d.blocks) if (b.id === id && b.type === "event") return `${b.data.time} ${b.data.title}`;
  return null;
};

describe("placing photos by when they were taken", () => {
  it("matches the day by date and the moment by time", () => {
    const [p] = propose(bundle, [photo("2026-10-03", "20:48")]);
    expect(p.target?.day).toBe(0);
    expect(eventTitle(p.target!.eventId)).toContain("20:00");
  });

  it("moments told in words get a sensible time (afternoon, evening)", () => {
    const opts = eventOptions(bundle).filter(o => o.day === 0 && o.eventId);
    const minutes = opts.map(o => o.minutes);
    expect(minutes).toEqual([...minutes].sort((a, b) => a - b)); // story order kept
    const [p] = propose(bundle, [photo("2026-10-03", "15:10")]);
    expect(eventTitle(p.target!.eventId)).toContain("บ่าย");
  });

  it("moments without a time sit between the times around them (morning photo ≠ the walk back)", () => {
    const [p] = propose(bundle, [photo("2026-10-04", "10:05")]);
    expect(eventTitle(p.target!.eventId)).not.toContain("ขากลับ");
    const [late] = propose(bundle, [photo("2026-10-04", "15:30")]);
    expect(eventTitle(late.target!.eventId)).toContain("ขากลับ");
  });

  it("says why when it can't place a photo", () => {
    const [noTime, otherDay] = propose(bundle, [photo(null, null), photo("2025-01-01", "10:00")]);
    expect(noTime.target).toBeNull();
    expect(otherDay.target).toBeNull();
    expect(otherDay.why).toContain("2025-01-01");
  });

  it("goes at the end of the moment, just before the next one", () => {
    const blocks = bundle.days[0].blocks;
    const first = blocks.find(b => b.type === "event")!;
    const i = insertIndex(blocks, first.id);
    expect(blocks[i].type).toBe("event");
    expect(blocks[i].id).not.toBe(first.id);
  });
});
