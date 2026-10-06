import type { ContentVersion, MediaAsset, SiteSettings, TripBundle, TripStatus, TripSummary } from "@/types/content";
import type { PreparedImage, PreparedVideo } from "./files";

/**
 * Everything the app reads or writes goes through this interface. Two implementations:
 *  - SupabaseRepository: the real backend (RLS enforces who can do what).
 *  - LocalRepository: IndexedDB in this browser, seeded from the migrated journal, for development,
 *    tests and previews before Supabase is set up.
 */
export interface ContentRepository {
  readonly kind: "local" | "supabase";

  // ── readers (published snapshots only) ──
  listPublished(): Promise<TripSummary[]>;
  getPublished(slug: string): Promise<TripBundle | null>;
  getSite(): Promise<SiteSettings>;

  // ── editors ──
  listTrips(): Promise<TripSummary[]>;
  /** The working copy + the timestamp it was saved at (for conflict detection). */
  loadTrip(id: string): Promise<{ bundle: TripBundle; savedAt: string }>;
  /** Save the working copy. Rejects with ConflictError if someone saved since `expectedSavedAt`. */
  saveTrip(bundle: TripBundle, expectedSavedAt: string | null): Promise<string>;
  createTrip(input: { title: string; slug: string; startDate: string; endDate: string | null; location: string }): Promise<string>;
  duplicateTrip(id: string): Promise<string>;
  deleteTrip(id: string): Promise<void>;
  publishTrip(bundle: TripBundle, label?: string): Promise<void>;
  setStatus(id: string, status: TripStatus): Promise<void>;
  listVersions(tripId: string): Promise<Omit<ContentVersion, "snapshot">[]>;
  getVersion(id: string): Promise<ContentVersion>;
  saveVersion(bundle: TripBundle, label: string): Promise<void>;
  saveSite(site: SiteSettings): Promise<void>;
  isSlugTaken(slug: string, exceptId?: string): Promise<boolean>;

  // ── media ──
  listMedia(filter?: { tripId?: string | null; q?: string }): Promise<MediaAsset[]>;
  uploadImage(prepared: PreparedImage, meta: Partial<MediaAsset>): Promise<MediaAsset>;
  uploadVideo(prepared: PreparedVideo, meta: Partial<MediaAsset>): Promise<MediaAsset>;
  replaceImage(id: string, prepared: PreparedImage): Promise<MediaAsset>;
  updateMedia(id: string, patch: Partial<MediaAsset>): Promise<MediaAsset>;
  deleteMedia(id: string): Promise<void>;
  /** The best source for re-editing: the untouched upload if kept, otherwise the largest web copy. */
  getOriginal(asset: MediaAsset): Promise<Blob>;
  /** URL of the file (or of a smaller copy when `edge` is given and exists). Synchronous on purpose. */
  mediaUrl(asset: MediaAsset, edge?: number): string;
}

export class ConflictError extends Error {
  constructor(message = "บันทึกนี้ถูกแก้จากที่อื่นระหว่างนี้") { super(message); this.name = "ConflictError"; }
}
export class AuthError extends Error {
  constructor(message = "กรุณาเข้าสู่ระบบอีกครั้ง") { super(message); this.name = "AuthError"; }
}
