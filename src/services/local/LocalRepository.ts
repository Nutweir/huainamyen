import { openDB, type IDBPDatabase } from "idb";
import type { ContentVersion, MediaAsset, SiteSettings, TripBundle, TripStatus, TripSummary } from "@/types/content";
import { ConflictError, type ContentRepository } from "../repository";
import { buildSnapshot, referencedMedia, sanitizeBundle, summarize } from "../snapshot";
import type { PreparedImage, PreparedVideo } from "../files";
import { clone, uid } from "@/utils/format";
import { emptyBundle } from "../factory";

/*
 * Backend that lives in this browser (IndexedDB). Same rules as Supabase where it matters:
 * readers only ever see published snapshots, saves detect conflicts, versions are kept.
 */
interface StoredTrip { id: string; bundle: Omit<TripBundle, "media">; savedAt: string }
type Seed = { bundles: TripBundle[]; site: SiteSettings };

const DB_NAME = "journeys-local";

export class LocalRepository implements ContentRepository {
  readonly kind = "local" as const;
  private db!: IDBPDatabase;
  private urls = new Map<string, string>(); // blob path → object URL
  private ready: Promise<void>;

  constructor(private seed: () => Promise<Seed>, private base = import.meta.env.BASE_URL || "/", dbName = DB_NAME) {
    this.ready = this.init(dbName);
  }

  private async init(dbName: string) {
    this.db = await openDB(dbName, 1, {
      upgrade(db) {
        db.createObjectStore("trips", { keyPath: "id" });
        db.createObjectStore("versions", { keyPath: "id" }).createIndex("tripId", "tripId");
        db.createObjectStore("media", { keyPath: "id" });
        db.createObjectStore("blobs");
        db.createObjectStore("meta");
      },
    });
    if (!(await this.db.get("meta", "seeded"))) {
      const { bundles, site } = await this.seed();
      for (const b of bundles) {
        for (const m of b.media) await this.db.put("media", m);
        const { media: _m, ...rest } = b;
        await this.db.put("trips", { id: b.trip.id, bundle: rest, savedAt: b.trip.updatedAt } satisfies StoredTrip);
        if (b.trip.status === "published") await this.publishTrip(b, "Migrated from the static site");
      }
      await this.db.put("meta", site, "site");
      await this.db.put("meta", true, "seeded");
    }
    // object URLs for files uploaded in this browser
    const keys = await this.db.getAllKeys("blobs");
    for (const k of keys) {
      const blob = await this.db.get("blobs", k);
      if (blob) this.urls.set(String(k), URL.createObjectURL(blob));
    }
  }

  private async withMedia(stored: Omit<TripBundle, "media">): Promise<TripBundle> {
    const all: MediaAsset[] = await this.db.getAll("media");
    const draft = { ...stored, media: all } as TripBundle;
    const used = referencedMedia(draft);
    return { ...draft, media: all.filter(m => used.has(m.id) || m.tripId === stored.trip.id) };
  }

  // ── readers ──
  async listPublished(): Promise<TripSummary[]> {
    await this.ready;
    const out: TripSummary[] = [];
    for (const t of (await this.db.getAll("trips")) as StoredTrip[]) {
      if (t.bundle.trip.status !== "published" || !t.bundle.trip.publishedVersionId) continue;
      const v: ContentVersion | undefined = await this.db.get("versions", t.bundle.trip.publishedVersionId);
      if (v) out.push({ ...summarize(v.snapshot), status: "published", publishedAt: t.bundle.trip.publishedAt });
    }
    return out.sort((a, b) => (b.startDate || "").localeCompare(a.startDate || ""));
  }

  async getPublished(slug: string): Promise<TripBundle | null> {
    await this.ready;
    const t = ((await this.db.getAll("trips")) as StoredTrip[]).find(x => x.bundle.trip.slug === slug);
    if (!t || t.bundle.trip.status !== "published" || !t.bundle.trip.publishedVersionId) return null;
    const v: ContentVersion | undefined = await this.db.get("versions", t.bundle.trip.publishedVersionId);
    return v ? v.snapshot : null;
  }

  async getSite(): Promise<SiteSettings> { await this.ready; return (await this.db.get("meta", "site")) as SiteSettings; }
  async saveSite(site: SiteSettings): Promise<void> { await this.ready; await this.db.put("meta", clone(site), "site"); }

  // ── editors ──
  async listTrips(): Promise<TripSummary[]> {
    await this.ready;
    const media = new Map(((await this.db.getAll("media")) as MediaAsset[]).map(m => [m.id, m]));
    return ((await this.db.getAll("trips")) as StoredTrip[])
      .map(t => ({ ...summarize({ ...t.bundle, media: [] } as TripBundle), cover: t.bundle.trip.coverId ? media.get(t.bundle.trip.coverId) || null : null }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async loadTrip(id: string): Promise<{ bundle: TripBundle; savedAt: string }> {
    await this.ready;
    const t: StoredTrip | undefined = await this.db.get("trips", id);
    if (!t) throw new Error("ไม่พบทริปนี้");
    return { bundle: await this.withMedia(t.bundle), savedAt: t.savedAt };
  }

  async saveTrip(bundle: TripBundle, expectedSavedAt: string | null): Promise<string> {
    await this.ready;
    const tx = this.db.transaction("trips", "readwrite");
    const current: StoredTrip | undefined = await tx.store.get(bundle.trip.id);
    if (current && expectedSavedAt && current.savedAt !== expectedSavedAt) { tx.abort(); await tx.done.catch(() => undefined); throw new ConflictError(); }
    const savedAt = new Date(Math.max(Date.now(), current ? Date.parse(current.savedAt) + 1 : 0)).toISOString();
    const { media: _m, ...clean } = sanitizeBundle(bundle);
    clean.trip = { ...clean.trip, updatedAt: savedAt, status: current?.bundle.trip.status ?? clean.trip.status, publishedVersionId: current?.bundle.trip.publishedVersionId ?? null, publishedAt: current?.bundle.trip.publishedAt ?? null };
    await tx.store.put({ id: bundle.trip.id, bundle: clean, savedAt } satisfies StoredTrip);
    await tx.done;
    return savedAt;
  }

  async isSlugTaken(slug: string, exceptId?: string): Promise<boolean> {
    await this.ready;
    return ((await this.db.getAll("trips")) as StoredTrip[]).some(t => t.bundle.trip.slug === slug && t.id !== exceptId);
  }

  async createTrip(input: { title: string; slug: string; startDate: string; endDate: string | null; location: string }): Promise<string> {
    await this.ready;
    if (await this.isSlugTaken(input.slug)) throw new Error(`slug "${input.slug}" ถูกใช้แล้ว`);
    const b = emptyBundle(input);
    const { media: _m, ...rest } = b;
    await this.db.put("trips", { id: b.trip.id, bundle: rest, savedAt: b.trip.updatedAt } satisfies StoredTrip);
    return b.trip.id;
  }

  async duplicateTrip(id: string): Promise<string> {
    const { bundle } = await this.loadTrip(id);
    let slug = `${bundle.trip.slug}-copy`, n = 2;
    while (await this.isSlugTaken(slug)) slug = `${bundle.trip.slug}-copy-${n++}`;
    const now = new Date().toISOString();
    const copy: TripBundle = clone(bundle);
    copy.trip = { ...copy.trip, id: uid(), slug, title: `${copy.trip.title} (สำเนา)`, status: "draft", publishedVersionId: null, publishedAt: null, createdAt: now, updatedAt: now };
    copy.days = copy.days.map(d => ({ ...d, id: uid(), blocks: d.blocks.map(b => ({ ...b, id: uid() })) }));
    const { media: _m, ...rest } = copy;
    await this.db.put("trips", { id: copy.trip.id, bundle: rest, savedAt: now } satisfies StoredTrip);
    return copy.trip.id;
  }

  async deleteTrip(id: string): Promise<void> {
    await this.ready;
    await this.db.delete("trips", id);
    for (const key of await this.db.getAllKeysFromIndex("versions", "tripId", id)) await this.db.delete("versions", key);
  }

  async publishTrip(bundle: TripBundle, label = "Published"): Promise<void> {
    const t: StoredTrip | undefined = await this.db.get("trips", bundle.trip.id);
    if (!t) throw new Error("บันทึกทริปก่อนเผยแพร่");
    const now = new Date().toISOString();
    const snapshot = buildSnapshot({ ...bundle, trip: { ...bundle.trip, status: "published", publishedAt: now } });
    const version: ContentVersion = { id: uid(), tripId: bundle.trip.id, label, createdAt: now, isPublished: true, snapshot };
    for (const old of (await this.db.getAllFromIndex("versions", "tripId", bundle.trip.id)) as ContentVersion[]) {
      if (old.isPublished) await this.db.put("versions", { ...old, isPublished: false });
    }
    await this.db.put("versions", version);
    t.bundle.trip = { ...t.bundle.trip, status: "published", publishedVersionId: version.id, publishedAt: now };
    await this.db.put("trips", t);
  }

  async setStatus(id: string, status: TripStatus): Promise<void> {
    await this.ready;
    const t: StoredTrip | undefined = await this.db.get("trips", id);
    if (!t) return;
    if (status === "published" && !t.bundle.trip.publishedVersionId) throw new Error("ยังไม่เคยเผยแพร่ กด Publish ก่อน");
    t.bundle.trip = { ...t.bundle.trip, status };
    await this.db.put("trips", t);
  }

  async listVersions(tripId: string): Promise<Omit<ContentVersion, "snapshot">[]> {
    await this.ready;
    const all = (await this.db.getAllFromIndex("versions", "tripId", tripId)) as ContentVersion[];
    return all.map(({ snapshot: _s, ...v }) => v).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async getVersion(id: string): Promise<ContentVersion> {
    await this.ready;
    const v = await this.db.get("versions", id);
    if (!v) throw new Error("ไม่พบเวอร์ชันนี้");
    return v as ContentVersion;
  }
  async saveVersion(bundle: TripBundle, label: string): Promise<void> {
    await this.ready;
    await this.db.put("versions", { id: uid(), tripId: bundle.trip.id, label, createdAt: new Date().toISOString(), isPublished: false, snapshot: sanitizeBundle(bundle) } satisfies ContentVersion);
  }

  // ── media ──
  async listMedia(filter: { tripId?: string | null; q?: string } = {}): Promise<MediaAsset[]> {
    await this.ready;
    const q = (filter.q || "").toLowerCase();
    return ((await this.db.getAll("media")) as MediaAsset[])
      .filter(m => filter.tripId === undefined || m.tripId === filter.tripId)
      .filter(m => !q || [m.caption, m.alt, m.location, m.album || "", ...m.tags, m.path].join(" ").toLowerCase().includes(q))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  private async putBlob(path: string, blob: Blob) {
    await this.db.put("blobs", blob, path);
    const old = this.urls.get(path);
    if (old) URL.revokeObjectURL(old);
    this.urls.set(path, URL.createObjectURL(blob));
  }

  async uploadImage(p: PreparedImage, meta: Partial<MediaAsset>): Promise<MediaAsset> {
    await this.ready;
    const id = uid(), dir = `local/${id}`, ext = p.main.blob.type === "image/webp" ? "webp" : "jpg";
    await this.putBlob(`${dir}/main.${ext}`, p.main.blob);
    const variants: Record<string, string> = {};
    for (const v of p.variants) { const path = `${dir}/${v.edge}.${ext}`; await this.putBlob(path, v.blob); variants[String(v.edge)] = path; }
    await this.putBlob(`${dir}/original`, p.original);
    const now = new Date().toISOString();
    const asset: MediaAsset = {
      id, kind: "image", path: `${dir}/main.${ext}`, variants, originalPath: `${dir}/original`, mime: p.main.blob.type,
      width: p.main.width, height: p.main.height, bytes: p.main.blob.size, alt: "", caption: "",
      takenDate: p.taken?.date || null, takenTime: p.taken?.time || null, location: "", camera: "", note: "", focus: null,
      tags: [], album: null, tripId: null, posterId: null, legacyKey: null, createdAt: now, updatedAt: now, ...meta,
    };
    await this.db.put("media", asset);
    return asset;
  }

  async uploadVideo(p: PreparedVideo, meta: Partial<MediaAsset>): Promise<MediaAsset> {
    await this.ready;
    const id = uid(), now = new Date().toISOString();
    let posterId: string | null = null;
    if (p.poster) {
      posterId = uid();
      await this.putBlob(`local/${posterId}/poster.webp`, p.poster);
      await this.db.put("media", { id: posterId, kind: "image", path: `local/${posterId}/poster.webp`, variants: {}, originalPath: null, mime: p.poster.type, width: p.width, height: p.height, bytes: p.poster.size, alt: "", caption: "", takenDate: null, takenTime: null, location: "", camera: "", note: "", focus: null, tags: ["poster"], album: null, tripId: meta.tripId ?? null, posterId: null, legacyKey: null, createdAt: now, updatedAt: now } satisfies MediaAsset);
    }
    const path = `local/${id}/clip`;
    await this.putBlob(path, p.original);
    const asset: MediaAsset = {
      id, kind: "video", path, variants: {}, originalPath: null, mime: p.original.type || "video/mp4", width: p.width, height: p.height,
      bytes: p.original.size, alt: "", caption: "", takenDate: null, takenTime: null, location: "", camera: "", note: "", focus: null,
      tags: [], album: null, tripId: null, posterId, legacyKey: null, createdAt: now, updatedAt: now, ...meta,
    };
    await this.db.put("media", asset);
    return asset;
  }

  async replaceImage(id: string, p: PreparedImage): Promise<MediaAsset> {
    await this.ready;
    const old: MediaAsset | undefined = await this.db.get("media", id);
    if (!old) throw new Error("ไม่พบรูปนี้");
    const fresh = await this.uploadImage(p, {});
    await this.db.delete("media", fresh.id);
    // keep the same id (every reference stays valid) and the first original upload
    const updated: MediaAsset = { ...old, path: fresh.path, variants: fresh.variants, mime: fresh.mime, width: fresh.width, height: fresh.height, bytes: fresh.bytes, originalPath: old.originalPath || fresh.originalPath, updatedAt: new Date().toISOString() };
    await this.db.put("media", updated);
    return updated;
  }

  async updateMedia(id: string, patch: Partial<MediaAsset>): Promise<MediaAsset> {
    await this.ready;
    const old: MediaAsset | undefined = await this.db.get("media", id);
    if (!old) throw new Error("ไม่พบรูปนี้");
    const { id: _id, path: _p, variants: _v, originalPath: _o, ...safe } = patch;
    const updated = { ...old, ...safe, updatedAt: new Date().toISOString() };
    await this.db.put("media", updated);
    return updated;
  }

  async deleteMedia(id: string): Promise<void> {
    await this.ready;
    for (const t of (await this.db.getAll("trips")) as StoredTrip[]) {
      if (referencedMedia({ ...t.bundle, media: [] } as TripBundle).has(id)) throw new Error(`รูปนี้ยังใช้อยู่ในทริป "${t.bundle.trip.title}" เอาออกจากเรื่องก่อน`);
    }
    const old: MediaAsset | undefined = await this.db.get("media", id);
    if (!old) return;
    for (const p of [old.path, ...Object.values(old.variants)]) if (p.startsWith("local/")) await this.db.delete("blobs", p);
    await this.db.delete("media", id);
  }

  async getOriginal(asset: MediaAsset): Promise<Blob> {
    await this.ready;
    for (const p of [asset.originalPath, asset.path]) {
      if (p?.startsWith("local/")) { const b = (await this.db.get("blobs", p)) as Blob | undefined; if (b) return b; }
    }
    const res = await fetch(this.mediaUrl(asset));
    if (!res.ok) throw new Error("เปิดไฟล์ต้นฉบับไม่ได้");
    return res.blob();
  }

  mediaUrl(asset: MediaAsset, edge?: number): string {
    const path = (edge && asset.variants[String(edge)]) || asset.path;
    if (path.startsWith("local/")) return this.urls.get(path) || "";
    return this.base + path;
  }
}
