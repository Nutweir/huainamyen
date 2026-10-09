import type { Block, MediaAsset, MediaRef, TripBundle } from "@/types/content";
import { isPlaceholder } from "@/types/content";
import { toText } from "@/utils/sanitize";
import { autoLayout, checkSize, LAYOUT_ADVICE } from "@/utils/media";

/*
 * What to look at before publishing. "error" = readers would see something broken (publish is held
 * back); "warn" = worth a look (publish anyway is fine). Each issue says where it is, so the editor
 * can take you there.
 */
export interface Issue {
  level: "error" | "warn";
  message: string;
  where: { tab: "story"; day: number; blockId: string } | { tab: "trip" | "notes" };
}

export function checkTrip(bundle: TripBundle): Issue[] {
  const issues: Issue[] = [];
  const media = new Map(bundle.media.map(m => [m.id, m]));
  const t = bundle.trip;
  const trip = (level: Issue["level"], message: string) => issues.push({ level, message, where: { tab: "trip" } });

  if (!t.title.trim()) trip("error", "ยังไม่มีชื่อทริป");
  if (!t.slug.trim()) trip("error", "ยังไม่มีลิงก์ (slug)");
  if (!t.startDate) trip("error", "ยังไม่ได้ใส่วันไป");
  if (!t.coverId) trip("warn", "ยังไม่มีรูปปก — หน้ารวมทริปจะไม่มีรูป");
  else if (!media.has(t.coverId)) trip("error", "รูปปกหายไปจากคลัง");
  if (!(t.seoDescription || t.summary).trim()) trip("warn", "ยังไม่มีเรื่องย่อ — ตอนแชร์ลิงก์จะไม่มีคำอธิบาย");

  const anchors = new Map<string, number>();
  bundle.days.forEach((day, d) => {
    if (!day.blocks.length) issues.push({ level: "warn", message: `Day ${d + 1} ยังว่าง`, where: { tab: "story", day: d, blockId: "" } });
    for (const b of day.blocks) {
      const at = (level: Issue["level"], message: string) => issues.push({ level, message, where: { tab: "story", day: d, blockId: b.id } });
      blockIssues(b, media, at);
      if (b.type === "event" && b.data.anchor) anchors.set(b.data.anchor, (anchors.get(b.data.anchor) || 0) + 1);
    }
  });
  for (const [anchor, n] of anchors) {
    if (n < 2) continue;
    bundle.days.forEach((day, d) => day.blocks.forEach(b => {
      if (b.type === "event" && b.data.anchor === anchor) issues.push({ level: "error", message: `ลิงก์ภายใน #${anchor} ซ้ำกัน — ลิงก์จะพาไปผิดที่`, where: { tab: "story", day: d, blockId: b.id } });
    }));
  }
  return issues;
}

const LABEL: Partial<Record<Block["type"], string>> = { paragraph: "ย่อหน้า", heading: "หัวข้อย่อย", thought: "ประโยคเด่น", note: "โน้ตลายมือ", quote: "คำพูด" };

function photoIssues(ref: MediaRef, media: Map<string, MediaAsset>, layout: string, at: (l: Issue["level"], m: string) => void, label = "รูป") {
  if (!ref.mediaId) return at("error", `${label}: ยังไม่ได้เลือกรูป`);
  const a = media.get(ref.mediaId);
  if (!a) return at("error", `${label}: รูปหายไปจากคลัง`);
  if (ref.hidden) return;
  if (!(ref.alt || a.alt).trim()) at("warn", `${label}: ยังไม่มีคำอธิบายรูป (alt) สำหรับผู้พิการทางสายตา`);
  if (tooSmall(a, layout)) at("warn", `${label}: เล็กกว่าที่แนะนำ อาจไม่คมบนจอใหญ่`);
}
// cropping to the layout's shape is by design; only a photo too small to look sharp is worth a word
const tooSmall = (a: MediaAsset, layout: string) => checkSize(a.width, a.height, LAYOUT_ADVICE[layout || autoLayout(a)] || LAYOUT_ADVICE[""]).notes.some(n => n.startsWith("เล็กกว่า"));

function blockIssues(b: Block, media: Map<string, MediaAsset>, at: (l: Issue["level"], m: string) => void) {
  switch (b.type) {
    case "paragraph": case "heading": case "thought": case "note": case "quote":
      if (!toText(b.data.html).trim()) at("warn", `${LABEL[b.type]}ว่าง — จะเป็นช่องว่างบนหน้าเว็บ`);
      break;
    case "event":
      if (!b.data.title.trim() && !b.data.quietTitle) at("warn", "ช่วงเวลายังไม่มีชื่อ");
      break;
    case "image":
      photoIssues(b.data.item, media, b.data.layout, at);
      break;
    case "decoration":
      photoIssues(b.data.item, media, "decoration", at, "รูปตกแต่ง");
      break;
    case "images": {
      const real = b.data.items.filter(i => !isPlaceholder(i)) as MediaRef[];
      if (!b.data.items.length) at("warn", "ชุดรูปยังไม่มีรูป");
      const waiting = b.data.items.length - real.length;
      if (waiting) at("warn", `ชุดรูปมีช่องรอรูป ${waiting} ช่อง — ไม่แสดงบนเว็บจนกว่าจะใส่รูป`);
      // one line per kind of problem for the whole set, not one per photo
      const missing = real.filter(r => !r.mediaId || !media.has(r.mediaId)).length;
      const shown = real.filter(r => r.mediaId && media.has(r.mediaId) && !r.hidden).map(r => ({ r, a: media.get(r.mediaId)! }));
      const noAlt = shown.filter(x => !(x.r.alt || x.a.alt).trim()).length;
      const small = shown.filter(x => tooSmall(x.a, b.data.layout)).length;
      if (missing) at("error", `ชุดรูป: ${missing} รูปหายไปจากคลัง`);
      if (noAlt) at("warn", `ชุดรูป: ${noAlt} รูปยังไม่มีคำอธิบายรูป (alt)`);
      if (small) at("warn", `ชุดรูป: ${small} รูปเล็กกว่าที่แนะนำ อาจไม่คมบนจอใหญ่`);
      break;
    }
    case "placeholder":
      at("warn", `ช่องรอรูป${b.data.label ? ` “${b.data.label}”` : ""} ยังไม่ได้ใส่รูป — ไม่แสดงบนเว็บ`);
      break;
    case "video":
      if (!b.data.mediaId) at("error", "วิดีโอ: ยังไม่ได้เลือกคลิป");
      else if (!media.has(b.data.mediaId)) at("error", "วิดีโอ: คลิปหายไปจากคลัง");
      break;
    case "dialogue":
      if (!b.data.lines.some(l => l.line.trim())) at("warn", "บทสนทนาว่าง");
      break;
    case "verse": case "letter":
      if (!b.data.lines.some(l => l.trim())) at("warn", "ข้อความว่าง");
      break;
  }
}
