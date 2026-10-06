/*
 * Read the static site's data files exactly as the browser did: trip.js, images.js and uploads.js
 * run against a stub `window`, then the admin edits in uploads.js are applied with the same rules as
 * the old renderer (assets/journal.js applyOverrides + mergeUploads).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";

/* eslint-disable @typescript-eslint/no-explicit-any -- legacy data is untyped JS */
export type Legacy = any;

export interface LegacyData {
  trip: Legacy;
  sizes: Record<string, [number, number]>;
  uploads: Legacy;
}

export function loadLegacy(root: string, slug: string): LegacyData {
  const sandbox: Legacy = { window: {} };
  vm.createContext(sandbox);
  for (const file of ["trip.js", "images.js", "uploads.js"]) {
    vm.runInContext(readFileSync(join(root, "legacy/trips", slug, file), "utf8"), sandbox, { filename: file });
  }
  const trip = sandbox.window.JOURNAL_TRIPS.find((t: Legacy) => t.slug === slug);
  if (!trip) throw new Error(`legacy trip ${slug} not found`);
  const uploads = (sandbox.window.JOURNAL_UPLOADS || {})[slug] || { images: {}, sizes: {}, placements: [], gallery: [], overrides: { images: {}, blocks: {} } };
  const sizes = { ...((sandbox.window.JOURNAL_IMAGE_SIZES || {})[slug] || {}), ...(uploads.sizes || {}) };
  return { trip, sizes, uploads };
}

/** Same ids as the old admin used for blocks: "<event>:<keys>", "<event>:deco:<keys>", "?<label>" for slots. */
export function itemId(x: Legacy): string {
  if (typeof x === "string") return x;
  if (!x) return "?";
  if (x.placeholder) return `?${x.placeholder}`;
  const ref = x.image ?? x.photo;
  if (typeof ref === "string") return ref;
  const src = (ref && ref.src) || x.src;
  return src ? `src:${src}` : "?";
}
export const blockId = (host: string, b: Legacy, deco = false): string =>
  `${host}:${deco ? "deco:" : ""}${(b.images || b.photos || [b]).map(itemId).join("+")}`;

const isImg = (b: Legacy) => b && typeof b === "object" && (b.image || b.images || b.photo || b.photos || b.placeholder);

/** Apply uploads.js: photo edits, block edits (layout, filled slots, clips), placements and gallery. */
export function applyUploads(T: Legacy, U: Legacy): void {
  const O = U.overrides || { images: {}, blocks: {} };
  const OI = O.images || {};
  const lists = (): [string, Legacy[] | undefined, boolean][] =>
    T.chapters.flatMap((ch: Legacy) => [
      [`chapter:${ch.id}`, ch.images, false], [`chapter:${ch.id}`, ch.decorations, true],
      ...ch.events.flatMap((e: Legacy) => [[e.id, e.content, false], [e.id, e.images, false], [e.id, e.decorations, true]]),
    ]);

  // photo edits: registry, plus captions written on the story block itself
  for (const [k, o] of Object.entries(OI)) if (T.images[k]) T.images[k] = { ...T.images[k], ...(o as object) };
  for (const [, list] of lists()) (list || []).forEach((b: Legacy) => {
    if (!isImg(b)) return;
    const own = typeof (b.image ?? b.photo) === "string" ? OI[b.image ?? b.photo] : null;
    if (own) Object.assign(b, own);
    const set = b.images || b.photos;
    if (set) set.forEach((x: Legacy, i: number) => {
      const k = typeof x === "object" && x ? x.image ?? x.photo : null;
      if (typeof k === "string" && OI[k]) set[i] = { ...x, ...OI[k] };
    });
  });

  // block edits
  const B = O.blocks || {};
  for (const [host, list, deco] of lists()) (list || []).forEach((b: Legacy, i: number) => {
    if (b && b.video) {
      const o = B[`${host}:video:${b.video.src}`];
      if (o) list![i] = o.hidden ? { hiddenVideo: b } : { ...b, video: { ...b.video, ...(o.video || {}) } };
      return;
    }
    if (!isImg(b)) return;
    const o = B[blockId(host, b, deco)];
    if (!o) return;
    const { fill = {}, ...rest } = o;
    let next: Legacy = { ...b, ...rest };
    if (next.images || next.photos) {
      next.images = (next.images || next.photos).map((x: Legacy) => (fill[itemId(x)] ? { image: fill[itemId(x)] } : x));
      delete next.photos;
    } else if (fill[itemId(b)]) {
      next = { ...next, image: fill[itemId(b)] };
      delete next.placeholder;
    }
    list![i] = next;
  });
  if (T.ending && typeof T.ending.photo === "string" && B[`ending:${T.ending.photo}`]) {
    T.ending.photo = { image: T.ending.photo, ...B[`ending:${T.ending.photo}`] };
  }

  // photos and placements added through the admin
  T.images = { ...T.images, ...(U.images || {}) };
  T.gallery = [...(T.gallery || []), ...(U.gallery || []).filter((k: string) => !(T.gallery || []).includes(k))];
  for (const p of U.placements || []) {
    const [kind, id] = p.target.startsWith("chapter:") ? ["chapter", p.target.slice(8)] : ["event", p.target];
    const host = kind === "chapter" ? T.chapters.find((c: Legacy) => c.id === id) : T.chapters.flatMap((c: Legacy) => c.events).find((e: Legacy) => e.id === id);
    if (!host) continue;
    (host[p.as === "decoration" ? "decorations" : "images"] ||= []).push(p.block);
  }
}
