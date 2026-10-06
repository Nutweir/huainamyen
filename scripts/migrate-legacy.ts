/*
 * Convert the static site's Huai Nam Yen journal (legacy/ + public/trips/) into the new content model.
 *
 *   npm run migrate:legacy            → src/content/seed/huai-nam-yen.json + site.json
 *
 * Deterministic: ids come from the old keys (UUID v5), so running it again gives the same output.
 * Nothing is invented: every value comes from trip.js / images.js / uploads.js or the files on disk.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import { JSDOM } from "jsdom";
import { useWindow, sanitizeInline, sanitizeNotes, toText } from "../src/utils/sanitize.ts";
import type {
  Block, BlockDataMap, BlockType, ImageLayout, MediaAsset, MediaRef, Mood, SetItem, SetLayout, SiteSettings,
  TravelNotes, Trip, TripBundle, TripDay, TripEnding,
} from "../src/types/content.ts";
import { applyUploads, loadLegacy, type Legacy } from "./lib/legacy.ts";
import { imageSize } from "./lib/imagesize.ts";

const ROOT = process.cwd();
const SLUG = process.argv[2] || "huai-nam-yen";
const NOW = "2026-10-06T00:00:00.000Z"; // fixed so re-runs produce identical files

useWindow(new JSDOM("").window as unknown as Window & typeof globalThis);

// UUID v5 (RFC 4122) from a name, so legacy keys map to stable database ids.
const NS = "6f1c2a52-9d1e-4f4b-8a3e-0c5b7d2e9a11";
function uuid5(name: string): string {
  const ns = Buffer.from(NS.replace(/-/g, ""), "hex");
  const h = createHash("sha1").update(Buffer.concat([ns, Buffer.from(name, "utf8")])).digest();
  h[6] = (h[6] & 0x0f) | 0x50; h[8] = (h[8] & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString("hex");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}

const { trip: T, sizes, uploads } = loadLegacy(ROOT, SLUG);
applyUploads(T, uploads);
const TRIP_ID = uuid5(`trip:${SLUG}`);
const MEDIA_ROOT = `trips/${SLUG}/`; // served from public/ at the same URL as before
const lines = (v: string | string[]) => (Array.isArray(v) ? v : [v]).map(sanitizeInline).join("<br>");

/* ---------- media ---------- */
const media = new Map<string, MediaAsset>();
const MIME: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".mp4": "video/mp4", ".mov": "video/quicktime", ".webm": "video/webm" };

function fileInfo(rel: string): { bytes: number; exists: boolean } {
  const p = join(ROOT, "public", MEDIA_ROOT, rel);
  return existsSync(p) ? { bytes: statSync(p).size, exists: true } : { bytes: 0, exists: false };
}

/** Size from images.js / uploads.js, else read from the file itself. */
function sizeOf(rel: string, fallback?: [number, number]): [number, number] {
  if (sizes[rel]) return sizes[rel];
  if (fallback && fallback[0]) return fallback;
  const p = join(ROOT, "public", MEDIA_ROOT, rel);
  return (existsSync(p) && imageSize(p)) || [0, 0];
}

function variantsOf(rel: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const edge of ["500", "1000"]) if (fileInfo(`_sized/${edge}/${rel}`).exists) out[edge] = `${MEDIA_ROOT}_sized/${edge}/${rel}`;
  return out;
}

/** Asset for a legacy image key. Asset fields hold the photo's own caption/alt; spots may override. */
function imageAsset(key: string): MediaAsset | null {
  const e = T.images[key];
  if (!e) { console.warn(`! image key "${key}" not in registry`); return null; }
  const id = uuid5(`media:${SLUG}:${key}`);
  if (media.has(id)) return media.get(id)!;
  const [w, h] = sizeOf(e.src, e.w && e.h ? [e.w, e.h] : undefined);
  const f = fileInfo(e.src);
  if (!f.exists) console.warn(`! file missing for ${key}: ${e.src}`);
  const asset: MediaAsset = {
    id, kind: "image", path: MEDIA_ROOT + e.src, variants: variantsOf(e.src), originalPath: null,
    mime: MIME[extname(e.src).toLowerCase()] || "image/jpeg", width: w, height: h, bytes: f.bytes,
    alt: e.alt || "", caption: e.caption || "", takenDate: e.date || null, takenTime: e.time || null,
    location: e.location || "", camera: e.camera || "", note: e.note || "", focus: e.focus || null,
    tags: [], album: e.src.split("/")[0] || null, tripId: TRIP_ID, posterId: null, legacyKey: key,
    createdAt: NOW, updatedAt: NOW,
  };
  media.set(id, asset);
  return asset;
}

function fileAsset(rel: string, kind: "image" | "video", extra: Partial<MediaAsset> = {}): MediaAsset {
  const id = uuid5(`media:${SLUG}:file:${rel}`);
  if (media.has(id)) return media.get(id)!;
  const f = fileInfo(rel);
  if (!f.exists) console.warn(`! file missing: ${rel}`);
  const [w, h] = kind === "image" ? sizeOf(rel) : [0, 0];
  const asset: MediaAsset = {
    id, kind, path: MEDIA_ROOT + rel, variants: kind === "image" ? variantsOf(rel) : {}, originalPath: null,
    mime: MIME[extname(rel).toLowerCase()] || (kind === "video" ? "video/mp4" : "image/jpeg"), width: w, height: h, bytes: f.bytes,
    alt: "", caption: "", takenDate: null, takenTime: null, location: "", camera: "", note: "", focus: null,
    tags: [], album: rel.split("/")[0] || null, tripId: TRIP_ID, posterId: null, legacyKey: null,
    createdAt: NOW, updatedAt: NOW, ...extra,
  };
  media.set(id, asset);
  return asset;
}

const SPOT_FIELDS = ["caption", "alt", "time", "date", "location", "camera", "note"] as const;
const ASSET_FIELD: Record<(typeof SPOT_FIELDS)[number], keyof MediaAsset> = { caption: "caption", alt: "alt", time: "takenTime", date: "takenDate", location: "location", camera: "camera", note: "note" };

/** A legacy item ("key" or { image: key, caption… }) → MediaRef keeping only what differs from the asset. */
function ref(item: Legacy, chapterDate: string | null): MediaRef | null {
  const key = typeof item === "string" ? item : item.image ?? item.photo;
  if (typeof key !== "string") { console.warn("! inline image objects are not used in this trip", item); return null; }
  const asset = imageAsset(key);
  if (!asset) return null;
  const spot = typeof item === "object" ? item : {};
  const r: MediaRef = { mediaId: asset.id };
  for (const f of SPOT_FIELDS) {
    const v = spot[f];
    if (v !== undefined && v !== (asset[ASSET_FIELD[f]] ?? "")) (r as unknown as Record<string, string>)[f] = v;
  }
  if (r.date && r.date === chapterDate) delete r.date;
  for (const f of ["rotation", "size", "aspectRatio", "expandable", "hidden"] as const) if (spot[f] !== undefined) (r as unknown as Record<string, unknown>)[f] = spot[f];
  if (T.images[key]?.hidden) r.hidden = true;
  return r;
}

/* ---------- blocks ---------- */
let seq = 0;
function block<K extends BlockType>(type: K, data: BlockDataMap[K], anchor: string): Block {
  return { id: uuid5(`block:${SLUG}:${anchor}:${seq++}`), type, data } as Block;
}

const LEGACY_LAYOUT: Record<string, string> = { stage: "spotlight", pair: "two-column", trio: "collage" };
const layoutOf = (l: string | undefined) => (l ? LEGACY_LAYOUT[l] || l : "");

function convert(b: Legacy, host: string, date: string | null): Block[] {
  if (typeof b === "string") return [block("paragraph", { html: sanitizeInline(b) }, host)];
  if (!b || typeof b !== "object") return [];
  if (b.hiddenVideo) return []; // hidden in the old admin: not shown, the file stays in public/
  if (b.video) {
    const v = b.video;
    const poster = v.poster ? fileAsset(v.poster, "image") : null;
    const clip = fileAsset(v.src, "video", { width: v.w || 0, height: v.h || 0, posterId: poster ? poster.id : null, alt: v.label || "", caption: v.caption || "" });
    return [block("video", { mediaId: clip.id, caption: "", label: "" }, host)];
  }
  if (b.images || b.photos) {
    const items: SetItem[] = (b.images || b.photos).map((x: Legacy) => (x && x.placeholder ? { placeholder: x.placeholder } : ref(x, date))).filter(Boolean);
    return [block("images", { items, layout: layoutOf(b.layout) as SetLayout | "", caption: b.caption ? sanitizeInline(b.caption) : "", position: b.position || "" }, host)];
  }
  if (b.placeholder) return [block("placeholder", { label: b.placeholder, layout: layoutOf(b.layout) as ImageLayout | "", position: b.position || b.side || "" }, host)];
  if (b.image || b.photo) {
    const r = ref(b, date);
    if (!r) return [];
    return [block("image", {
      item: r, layout: layoutOf(b.layout) as ImageLayout | "", position: b.position || b.side || "", tone: b.tone || "", reveal: b.reveal || "",
      besideCount: b.with || 3, text: b.text ? [].concat(b.text) : [],
    }, host)];
  }
  if (b.note) return [block("note", { html: sanitizeInline(b.note) }, host)];
  if (b.thought) return [block("thought", { html: lines(b.thought), size: b.size === "xl" ? "xl" : "" }, host)];
  if (b.quote) return [block("quote", { html: lines(b.quote), by: b.by || "" }, host)];
  if (b.dialogue) return [block("dialogue", { lines: b.dialogue.map(([who, line]: [string, string]) => ({ who, line })) }, host)];
  if (b.letter) return [block("letter", { lines: b.letter, lead: b.lead || "" }, host)];
  if (b.verse) return [block("verse", { lines: b.verse.map((l: string) => sanitizeInline(l)) }, host)];
  if (b.pause) return [block("pause", { text: b.pause }, host)];
  if (b.mark) return [block("mark", { text: b.mark }, host)];
  if (b.stamp) return [block("stamp", { value: b.stamp.value, label: b.stamp.label, sub: b.stamp.sub || "" }, host)];
  console.warn("! unknown legacy block", b);
  return [];
}

function decorations(list: Legacy[] | undefined, host: string, date: string | null): Block[] {
  return (list || []).map(d => ref(d, date) && block("decoration", { item: ref(d, date)!, position: d.position || "" }, host)).filter(Boolean) as Block[];
}

const days: TripDay[] = T.chapters.map((ch: Legacy) => {
  const date = ch.date || null;
  const blocks: Block[] = [];
  for (const b of ch.images || []) blocks.push(...convert(b, `chapter:${ch.id}`, date));
  blocks.push(...decorations(ch.decorations, `chapter:${ch.id}`, date));
  for (const e of ch.events) {
    blocks.push(block("event", { anchor: e.id, time: e.time || "", title: sanitizeInline(e.title), mood: (e.mood as Mood) || null, quietTitle: !!e.quietTitle }, e.id));
    for (const b of e.content || []) blocks.push(...convert(b, e.id, date));
    for (const b of e.images || []) blocks.push(...convert(b, e.id, date));
    blocks.push(...decorations(e.decorations, e.id, date));
  }
  return { id: uuid5(`day:${SLUG}:${ch.id}`), dayNumber: ch.day, date, route: ch.route, mood: ch.mood as Mood, closing: ch.closing || "", blocks };
});

/* ---------- ending, gallery, notes ---------- */
const E = T.ending;
const ending: TripEnding | null = E ? {
  heading: E.heading || "", prelude: (E.prelude || []).map((s: string[]) => s.map(sanitizeInline)), title: E.title || "",
  stanzas: (E.stanzas || []).map((s: string[]) => s.map(sanitizeInline)), signoff: E.signoff || "",
  photo: E.photo ? ref(typeof E.photo === "string" ? E.photo : E.photo, T.endDate) : null,
} : null;

const gallery = (T.gallery || []).map((k: string) => imageAsset(k)).filter((a: MediaAsset | null): a is MediaAsset => !!a && !T.images[a.legacyKey!]?.hidden).map((a: MediaAsset) => a.id);

const N = T.travelNotes;
const ctx = { links: N.links };
const notes: TravelNotes = {
  lede: N.lede, disclaimer: N.disclaimer, facts: N.facts,
  sections: N.sections.map((s: Legacy) => ({ anchor: s.id, title: s.title, en: s.en, kind: s.type || "html", html: s.type ? "" : sanitizeNotes(s.html(ctx).trim()) })),
  places: N.places, mapNote: N.mapNote,
  expensesBefore: N.expenses.before,
  expenses: N.expenses.items.map(([label, amount, note]: string[]) => ({ label, amount, note })),
  split: N.expenses.split, splitNote: N.expenses.splitNote,
  contacts: N.contacts(ctx).map((c: Legacy) => ({ href: c.href, title: c.title, desc: c.desc, host: c.host, external: !!c.external })),
  aliases: N.aliases || {},
};

/* ---------- trip ---------- */
const cover = imageAsset(T.coverImage);
const ogFile = "cover/og.jpg";
const og = fileInfo(ogFile).exists ? fileAsset(ogFile, "image", { width: 1200, height: 630, alt: "Huai Nam Yen Travel Journal — ทุ่งนาบ้านนาเกียนกับเมฆก้อนใหญ่" }) : null;
const legacyHtml = readFileSync(join(ROOT, "legacy/index.html"), "utf8");
const metaDesc = /<meta name="description" content="([^"]*)"/.exec(legacyHtml)?.[1] || "";
const withLine = (T.coverMeta || []).find(([k]: string[]) => k === "With");

const trip: Trip = {
  id: TRIP_ID, slug: SLUG, title: T.title, titleLocal: T.titleTh || "", location: T.location,
  startDate: T.startDate, endDate: T.endDate || null, durationLabel: T.duration || "", summary: T.summary || "",
  epigraph: T.epigraph || [], coverId: cover ? cover.id : null, coverMeta: T.coverMeta || [], tags: T.tags || [],
  companions: withLine ? withLine[1] : "", seoTitle: `${T.title} · ${T.titleTh} — Travel Journal`, seoDescription: metaDesc,
  ogImageId: og ? og.id : null, status: "published", publishedVersionId: null, publishedAt: NOW, sortOrder: 0,
  showPlaceholders: T.showPlaceholders !== false, createdAt: NOW, updatedAt: NOW,
};

const bundle: TripBundle = { schema: 1, trip, days, ending, gallery, notes, media: [...media.values()] };

const site: SiteSettings = {
  title: "Journeys by Nutweir",
  tagline: "บันทึกการเดินทาง · ความทรงจำจากการเดินทาง เก็บไว้อ่านอีกครั้งในวันข้างหน้า",
  aboutHtml: "",
  author: "Nutweir",
};

const out = join(ROOT, "src/content/seed");
mkdirSync(out, { recursive: true });
writeFileSync(join(out, `${SLUG}.json`), JSON.stringify(bundle, null, 2) + "\n");
writeFileSync(join(out, "site.json"), JSON.stringify(site, null, 2) + "\n");

const count = (t: string) => days.reduce((n, d) => n + d.blocks.filter(b => b.type === t).length, 0);
console.log(`${SLUG}: ${days.length} days, ${count("event")} events, ${days.reduce((n, d) => n + d.blocks.length, 0)} blocks, ${media.size} media files`);
console.log(`  paragraphs ${count("paragraph")}, images ${count("image")}, sets ${count("images")}, videos ${count("video")}, decorations ${count("decoration")}`);
console.log(`  title "${toText(trip.title)}" ${trip.startDate}–${trip.endDate}, gallery ${gallery.length}, notes sections ${notes.sections.length}`);
