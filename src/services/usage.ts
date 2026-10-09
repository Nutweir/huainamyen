import type { TripBundle } from "@/types/content";
import { isPlaceholder } from "@/types/content";
import { BLOCK_LABELS } from "@/services/factory";

/* Where each photo/clip is used, across all trips: so the library can say "used in…" and find unused ones. */
export interface Use {
  tripId: string;
  tripTitle: string;
  label: string;
  /** link into the editor: a block, or a tab */
  blockId: string | null;
  tab: "story" | "trip";
}

export function mediaUsage(bundles: TripBundle[]): Map<string, Use[]> {
  const out = new Map<string, Use[]>();
  const add = (id: string | null | undefined, use: Use) => { if (id) out.set(id, [...(out.get(id) || []), use]); };
  for (const b of bundles) {
    const base = { tripId: b.trip.id, tripTitle: b.trip.title || "(ไม่มีชื่อ)" };
    add(b.trip.coverId, { ...base, label: "รูปปก", blockId: null, tab: "trip" });
    add(b.trip.ogImageId, { ...base, label: "รูปตอนแชร์", blockId: null, tab: "trip" });
    b.gallery.forEach(id => add(id, { ...base, label: "ม้วนฟิล์ม", blockId: null, tab: "trip" }));
    add(b.ending?.photo?.mediaId, { ...base, label: "หน้าปิดท้าย", blockId: null, tab: "trip" });
    b.days.forEach(d => {
      let moment = "";
      for (const x of d.blocks) {
        if (x.type === "event") moment = `${x.data.time} ${x.data.title}`.trim();
        const label = `Day ${String(d.dayNumber).padStart(2, "0")}${moment ? ` · ${moment}` : ""} · ${BLOCK_LABELS[x.type]}`;
        const use = { ...base, label, blockId: x.id, tab: "story" as const };
        if (x.type === "image" || x.type === "decoration") add(x.data.item.mediaId, use);
        else if (x.type === "video") add(x.data.mediaId, use);
        else if (x.type === "images") x.data.items.forEach(i => { if (!isPlaceholder(i)) add(i.mediaId, use); });
      }
    });
  }
  return out;
}
