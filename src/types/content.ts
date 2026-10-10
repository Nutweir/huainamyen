/*
 * Content model shared by the public site, the admin, the migration scripts and the database.
 * Everything here is plain JSON so a trip can be exported, archived and re-imported for decades
 * without depending on any editor library. Rich text is a small sanitized HTML subset
 * (<b> <i> <br> <a>), see utils/sanitize.ts.
 */

export type TripStatus = "draft" | "published" | "archived";
export type Mood = "morning" | "day" | "golden" | "dusk" | "night" | "dawn" | "forest" | "evening" | "notes";
export const MOODS: Mood[] = ["morning", "day", "golden", "dusk", "night", "dawn", "forest", "evening", "notes"];

export type ImageLayout =
  | "hero" | "full" | "spotlight" | "background" | "wide" | "inline" | "portrait" | "polaroid" | "diary-photo";
export type SetLayout = "two-column" | "collage" | "memory-stack" | "film-strip" | "gallery";
export type Position = "left" | "right" | "center" | "bleed-left" | "bleed-right";

export interface MediaAsset {
  id: string;
  kind: "image" | "video";
  /** Path inside the "media" bucket (or a legacy static path starting with "trips/"). */
  path: string;
  /** Smaller copies by longest edge, e.g. { "500": "…/500.webp" }. */
  variants: Record<string, string>;
  /** The untouched upload in the private "originals" bucket. */
  originalPath: string | null;
  mime: string;
  width: number;
  height: number;
  bytes: number;
  alt: string;
  caption: string;
  takenDate: string | null;
  takenTime: string | null;
  location: string;
  camera: string;
  note: string;
  focus: string | null;
  tags: string[];
  album: string | null;
  tripId: string | null;
  /** For videos: the poster image asset. */
  posterId: string | null;
  /** Stable key from the legacy site (e.g. "noodles"); used to keep old references working. */
  legacyKey: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A photo placed in the story. Fields set here override the asset's own caption etc. for this spot only. */
export interface MediaRef {
  mediaId: string;
  caption?: string;
  alt?: string;
  time?: string;
  date?: string;
  location?: string;
  camera?: string;
  note?: string;
  rotation?: number;
  size?: "s" | "m" | "l";
  aspectRatio?: string;
  expandable?: boolean;
  hidden?: boolean;
}
export interface Placeholder { placeholder: string }
export type SetItem = MediaRef | Placeholder;

export interface BlockDataMap {
  /** Starts a timestamped moment in the day. Everything until the next event belongs to it. */
  event: { anchor: string; time: string; title: string; mood: Mood | null; quietTitle: boolean };
  paragraph: { html: string };
  heading: { html: string };
  thought: { html: string; size: "" | "xl" };
  note: { html: string };
  quote: { html: string; by: string };
  dialogue: { lines: { who: string; line: string }[] };
  verse: { lines: string[] };
  letter: { lines: string[]; lead: string };
  pause: { text: string };
  mark: { text: string };
  spacer: { size: "s" | "m" | "l" };
  stamp: { value: string; label: string; sub: string };
  image: { item: MediaRef; layout: ImageLayout | ""; position: Position | ""; tone: "" | "forest" | "night"; reveal: "" | "slow"; besideCount: number; text: string[] };
  images: { items: SetItem[]; layout: SetLayout | ""; caption: string; position: Position | "" };
  placeholder: { label: string; layout: ImageLayout | ""; position: Position | "" };
  video: { mediaId: string; caption: string; label: string };
  decoration: { item: MediaRef; position: "" | "left" | "right" };
}
export type BlockType = keyof BlockDataMap;
export const BLOCK_TYPES = [
  "event", "paragraph", "heading", "thought", "note", "quote", "dialogue", "verse", "letter",
  "pause", "mark", "spacer", "stamp", "image", "images", "placeholder", "video", "decoration",
] as const satisfies readonly BlockType[];

export type Block<T extends BlockType = BlockType> = {
  [K in T]: { id: string; type: K; data: BlockDataMap[K] };
}[T];

export interface TripDay {
  id: string;
  dayNumber: number;
  date: string | null;
  route: string[];
  mood: Mood;
  closing: string;
  /** Ordered story of the day. */
  blocks: Block[];
}

export interface TravelNoteSection {
  anchor: string;
  title: string;
  en: string;
  kind: "html" | "map" | "expenses" | "contacts";
  html: string;
}
export interface Place { key: string; name: string; area: string; coordinates: string; embed: string }
export interface Contact { href: string; title: string; desc: string; host: string; external: boolean }
export interface Expense { label: string; amount: string; note: string }

export interface TravelNotes {
  lede: string;
  disclaimer: string;
  facts: [string, string][];
  sections: TravelNoteSection[];
  places: Place[];
  mapNote: string;
  expensesBefore: string;
  expenses: Expense[];
  split: [string, number][];
  splitNote: string;
  contacts: Contact[];
  /** Old anchors that should land on a section, e.g. { omkoi: "getting-there" }. */
  aliases: Record<string, string>;
}

export interface TripEnding {
  heading: string;
  prelude: string[][];
  title: string;
  stanzas: string[][];
  signoff: string;
  photo: MediaRef | null;
}

export interface Trip {
  id: string;
  slug: string;
  title: string;
  titleLocal: string;
  location: string;
  startDate: string;
  endDate: string | null;
  durationLabel: string;
  summary: string;
  epigraph: string[];
  coverId: string | null;
  coverMeta: [string, string][];
  tags: string[];
  companions: string;
  seoTitle: string;
  seoDescription: string;
  ogImageId: string | null;
  status: TripStatus;
  publishedVersionId: string | null;
  publishedAt: string | null;
  sortOrder: number;
  showPlaceholders: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Everything needed to show or edit one trip. Also the shape of exports and published snapshots. */
export interface TripBundle {
  schema: 1;
  trip: Trip;
  days: TripDay[];
  ending: TripEnding | null;
  gallery: string[];
  notes: TravelNotes | null;
  media: MediaAsset[];
}

export interface ContentVersion {
  id: string;
  tripId: string;
  label: string;
  createdAt: string;
  isPublished: boolean;
  snapshot: TripBundle;
}

export interface TripSummary {
  id: string;
  slug: string;
  title: string;
  location: string;
  startDate: string;
  endDate: string | null;
  summary: string;
  status: TripStatus;
  coverId: string | null;
  cover: MediaAsset | null;
  tags: string[];
  updatedAt: string;
  publishedAt: string | null;
}

export interface SiteSettings {
  title: string;
  tagline: string;
  /** About page text: <p> paragraphs of the inline subset. */
  aboutHtml: string;
  author: string;
  /** About page photo — a copy of the asset, since readers can't read the media table. */
  photo?: MediaAsset | null;
  /** Links on the About page (Instagram, e-mail…); platform is an id from utils/social (older links have none). */
  links?: { label: string; url: string; platform?: string }[];
  /** A short handwritten line under the name. */
  note?: string;
  /** Small facts beside it, e.g. ["Based in", "เชียงใหม่"]. */
  facts?: [string, string][];
  /** Handwritten caption under the photo. */
  photoCaption?: string;
}

export const isPlaceholder = (x: SetItem): x is Placeholder => "placeholder" in x;
