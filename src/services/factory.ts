import type { Block, BlockDataMap, BlockType, TripBundle, TripDay } from "@/types/content";
import { uid } from "@/utils/format";

/** A new, empty trip with one day, ready to write in. */
export function emptyBundle(input: { title: string; slug: string; startDate: string; endDate: string | null; location: string }): TripBundle {
  const now = new Date().toISOString();
  return {
    schema: 1,
    trip: {
      id: uid(), slug: input.slug, title: input.title, titleLocal: "", location: input.location, startDate: input.startDate,
      endDate: input.endDate, durationLabel: "", summary: "", epigraph: [], coverId: null, coverMeta: [], tags: [], companions: "",
      seoTitle: "", seoDescription: "", ogImageId: null, status: "draft", publishedVersionId: null, publishedAt: null,
      sortOrder: 0, showPlaceholders: true, createdAt: now, updatedAt: now,
    },
    days: [newDay(1, input.startDate)],
    ending: null,
    gallery: [],
    notes: null,
    media: [],
  };
}

export function newDay(dayNumber: number, date: string | null): TripDay {
  return { id: uid(), dayNumber, date, route: [], mood: "morning", closing: "", blocks: [] };
}

const DEFAULTS: { [K in BlockType]: () => BlockDataMap[K] } = {
  event: () => ({ anchor: `moment-${uid().slice(0, 8)}`, time: "", title: "", mood: null, quietTitle: false }),
  paragraph: () => ({ html: "" }),
  heading: () => ({ html: "" }),
  thought: () => ({ html: "", size: "" }),
  note: () => ({ html: "" }),
  quote: () => ({ html: "", by: "" }),
  dialogue: () => ({ lines: [{ who: "", line: "" }] }),
  verse: () => ({ lines: [""] }),
  letter: () => ({ lines: [""], lead: "" }),
  pause: () => ({ text: "" }),
  mark: () => ({ text: "" }),
  spacer: () => ({ size: "m" }),
  stamp: () => ({ value: "", label: "", sub: "" }),
  image: () => ({ item: { mediaId: "" }, layout: "", position: "", tone: "", reveal: "", besideCount: 3, text: [] }),
  images: () => ({ items: [], layout: "", caption: "", position: "" }),
  placeholder: () => ({ label: "", layout: "", position: "" }),
  video: () => ({ mediaId: "", caption: "", label: "" }),
  decoration: () => ({ item: { mediaId: "" }, position: "" }),
};

export function newBlock<K extends BlockType>(type: K, data?: Partial<BlockDataMap[K]>): Block<K> {
  return { id: uid(), type, data: { ...DEFAULTS[type](), ...data } } as Block<K>;
}

export const BLOCK_LABELS: Record<BlockType, string> = {
  event: "ช่วงเวลา (Timeline)", paragraph: "ย่อหน้า", heading: "หัวข้อย่อย", thought: "ประโยคเด่น", note: "โน้ตลายมือ",
  quote: "คำพูดของใคร", dialogue: "บทสนทนา", verse: "บรรทัดสั้น ๆ", letter: "ข้อความถึงใคร", pause: "เว้นจังหวะ",
  mark: "เส้นคั่นเล็ก", spacer: "ช่องว่าง", stamp: "ตราประทับ", image: "รูป", images: "ชุดรูป / คอลลาจ",
  placeholder: "ช่องรอรูป", video: "วิดีโอ", decoration: "รูปตกแต่งข้างบันทึก",
};
