import type { Block, TripBundle } from "@/types/content";
import { BLOCK_LABELS } from "@/services/factory";
import { toText } from "@/utils/sanitize";
import { clone } from "@/utils/format";

/*
 * What the working copy changes compared with what readers see now (the published snapshot).
 * Plain-language lines, each pointing at where to look. Order and wording only; it never edits anything.
 */
export interface Change {
  kind: "added" | "removed" | "changed" | "moved";
  what: string;
  before?: string;
  after?: string;
  where: { tab: "story"; day: number; blockId: string } | { tab: "trip" | "notes" };
  /** How to put just this back the way readers see it (see revertChange). */
  revert?: Revert;
}
export type Revert =
  | { t: "field"; key: keyof TripBundle["trip"] }
  | { t: "data" | "place"; id: string }
  | { t: "day"; id: string }
  | { t: "ending" | "gallery" | "notes" };

const TRIP_FIELDS: [keyof TripBundle["trip"], string][] = [
  ["title", "ชื่อทริป"], ["titleLocal", "ชื่อรอง"], ["slug", "ลิงก์"], ["location", "สถานที่"], ["startDate", "วันไป"],
  ["endDate", "วันกลับ"], ["durationLabel", "ระยะเวลา"], ["companions", "ไปกับใคร"], ["summary", "เรื่องย่อ"],
  ["epigraph", "คำนำบนหน้าปก"], ["coverMeta", "ข้อมูลบนหน้าปก"], ["tags", "แท็ก"], ["coverId", "รูปปก"],
  ["ogImageId", "รูปตอนแชร์"], ["seoTitle", "ชื่อหน้า (SEO)"], ["seoDescription", "คำอธิบาย (SEO)"],
];

const show = (v: unknown): string => {
  if (v == null || v === "") return "(ว่าง)";
  if (Array.isArray(v)) return v.map(x => (Array.isArray(x) ? x.join(": ") : String(x))).join(" / ") || "(ว่าง)";
  return String(v);
};
const short = (s: string, n = 90) => (s.length > n ? `${s.slice(0, n)}…` : s);

/** One readable line for a block, to show before → after. */
export function describe(b: Block): string {
  const d = b.data as Record<string, unknown>;
  if (typeof d.html === "string") return short(toText(d.html)) || "(ว่าง)";
  switch (b.type) {
    case "event": return `${b.data.time} ${b.data.title}`.trim();
    case "dialogue": return short(b.data.lines.map(l => `${l.who}: ${l.line}`).join(" / "));
    case "verse": case "letter": return short(toText(b.data.lines.join(" / ")));
    case "pause": case "mark": return b.data.text || "—";
    case "stamp": return `${b.data.value} ${b.data.label}`;
    case "images": return `${b.data.items.length} รูป · ${b.data.layout || "อัตโนมัติ"}`;
    case "image": return `${b.data.item.caption || "รูป"} · ${b.data.layout || "อัตโนมัติ"}${b.data.position ? ` · ${b.data.position}` : ""}`;
    default: return BLOCK_LABELS[b.type];
  }
}

/** When both lines read the same (e.g. "3 รูป · collage"), say what did change. */
function detail(a: Block, b: Block): string {
  if (a.type === "images" && b.type === "images") {
    const ids = (x: typeof a) => x.data.items.map(i => ("mediaId" in i ? i.mediaId : i.placeholder));
    const [p, n] = [ids(a), ids(b)];
    if (p.join() !== n.join() && [...p].sort().join() === [...n].sort().join()) return "สลับลำดับรูป";
    if (p.join() !== n.join()) return "เปลี่ยนรูปในชุด";
    if (a.data.caption !== b.data.caption) return `คำบรรยาย: ${short(b.data.caption || "(ว่าง)")}`;
    if (a.data.position !== b.data.position) return `ตำแหน่ง: ${b.data.position || "อัตโนมัติ"}`;
    return "แก้คำบรรยายหรือรายละเอียดของรูป";
  }
  return "แก้รายละเอียด (เช่น คำบรรยาย ตำแหน่ง)";
}

export function diffTrip(published: TripBundle | null, current: TripBundle): Change[] {
  if (!published) return [{ kind: "added", what: "ยังไม่เคยเผยแพร่ — ทั้งทริปจะเป็นของใหม่สำหรับผู้อ่าน", where: { tab: "trip" } }];
  const out: Change[] = [];
  for (const [k, label] of TRIP_FIELDS) {
    const was = published.trip[k], now = current.trip[k];
    if (JSON.stringify(was ?? null) === JSON.stringify(now ?? null)) continue;
    if (Array.isArray(was) && Array.isArray(now)) {
      // lists (cover lines, tags…): only the lines that differ, so the change is visible however long the list
      const key = (x: unknown) => JSON.stringify(x);
      const gone = was.filter(x => !now.some(y => key(y) === key(x))), came = now.filter(x => !was.some(y => key(y) === key(x)));
      out.push({ kind: "changed", what: label, before: gone.length ? short(show(gone)) : "(ลำดับเดิม)", after: came.length ? short(show(came)) : "(สลับลำดับ)", where: { tab: "trip" }, revert: { t: "field", key: k } });
    } else out.push({ kind: "changed", what: label, before: short(show(was)), after: short(show(now)), where: { tab: "trip" }, revert: { t: "field", key: k } });
  }

  // blocks, matched by id across all days
  const old = new Map<string, { b: Block; day: number; i: number }>();
  published.days.forEach((d, day) => d.blocks.forEach((b, i) => old.set(b.id, { b, day, i })));
  const seen = new Set<string>();
  current.days.forEach((d, day) => {
    // positions among blocks that existed before, to tell a real move from a neighbour being added
    const kept = d.blocks.filter(b => old.get(b.id)?.day === day).map(b => b.id);
    const keptBefore = published.days[day]?.blocks.filter(b => kept.includes(b.id)).map(b => b.id) || [];
    d.blocks.forEach(b => {
      seen.add(b.id);
      const where = { tab: "story" as const, day, blockId: b.id };
      const was = old.get(b.id);
      const label = BLOCK_LABELS[b.type];
      if (!was) { out.push({ kind: "added", what: `เพิ่ม${label} · Day ${day + 1}`, after: describe(b), where, revert: { t: "place", id: b.id } }); return; }
      if (JSON.stringify(was.b.data) !== JSON.stringify(b.data) || was.b.type !== b.type) {
        const [before, after] = [describe(was.b), describe(b)];
        out.push({ kind: "changed", what: `แก้${label} · Day ${day + 1}`, before, after: before === after ? detail(was.b, b) : after, where, revert: { t: "data", id: b.id } });
      }
      if (was.day !== day) out.push({ kind: "moved", what: `ย้าย${label} จาก Day ${was.day + 1} ไป Day ${day + 1}`, after: describe(b), where, revert: { t: "place", id: b.id } });
      else if (kept.indexOf(b.id) !== keptBefore.indexOf(b.id)) out.push({ kind: "moved", what: `ย้ายตำแหน่ง${label} · Day ${day + 1}`, after: describe(b), where, revert: { t: "place", id: b.id } });
    });
  });
  for (const [id, { b, day }] of old) {
    if (!seen.has(id)) out.push({ kind: "removed", what: `ลบ${BLOCK_LABELS[b.type]} · Day ${day + 1}`, before: describe(b), where: { tab: "story", day: Math.min(day, current.days.length - 1), blockId: "" }, revert: { t: "place", id } });
  }

  // days, closing pages, film roll, travel notes
  if (published.days.length !== current.days.length) out.push({ kind: "changed", what: "จำนวนวัน", before: String(published.days.length), after: String(current.days.length), where: { tab: "story", day: 0, blockId: "" } });
  current.days.forEach((d, day) => {
    const p = published.days.find(x => x.id === d.id);
    if (p && JSON.stringify([p.date, p.route, p.mood, p.closing]) !== JSON.stringify([d.date, d.route, d.mood, d.closing])) out.push({ kind: "changed", what: `ตั้งค่า Day ${day + 1} (วันที่ เส้นทาง บรรยากาศ ประโยคปิดวัน)`, where: { tab: "story", day, blockId: "" }, revert: { t: "day", id: d.id } });
  });
  if (JSON.stringify(published.ending) !== JSON.stringify(current.ending)) out.push({ kind: "changed", what: "หน้าปิดท้าย", where: { tab: "trip" }, revert: { t: "ending" } });
  if (JSON.stringify(published.gallery) !== JSON.stringify(current.gallery)) out.push({ kind: "changed", what: "ม้วนฟิล์ม", before: `${published.gallery.length} รูป`, after: `${current.gallery.length} รูป`, where: { tab: "trip" }, revert: { t: "gallery" } });
  if (JSON.stringify(published.notes) !== JSON.stringify(current.notes)) out.push({ kind: "changed", what: "ข้อมูลการเดินทาง", where: { tab: "notes" }, revert: { t: "notes" } });
  return out;
}

/**
 * Put one change back the way readers see it, leaving everything else as it is.
 * data: the block's content in place · place: where the block sits (an added block goes, a removed one comes back).
 */
export function revertChange(published: TripBundle, current: TripBundle, r: Revert): void {
  const find = (b: TripBundle, id: string) => {
    for (let day = 0; day < b.days.length; day++) {
      const i = b.days[day].blocks.findIndex(x => x.id === id);
      if (i >= 0) return { day, i, b: b.days[day].blocks[i] };
    }
    return null;
  };
  switch (r.t) {
    case "field": (current.trip as unknown as Record<string, unknown>)[r.key] = clone(published.trip[r.key] ?? null); return;
    case "ending": current.ending = clone(published.ending); return;
    case "gallery": current.gallery = clone(published.gallery); return;
    case "notes": current.notes = clone(published.notes); return;
    case "day": {
      const p = published.days.find(d => d.id === r.id), d = current.days.find(x => x.id === r.id);
      if (p && d) Object.assign(d, clone({ date: p.date, route: p.route, mood: p.mood, closing: p.closing }));
      return;
    }
    case "data": {
      const was = find(published, r.id), now = find(current, r.id);
      if (was && now) current.days[now.day].blocks[now.i] = { ...now.b, type: was.b.type, data: clone(was.b.data) } as Block;
      return;
    }
    case "place": {
      const was = find(published, r.id), now = find(current, r.id);
      if (now) current.days[now.day].blocks.splice(now.i, 1);
      if (!was) return;
      const pday = published.days[was.day];
      const target = current.days.find(d => d.id === pday.id) || current.days[Math.min(was.day, current.days.length - 1)];
      if (!target) return;
      // right after the nearest block that came before it for readers
      let at = 0;
      for (let k = was.i - 1; k >= 0; k--) {
        const j = target.blocks.findIndex(x => x.id === pday.blocks[k].id);
        if (j >= 0) { at = j + 1; break; }
      }
      target.blocks.splice(at, 0, now ? now.b : clone(was.b));
    }
  }
}
