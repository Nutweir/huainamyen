/*
 * Independent completeness check: walks the legacy data (after the admin edits are applied) and proves
 * every piece of text, every photo and every moment is present in the migrated bundle.
 *
 *   npm run verify:migration     → exits 1 on any loss
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Block, TripBundle } from "../src/types/content.ts";
import { applyUploads, loadLegacy, type Legacy } from "./lib/legacy.ts";

const ROOT = process.cwd();
const SLUG = process.argv[2] || "huai-nam-yen";
const { trip: T, uploads } = loadLegacy(ROOT, SLUG);
applyUploads(T, uploads);
const bundle: TripBundle = JSON.parse(readFileSync(join(ROOT, "src/content/seed", `${SLUG}.json`), "utf8"));

const problems: string[] = [];
const fail = (m: string) => problems.push(m);
// compare text without markup, entities or spacing differences
const norm = (s: string) => s.replace(/<[^>]+>/g, "").replace(/&nbsp;| /g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/\s+/g, "").trim();
const haystack = norm(JSON.stringify(bundle).replace(/\\"/g, '"').replace(/\\n/g, " "));
const IGNORE_KEYS = new Set(["layout", "position", "side", "tone", "reveal", "mood", "id", "src", "poster", "image", "photo", "w", "h", "with", "size", "type", "focus", "embed", "coordinates", "href", "key"]);

let checked = 0;
function walk(v: Legacy, path: string): void {
  if (typeof v === "string") {
    const n = norm(v);
    if (n.length < 2) return;
    checked++;
    if (!haystack.includes(n)) fail(`text missing at ${path}: "${v.slice(0, 60)}"`);
  } else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`));
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) { if (!IGNORE_KEYS.has(k) && typeof x !== "function") walk(x, `${path}.${k}`); }
}

// 1. all story text, titles, times, ending
T.chapters.forEach((ch: Legacy, ci: number) => {
  walk(ch.route, `day${ci + 1}.route`);
  if (ch.closing) walk(ch.closing, `day${ci + 1}.closing`);
  ch.events.forEach((e: Legacy) => { walk(e.title, `${e.id}.title`); if (e.time) walk(e.time, `${e.id}.time`); walk(e.content.filter((b: Legacy) => !(b && b.hiddenVideo)), `${e.id}`); });
});
walk(T.ending, "ending");
walk([T.title, T.titleTh, T.location, T.summary, T.epigraph, T.coverMeta, T.duration], "trip");

// 2. travel notes (sections rendered with the same links)
const N = T.travelNotes;
walk([N.lede, N.disclaimer, N.facts, N.mapNote, N.expenses.before, N.expenses.splitNote, N.expenses.items, N.places.map((p: Legacy) => [p.name, p.area])], "notes");
walk(N.contacts({ links: N.links }).map((c: Legacy) => [c.title, c.desc, c.host]), "notes.contacts");
N.sections.filter((s: Legacy) => s.html).forEach((s: Legacy) => {
  const text = s.html({ links: N.links }).replace(/<[^>]+>/g, "\n").split("\n").map((t: string) => t.trim()).filter(Boolean);
  walk(text, `notes.${s.id}`);
});

// 3. moments: same order, anchors, times, dates
const legacyEvents = T.chapters.flatMap((ch: Legacy) => ch.events.map((e: Legacy) => `${ch.date}|${e.id}|${e.time || ""}`));
const newEvents = bundle.days.flatMap(d => d.blocks.filter((b): b is Block<"event"> => b.type === "event").map(b => `${d.date}|${b.data.anchor}|${b.data.time}`));
if (JSON.stringify(legacyEvents) !== JSON.stringify(newEvents)) fail(`moments differ:\n  legacy ${legacyEvents.join(", ")}\n  new    ${newEvents.join(", ")}`);
if (bundle.trip.startDate !== T.startDate || bundle.trip.endDate !== T.endDate) fail("trip dates changed");

// 4. block counts per kind
const legacyCount: Record<string, number> = {};
T.chapters.forEach((ch: Legacy) => ch.events.forEach((e: Legacy) => e.content.forEach((b: Legacy) => {
  const k = typeof b === "string" ? "paragraph" : b.hiddenVideo ? "" : b.video ? "video" : b.images || b.photos ? "images" : b.image || b.photo ? "image"
    : ["note", "thought", "quote", "dialogue", "letter", "verse", "pause", "mark", "stamp", "placeholder"].find(x => b[x] !== undefined) || "?";
  if (k) legacyCount[k] = (legacyCount[k] || 0) + 1;
})));
const newCount: Record<string, number> = {};
bundle.days.forEach(d => d.blocks.forEach(b => { if (b.type !== "event" && b.type !== "decoration") newCount[b.type] = (newCount[b.type] || 0) + 1; }));
for (const k of new Set([...Object.keys(legacyCount), ...Object.keys(newCount)])) {
  if ((legacyCount[k] || 0) !== (newCount[k] || 0)) fail(`block count "${k}": legacy ${legacyCount[k] || 0}, new ${newCount[k] || 0}`);
}

// 5. every photo shown before is still shown, and every file exists
const shownKeys = new Set<string>();
const collect = (x: Legacy) => {
  if (typeof x === "string") return;
  if (!x || typeof x !== "object") return;
  if (typeof (x.image ?? x.photo) === "string") shownKeys.add(x.image ?? x.photo);
  (x.images || x.photos || []).forEach((i: Legacy) => typeof i === "string" ? shownKeys.add(i) : collect(i));
};
T.chapters.forEach((ch: Legacy) => ch.events.forEach((e: Legacy) => { e.content.forEach(collect); (e.decorations || []).forEach(collect); }));
if (T.ending?.photo) collect(typeof T.ending.photo === "string" ? { image: T.ending.photo } : T.ending.photo);
shownKeys.add(T.coverImage);
const byKey = new Map(bundle.media.filter(m => m.legacyKey).map(m => [m.legacyKey!, m]));
for (const k of shownKeys) {
  const m = byKey.get(k);
  if (!m) { fail(`photo "${k}" not migrated`); continue; }
  if (m.path !== `trips/${SLUG}/${T.images[k].src}`) fail(`photo "${k}" points to ${m.path}, legacy shows ${T.images[k].src}`);
}
for (const m of bundle.media) {
  for (const p of [m.path, ...Object.values(m.variants)]) if (!existsSync(join(ROOT, "public", p))) fail(`file missing: public/${p}`);
  if (m.kind === "image" && (!m.width || !m.height)) fail(`no size for ${m.path}`);
}
const used = new Set<string>([bundle.trip.coverId!, bundle.trip.ogImageId!, ...bundle.gallery]);
JSON.stringify(bundle.days, (k, v) => { if ((k === "mediaId") && typeof v === "string") used.add(v); return v; });
if (bundle.ending?.photo) used.add(bundle.ending.photo.mediaId);
bundle.media.forEach(m => { if (m.posterId) used.add(m.posterId); });
for (const id of used) if (id && !bundle.media.some(m => m.id === id)) fail(`reference to unknown media ${id}`);

// 6. the admin edits made on the old site survived
const find = (key: string) => byKey.get(key);
if (T.images["uncle-phue-lue"] && !haystack.includes(norm(T.images["uncle-phue-lue"].caption || ""))) fail("uncle-phue-lue caption edit lost");
for (const [k, o] of Object.entries((uploads.overrides || {}).images || {}) as [string, Legacy][]) {
  if (o.src && find(k)?.path !== `trips/${SLUG}/${o.src}`) fail(`replaced photo ${k} should use ${o.src}`);
}

console.log(`checked ${checked} pieces of text, ${legacyEvents.length} moments, ${shownKeys.size} shown photos, ${bundle.media.length} media files`);
if (problems.length) { console.error(`\n${problems.length} problem(s):\n- ${problems.join("\n- ")}`); process.exit(1); }
console.log("✓ migration complete: no text, photo, moment or edit lost");
