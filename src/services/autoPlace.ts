import type { Block, MediaAsset, TripBundle } from "@/types/content";
import { isTime } from "@/utils/format";

/*
 * Where should a photo go, from when it was taken (EXIF date and time)? The day is the one with the
 * same date; the moment is the last one that started before the photo. Moments named in words
 * ("บ่าย", "เย็น"…) get an estimated clock time, kept in story order. Only a suggestion: the author
 * confirms or changes every one.
 */
export interface Target { day: number; eventId: string | null } // eventId null = the start of the day, before its first moment
export interface Proposal { asset: MediaAsset; target: Target | null; why: string }
export interface EventOption { day: number; eventId: string | null; label: string; minutes: number }

const WORDS: [RegExp, number][] = [
  [/รุ่งสาง|เช้ามืด|ฟ้าสาง/, 5 * 60], [/เช้า/, 7 * 60], [/สาย/, 10 * 60], [/เที่ยง/, 12 * 60], [/บ่าย/, 14 * 60],
  [/เย็น|พระอาทิตย์ตก/, 17 * 60], [/ค่ำ|พลบ/, 19 * 60], [/กลางคืน|ดึก/, 21 * 60],
];
const toMinutes = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };

/** Every moment of every day, with a clock time to compare against (estimated where the story uses words). */
export function eventOptions(bundle: TripBundle): EventOption[] {
  const out: EventOption[] = [];
  bundle.days.forEach((d, day) => {
    const dd = String(d.dayNumber).padStart(2, "0");
    out.push({ day, eventId: null, label: `Day ${dd} · ต้นวัน`, minutes: 0 });
    const events = d.blocks.filter((b): b is Block<"event"> => b.type === "event");
    // a clock time, or a time-of-day word; null = only its place in the story tells us
    const known = events.map(e => (isTime(e.data.time) ? toMinutes(e.data.time) : WORDS.find(([re]) => re.test(e.data.time))?.[1] ?? null));
    const est = known.map((m, i) => {
      if (m !== null) return m;
      // spread unnamed moments evenly between the known times around them
      let a = i - 1; while (a >= 0 && known[a] === null) a--;
      let z = i + 1; while (z < known.length && known[z] === null) z++;
      const from = a >= 0 ? known[a]! : 0, to = z < known.length ? known[z]! : Math.max(from, 23 * 60);
      return from + ((to - from) * (i - a)) / (z - a);
    });
    let last = 0;
    events.forEach((e, i) => {
      last = Math.max(last, Math.round(est[i]));
      out.push({ day, eventId: e.id, label: `Day ${dd} · ${`${e.data.time} ${e.data.title}`.trim()}`, minutes: last });
    });
  });
  return out;
}

export function propose(bundle: TripBundle, assets: MediaAsset[]): Proposal[] {
  const options = eventOptions(bundle);
  return assets.map(asset => {
    if (!asset.takenDate) return { asset, target: null, why: "ไฟล์นี้ไม่มีวันเวลาที่ถ่าย — เลือกเอง" };
    const day = bundle.days.findIndex(d => d.date === asset.takenDate);
    if (day < 0) return { asset, target: null, why: `ถ่ายวันที่ ${asset.takenDate} ไม่ตรงกับวันในทริป` };
    const t = asset.takenTime && isTime(asset.takenTime) ? toMinutes(asset.takenTime) : null;
    const inDay = options.filter(o => o.day === day && o.eventId);
    if (t === null || !inDay.length) return { asset, target: { day, eventId: null }, why: "ตามวันที่ถ่าย" };
    const hit = [...inDay].reverse().find(o => o.minutes <= t);
    return { asset, target: { day, eventId: hit?.eventId ?? null }, why: hit ? `ถ่าย ${asset.takenTime}` : `ถ่าย ${asset.takenTime} ก่อนช่วงเวลาแรก` };
  });
}

/** Index in the day's blocks where photos for this target go: the end of that moment (before the next one). */
export function insertIndex(blocks: Block[], eventId: string | null): number {
  const start = eventId ? blocks.findIndex(b => b.id === eventId) : -1;
  if (eventId && start < 0) return blocks.length;
  const next = blocks.findIndex((b, i) => i > start && b.type === "event");
  return next < 0 ? blocks.length : next;
}
