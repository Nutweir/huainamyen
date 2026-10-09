import type { TripBundle } from "@/types/content";
import { newBlock, newDay } from "@/services/factory";
import { slugify } from "@/utils/format";

/*
 * Starting shapes for a new trip: only structure (days and the moments of each day, named by time of
 * day). Every word of the story is still the author's to write.
 */
export interface TripTemplate { id: string; label: string; hint: string; days: string[][] }

export const TRIP_TEMPLATES: TripTemplate[] = [
  { id: "blank", label: "เปล่า", hint: "หนึ่งวัน ยังไม่มีอะไร เริ่มจากศูนย์", days: [[]] },
  { id: "day", label: "ไปเช้าเย็นกลับ", hint: "1 วัน · เช้า บ่าย เย็น", days: [["เช้า", "บ่าย", "เย็น"]] },
  { id: "weekend", label: "2 วัน 1 คืน", hint: "วันแรก เช้า–ค่ำ · วันที่สอง เช้า บ่าย", days: [["เช้า", "บ่าย", "เย็น", "ค่ำ"], ["เช้า", "บ่าย"]] },
  { id: "three", label: "3 วัน 2 คืน", hint: "3 วัน · เช้า บ่าย เย็น ทุกวัน", days: [["เช้า", "บ่าย", "เย็น"], ["เช้า", "บ่าย", "เย็น"], ["เช้า", "บ่าย"]] },
];

/** Date n days after an ISO date (UTC, so time zones never shift it). */
export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** The last day of a trip that starts on `start` with this template. */
export const endDateFor = (start: string, t: TripTemplate) => (start && t.days.length > 1 ? addDays(start, t.days.length - 1) : start || "");

/** A link for the trip: from an English title, otherwise from the start date ("trip-2027-02-01"). */
export const suggestSlug = (title: string, start: string) => slugify(title) || (start ? `trip-${start}` : "");

/** Days and moments for the template, dated from the trip's start; replaces the empty first day. */
export function applyTemplate(bundle: TripBundle, t: TripTemplate): TripBundle {
  const start = bundle.trip.startDate;
  bundle.days = t.days.map((moments, i) => {
    const day = newDay(i + 1, start ? addDays(start, i) : null);
    day.blocks = moments.map(time => newBlock("event", { time, title: "" }));
    return day;
  });
  if (t.days.length > 1 && !bundle.trip.durationLabel) bundle.trip.durationLabel = `${t.days.length} Days / ${t.days.length - 1} Night${t.days.length > 2 ? "s" : ""}`;
  return bundle;
}
