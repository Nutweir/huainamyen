/*
 * File checks and in-browser processing for uploads.
 * The real type comes from the file's first bytes, never from its name or the browser's guess.
 */

export type Sniffed =
  | { kind: "image"; mime: "image/jpeg" | "image/png" | "image/webp" | "image/gif" | "image/avif" | "image/heic" }
  | { kind: "raw"; mime: "image/x-adobe-dng" }
  | { kind: "video"; mime: "video/mp4" | "video/quicktime" | "video/webm" };

export const LIMITS = { imageBytes: 60 * 1024 * 1024, videoBytes: 50 * 1024 * 1024 };

export function sniffBytes(b: Uint8Array): Sniffed | null {
  const ascii = (from: number, to: number) => String.fromCharCode(...b.subarray(from, to));
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { kind: "image", mime: "image/jpeg" };
  if (b[0] === 0x89 && ascii(1, 4) === "PNG") return { kind: "image", mime: "image/png" };
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return { kind: "image", mime: "image/webp" };
  if (ascii(0, 4) === "GIF8") return { kind: "image", mime: "image/gif" };
  if ((b[0] === 0x49 && b[1] === 0x49 && b[2] === 0x2a && b[3] === 0) || (b[0] === 0x4d && b[1] === 0x4d && b[2] === 0 && b[3] === 0x2a)) return { kind: "raw", mime: "image/x-adobe-dng" };
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return { kind: "video", mime: "video/webm" };
  if (ascii(4, 8) === "ftyp") {
    const brand = ascii(8, 12);
    if (["avif", "avis"].includes(brand)) return { kind: "image", mime: "image/avif" };
    if (["heic", "heix", "hevc", "heim", "heis", "mif1", "msf1"].includes(brand)) return { kind: "image", mime: "image/heic" };
    if (brand === "qt  ") return { kind: "video", mime: "video/quicktime" };
    return { kind: "video", mime: "video/mp4" }; // isom, mp41, mp42, M4V , avc1, iso5…
  }
  return null;
}

export async function sniff(file: Blob): Promise<Sniffed | null> {
  return sniffBytes(new Uint8Array(await file.slice(0, 32).arrayBuffer()));
}

/** Refuse anything that isn't really a photo or clip, or is too big. Returns a Thai message or null. */
export async function validateUpload(file: File): Promise<{ type: Sniffed } | { error: string }> {
  const type = await sniff(file);
  if (!type) return { error: `${file.name}: ไม่ใช่ไฟล์รูปหรือวิดีโอที่รองรับ` };
  const limit = type.kind === "video" ? LIMITS.videoBytes : LIMITS.imageBytes;
  if (file.size > limit) return { error: `${file.name}: ใหญ่เกิน ${Math.round(limit / 1048576)} MB` };
  return { type };
}

/* ---------- EXIF date (JPEG and DNG/TIFF) ---------- */
function tiffReader(v: DataView, t: number) {
  const le = v.getUint16(t) === 0x4949;
  const u16 = (o: number) => v.getUint16(t + o, le), u32 = (o: number) => v.getUint32(t + o, le);
  const find = (ifd: number, tag: number) => { const n = u16(ifd); for (let i = 0; i < n; i++) { const e = ifd + 2 + i * 12; if (u16(e) === tag) return e; } return null; };
  return { u16, u32, find, ifd0: u32(4) };
}
function tiffDate(v: DataView, t: number): { date: string; time: string } | null {
  try {
    const r = tiffReader(v, t);
    const exifPtr = r.find(r.ifd0, 0x8769);
    const entry = exifPtr && (r.find(r.u32(exifPtr + 8), 0x9003) || r.find(r.u32(exifPtr + 8), 0x9004));
    if (!entry) return null;
    const s = Array.from({ length: 19 }, (_, i) => String.fromCharCode(v.getUint8(t + r.u32(entry + 8) + i))).join("");
    const m = s.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2})/);
    return m ? { date: `${m[1]}-${m[2]}-${m[3]}`, time: `${m[4]}:${m[5]}` } : null;
  } catch { return null; }
}
/** When the photo was taken, read before re-encoding strips EXIF. */
export async function exifDate(file: Blob): Promise<{ date: string; time: string } | null> {
  try {
    const v = new DataView(await file.slice(0, 256 * 1024).arrayBuffer());
    if (v.getUint32(0) === 0x49492a00 || v.getUint32(0) === 0x4d4d002a) return tiffDate(v, 0);
    if (v.getUint16(0) !== 0xffd8) return null;
    let off = 2;
    while (off + 4 < v.byteLength) {
      const marker = v.getUint16(off), len = v.getUint16(off + 2);
      if (marker === 0xffe1 && v.getUint32(off + 4) === 0x45786966) return tiffDate(v, off + 10);
      if ((marker & 0xff00) !== 0xff00) break;
      off += 2 + len;
    }
  } catch { /* no EXIF */ }
  return null;
}

/* ---------- decoding ---------- */
/** DNG: use the full-size JPEG preview the camera embeds (Ricoh: 6000×4000), turned upright. */
async function dngBitmap(file: Blob): Promise<ImageBitmap> {
  const buf = new Uint8Array(await file.arrayBuffer());
  let orientation = 1;
  try { const r = tiffReader(new DataView(buf.buffer), 0), e = r.find(r.ifd0, 0x0112); if (e) orientation = r.u16(e + 8); } catch { /* upright */ }
  const starts: number[] = [];
  for (let i = 0; i < buf.length - 3 && starts.length < 40; i++) if (buf[i] === 0xff && buf[i + 1] === 0xd8 && buf[i + 2] === 0xff && buf[i + 3] >= 0xc0) starts.push(i);
  let best: ImageBitmap | null = null;
  for (const s of starts.slice(0, 16)) {
    try {
      const bmp = await createImageBitmap(new Blob([buf.subarray(s)], { type: "image/jpeg" }), { imageOrientation: "none" });
      if (!best || bmp.width * bmp.height > best.width * best.height) { best?.close(); best = bmp; } else bmp.close();
    } catch { /* raw sensor data, not a preview */ }
  }
  if (!best || Math.max(best.width, best.height) < 1000) throw new Error("ไฟล์ DNG นี้ไม่มีภาพตัวอย่างขนาดใหญ่ในตัว ให้แปลงเป็น JPG ก่อน");
  if (orientation === 1) return best;
  const turned = orientation === 6 || orientation === 8;
  const c = new OffscreenCanvas(turned ? best.height : best.width, turned ? best.width : best.height);
  const ctx = c.getContext("2d")!;
  if (orientation === 3) { ctx.translate(best.width, best.height); ctx.rotate(Math.PI); }
  if (orientation === 6) { ctx.translate(best.height, 0); ctx.rotate(Math.PI / 2); }
  if (orientation === 8) { ctx.translate(0, best.width); ctx.rotate(-Math.PI / 2); }
  ctx.drawImage(best, 0, 0);
  best.close();
  return c.transferToImageBitmap();
}

export async function decodeImage(file: Blob, type: Sniffed): Promise<ImageBitmap> {
  if (type.kind === "raw") return dngBitmap(file);
  try { return await createImageBitmap(file); }
  catch { throw new Error(type.mime === "image/heic" ? "เบราว์เซอร์นี้เปิดไฟล์ HEIC ไม่ได้ เลือกจาก Safari บน iPhone หรือแปลงเป็น JPG ก่อน" : "เปิดรูปนี้ไม่ได้ ไฟล์อาจเสีย"); }
}

/* ---------- encoding ---------- */
export interface Crop { x: number; y: number; w: number; h: number } // fractions of the (rotated) photo
export interface Edit { crop?: Crop | null; rotate?: 0 | 90 | 180 | 270 }

/** Apply rotation + crop, return a new bitmap (the source is left untouched). */
export async function applyEdit(src: ImageBitmap, edit: Edit = {}): Promise<ImageBitmap> {
  const rot = edit.rotate || 0;
  const turned = rot === 90 || rot === 270;
  const rw = turned ? src.height : src.width, rh = turned ? src.width : src.height;
  const c = edit.crop || { x: 0, y: 0, w: 1, h: 1 };
  const out = new OffscreenCanvas(Math.max(1, Math.round(c.w * rw)), Math.max(1, Math.round(c.h * rh)));
  const ctx = out.getContext("2d")!;
  ctx.translate(-c.x * rw, -c.y * rh);
  ctx.translate(rw / 2, rh / 2);
  ctx.rotate((rot * Math.PI) / 180);
  ctx.drawImage(src, -src.width / 2, -src.height / 2);
  return out.transferToImageBitmap();
}

/** Resize to fit `edge` and encode (WebP; JPEG if the browser can't make WebP). EXIF/GPS are never copied. */
export async function encode(bmp: ImageBitmap, edge: number, quality = 0.82): Promise<{ blob: Blob; width: number; height: number }> {
  const scale = Math.min(1, edge / Math.max(bmp.width, bmp.height));
  const width = Math.round(bmp.width * scale), height = Math.round(bmp.height * scale);
  const c = new OffscreenCanvas(width, height);
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bmp, 0, 0, width, height);
  let blob = await c.convertToBlob({ type: "image/webp", quality });
  if (blob.type !== "image/webp") blob = await c.convertToBlob({ type: "image/jpeg", quality: 0.85 });
  return { blob, width, height };
}

export const MAIN_EDGE = 2000;
export const VARIANTS = [500, 1000];

export interface PreparedImage {
  kind: "image";
  original: File;
  main: { blob: Blob; width: number; height: number };
  variants: { edge: number; blob: Blob; width: number; height: number }[];
  taken: { date: string; time: string } | null;
}

export async function prepareImage(file: File, edit: Edit = {}): Promise<PreparedImage> {
  const check = await validateUpload(file);
  if ("error" in check) throw new Error(check.error);
  if (check.type.kind === "video") throw new Error("นี่คือวิดีโอ ไม่ใช่รูป");
  const taken = await exifDate(file);
  const src = await decodeImage(file, check.type);
  const edited = edit.crop || edit.rotate ? await applyEdit(src, edit) : src;
  const main = await encode(edited, MAIN_EDGE);
  const variants = [];
  for (const edge of VARIANTS) if (Math.max(main.width, main.height) > edge * 1.15) variants.push({ edge, ...(await encode(edited, edge)) });
  if (edited !== src) edited.close();
  src.close();
  return { kind: "image", original: file, main, variants, taken };
}

/* ---------- video ---------- */
export interface PreparedVideo {
  kind: "video";
  original: File;
  width: number; height: number; duration: number;
  poster: Blob | null;
}

/**
 * A clip's size and a poster frame. iPhone Safari only decodes frames for a video that is in the page
 * and has played, so the probe sits invisibly in the page and plays muted for a moment.
 */
export function prepareVideo(file: File, at = 1): Promise<PreparedVideo> {
  return new Promise((ok, fail) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.muted = true; v.defaultMuted = true; v.playsInline = true;
    v.setAttribute("muted", ""); v.setAttribute("playsinline", ""); v.preload = "auto";
    v.style.cssText = "position:fixed;left:0;top:0;width:2px;height:2px;opacity:0;pointer-events:none;";
    document.body.appendChild(v);
    const done = (fn: () => void) => { clearTimeout(timer); v.removeAttribute("src"); v.load(); v.remove(); URL.revokeObjectURL(url); fn(); };
    const timer = setTimeout(() => done(() => fail(new Error("อ่านคลิปไม่ได้ (หมดเวลา)"))), 25000);
    const waitFor = (ev: string, ms: number) => new Promise<void>(r => { const t = setTimeout(r, ms); v.addEventListener(ev, () => { clearTimeout(t); r(); }, { once: true }); });
    v.addEventListener("error", () => done(() => fail(new Error("เบราว์เซอร์นี้เปิดคลิปนี้ไม่ได้ ถ้าเป็น HEVC/.mov ให้เลือกจาก Safari หรือแปลงเป็น MP4 (H.264)"))), { once: true });
    v.addEventListener("loadedmetadata", async () => {
      const info: PreparedVideo = { kind: "video", original: file, width: v.videoWidth, height: v.videoHeight, duration: v.duration, poster: null };
      try {
        await v.play().catch(() => undefined);
        await waitFor("timeupdate", 2500);
        v.pause();
        const t = Math.min(at, (v.duration || 2) / 2);
        if (Math.abs(v.currentTime - t) > 0.05) { v.currentTime = t; await waitFor("seeked", 4000); }
        if (v.readyState >= 2 && v.videoWidth) info.poster = await frameBlob(v);
      } catch { /* poster can be chosen later */ }
      done(() => ok(info));
    }, { once: true });
    v.src = url;
    v.load();
  });
}

export async function frameBlob(video: HTMLVideoElement): Promise<Blob> {
  const scale = Math.min(1, 1280 / Math.max(video.videoWidth, video.videoHeight));
  const c = new OffscreenCanvas(Math.round(video.videoWidth * scale), Math.round(video.videoHeight * scale));
  c.getContext("2d")!.drawImage(video, 0, 0, c.width, c.height);
  return c.convertToBlob({ type: "image/webp", quality: 0.82 });
}
