import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Block, ContentVersion, MediaAsset, SiteSettings, TravelNotes, Trip, TripBundle, TripDay, TripStatus, TripSummary,
} from "@/types/content";
import { AuthError, ConflictError, type ContentRepository } from "../repository";
import { buildSnapshot, referencedMedia, sanitizeBundle } from "../snapshot";
import type { PreparedImage, PreparedVideo } from "../files";
import { clone, uid } from "@/utils/format";
import { emptyBundle } from "../factory";

/* Row shapes (snake_case) ⇄ app model (camelCase). */
type Row = Record<string, unknown>;
const s = (v: unknown) => (v == null ? "" : String(v));

export function rowToMedia(r: Row): MediaAsset {
  return {
    id: s(r.id), kind: r.kind as MediaAsset["kind"], path: s(r.path), variants: (r.variants as Record<string, string>) || {},
    originalPath: (r.original_path as string) ?? null, mime: s(r.mime), width: Number(r.width) || 0, height: Number(r.height) || 0,
    bytes: Number(r.bytes) || 0, alt: s(r.alt), caption: s(r.caption), takenDate: (r.taken_date as string) ?? null,
    takenTime: (r.taken_time as string) ?? null, location: s(r.location), camera: s(r.camera), note: s(r.note),
    focus: (r.focus as string) ?? null, tags: (r.tags as string[]) || [], album: (r.album as string) ?? null,
    tripId: (r.trip_id as string) ?? null, posterId: (r.poster_id as string) ?? null, legacyKey: (r.legacy_key as string) ?? null,
    createdAt: s(r.created_at), updatedAt: s(r.updated_at),
  };
}
export function mediaToRow(m: Partial<MediaAsset>): Row {
  const map: [keyof MediaAsset, string][] = [["id", "id"], ["kind", "kind"], ["path", "path"], ["variants", "variants"], ["originalPath", "original_path"], ["mime", "mime"],
    ["width", "width"], ["height", "height"], ["bytes", "bytes"], ["alt", "alt"], ["caption", "caption"], ["takenDate", "taken_date"], ["takenTime", "taken_time"],
    ["location", "location"], ["camera", "camera"], ["note", "note"], ["focus", "focus"], ["tags", "tags"], ["album", "album"], ["tripId", "trip_id"],
    ["posterId", "poster_id"], ["legacyKey", "legacy_key"]];
  const out: Row = {};
  for (const [k, col] of map) if (m[k] !== undefined) out[col] = m[k];
  return out;
}
function rowToTrip(r: Row): Trip {
  return {
    id: s(r.id), slug: s(r.slug), title: s(r.title), titleLocal: s(r.title_local), location: s(r.location),
    startDate: s(r.start_date), endDate: (r.end_date as string) ?? null, durationLabel: s(r.duration_label), summary: s(r.summary),
    epigraph: (r.epigraph as string[]) || [], coverId: (r.cover_id as string) ?? null, coverMeta: (r.cover_meta as [string, string][]) || [],
    tags: (r.tags as string[]) || [], companions: s(r.companions), seoTitle: s(r.seo_title), seoDescription: s(r.seo_description),
    ogImageId: (r.og_image_id as string) ?? null, status: r.status as TripStatus, publishedVersionId: (r.published_version_id as string) ?? null,
    publishedAt: (r.published_at as string) ?? null, sortOrder: Number(r.sort_order) || 0, showPlaceholders: r.show_placeholders !== false,
    createdAt: s(r.created_at), updatedAt: s(r.updated_at),
  };
}
const SUMMARY_COLS = "id, slug, title, location, start_date, end_date, summary, status, cover_id, tags, updated_at, published_at, card";
function rowToSummary(r: Row): TripSummary {
  const card = (r.card as { cover?: MediaAsset } | null) || null;
  return {
    id: s(r.id), slug: s(r.slug), title: s(r.title), location: s(r.location), startDate: s(r.start_date), endDate: (r.end_date as string) ?? null,
    summary: s(r.summary), status: r.status as TripStatus, coverId: (r.cover_id as string) ?? null, cover: card?.cover || null,
    tags: (r.tags as string[]) || [], updatedAt: s(r.updated_at), publishedAt: (r.published_at as string) ?? null,
  };
}

const MEDIA_BUCKET = "media", ORIGINALS_BUCKET = "originals";

export class SupabaseRepository implements ContentRepository {
  readonly kind = "supabase" as const;
  constructor(private sb: SupabaseClient, private supabaseUrl: string, private base = import.meta.env.BASE_URL || "/") {}

  private fail(error: { message: string; code?: string } | null, what: string): void {
    if (!error) return;
    if (error.code === "40001" || /conflict/.test(error.message)) throw new ConflictError();
    if (error.code === "42501" || /JWT|not allowed|permission/i.test(error.message)) throw new AuthError(`${what}: ไม่มีสิทธิ์ หรือหมดเวลาเข้าสู่ระบบ`);
    throw new Error(`${what}: ${error.message}`);
  }

  // ── readers ──
  async listPublished(): Promise<TripSummary[]> {
    const { data, error } = await this.sb.from("trips").select(SUMMARY_COLS).eq("status", "published").order("start_date", { ascending: false });
    this.fail(error, "โหลดรายการทริป");
    return (data || []).map(rowToSummary);
  }

  async getPublished(slug: string): Promise<TripBundle | null> {
    const { data: t, error } = await this.sb.from("trips").select("published_version_id").eq("slug", slug).eq("status", "published").maybeSingle();
    this.fail(error, "โหลดทริป");
    if (!t?.published_version_id) return null;
    const { data: v, error: e2 } = await this.sb.from("content_versions").select("snapshot").eq("id", t.published_version_id).maybeSingle();
    this.fail(e2, "โหลดทริป");
    return (v?.snapshot as TripBundle) || null;
  }

  async getSite(): Promise<SiteSettings> {
    const { data, error } = await this.sb.from("site_settings").select("value").eq("key", "site").maybeSingle();
    this.fail(error, "โหลดการตั้งค่า");
    return (data?.value as SiteSettings) || { title: "Journeys by Nutweir", tagline: "", aboutHtml: "", author: "Nutweir" };
  }
  async saveSite(site: SiteSettings): Promise<void> {
    const { error } = await this.sb.from("site_settings").upsert({ key: "site", value: site, updated_at: new Date().toISOString() });
    this.fail(error, "บันทึกการตั้งค่า");
  }

  // ── editors ──
  async listTrips(): Promise<TripSummary[]> {
    const { data, error } = await this.sb.from("trips").select(`${SUMMARY_COLS}, cover:media_assets!trips_cover_fk(*)`).order("updated_at", { ascending: false });
    this.fail(error, "โหลดรายการทริป");
    return (data || []).map((r: Row) => ({ ...rowToSummary(r), cover: r.cover ? rowToMedia(r.cover as Row) : null }));
  }

  async loadTrip(id: string): Promise<{ bundle: TripBundle; savedAt: string }> {
    const [trip, days, blocks, notes, expenses, gallery] = await Promise.all([
      this.sb.from("trips").select("*").eq("id", id).single(),
      this.sb.from("trip_days").select("*").eq("trip_id", id).order("sort_order"),
      this.sb.from("story_blocks").select("id, day_id, type, data, sort_order").eq("trip_id", id).order("sort_order"),
      this.sb.from("travel_notes").select("data").eq("trip_id", id).maybeSingle(),
      this.sb.from("expenses").select("*").eq("trip_id", id).order("sort_order"),
      this.sb.from("trip_media").select("media_id").eq("trip_id", id).order("sort_order"),
    ]);
    for (const r of [trip, days, blocks, notes, expenses, gallery]) this.fail(r.error, "โหลดทริป");
    const byDay = new Map<string, Block[]>();
    for (const b of (blocks.data || []) as Row[]) {
      const list = byDay.get(s(b.day_id)) || [];
      list.push({ id: s(b.id), type: b.type, data: b.data } as Block);
      byDay.set(s(b.day_id), list);
    }
    const tripRow = trip.data as Row;
    const bundle: TripBundle = {
      schema: 1,
      trip: rowToTrip(tripRow),
      days: ((days.data || []) as Row[]).map((d): TripDay => ({
        id: s(d.id), dayNumber: Number(d.day_number), date: (d.date as string) ?? null, route: (d.route as string[]) || [],
        mood: d.mood as TripDay["mood"], closing: s(d.closing), blocks: byDay.get(s(d.id)) || [],
      })),
      ending: (tripRow.ending as TripBundle["ending"]) || null,
      gallery: ((gallery.data || []) as Row[]).map(g => s(g.media_id)),
      notes: notes.data ? { ...(notes.data.data as TravelNotes), expenses: ((expenses.data || []) as Row[]).map(e => ({ label: s(e.label), amount: s(e.amount), note: s(e.note) })) } : null,
      media: [],
    };
    const ids = [...referencedMedia(bundle)];
    const [byId, byTrip] = await Promise.all([
      ids.length ? this.sb.from("media_assets").select("*").in("id", ids) : Promise.resolve({ data: [], error: null }),
      this.sb.from("media_assets").select("*").eq("trip_id", id),
    ]);
    this.fail(byId.error, "โหลดรูป"); this.fail(byTrip.error, "โหลดรูป");
    const media = new Map<string, MediaAsset>();
    for (const r of [...(byId.data || []), ...(byTrip.data || [])] as Row[]) media.set(s(r.id), rowToMedia(r));
    // posters of clips
    const posters = [...media.values()].map(m => m.posterId).filter((p): p is string => !!p && !media.has(p));
    if (posters.length) {
      const { data } = await this.sb.from("media_assets").select("*").in("id", posters);
      for (const r of (data || []) as Row[]) media.set(s(r.id), rowToMedia(r));
    }
    bundle.media = [...media.values()];
    return { bundle, savedAt: s(tripRow.updated_at) };
  }

  async saveTrip(bundle: TripBundle, expectedSavedAt: string | null): Promise<string> {
    const clean = sanitizeBundle(bundle);
    const { data, error } = await this.sb.rpc("save_trip_content", {
      p_trip_id: clean.trip.id,
      p_trip: { ...clean.trip, ending: clean.ending },
      p_days: clean.days,
      p_notes: clean.notes,
      p_gallery: clean.gallery,
      p_expected: expectedSavedAt,
    });
    this.fail(error, "บันทึก");
    return s(data);
  }

  async isSlugTaken(slug: string, exceptId?: string): Promise<boolean> {
    let q = this.sb.from("trips").select("id", { count: "exact", head: true }).eq("slug", slug);
    if (exceptId) q = q.neq("id", exceptId);
    const { count, error } = await q;
    this.fail(error, "ตรวจ slug");
    return (count || 0) > 0;
  }

  async createTrip(input: { title: string; slug: string; startDate: string; endDate: string | null; location: string }): Promise<string> {
    const b = emptyBundle(input);
    const { data, error } = await this.sb.from("trips").insert({ id: b.trip.id, slug: input.slug, title: input.title, location: input.location, start_date: input.startDate || null, end_date: input.endDate || null, status: "draft" }).select("updated_at").single();
    this.fail(error, "สร้างทริป");
    await this.saveTrip(b, s(data?.updated_at));
    return b.trip.id;
  }

  async duplicateTrip(id: string): Promise<string> {
    const { bundle } = await this.loadTrip(id);
    let slug = `${bundle.trip.slug}-copy`, n = 2;
    while (await this.isSlugTaken(slug)) slug = `${bundle.trip.slug}-copy-${n++}`;
    const newId = await this.createTrip({ title: `${bundle.trip.title} (สำเนา)`, slug, startDate: bundle.trip.startDate, endDate: bundle.trip.endDate, location: bundle.trip.location });
    const { savedAt } = await this.loadTrip(newId);
    const copy: TripBundle = clone(bundle);
    copy.trip = { ...copy.trip, id: newId, slug, title: `${bundle.trip.title} (สำเนา)`, status: "draft", publishedVersionId: null, publishedAt: null };
    copy.days = copy.days.map(d => ({ ...d, id: uid(), blocks: d.blocks.map(b => ({ ...b, id: uid() })) }));
    await this.saveTrip(copy, savedAt);
    return newId;
  }

  async deleteTrip(id: string): Promise<void> {
    const { error } = await this.sb.from("trips").delete().eq("id", id);
    this.fail(error, "ลบทริป");
  }

  async publishTrip(bundle: TripBundle, label = "Published"): Promise<void> {
    const snapshot = buildSnapshot({ ...bundle, trip: { ...bundle.trip, status: "published", publishedAt: new Date().toISOString() } });
    const { error } = await this.sb.rpc("publish_trip", { p_trip_id: bundle.trip.id, p_snapshot: snapshot, p_label: label });
    this.fail(error, "เผยแพร่");
  }

  async setStatus(id: string, status: TripStatus): Promise<void> {
    const { error } = await this.sb.rpc("set_trip_status", { p_trip_id: id, p_status: status });
    this.fail(error, "เปลี่ยนสถานะ");
  }

  async listVersions(tripId: string): Promise<Omit<ContentVersion, "snapshot">[]> {
    const { data, error } = await this.sb.from("content_versions").select("id, trip_id, label, created_at, is_published").eq("trip_id", tripId).order("created_at", { ascending: false });
    this.fail(error, "โหลดประวัติ");
    return ((data || []) as Row[]).map(v => ({ id: s(v.id), tripId: s(v.trip_id), label: s(v.label), createdAt: s(v.created_at), isPublished: !!v.is_published }));
  }
  async getVersion(id: string): Promise<ContentVersion> {
    const { data, error } = await this.sb.from("content_versions").select("*").eq("id", id).single();
    this.fail(error, "โหลดเวอร์ชัน");
    const v = data as Row;
    return { id: s(v.id), tripId: s(v.trip_id), label: s(v.label), createdAt: s(v.created_at), isPublished: !!v.is_published, snapshot: v.snapshot as TripBundle };
  }
  async saveVersion(bundle: TripBundle, label: string): Promise<void> {
    const { error } = await this.sb.from("content_versions").insert({ trip_id: bundle.trip.id, label, snapshot: sanitizeBundle(bundle), is_published: false });
    this.fail(error, "บันทึกเวอร์ชัน");
  }

  // ── media ──
  async listMedia(filter: { tripId?: string | null; q?: string } = {}): Promise<MediaAsset[]> {
    let q = this.sb.from("media_assets").select("*").order("created_at", { ascending: false }).limit(500);
    if (filter.tripId !== undefined) q = filter.tripId ? q.eq("trip_id", filter.tripId) : q.is("trip_id", null);
    if (filter.q) q = q.or(`caption.ilike.%${filter.q.replace(/[%,()]/g, "")}%,alt.ilike.%${filter.q.replace(/[%,()]/g, "")}%,location.ilike.%${filter.q.replace(/[%,()]/g, "")}%`);
    const { data, error } = await q;
    this.fail(error, "โหลดคลังรูป");
    return ((data || []) as Row[]).map(rowToMedia);
  }

  private async put(bucket: string, path: string, blob: Blob): Promise<void> {
    const { error } = await this.sb.storage.from(bucket).upload(path, blob, { contentType: blob.type || "application/octet-stream", upsert: false, cacheControl: "31536000" });
    this.fail(error, `อัปโหลด ${path}`);
  }
  private async remove(bucket: string, paths: string[]): Promise<void> {
    if (paths.length) await this.sb.storage.from(bucket).remove(paths);
  }

  private async storeImage(id: string, p: PreparedImage): Promise<{ path: string; variants: Record<string, string>; originalPath: string; uploaded: string[] }> {
    const ext = p.main.blob.type === "image/webp" ? "webp" : "jpg";
    const stamp = Date.now().toString(36);
    const dir = `${new Date().getFullYear()}/${id}`;
    const uploaded: string[] = [];
    try {
      const path = `${dir}/${stamp}.${ext}`;
      await this.put(MEDIA_BUCKET, path, p.main.blob); uploaded.push(path);
      const variants: Record<string, string> = {};
      for (const v of p.variants) { const vp = `${dir}/${stamp}-${v.edge}.${ext}`; await this.put(MEDIA_BUCKET, vp, v.blob); uploaded.push(vp); variants[String(v.edge)] = vp; }
      const originalPath = `${dir}/${stamp}-original-${p.original.name.replace(/[^\w.-]+/g, "_").slice(-60)}`;
      await this.put(ORIGINALS_BUCKET, originalPath, p.original);
      return { path, variants, originalPath, uploaded };
    } catch (e) { await this.remove(MEDIA_BUCKET, uploaded); throw e; }
  }

  async uploadImage(p: PreparedImage, meta: Partial<MediaAsset>): Promise<MediaAsset> {
    const id = uid();
    const files = await this.storeImage(id, p);
    const row = mediaToRow({
      id, kind: "image", path: files.path, variants: files.variants, originalPath: files.originalPath, mime: p.main.blob.type,
      width: p.main.width, height: p.main.height, bytes: p.main.blob.size, takenDate: p.taken?.date || null, takenTime: p.taken?.time || null, ...meta,
    });
    const { data, error } = await this.sb.from("media_assets").insert(row).select("*").single();
    if (error) { await this.remove(MEDIA_BUCKET, files.uploaded); await this.remove(ORIGINALS_BUCKET, [files.originalPath]); }
    this.fail(error, "บันทึกข้อมูลรูป");
    return rowToMedia(data as Row);
  }

  async uploadVideo(p: PreparedVideo, meta: Partial<MediaAsset>): Promise<MediaAsset> {
    const id = uid(), dir = `${new Date().getFullYear()}/${id}`;
    const ext = (p.original.name.match(/\.(mp4|m4v|mov|webm)$/i)?.[1] || "mp4").toLowerCase().replace("m4v", "mp4");
    const path = `${dir}/clip.${ext}`;
    await this.put(MEDIA_BUCKET, path, p.original);
    let posterId: string | null = null;
    if (p.poster) {
      posterId = uid();
      const pp = `${dir}/poster.webp`;
      await this.put(MEDIA_BUCKET, pp, p.poster);
      const { error } = await this.sb.from("media_assets").insert(mediaToRow({ id: posterId, kind: "image", path: pp, mime: p.poster.type, width: p.width, height: p.height, bytes: p.poster.size, tags: ["poster"], tripId: meta.tripId ?? null }));
      this.fail(error, "บันทึกภาพปกคลิป");
    }
    const { data, error } = await this.sb.from("media_assets").insert(mediaToRow({ id, kind: "video", path, mime: p.original.type || "video/mp4", width: p.width, height: p.height, bytes: p.original.size, posterId, ...meta })).select("*").single();
    this.fail(error, "บันทึกข้อมูลคลิป");
    return rowToMedia(data as Row);
  }

  async replaceImage(id: string, p: PreparedImage): Promise<MediaAsset> {
    const { data: old, error } = await this.sb.from("media_assets").select("*").eq("id", id).single();
    this.fail(error, "โหลดรูป");
    const prev = rowToMedia(old as Row);
    const files = await this.storeImage(id, p);
    const { data, error: e2 } = await this.sb.from("media_assets").update({ path: files.path, variants: files.variants, mime: p.main.blob.type, width: p.main.width, height: p.main.height, bytes: p.main.blob.size, original_path: prev.originalPath || files.originalPath }).eq("id", id).select("*").single();
    if (e2) await this.remove(MEDIA_BUCKET, files.uploaded);
    this.fail(e2, "เปลี่ยนรูป");
    // old web copies go; the very first original upload is kept
    if (!prev.path.startsWith("trips/")) await this.remove(MEDIA_BUCKET, [prev.path, ...Object.values(prev.variants)]);
    if (prev.originalPath) await this.remove(ORIGINALS_BUCKET, [files.originalPath]);
    return rowToMedia(data as Row);
  }

  async updateMedia(id: string, patch: Partial<MediaAsset>): Promise<MediaAsset> {
    const { id: _i, path: _p, variants: _v, originalPath: _o, kind: _k, ...safe } = patch;
    const { data, error } = await this.sb.from("media_assets").update(mediaToRow(safe)).eq("id", id).select("*").single();
    this.fail(error, "บันทึกข้อมูลรูป");
    return rowToMedia(data as Row);
  }

  async deleteMedia(id: string): Promise<void> {
    const { data: used, error } = await this.sb.rpc("media_in_use", { p_media_id: id });
    this.fail(error, "ตรวจการใช้งานรูป");
    if (used) throw new Error(`รูปนี้ยังใช้อยู่ในทริป "${used}" เอาออกจากเรื่องก่อน`);
    const { data: row } = await this.sb.from("media_assets").select("*").eq("id", id).maybeSingle();
    if (!row) return;
    const m = rowToMedia(row as Row);
    const { error: e2 } = await this.sb.from("media_assets").delete().eq("id", id);
    this.fail(e2, "ลบรูป");
    if (!m.path.startsWith("trips/")) await this.remove(MEDIA_BUCKET, [m.path, ...Object.values(m.variants)]);
    if (m.originalPath) await this.remove(ORIGINALS_BUCKET, [m.originalPath]);
  }

  async getOriginal(asset: MediaAsset): Promise<Blob> {
    if (asset.originalPath) {
      const { data } = await this.sb.storage.from(ORIGINALS_BUCKET).download(asset.originalPath);
      if (data) return data;
    }
    const res = await fetch(this.mediaUrl(asset), { cache: "no-store" });
    if (!res.ok) throw new Error("เปิดไฟล์ต้นฉบับไม่ได้");
    return res.blob();
  }

  mediaUrl(asset: MediaAsset, edge?: number): string {
    const path = (edge && asset.variants[String(edge)]) || asset.path;
    if (path.startsWith("trips/")) return this.base + path; // files from the static site, still served by the site itself
    return `${this.supabaseUrl}/storage/v1/object/public/${MEDIA_BUCKET}/${path.split("/").map(encodeURIComponent).join("/")}`;
  }
}
