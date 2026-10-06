const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const pad = (n: number) => String(n).padStart(2, "0");

export const uid = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID()
    : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => { const r = (Math.random() * 16) | 0; return (c === "x" ? r : (r & 3) | 8).toString(16); });

function ymd(s: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || "");
  return m ? { y: +m[1], m: +m[2], d: +m[3] } : null;
}

/** "03–04 October 2026", "30 September – 02 October 2026"; short: "03–04 Oct". */
export function dateRange(a: string, b?: string | null, short = false): string {
  const s = ymd(a), e = ymd(b || a);
  if (!s || !e) return "";
  const mon = (m: number) => (short ? MONTHS[m - 1].slice(0, 3) : MONTHS[m - 1]);
  const year = short ? "" : ` ${e.y}`;
  if (a === (b || a)) return `${pad(s.d)} ${mon(s.m)}${year}`;
  if (s.y === e.y && s.m === e.m) return `${pad(s.d)}–${pad(e.d)} ${mon(e.m)}${year}`;
  if (s.y === e.y) return `${pad(s.d)} ${mon(s.m)} – ${pad(e.d)} ${mon(e.m)}${year}`;
  return `${pad(s.d)} ${mon(s.m)} ${s.y} – ${pad(e.d)} ${mon(e.m)} ${e.y}`;
}

/** "2026-10-03" → "03 Oct 2026"; anything malformed → "" (never throws). */
export function stampDate(s: string | null | undefined): string {
  const d = ymd(s || "");
  return d ? `${pad(d.d)} ${MONTHS[d.m - 1].slice(0, 3)} ${d.y}` : "";
}

export const yearOf = (s: string): string => (ymd(s)?.y ?? "").toString();
export const pad2 = pad;

export function slugify(s: string): string {
  return s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}

export const isTime = (s: string): boolean => /^\d{1,2}:\d{2}$/.test(s);

/** Deep copy of plain JSON content. Works on Vue reactive proxies, which structuredClone refuses. */
export const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
