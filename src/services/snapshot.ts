import { clone } from "@/utils/format";
import type { Block, MediaAsset, MediaRef, SetItem, TripBundle, TripSummary } from "@/types/content";
import { isPlaceholder } from "@/types/content";
import { safeHref, safeMapEmbed, sanitizeInline, sanitizeNotes } from "@/utils/sanitize";

/** Every media id a bundle points at (photos, sets, decorations, clips + posters, cover, share image, ending, gallery). */
export function referencedMedia(bundle: TripBundle): Set<string> {
  const ids = new Set<string>();
  const add = (id: string | null | undefined) => { if (id) ids.add(id); };
  const ref = (r: MediaRef | null | undefined) => { if (r && !r.hidden) add(r.mediaId); };
  add(bundle.trip.coverId); add(bundle.trip.ogImageId);
  bundle.gallery.forEach(add);
  ref(bundle.ending?.photo);
  for (const day of bundle.days) for (const b of day.blocks) {
    if (b.type === "image" || b.type === "decoration") ref(b.data.item);
    if (b.type === "images") b.data.items.forEach((x: SetItem) => { if (!isPlaceholder(x)) ref(x); });
    if (b.type === "video") add(b.data.mediaId);
  }
  for (const m of bundle.media) if (ids.has(m.id) && m.posterId) ids.add(m.posterId);
  return ids;
}

/** Re-sanitize every rich-text field (defence in depth before saving or publishing). */
export function sanitizeBundle(bundle: TripBundle): TripBundle {
  const clean = clone(bundle);
  for (const day of clean.days) for (const b of day.blocks as Block[]) {
    const d = b.data as unknown as Record<string, unknown>;
    if (typeof d.html === "string") d.html = sanitizeInline(d.html);
    if (b.type === "event") b.data.title = sanitizeInline(b.data.title);
    if (b.type === "verse") b.data.lines = b.data.lines.map(sanitizeInline);
    if (b.type === "images") b.data.caption = sanitizeInline(b.data.caption);
    if (b.type === "image") b.data.text = b.data.text.map(sanitizeInline);
  }
  if (clean.ending) {
    clean.ending.prelude = clean.ending.prelude.map(s => s.map(sanitizeInline));
    clean.ending.stanzas = clean.ending.stanzas.map(s => s.map(sanitizeInline));
  }
  if (clean.notes) {
    clean.notes.sections = clean.notes.sections.map(s => ({ ...s, html: sanitizeNotes(s.html) }));
    clean.notes.contacts = clean.notes.contacts.map(c => ({ ...c, href: safeHref(c.href) }));
    clean.notes.places = clean.notes.places.map(p => ({ ...p, embed: safeMapEmbed(p.embed) }));
  }
  return clean;
}

/** What readers get when a trip is published: sanitized content and only the media it shows. */
export function buildSnapshot(bundle: TripBundle): TripBundle {
  const clean = sanitizeBundle(bundle);
  const used = referencedMedia(clean);
  clean.media = clean.media.filter((m: MediaAsset) => used.has(m.id)).map(m => ({ ...m, originalPath: null }));
  clean.days = clean.days.map(d => ({ ...d, blocks: d.blocks.filter(b => !(b.type === "image" && b.data.item.hidden)) }));
  return clean;
}

export function summarize(bundle: TripBundle): TripSummary {
  const t = bundle.trip;
  return {
    id: t.id, slug: t.slug, title: t.title, location: t.location, startDate: t.startDate, endDate: t.endDate,
    summary: t.summary, status: t.status, coverId: t.coverId, cover: bundle.media.find(m => m.id === t.coverId) || null,
    tags: t.tags, updatedAt: t.updatedAt, publishedAt: t.publishedAt,
  };
}

/** Stable JSON export (and import check) — the long-term archive format. */
export function exportBundle(bundle: TripBundle): string {
  return JSON.stringify({ format: "journeys-by-nutweir/trip", exportedAt: new Date().toISOString(), ...sanitizeBundle(bundle) }, null, 2);
}
export function parseImport(text: string): TripBundle {
  const data = JSON.parse(text);
  if (data.schema !== 1 || !data.trip || !Array.isArray(data.days)) throw new Error("ไฟล์นี้ไม่ใช่ข้อมูลทริปที่ส่งออกจากระบบนี้");
  const { format: _format, exportedAt: _at, ...bundle } = data;
  return sanitizeBundle(bundle as TripBundle);
}
