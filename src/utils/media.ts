import type { ImageLayout, MediaAsset, MediaRef, SetLayout } from "@/types/content";
import { stampDate } from "./format";

/*
 * Photo presets, ported from the static site's journal-images.js where they were tuned and tested.
 * sizes: what the browser should download for; crop: the shape the page crops to (if it crops).
 */
export interface Preset { sizes: string; crop?: string; priority?: boolean; expandable?: boolean; beside?: boolean; tilt?: number[] }

export const IMAGE_PRESETS: Record<ImageLayout, Preset> = {
  hero: { sizes: "100vw", priority: true },
  full: { sizes: "100vw" },
  spotlight: { sizes: "(min-width: 720px) 70vh, 100vw" },
  background: { sizes: "100vw", expandable: false },
  wide: { sizes: "(min-width: 1120px) 1080px, 100vw", crop: "3 / 2" },
  inline: { sizes: "(min-width: 720px) 680px, 100vw" },
  portrait: { sizes: "(min-width: 720px) 460px, 100vw", beside: true },
  polaroid: { sizes: "320px", crop: "1 / 1", beside: true, tilt: [-1.6, 1.8] },
  "diary-photo": { sizes: "260px", beside: true, tilt: [-2.4, 2] },
};
export const SET_PRESETS: Record<SetLayout, Preset> = {
  "two-column": { sizes: "(min-width: 900px) 430px, 50vw", crop: "4 / 5" },
  collage: { sizes: "(min-width: 900px) 520px, 60vw" },
  "memory-stack": { sizes: "320px", crop: "4 / 5", tilt: [-5, 4, -1.5, 2.5] },
  "film-strip": { sizes: "240px" },
  gallery: { sizes: "(min-width: 720px) 220px, 33vw", crop: "1 / 1" },
};

/** Recommended photo per layout (shown in the admin next to the layout picker). */
export const LAYOUT_ADVICE: Record<string, { ratio?: [number, number]; crops?: boolean; min: number; text: string }> = {
  "": { min: 1200, text: "ระบบเลือกรูปแบบให้ตามรูป · ด้านยาวอย่างน้อย 1200 px" },
  hero: { ratio: [16, 9], crops: true, min: 1800, text: "แนวนอน 16:9 · กว้างอย่างน้อย 1800 px" },
  full: { ratio: [3, 2], min: 1800, text: "แนวนอน 3:2 หรือ 16:9 · กว้างอย่างน้อย 1800 px · จอใหญ่แสดงทั้งใบ" },
  spotlight: { ratio: [3, 4], min: 1400, text: "แนวตั้ง 3:4–9:16 · สูงอย่างน้อย 1400 px" },
  background: { ratio: [16, 9], crops: true, min: 1800, text: "แนวนอน 16:9 · กว้างอย่างน้อย 1800 px" },
  wide: { ratio: [3, 2], crops: true, min: 1600, text: "แนวนอน 3:2 · อย่างน้อย 1600×1067 px" },
  inline: { min: 1200, text: "สัดส่วนไหนก็ได้ · ด้านยาวอย่างน้อย 1200 px" },
  portrait: { ratio: [4, 5], min: 1150, text: "แนวตั้ง 4:5 · อย่างน้อย 920×1150 px" },
  polaroid: { ratio: [1, 1], crops: true, min: 700, text: "สี่เหลี่ยมจัตุรัส 1:1 · อย่างน้อย 700×700 px" },
  "diary-photo": { min: 600, text: "สัดส่วนไหนก็ได้ · ด้านยาวอย่างน้อย 600 px" },
  "two-column": { ratio: [4, 5], crops: true, min: 1100, text: "แนวตั้ง 4:5 ทุกรูป · อย่างน้อย 880×1100 px" },
  collage: { ratio: [4, 5], crops: true, min: 1100, text: "แนวตั้ง 4:5 · รูปแรกใหญ่ที่สุด" },
  "memory-stack": { ratio: [4, 5], crops: true, min: 800, text: "แนวตั้ง 4:5 · อย่างน้อย 640×800 px" },
  "film-strip": { min: 600, text: "สัดส่วนไหนก็ได้ · สูงอย่างน้อย 600 px" },
  gallery: { ratio: [1, 1], crops: true, min: 600, text: "สี่เหลี่ยมจัตุรัส 1:1 · อย่างน้อย 600×600 px" },
  decoration: { ratio: [4, 5], crops: true, min: 400, text: "รูปเล็ก 4:5 · อย่างน้อย 320×400 px" },
};

export function checkSize(w: number, h: number, advice: { ratio?: [number, number]; crops?: boolean; min: number }): { ok: boolean; notes: string[] } {
  const notes: string[] = [];
  if (!w || !h) return { ok: true, notes };
  if (Math.max(w, h) < advice.min) notes.push(`เล็กกว่าที่แนะนำ (ด้านยาว ${Math.max(w, h)} px)`);
  if (advice.ratio && advice.crops) {
    const want = advice.ratio[0] / advice.ratio[1];
    if (Math.abs(w / h - want) / want > 0.06) notes.push(`สัดส่วนไม่ตรง ${advice.ratio.join(":")} หน้าเว็บจะตัดขอบ`);
  }
  return { ok: notes.length === 0, notes };
}

/** Automatic layout when the author didn't choose one. */
export function autoLayout(asset: Pick<MediaAsset, "width" | "height"> | null): ImageLayout {
  if (!asset || !asset.width) return "inline";
  return asset.width > asset.height ? "wide" : "portrait";
}
export function autoSetLayout(count: number): SetLayout {
  return count === 2 ? "two-column" : count <= 4 ? "collage" : "gallery";
}

/** Photo as shown in one spot: asset fields, overridden by what this spot sets. */
export interface ResolvedPhoto {
  asset: MediaAsset;
  alt: string; caption: string; time: string; date: string; location: string; camera: string; note: string;
  rotation?: number; size?: "s" | "m" | "l"; aspectRatio?: string; expandable?: boolean; focus: string | null;
}
export function resolvePhoto(ref: MediaRef | null | undefined, media: Map<string, MediaAsset>): ResolvedPhoto | null {
  if (!ref || ref.hidden) return null;
  const asset = media.get(ref.mediaId);
  if (!asset) return null;
  return {
    asset,
    alt: ref.alt ?? asset.alt ?? "",
    caption: ref.caption ?? asset.caption ?? "",
    time: ref.time ?? asset.takenTime ?? "",
    date: ref.date ?? asset.takenDate ?? "",
    location: ref.location ?? asset.location ?? "",
    camera: ref.camera ?? asset.camera ?? "",
    note: ref.note ?? asset.note ?? "",
    rotation: ref.rotation, size: ref.size, aspectRatio: ref.aspectRatio, expandable: ref.expandable,
    focus: asset.focus,
  };
}

/** What is written on the back of the print: date · time · place. Only when a time, place or date is known. */
export function backOfPhoto(p: ResolvedPhoto, dayDate: string | null): string {
  if (!p.time && !p.location && !p.date) return "";
  return [stampDate(p.date || dayDate), p.time, p.location].filter(Boolean).join(" · ");
}

export const VARIANT_EDGES = [500, 1000] as const;
