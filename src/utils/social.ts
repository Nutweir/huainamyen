/*
 * Social and contact links for the About page: pick a platform, type a username, get the right URL
 * (pasting a full URL works too). Each platform has its brand colour and a simplified mark.
 */
export interface Platform {
  id: string;
  label: string;
  color: string;
  /** shown before the input, e.g. "tiktok.com/@" */
  prefix: string;
  placeholder: string;
  /** username / address → URL ("" when it can't make a usable one) */
  toUrl: (value: string) => string;
  /** URL → what to show in the input */
  fromUrl: (url: string) => string;
  /** 24×24 mark, filled */
  path: string;
}

const handle = (v: string) => v.trim().replace(/^@+/, "").replace(/\s+/g, "");
const isUrl = (v: string) => /^https?:\/\//i.test(v.trim());
/** A profile on a site: full URLs on that site are kept, anything else is read as a username. */
function profile(id: string, label: string, color: string, base: string, at: boolean, domain: RegExp, path: string): Platform {
  return {
    id, label, color, path,
    prefix: `${base.replace(/^https:\/\/(www\.)?/, "")}${at ? "@" : ""}`,
    placeholder: "ชื่อผู้ใช้",
    toUrl: v => (isUrl(v) ? (domain.test(v) ? v.trim() : "") : handle(v) ? `${base}${at ? "@" : ""}${encodeURIComponent(handle(v))}` : ""),
    fromUrl: url => (domain.test(url) ? decodeURIComponent(url.replace(/^https?:\/\/[^/]+\/@?/i, "").replace(/\/+$/, "")) : url),
  };
}

export const PLATFORMS: Platform[] = [
  profile("instagram", "Instagram", "#E1306C", "https://www.instagram.com/", false, /^https?:\/\/(www\.)?instagram\.com\//i,
    "M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5zm0 2a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3H7zm5 3.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9zm0 2a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zm5.3-4a1.2 1.2 0 1 1 0 2.4 1.2 1.2 0 0 1 0-2.4z"),
  profile("tiktok", "TikTok", "#111111", "https://www.tiktok.com/", true, /^https?:\/\/(www\.|vm\.)?tiktok\.com\//i,
    "M16.6 3c.4 1.9 1.6 3.3 3.4 3.6v3.1a7 7 0 0 1-3.4-1v6.2A5.9 5.9 0 1 1 10.7 9v3.2a2.8 2.8 0 1 0 2.8 2.8V3h3.1z"),
  profile("facebook", "Facebook", "#1877F2", "https://www.facebook.com/", false, /^https?:\/\/(www\.|m\.)?(facebook|fb)\.com\//i,
    "M12 2a10 10 0 0 0-1.6 19.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.5h-1.3c-1.2 0-1.6.8-1.6 1.6V12h2.8l-.4 2.9h-2.4v7A10 10 0 0 0 12 2z"),
  profile("youtube", "YouTube", "#FF0000", "https://www.youtube.com/", true, /^https?:\/\/(www\.|m\.)?(youtube\.com|youtu\.be)\//i,
    "M21.6 7.2a2.5 2.5 0 0 0-1.8-1.8C18.2 5 12 5 12 5s-6.2 0-7.8.4a2.5 2.5 0 0 0-1.8 1.8A26 26 0 0 0 2 12a26 26 0 0 0 .4 4.8 2.5 2.5 0 0 0 1.8 1.8C5.8 19 12 19 12 19s6.2 0 7.8-.4a2.5 2.5 0 0 0 1.8-1.8A26 26 0 0 0 22 12a26 26 0 0 0-.4-4.8zM10 15V9l5.2 3L10 15z"),
  profile("x", "X", "#111111", "https://x.com/", false, /^https?:\/\/(www\.)?(x|twitter)\.com\//i,
    "M17.8 3h3l-6.6 7.6L22 21h-6.1l-4.8-6.3L5.6 21h-3l7.1-8.1L2.2 3h6.2l4.3 5.7L17.8 3zm-1 16.2h1.7L7.3 4.7H5.5l11.3 14.5z"),
  profile("threads", "Threads", "#111111", "https://www.threads.net/", true, /^https?:\/\/(www\.)?threads\.(net|com)\//i,
    "M12.2 21.5c-5.4 0-9-3.5-9-9.5s3.6-9.5 9-9.5c4.3 0 7.3 2.3 8.4 6.3l-2.4.7c-.8-3-3-4.6-6-4.6-3.9 0-6.4 2.6-6.4 7.1s2.5 7.1 6.4 7.1c3.3 0 5.6-1.8 5.6-4.4 0-1.6-.8-2.7-2.2-3.2-.3 2.6-1.8 4.2-4.3 4.2-2.2 0-3.7-1.3-3.7-3.1 0-2.2 1.9-3.4 5.2-3.3.2-1.5-.4-2.3-1.9-2.3-1 0-1.8.4-2.3 1.1L7 8.9c.9-1.2 2.3-1.9 4-1.9 2.9 0 4.5 1.8 4.2 5 2.6.9 3.9 2.8 3.9 5.2 0 3.9-3.3 6.3-6.9 6.3zm-.8-6.4c1.3 0 2.1-.9 2.2-2.6-2.2-.1-3.2.5-3.2 1.4 0 .7.4 1.2 1 1.2z"),
  {
    id: "line", label: "LINE", color: "#06C755", prefix: "LINE ID", placeholder: "ไอดีไลน์ หรือลิงก์ line.me",
    toUrl: v => (isUrl(v) ? (/^https?:\/\/(line\.me|lin\.ee)\//i.test(v) ? v.trim() : "") : handle(v) ? `https://line.me/ti/p/~${encodeURIComponent(handle(v))}` : ""),
    fromUrl: url => url.replace(/^https?:\/\/line\.me\/ti\/p\/~/i, ""),
    path: "M12 3C6.5 3 2 6.6 2 11c0 4 3.6 7.3 8.4 7.9.3.1.8.2.9.5.1.3.1.7 0 1l-.1.9c0 .3-.2 1 .9.5s5.9-3.5 8-6C21.4 14.2 22 12.7 22 11c0-4.4-4.5-8-10-8zM8 13.3H6.2a.5.5 0 0 1-.5-.5V9.1a.5.5 0 0 1 1 0v3.2H8a.5.5 0 0 1 0 1zm1.8-.5a.5.5 0 0 1-1 0V9.1a.5.5 0 0 1 1 0v3.7zm4.3 0a.5.5 0 0 1-.9.3l-1.8-2.5v2.2a.5.5 0 0 1-1 0V9.1a.5.5 0 0 1 .9-.3l1.8 2.5V9.1a.5.5 0 0 1 1 0v3.7zm3-2.3a.5.5 0 0 1 0 1h-1.3v.8h1.3a.5.5 0 0 1 0 1h-1.8a.5.5 0 0 1-.5-.5V9.1c0-.3.2-.5.5-.5h1.8a.5.5 0 0 1 0 1h-1.3v.8h1.3z",
  },
  {
    id: "email", label: "อีเมล", color: "#3f5e45", prefix: "อีเมล", placeholder: "you@example.com",
    toUrl: v => { const e = v.trim().replace(/^mailto:/i, ""); return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? `mailto:${e}` : ""; },
    fromUrl: url => url.replace(/^mailto:/i, ""),
    path: "M3 5h18a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zm1 2.4V17h16V7.4l-8 5.6-8-5.6zM5.6 7l6.4 4.5L18.4 7H5.6z",
  },
  {
    id: "website", label: "เว็บไซต์", color: "#3f5e45", prefix: "https://", placeholder: "example.com",
    toUrl: v => { const t = v.trim(); if (!t) return ""; const u = isUrl(t) ? t : `https://${t}`; return /^https?:\/\/[^\s/]+\.[^\s]+/i.test(u) ? u : ""; },
    fromUrl: url => url.replace(/^https:\/\//i, ""),
    path: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm6.9 6h-3a15.6 15.6 0 0 0-1.4-3.6A8 8 0 0 1 18.9 8zM12 4c.9 1.2 1.6 2.6 2 4h-4c.4-1.4 1.1-2.8 2-4zM4.3 14a8.2 8.2 0 0 1 0-4h3.4a16.5 16.5 0 0 0 0 4H4.3zm.8 2h3a15.6 15.6 0 0 0 1.4 3.6A8 8 0 0 1 5.1 16zm3-8h-3a8 8 0 0 1 4.4-3.6C8.8 5.5 8.4 6.7 8.1 8zM12 20c-.9-1.2-1.6-2.6-2-4h4c-.4 1.4-1.1 2.8-2 4zm2.3-6H9.7a14.6 14.6 0 0 1 0-4h4.6a14.6 14.6 0 0 1 0 4zm.3 5.6c.6-1.1 1.1-2.3 1.4-3.6h3a8 8 0 0 1-4.4 3.6zm1.8-5.6a16.5 16.5 0 0 0 0-4h3.4a8.2 8.2 0 0 1 0 4h-3.4z",
  },
  {
    id: "other", label: "อื่น ๆ", color: "#3f5e45", prefix: "ลิงก์", placeholder: "https://…",
    toUrl: v => (/^(https?:\/\/|mailto:|tel:)\S+$/i.test(v.trim()) ? v.trim() : ""),
    fromUrl: url => url,
    path: "M10.6 13.4a1 1 0 0 1 0-1.4l3-3a1 1 0 1 1 1.4 1.4l-3 3a1 1 0 0 1-1.4 0zM8.5 19a4.5 4.5 0 0 1-3.2-7.7l2.1-2.1a1 1 0 1 1 1.4 1.4l-2.1 2.1a2.5 2.5 0 0 0 3.5 3.5l2.1-2.1a1 1 0 1 1 1.4 1.4l-2.1 2.1A4.5 4.5 0 0 1 8.5 19zm7.4-5.2a1 1 0 0 1-.7-1.7l2.1-2.1a2.5 2.5 0 0 0-3.5-3.5l-2.1 2.1a1 1 0 1 1-1.4-1.4l2.1-2.1a4.5 4.5 0 0 1 6.4 6.4l-2.1 2.1a1 1 0 0 1-.8.2z",
  },
];

export const platformById = (id: string | undefined) => PLATFORMS.find(p => p.id === id);
/** Which platform a saved URL belongs to (older links have no platform stored). */
export function detectPlatform(url: string): Platform {
  for (const p of PLATFORMS) {
    if (["website", "other", "email", "line"].includes(p.id)) continue;
    if (p.toUrl(url) === url.trim() && isUrl(url)) return p;
  }
  if (/^mailto:/i.test(url)) return platformById("email")!;
  if (/^https?:\/\/(line\.me|lin\.ee)\//i.test(url)) return platformById("line")!;
  return platformById(isUrl(url) ? "website" : "other")!;
}
