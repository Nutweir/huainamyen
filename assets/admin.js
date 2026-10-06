/*
 * Admin: add and edit a trip's photos and clips from the browser, published as one GitHub commit.
 * Photos are resized and re-encoded here (which drops EXIF/GPS). Everything the admin
 * changes is written to trips/<slug>/uploads.js — new photos, and edits to the trip's own
 * photos as overrides — so the story in trip.js is never rewritten.
 */
(() => {
  "use strict";

  const API = "https://api.github.com";
  const MAX_EDGE = 1800;
  const VARIANTS = [500, 1000]; // keep in sync with assets/journal-images.js and tools/prepare_images.py
  const QUALITY = 0.82;
  const STORE = "journal-admin-token";
  const REPO = document.body.dataset.repo;
  const BRANCH = document.body.dataset.branch || "main";
  const META = ["caption", "alt", "time", "date", "location"];

  const LAYOUTS = {
    single: [["", "อัตโนมัติ"], ["wide", "wide · กว้าง"], ["full", "full · เต็มจอ"], ["spotlight", "spotlight · ทั้งใบบนแถบสี"], ["inline", "inline · ในคอลัมน์ข้อความ"],
      ["portrait", "portrait · แนวตั้ง"], ["polaroid", "polaroid · โพลารอยด์"], ["diary-photo", "diary-photo · รูปแปะเทป"], ["background", "background · ภาพบรรยากาศ"], ["hero", "hero · ภาพเปิดเต็มจอ"]],
    set: [["", "อัตโนมัติ"], ["two-column", "two-column · สองรูปคู่"], ["collage", "collage · คอลลาจ (3–4 รูป)"], ["memory-stack", "memory-stack · รูปซ้อนกัน"],
      ["film-strip", "film-strip · แถบฟิล์ม"], ["gallery", "gallery · ตารางรูป"]],
    decoration: [["", "ขนาดปกติ"], ["s", "เล็ก"], ["l", "ใหญ่"]]
  };
  const POSITIONS = [["", "อัตโนมัติ"], ["left", "ซ้าย"], ["right", "ขวา"], ["center", "กลาง"], ["bleed-left", "ล้นขอบซ้าย"], ["bleed-right", "ล้นขอบขวา"]];
  const LEGACY_LAYOUT = { stage: "spotlight", pair: "two-column", trio: "collage" };

  /*
   * Recommended photo per layout, matching how journal.css shows each preset.
   * ratio: the shape to crop to (the page crops to it when `crops`), min: shortest good long edge in px.
   */
  const SPECS = {
    "":            { min: 1200, text: "ระบบเลือกรูปแบบให้ตามรูป · ด้านยาวอย่างน้อย 1200 px" },
    hero:          { ratio: [16, 9], crops: true, min: 1800, text: "แนวนอน 16:9 · กว้างอย่างน้อย 1800 px · เต็มจอ ขอบอาจถูกตัด" },
    full:          { ratio: [3, 2], min: 1800, text: "แนวนอน 3:2 หรือ 16:9 · กว้างอย่างน้อย 1800 px · จอคอมจะตัดให้พอดีจอ มือถือเห็นทั้งใบ" },
    spotlight:     { ratio: [3, 4], min: 1400, text: "แนวตั้ง 3:4 ถึง 9:16 · สูงอย่างน้อย 1400 px · แสดงทั้งใบ" },
    background:    { ratio: [16, 9], crops: true, min: 1800, text: "แนวนอน 16:9 · กว้างอย่างน้อย 1800 px · เว้นด้านล่างไว้ให้ข้อความ" },
    wide:          { ratio: [3, 2], crops: true, min: 1600, text: "แนวนอน 3:2 · อย่างน้อย 1600×1067 px" },
    inline:        { min: 1200, text: "สัดส่วนไหนก็ได้ · ด้านยาวอย่างน้อย 1200 px · แสดงทั้งใบ" },
    portrait:      { ratio: [4, 5], min: 1150, text: "แนวตั้ง 4:5 · อย่างน้อย 920×1150 px · แสดงทั้งใบ" },
    polaroid:      { ratio: [1, 1], crops: true, min: 700, text: "สี่เหลี่ยมจัตุรัส 1:1 · อย่างน้อย 700×700 px" },
    "diary-photo": { min: 600, text: "สัดส่วนไหนก็ได้ · ด้านยาวอย่างน้อย 600 px" },
    "two-column":  { ratio: [4, 5], crops: true, min: 1100, text: "แนวตั้ง 4:5 ทุกรูป · อย่างน้อย 880×1100 px" },
    collage:       { ratio: [4, 5], crops: true, min: 1100, text: "แนวตั้ง 4:5 · อย่างน้อย 880×1100 px · รูปแรกจะใหญ่ที่สุด" },
    "memory-stack":{ ratio: [4, 5], crops: true, min: 800, text: "แนวตั้ง 4:5 · อย่างน้อย 640×800 px" },
    "film-strip":  { min: 600, text: "สัดส่วนไหนก็ได้ · สูงอย่างน้อย 600 px" },
    gallery:       { ratio: [1, 1], crops: true, min: 600, text: "สี่เหลี่ยมจัตุรัส 1:1 · อย่างน้อย 600×600 px" },
    separate:      { min: 1200, text: "แต่ละรูปเลือกรูปแบบอัตโนมัติ · ด้านยาวอย่างน้อย 1200 px" },
    decoration:    { ratio: [4, 5], crops: true, min: 400, text: "รูปเล็ก 4:5 · อย่างน้อย 320×400 px" },
    cover:         { ratio: [9, 16], min: 1400, text: "แนวตั้ง · สูงอย่างน้อย 1400 px · มือถือครอปเป็น 4:5" }
  };

  function specFor(as, layout, count) {
    if (as === "decoration") return SPECS.decoration;
    if (as === "cover") return SPECS.cover;
    if (!layout && count > 1) return SPECS[count === 2 ? "two-column" : count <= 4 ? "collage" : "gallery"];
    return SPECS[LEGACY_LAYOUT[layout] || layout] || SPECS[""];
  }

  // Does this photo (after any crop) suit the layout? Small = blurry on big screens; other shape = edges cut.
  function checkSize(w, h, spec) {
    if (!w || !h) return { level: "", text: "" };
    const notes = [];
    if (Math.max(w, h) < spec.min) notes.push(`เล็กกว่าที่แนะนำ (ด้านยาว ${Math.max(w, h)} px) อาจไม่คมบนจอใหญ่`);
    if (spec.ratio && spec.crops) {
      const want = spec.ratio[0] / spec.ratio[1], got = w / h;
      if (Math.abs(got - want) / want > 0.06) notes.push(`สัดส่วนไม่ตรง ${spec.ratio.join(":")} หน้าเว็บจะตัดขอบให้ · กด "ครอป" เพื่อเลือกส่วนเอง`);
    }
    return notes.length ? { level: "warn", text: notes.join(" · ") } : { level: "ok", text: "ขนาดและสัดส่วนเหมาะกับรูปแบบนี้" };
  }
  const sizeBadge = (w, h, spec) => {
    const c = checkSize(w, h, spec);
    return `<span class="size-info">${w && h ? `${w}×${h} px` : ""}</span>${c.text ? `<span class="size-check ${c.level}">${c.level === "ok" ? "✓ " : "! "}${c.text}</span>` : ""}`;
  };

  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  const options = (list, value) => list.map(([v, l]) => `<option value="${v}"${v === (value || "") ? " selected" : ""}>${l}</option>`).join("");
  const JI = window.JournalImages;
  const trips = window.JOURNAL_TRIPS || [];
  let token = "", files = [], uploads = null;

  /* ---------- GitHub ---------- */
  async function gh(path, opts = {}) {
    const res = await fetch(API + path, {
      ...opts,
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", ...(opts.body ? { "Content-Type": "application/json" } : {}) }
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const err = new Error(`${res.status} ${body.message || res.statusText}`);
      err.status = res.status;
      throw err;
    }
    return res.status === 204 ? null : res.json();
  }

  const b64ToText = b64 => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\n/g, "")), c => c.charCodeAt(0)));
  const textToB64 = text => { const bytes = new TextEncoder().encode(text); let s = ""; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); };
  const blobToB64 = blob => new Promise((ok, fail) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(",")[1]); r.onerror = fail; r.readAsDataURL(blob); });

  const uploadsPath = T => `${T.base}uploads.js`;
  const emptyUploads = () => ({ images: {}, sizes: {}, placements: [], gallery: [], overrides: { images: {}, blocks: {} } });
  const normalize = d => { const e = emptyUploads(); return { ...e, ...d, overrides: { ...e.overrides, ...(d.overrides || {}) } }; };

  function parseUploads(text) {
    const start = text.indexOf("= {"), end = text.lastIndexOf("};");
    if (start < 0 || end < 0) throw new Error("uploads.js อ่านไม่ได้");
    return normalize(JSON.parse(text.slice(start + 2, end + 1)));
  }
  const writeUploads = (T, data) =>
    `/* Managed by admin.html — photos added online and edits to the trip's photos. Edit through the admin page, not by hand. */\n(window.JOURNAL_UPLOADS = window.JOURNAL_UPLOADS || {})["${T.slug}"] = ${JSON.stringify(data, null, 2)};\n`;

  async function readUploads(T, ref = BRANCH) {
    try {
      const f = await gh(`/repos/${REPO}/contents/${uploadsPath(T)}?ref=${ref}`);
      return parseUploads(b64ToText(f.content));
    } catch (e) {
      if (e.status === 404) return emptyUploads();
      throw e;
    }
  }

  /**
   * One commit for everything. `build(current)` gets the latest uploads data and returns
   * { data, files: [{ path, b64 }], remove: [paths] }. Retries once if someone pushed meanwhile.
   */
  async function commit(T, message, build, log) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const ref = await gh(`/repos/${REPO}/git/ref/heads/${BRANCH}`);
      const head = await gh(`/repos/${REPO}/git/commits/${ref.object.sha}`);
      const current = await readUploads(T, ref.object.sha);
      const plan = await build(current);
      const tree = [];
      for (const f of [...plan.files, { path: uploadsPath(T), b64: textToB64(writeUploads(T, plan.data)) }]) {
        log(`อัปโหลด ${f.path.split("/").pop()}${f.blob && f.blob.size > 2e6 ? ` (${(f.blob.size / 1048576).toFixed(1)} MB)` : ""}`);
        const content = f.b64 ?? await blobToB64(f.blob);
        const blob = await gh(`/repos/${REPO}/git/blobs`, { method: "POST", body: JSON.stringify({ content, encoding: "base64" }) });
        tree.push({ path: f.path, mode: "100644", type: "blob", sha: blob.sha });
      }
      (plan.remove || []).forEach(path => tree.push({ path, mode: "100644", type: "blob", sha: null }));
      const newTree = await gh(`/repos/${REPO}/git/trees`, { method: "POST", body: JSON.stringify({ base_tree: head.tree.sha, tree }) });
      const next = await gh(`/repos/${REPO}/git/commits`, { method: "POST", body: JSON.stringify({ message, tree: newTree.sha, parents: [ref.object.sha] }) });
      try {
        await gh(`/repos/${REPO}/git/refs/heads/${BRANCH}`, { method: "PATCH", body: JSON.stringify({ sha: next.sha }) });
        return plan.data;
      } catch (e) {
        if (e.status !== 422 || attempt) throw e;
        log("มีการแก้ไขใหม่บน GitHub ระหว่างนี้ กำลังลองอีกครั้ง…");
      }
    }
  }

  /* ---------- photos ---------- */

  // Date/time the photo was taken, from the JPEG's EXIF (read before it is stripped).
  async function exifDate(file) {
    try {
      const v = new DataView(await file.slice(0, 256 * 1024).arrayBuffer());
      if (v.getUint32(0) === 0x49492a00 || v.getUint32(0) === 0x4d4d002a) return tiffDate(v, 0); // DNG is TIFF
      if (v.getUint16(0) !== 0xffd8) return null;
      let off = 2;
      while (off + 4 < v.byteLength) {
        const marker = v.getUint16(off), len = v.getUint16(off + 2);
        if (marker === 0xffe1 && v.getUint32(off + 4) === 0x45786966) return tiffDate(v, off + 10);
        if ((marker & 0xff00) !== 0xff00) break;
        off += 2 + len;
      }
    } catch { /* no EXIF: fields stay empty */ }
    return null;
  }

  // TIFF block (inside JPEG EXIF, or a whole DNG): find the IFD entry for a tag.
  function tiffReader(v, t) {
    const le = v.getUint16(t) === 0x4949;
    const u16 = o => v.getUint16(t + o, le), u32 = o => v.getUint32(t + o, le);
    const find = (ifd, tag) => { const n = u16(ifd); for (let i = 0; i < n; i++) { const e = ifd + 2 + i * 12; if (u16(e) === tag) return e; } return null; };
    return { u16, u32, find, ifd0: u32(4) };
  }

  function tiffDate(v, t) {
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

  /* ---------- DNG and video ---------- */
  const isDng = f => /\.dng$/i.test(f.name) || f.type === "image/x-adobe-dng";
  const isVideo = f => f.type.startsWith("video/") || /\.(mp4|m4v|mov|webm)$/i.test(f.name);
  const isImageFile = f => f.type.startsWith("image/") || /\.(jpe?g|png|webp|gif|avif)$/i.test(f.name);
  const MAX_VIDEO_MB = 50;

  /*
   * Browsers can't read camera raw files, but DNGs normally carry a full-size JPEG preview
   * (Ricoh: 6000×4000). Take the largest preview that decodes, turn it upright, return a JPG file.
   */
  async function dngToJpeg(file) {
    const buf = new Uint8Array(await file.arrayBuffer());
    const view = new DataView(buf.buffer);
    let orientation = 1;
    try { const r = tiffReader(view, 0), e = r.find(r.ifd0, 0x0112); if (e) orientation = r.u16(e + 8); } catch { /* keep upright */ }
    const starts = [];
    for (let i = 0; i < buf.length - 3 && starts.length < 40; i++) {
      if (buf[i] === 0xff && buf[i + 1] === 0xd8 && buf[i + 2] === 0xff && (buf[i + 3] >= 0xc0)) starts.push(i);
    }
    let best = null;
    for (const s of starts.slice(0, 16)) {
      try {
        const bmp = await createImageBitmap(new Blob([buf.subarray(s)], { type: "image/jpeg" }), { imageOrientation: "none" });
        if (!best || bmp.width * bmp.height > best.width * best.height) { if (best && best.close) best.close(); best = bmp; } else if (bmp.close) bmp.close();
      } catch { /* raw sensor data or a false match: not a viewable JPEG */ }
    }
    if (!best || Math.max(best.width, best.height) < 1000) throw new Error("ไฟล์ DNG นี้ไม่มีภาพตัวอย่างขนาดใหญ่ในตัว ให้แปลงเป็น JPG ก่อน (หรือใช้ python tools/prepare_images.py บนคอม)");
    const turned = orientation === 6 || orientation === 8;
    const scale = Math.min(1, 2400 / Math.max(best.width, best.height));
    const w = Math.round(best.width * scale), h = Math.round(best.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = turned ? h : w; canvas.height = turned ? w : h;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingQuality = "high";
    if (orientation === 3) { ctx.translate(w, h); ctx.rotate(Math.PI); }
    if (orientation === 6) { ctx.translate(h, 0); ctx.rotate(Math.PI / 2); }
    if (orientation === 8) { ctx.translate(0, w); ctx.rotate(-Math.PI / 2); }
    ctx.drawImage(best, 0, 0, w, h);
    if (best.close) best.close();
    const blob = await new Promise(ok => canvas.toBlob(ok, "image/jpeg", 0.92));
    return new File([blob], file.name.replace(/\.dng$/i, ".jpg"), { type: "image/jpeg", lastModified: file.lastModified });
  }

  // A clip's size, length and a poster frame. Failing here means this browser can't play the file.
  function videoInfo(url, at = 1) {
    return new Promise((ok, fail) => {
      const v = document.createElement("video");
      const timer = setTimeout(() => fail(new Error("timeout")), 20000);
      v.muted = true; v.playsInline = true; v.preload = "auto"; v.crossOrigin = "anonymous";
      v.onloadedmetadata = () => { v.currentTime = Math.min(at, (v.duration || 2) / 2); };
      v.onseeked = async () => {
        try { ok({ w: v.videoWidth, h: v.videoHeight, duration: v.duration, poster: await frameJpeg(v) }); } catch (e) { fail(e); } finally { clearTimeout(timer); }
      };
      v.onerror = () => { clearTimeout(timer); fail(new Error("unplayable")); };
      v.src = url;
    });
  }

  async function frameJpeg(video) {
    const scale = Math.min(1, 1080 / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(video.videoWidth * scale); canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
    return new Promise(ok => canvas.toBlob(ok, "image/jpeg", 0.82));
  }

  const UNPLAYABLE = "เบราว์เซอร์นี้เปิดคลิปนี้ไม่ได้ (มักเป็นไฟล์ HEVC/.mov จาก iPhone) แปลงเป็น MP4 (H.264) ก่อน หรือเลือกจาก Safari บน iPhone";
  const extOf = f => (f.name.match(/\.(mp4|m4v|mov|webm)$/i) || [, "mp4"])[1].toLowerCase();

  function freshVideoSrc(T, data, file) {
    const taken = new Set(allVideoSrcs(T, data).map(x => x.replace(/\.[^.]+$/, "")));
    let base = slugify(file.name) || `clip-${Date.now().toString(36)}`, name = base, n = 2;
    while (taken.has(`video/${name}`)) name = `${base}-${n++}`;
    return `video/${name}.${extOf(file) === "m4v" ? "mp4" : extOf(file)}`;
  }

  function allVideoSrcs(T, data) {
    const out = [];
    T.chapters.forEach(ch => ch.events.forEach(e => (e.content || []).forEach(b => b && b.video && out.push(b.video.src))));
    data.placements.forEach(p => p.block.video && out.push(p.block.video.src));
    Object.values(data.overrides.blocks).forEach(o => o.video && o.video.src && out.push(o.video.src));
    return out;
  }

  async function encode(bitmap, edge, crop) {
    const c = crop || { x: 0, y: 0, w: 1, h: 1 };
    const sx = c.x * bitmap.width, sy = c.y * bitmap.height, sw = c.w * bitmap.width, sh = c.h * bitmap.height;
    const scale = Math.min(1, edge / Math.max(sw, sh));
    const w = Math.round(sw * scale), h = Math.round(sh * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, w, h);
    const blob = await new Promise(ok => canvas.toBlob(ok, "image/jpeg", QUALITY));
    return { blob, w, h };
  }

  // Resize + re-encode one picked file, ready to commit: the photo and its smaller copies.
  async function prepare(T, file, src, crop) {
    const bitmap = await createImageBitmap(file);
    const main = await encode(bitmap, MAX_EDGE, crop);
    const out = [{ path: T.base + src, b64: await blobToB64(main.blob) }];
    for (const edge of VARIANTS) {
      if (Math.max(main.w, main.h) > edge * 1.15) out.push({ path: `${T.base}_sized/${edge}/${src}`, b64: await blobToB64((await encode(bitmap, edge, crop)).blob) });
    }
    if (bitmap.close) bitmap.close();
    return { files: out, size: [main.w, main.h] };
  }

  function filesOf(T, src, size) {
    const out = [T.base + src];
    for (const edge of VARIANTS) if (size && Math.max(...size) > edge * 1.15) out.push(`${T.base}_sized/${edge}/${src}`);
    return out;
  }

  const slugify = name => name.replace(/\.[^.]+$/, "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);

  function uniqueName(base, taken) {
    let name = base || `photo-${Date.now().toString(36)}`, n = 2;
    while (taken.has(name)) name = `${base || "photo"}-${n++}`;
    taken.add(name);
    return name;
  }
  const takenKeys = (T, data) => new Set([...Object.keys(T.images || {}), ...Object.keys(data.images)]);
  const takenPaths = (T, data) => new Set([...Object.values(T.images || {}), ...Object.values(data.images)].map(i => i.src.replace(/\.[^.]+$/, "")));

  function freshSrc(T, data, folder, file) {
    const paths = takenPaths(T, data);
    let base = slugify(file.name) || `photo-${Date.now().toString(36)}`, name = base, n = 2;
    while (paths.has(`${folder}/${name}`)) name = `${base}-${n++}`;
    return `${folder}/${name}.jpg`;
  }

  /* ---------- trip helpers ---------- */
  const trip = () => trips.find(t => t.slug === $("trip").value);
  const kind = () => document.querySelector('input[name="as"]:checked').value;
  const pad = n => String(n).padStart(2, "0");
  const plain = s => String(s || "").replace(/<[^>]+>/g, "");

  function chapterOf(T, target) {
    const id = target.replace(/^chapter:/, "");
    return T.chapters.find(c => c.id === id || c.events.some(e => e.id === id));
  }

  function targetLabel(T, target) {
    if (target === "cover") return "หน้าปก";
    if (target === "ending") return "ภาพปิดท้าย";
    const ch = chapterOf(T, target);
    if (!ch) return target;
    if (target.startsWith("chapter:")) return `หน้าเปิด Day ${pad(ch.day)}`;
    const ev = ch.events.find(e => e.id === target);
    return `Day ${pad(ch.day)} · ${ev.time ? ev.time + " · " : ""}${plain(ev.title)}`;
  }

  function folderFor(T, target, as) {
    if (as === "decoration") return "details";
    const ch = chapterOf(T, target);
    return ch ? `day-${pad(ch.day)}` : "photos";
  }

  /* ---------- add photos (section 2) ---------- */
  function fillTrips() {
    $("trip").innerHTML = trips.map(t => `<option value="${t.slug}">${t.title}</option>`).join("");
    fillTargets();
  }

  function fillTargets() {
    const T = trip();
    if (!T) return;
    $("target").innerHTML = T.chapters.map(ch => `<optgroup label="Day ${pad(ch.day)} · ${ch.route.join(" → ")}">
      <option value="chapter:${ch.id}">หน้าเปิด Day ${pad(ch.day)}</option>
      ${ch.events.map(e => `<option value="${e.id}">${e.time ? e.time + " · " : ""}${plain(e.title)}</option>`).join("")}
    </optgroup>`).join("");
    if (T.chapters[0] && T.chapters[0].events[0]) $("target").value = T.chapters[0].events[0].id;
  }

  function refreshLayout() {
    const as = kind(), n = files.filter(f => f.kind !== "video").length, clips = files.length - n;
    $("layout-box").hidden = n === 0;
    $("as-hint").textContent = as === "story"
      ? "รูปจะต่อท้ายข้อความของช่วงที่เลือก ถ้าอยากแทรกกลางเรื่องให้แก้ใน trip.js"
      : "รูปเล็กแปะข้างบันทึก จอกว้างอยู่ขอบนอก จอเล็กเรียงท้ายช่วงนั้น กดดูภาพใหญ่ไม่ได้";
    const list = as === "decoration" ? LAYOUTS.decoration : n > 1 ? [...LAYOUTS.set, ["separate", "แยกเป็นทีละรูป"]] : LAYOUTS.single;
    const keep = $("layout").value;
    $("layout").innerHTML = options(list, list.some(([v]) => v === keep) ? keep : "");
    $("layout").previousElementSibling.textContent = as === "decoration" ? "ขนาด" : "รูปแบบการแสดง";
    $("position-box").hidden = n > 1 && as === "story" && $("layout").value !== "separate";
    $("group-caption-box").hidden = !(as === "story" && n > 1 && $("layout").value !== "separate");
    $("roll-box").hidden = as !== "story";
    const spec = specFor(as, $("layout").value, n);
    $("spec-hint").textContent = `ขนาดที่แนะนำ: ${spec.text}`;
    files.forEach(f => { const el = document.querySelector(`[data-size="${f.id}"]`); if (el) el.innerHTML = sizeBadge(...cropped(f), spec); });
    $("publish").disabled = !token || files.length === 0;
    const what = [n && `${n} รูป`, clips && `${clips} คลิป`].filter(Boolean).join(" + ");
    $("publish-hint").textContent = !token ? "เชื่อมต่อ GitHub ก่อน" : what ? `${what} พร้อมเผยแพร่${clips && as === "decoration" ? " (คลิปจะวางในเรื่อง)" : ""}` : "เลือกรูปหรือคลิปก่อน";
  }

  async function addFiles(list) {
    const notes = [];
    for (let file of list) {
      const id = Math.random().toString(36).slice(2);
      if (isVideo(file)) {
        if (file.size > MAX_VIDEO_MB * 1024 * 1024) { notes.push(`${file.name}: ใหญ่เกิน ${MAX_VIDEO_MB} MB ตัดคลิปให้สั้นลงก่อน`); continue; }
        const url = URL.createObjectURL(file);
        try {
          const info = await videoInfo(url);
          files.push({ id, kind: "video", file, url, ...info, posterUrl: URL.createObjectURL(info.poster) });
        } catch { URL.revokeObjectURL(url); notes.push(`${file.name}: ${UNPLAYABLE}`); }
        continue;
      }
      const exif = await exifDate(file);
      if (isDng(file)) {
        $("publish-hint").textContent = `กำลังอ่านไฟล์ DNG ${file.name}…`;
        try { file = await dngToJpeg(file); } catch (err) { notes.push(`${file.name}: ${err.message}`); continue; }
      } else if (!isImageFile(file)) { notes.push(`${file.name}: ไม่รองรับไฟล์ชนิดนี้`); continue; }
      files.push({ id, file, url: URL.createObjectURL(file), exif, ...(await naturalSize(file)) });
    }
    renderFiles();
    if (notes.length) alert(notes.join("\n\n"));
  }

  async function naturalSize(file) {
    try { const b = await createImageBitmap(file); const s = { w: b.width, h: b.height }; if (b.close) b.close(); return s; } catch { return { w: 0, h: 0 }; }
  }
  const cropped = f => f.crop ? [Math.round(f.crop.w * f.w), Math.round(f.crop.h * f.h)] : [f.w, f.h];

  // A small preview of the cropped area, so the card shows what will be published.
  async function cropPreview(file, crop) {
    const b = await createImageBitmap(file);
    const out = await encode(b, 360, crop);
    if (b.close) b.close();
    return URL.createObjectURL(out.blob);
  }

  function metaFields(v, exif) {
    return `<label class="field"><span>คำบรรยาย (caption)</span><input type="text" data-k="caption" value="${esc(v.caption)}" placeholder="เช่น แสงสุดท้ายก่อนเย็น"></label>
      <label class="field"><span>คำอธิบายรูปสำหรับคนที่มองไม่เห็นภาพ (alt)</span><input type="text" data-k="alt" value="${esc(v.alt)}" placeholder="บอกว่าในภาพมีอะไร"></label>
      <div class="grid2">
        <label class="field"><span>เวลา</span><input type="time" data-k="time" value="${esc(v.time ?? exif?.time)}"></label>
        <label class="field"><span>สถานที่</span><input type="text" data-k="location" value="${esc(v.location)}" placeholder="เช่น Ban Na Kian"></label>
      </div>
      <label class="field"><span>วันที่ถ่าย</span><input type="date" data-k="date" value="${esc(v.date ?? exif?.date)}"><small>ถ้าตรงกับวันของบทนั้นไม่ต้องใส่${exif ? " · อ่านจากไฟล์รูปแล้ว" : ""}</small></label>`;
  }

  function videoCard(f, n) {
    const mov = extOf(f.file) === "mov";
    return `<div class="file" data-id="${f.id}">
      <div class="file-side"><video src="${f.url}" poster="${f.posterUrl}" muted playsinline preload="metadata"></video><span class="tag">วิดีโอ ${Math.round(f.duration || 0)} วิ</span></div>
      <div>
        <div class="file-head"><span>${n + 1}. ${esc(f.file.name)} · ${(f.file.size / 1048576).toFixed(1)} MB</span><button type="button" data-remove="${f.id}">เอาออก</button></div>
        <p class="size-line"><span class="size-info">${f.w}×${f.h} px</span>${mov ? `<span class="size-check warn">! ไฟล์ .mov อาจเล่นไม่ได้บน Android/Windows แนะนำ MP4</span>` : `<span class="size-check ok">✓ วางในเรื่องเป็นคลิป เล่นเองเมื่อเลื่อนมาถึง</span>`}</p>
        <label class="field"><span>คำบรรยาย (caption)</span><input type="text" data-k="caption" value="${esc(f.caption)}" placeholder="เช่น เสียงน้ำตก"></label>
        <label class="field"><span>คำอธิบายคลิป (สำหรับโปรแกรมอ่านหน้าจอ)</span><input type="text" data-k="label" value="${esc(f.label)}" placeholder="ในคลิปมีอะไร"></label>
      </div>
    </div>`;
  }

  function renderFiles() {
    $("file-list").innerHTML = files.map((f, n) => f.kind === "video" ? videoCard(f, n) : `<div class="file" data-id="${f.id}">
      <div class="file-side"><img src="${f.preview || f.url}" alt="">
        <button class="btn ghost small" type="button" data-crop="${f.id}">ครอป</button>
        ${f.crop ? `<button class="link-btn" type="button" data-uncrop="${f.id}">ใช้ทั้งใบ</button>` : ""}</div>
      <div>
        <div class="file-head"><span>${n + 1}. ${esc(f.file.name)}</span><button type="button" data-remove="${f.id}">เอาออก</button></div>
        <p class="size-line" data-size="${f.id}"></p>
        ${metaFields(f, f.exif)}
      </div>
    </div>`).join("");
    refreshLayout();
  }

  $("file-list").addEventListener("input", e => {
    const box = e.target.closest(".file"), k = e.target.dataset.k;
    if (box && k) files.find(x => x.id === box.dataset.id)[k] = e.target.value;
  });
  $("file-list").addEventListener("click", async e => {
    const cropId = e.target.dataset.crop, uncropId = e.target.dataset.uncrop;
    if (cropId || uncropId) {
      const f = files.find(x => x.id === (cropId || uncropId));
      if (uncropId) { f.crop = null; f.preview = null; renderFiles(); return; }
      const spec = specFor(kind(), $("layout").value, files.length);
      const crop = await openCropper(f.url, f.w, f.h, spec, f.crop);
      if (!crop) return;
      f.crop = crop;
      f.preview = await cropPreview(f.file, crop);
      renderFiles();
      return;
    }
    const id = e.target.dataset.remove;
    if (!id) return;
    URL.revokeObjectURL(files.find(x => x.id === id).url);
    files = files.filter(x => x.id !== id);
    renderFiles();
  });

  const drop = $("drop");
  ["dragenter", "dragover"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add("over"); }));
  ["dragleave", "drop"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove("over"); }));
  // Copy the FileList first: clearing the input empties the live list while files are still being read.
  drop.addEventListener("drop", e => addFiles([...e.dataTransfer.files]));
  $("files").addEventListener("change", e => { const picked = [...e.target.files]; e.target.value = ""; addFiles(picked); });
  $("trip").addEventListener("change", () => { fillTargets(); loadUploads(); });
  document.querySelectorAll('input[name="as"]').forEach(r => r.addEventListener("change", refreshLayout));
  $("layout").addEventListener("change", refreshLayout);

  function logger(el = $("log")) {
    el.innerHTML = "";
    return (msg, cls = "") => { const li = document.createElement("li"); li.textContent = msg; if (cls) li.className = cls; el.appendChild(li); };
  }

  // Photo entry from form values: only filled-in fields, date left out when it is the chapter's own day.
  function entryFrom(v, fallbackAlt, chapterDate) {
    const e = { alt: (v.alt || v.caption || fallbackAlt).trim() };
    META.filter(k => k !== "alt").forEach(k => { const val = (v[k] || "").trim(); if (val) e[k] = val; });
    if (e.date && e.date === chapterDate) delete e.date;
    return e;
  }

  $("form").addEventListener("submit", async e => {
    e.preventDefault();
    const T = trip(), target = $("target").value, as = kind(), layout = $("layout").value, position = $("position").value;
    const log = logger();
    $("publish").disabled = true;
    try {
      log(`เตรียมไฟล์ ${files.length} ไฟล์…`);
      const folder = folderFor(T, target, as), label = targetLabel(T, target), ch = chapterOf(T, target);
      const values = files.filter(f => f.kind !== "video").map(f => ({ ...f, time: f.time ?? f.exif?.time ?? "", date: f.date ?? f.exif?.date ?? "" }));
      const clips = files.filter(f => f.kind === "video");
      const what = [values.length && `${values.length} photo${values.length > 1 ? "s" : ""}`, clips.length && `${clips.length} clip${clips.length > 1 ? "s" : ""}`].filter(Boolean).join(" and ");
      const saved = await commit(T, `Add ${what} to "${label}" via admin`, async current => {
        const data = structuredClone(current);
        const keys = takenKeys(T, data), out = [], added = [];
        const id = `u-${Date.now().toString(36)}`, when = new Date().toISOString();
        clips.forEach((c, n) => {
          const src = freshVideoSrc(T, data, c.file), poster = src.replace(/\.[^.]+$/, "-poster.jpg");
          out.push({ path: T.base + src, blob: c.file }, { path: T.base + poster, blob: c.poster });
          data.placements.push({ id: `${id}-v${n}`, target, as: "story", added: when, block: { video: { src, poster, w: c.w, h: c.h, label: (c.label || c.caption || `คลิปจาก${label}`).trim(), ...(c.caption ? { caption: c.caption.trim() } : {}) } } });
        });
        for (const v of values) {
          const src = freshSrc(T, data, folder, v.file);
          const key = uniqueName(src.split("/").pop().replace(/\.jpg$/, ""), keys);
          const p = await prepare(T, v.file, src, v.crop);
          data.images[key] = { src, ...entryFrom(v, `รูปจาก${label}`, ch && ch.date) };
          data.sizes[src] = p.size;
          out.push(...p.files);
          added.push(key);
        }
        if (!added.length) return { data, files: out };
        if (as === "decoration") {
          added.forEach((k, n) => data.placements.push({ id: `${id}-${n}`, target, as, added: when, block: { image: k, ...(position ? { position } : {}), ...(layout ? { size: layout } : {}) } }));
        } else if (added.length === 1 || layout === "separate") {
          added.forEach((k, n) => data.placements.push({ id: `${id}-${n}`, target, as, added: when, block: { image: k, ...(layout && layout !== "separate" ? { layout } : {}), ...(position ? { position } : {}) } }));
        } else {
          const caption = $("group-caption").value.trim();
          data.placements.push({ id, target, as, added: when, block: { images: added, ...(layout ? { layout } : {}), ...(caption ? { caption } : {}) } });
        }
        if (as === "story" && $("add-roll").checked) data.gallery.push(...added);
        return { data, files: out };
      }, log);
      uploads = saved;
      log("เผยแพร่แล้ว · เว็บจะอัปเดตภายในประมาณ 1 นาที", "done");
      files.forEach(f => URL.revokeObjectURL(f.url));
      files = [];
      $("group-caption").value = "";
      renderFiles();
      renderList();
    } catch (err) {
      log(`ไม่สำเร็จ: ${err.message}`, "err");
      if (err.status === 401 || err.status === 403) log("token ไม่ถูกต้อง หมดอายุ หรือไม่มีสิทธิ์ Contents: Read and write", "err");
    } finally {
      refreshLayout();
    }
  });

  /* ---------- every photo in the trip (section 3) ---------- */
  const isImg = b => b && typeof b === "object" && (b.image || b.images || b.photo || b.photos || b.placeholder);
  const itemsOf = b => b.images || b.photos || [b];

  // Story order: cover, each chapter opener and event (its own photos, then admin uploads), ending.
  function occurrences(T, data) {
    const out = [{ id: "cover", host: "cover", kind: "cover", block: { image: T.coverImage } }];
    const fromTrip = (host, list, deco) => (list || []).forEach(b => {
      if (b && b.video && !deco) out.push({ id: `${host}:video:${b.video.src}`, host, kind: "video", block: b });
      else if (isImg(b)) out.push({ id: JI.blockId(host, b, deco), host, kind: deco ? "decoration" : "story", block: b });
    });
    const fromUploads = host => data.placements.filter(p => p.target === host).forEach(p => out.push({ id: p.id, host, kind: p.as, block: p.block, placement: p }));
    T.chapters.forEach(ch => {
      const host = `chapter:${ch.id}`;
      fromTrip(host, ch.images); fromTrip(host, ch.decorations, true); fromUploads(host);
      ch.events.forEach(e => { fromTrip(e.id, e.content); fromTrip(e.id, e.images); fromTrip(e.id, e.decorations, true); fromUploads(e.id); });
    });
    if (T.ending && T.ending.photo) {
      const key = typeof T.ending.photo === "string" ? T.ending.photo : T.ending.photo.image;
      out.push({ id: `ending:${key}`, host: "ending", kind: "ending", block: typeof T.ending.photo === "string" ? { image: key, layout: "portrait" } : T.ending.photo });
    }
    return out;
  }

  // Caption, time… written on the story block itself (they beat the image registry when rendering).
  const itemMeta = x => x && typeof x === "object" ? Object.fromEntries(META.filter(k => x[k] !== undefined).map(k => [k, x[k]])) : {};

  // What a photo looks like now: the trip's entry (plus the block's own caption) with the admin's edits, or an uploaded entry.
  function photoNow(T, data, ref, item) {
    if (typeof ref !== "string") return ref && ref.src ? { ...ref } : null;
    if (data.images[ref]) return { ...data.images[ref], uploaded: true };
    if (T.images[ref]) return { ...T.images[ref], ...itemMeta(item), ...(data.overrides.images[ref] || {}) };
    return null;
  }

  function blockNow(occ, data) {
    if (occ.placement) return occ.placement.block;
    if (occ.block.video) { const o = data.overrides.blocks[occ.id] || {}; return { ...occ.block, video: { ...occ.block.video, ...(o.video || {}) }, hidden: !!o.hidden }; }
    const o = data.overrides.blocks[occ.id] || {};
    const { fill, ...rest } = o;
    return { ...occ.block, ...rest, fill: fill || {} };
  }

  function thumbSrc(T, data, im) {
    const size = data.sizes[im.src] || ((window.JOURNAL_IMAGE_SIZES || {})[T.slug] || {})[im.src];
    return size && Math.max(...size) > 575 ? `${T.base}_sized/500/${im.src}` : `${T.base}${im.src}`;
  }

  function renderList() {
    const T = trip(), data = uploads || emptyUploads();
    const occs = occurrences(T, data);
    $("uploads-empty").hidden = occs.length > 0;
    let lastHost = "";
    $("uploads").innerHTML = occs.map(occ => {
      const b = blockNow(occ, data);
      if (b.video) {
        const head = occ.host !== lastHost ? `<li class="group-head">${esc(targetLabel(T, occ.host))}</li>` : "";
        lastHost = occ.host;
        const tags = ["วิดีโอ", occ.placement && "อัปโหลด", !occ.placement && data.overrides.blocks[occ.id] && "แก้ไขแล้ว", b.hidden && "ซ่อนอยู่"].filter(Boolean);
        const thumb = b.video.poster ? `<img src="${T.base}${b.video.poster}" alt="" loading="lazy" class="${b.hidden ? "is-hidden" : ""}" onerror="this.style.visibility='hidden'">` : `<span class="empty-thumb">▶</span>`;
        return `${head}<li><span class="thumbs">${thumb}</span><span><b>${esc(b.video.caption || "ไม่มีคำบรรยาย")}</b><span>${tags.map(esc).join(" · ")}</span></span>
          <button class="btn ghost small" type="button" data-edit="${esc(occ.id)}"${token ? "" : " disabled"}>แก้ไข</button></li>`;
      }
      const thumbs = itemsOf(occ.block).map(x => {
        const id = JI.itemId(x), filled = b.fill && b.fill[id];
        if (x && x.placeholder && !filled) return `<span class="empty-thumb" title="ช่องว่าง">+</span>`;
        const im = photoNow(T, data, filled || (typeof x === "string" ? x : x.image ?? x.photo ?? x), filled ? null : x);
        return im ? `<img src="${thumbSrc(T, data, im)}" alt="" loading="lazy" class="${im.hidden ? "is-hidden" : ""}" onerror="this.style.visibility='hidden'">` : "";
      }).join("");
      const tags = [];
      if (occ.kind === "decoration") tags.push("รูปตกแต่ง");
      else if (occ.kind !== "cover") tags.push(LEGACY_LAYOUT[b.layout] || b.layout || "อัตโนมัติ");
      if (occ.placement) tags.push("อัปโหลด");
      if (!occ.placement && (data.overrides.blocks[occ.id] || itemsOf(occ.block).some(x => typeof (x.image ?? x.photo ?? x) === "string" && data.overrides.images[x.image ?? x.photo ?? x]))) tags.push("แก้ไขแล้ว");
      if (itemsOf(occ.block).some(x => x && x.placeholder && !(b.fill || {})[JI.itemId(x)])) tags.push("มีช่องว่าง");
      const x0 = itemsOf(occ.block)[0], f0 = (b.fill || {})[JI.itemId(x0)];
      const first = photoNow(T, data, f0 || (typeof x0 === "string" ? x0 : x0.image ?? x0.photo), f0 ? null : x0);
      const cap = b.caption || (first && first.caption) || "";
      const head = occ.host !== lastHost ? `<li class="group-head">${esc(targetLabel(T, occ.host))}</li>` : "";
      lastHost = occ.host;
      return `${head}<li><span class="thumbs">${thumbs}</span><span><b>${esc(cap || "ไม่มีคำบรรยาย")}</b><span>${tags.map(esc).join(" · ")}</span></span>
        <button class="btn ghost small" type="button" data-edit="${esc(occ.id)}"${token ? "" : " disabled"}>แก้ไข</button></li>`;
    }).join("");
  }

  async function loadUploads() {
    const T = trip();
    if (!T) return;
    uploads = token ? await readUploads(T).catch(() => null) : null;
    if (!uploads) uploads = normalize((window.JOURNAL_UPLOADS || {})[T.slug] || {});
    renderList();
  }

  /* ---------- editor ---------- */
  const dlg = $("editor");
  let editing = null; // { occ, picks: { itemId: { file, url, w, h, crop } }, sizes: { itemId: [w, h] } }

  $("uploads").addEventListener("click", e => {
    const id = e.target.dataset.edit;
    if (!id) return;
    const T = trip(), data = uploads;
    const occ = occurrences(T, data).find(o => o.id === id);
    if (occ) openEditor(T, data, occ);
  });

  function openEditor(T, data, occ) {
    if (occ.block.video) return openVideoEditor(T, data, occ);
    editing = { occ, picks: {}, sizes: {}, srcs: {} };
    const b = blockNow(occ, data), items = itemsOf(occ.block);
    const isSet = !!(occ.block.images || occ.block.photos);
    const layoutList = occ.kind === "decoration" ? LAYOUTS.decoration : isSet ? LAYOUTS.set : LAYOUTS.single;
    const layoutValue = occ.kind === "decoration" ? b.size : LEGACY_LAYOUT[b.layout] || b.layout;
    const blockFields = occ.kind === "cover" ? `<p class="hint">รูปหน้าปก เปลี่ยนรูปหรือแก้คำอธิบายได้ ซ่อนไม่ได้</p>` : `
      <div class="grid2">
        <label class="field"><span>${occ.kind === "decoration" ? "ขนาด" : "รูปแบบการแสดง"}</span><select data-b="layout">${options(layoutList, layoutValue)}</select></label>
        ${isSet ? "" : `<label class="field"><span>ตำแหน่ง</span><select data-b="position">${options(POSITIONS, b.position || b.side)}</select></label>`}
      </div>
      ${isSet ? `<label class="field"><span>คำบรรยายของชุดภาพ</span><input type="text" data-b="caption" value="${esc(b.caption)}"></label>` : ""}`;
    const itemHtml = items.map(x => {
      const id = JI.itemId(x), filled = (b.fill || {})[id];
      if (x && x.placeholder && !filled) {
        return `<div class="file" data-item="${esc(id)}"><div class="file-side"><span class="empty-thumb big">+</span><span data-crop-slot></span></div><div>
          <div class="file-head"><span>ช่องว่าง: ${esc(x.placeholder)}</span></div>
          <p class="size-line" data-size></p>
          <label class="field"><span>ใส่รูปลงช่องนี้</span><input type="file" accept="image/*" data-pick></label>
          ${metaFields({ caption: x.placeholder }, null)}</div></div>`;
      }
      const ref = filled || (typeof x === "string" ? x : x.image ?? x.photo);
      const im = photoNow(T, data, ref, filled ? null : x) || {};
      const size = data.sizes[im.src] || ((window.JOURNAL_IMAGE_SIZES || {})[T.slug] || {})[im.src];
      if (size) editing.sizes[id] = size;
      if (im.src) editing.srcs[id] = im.src;
      return `<div class="file" data-item="${esc(id)}" data-key="${esc(typeof ref === "string" ? ref : "")}">
        <div class="file-side"><img src="${im.src ? thumbSrc(T, data, im) : ""}" alt="" data-preview>
          ${im.src ? `<button class="btn ghost small" type="button" data-crop-item>ครอป</button>` : ""}</div>
        <div>
          <div class="file-head"><span>${esc(im.src || "")}</span></div>
          <p class="size-line" data-size></p>
          ${metaFields(im, null)}
          <label class="field"><span>เปลี่ยนเป็นรูปใหม่</span><input type="file" accept="image/*" data-pick><small>caption และข้อมูลด้านบนยังอยู่เหมือนเดิม</small></label>
          ${occ.kind === "cover" ? "" : `<label class="check"><input type="checkbox" data-k="hidden"${im.hidden ? " checked" : ""}> ซ่อนรูปนี้ (ทุกที่ รวมถึงม้วนฟิล์ม)</label>`}
        </div>
      </div>`;
    }).join("");
    $("editor-title").textContent = targetLabel(T, occ.host);
    $("editor-body").innerHTML = blockFields + `<div class="files">${itemHtml}</div>`;
    $("editor-delete").hidden = !occ.placement;
    $("editor-log").innerHTML = "";
    editorBadges();
    dlg.showModal();
  }

  function openVideoEditor(T, data, occ) {
    const v = blockNow(occ, data).video;
    editing = { occ, video: true, file: null, poster: null };
    $("editor-title").textContent = `${targetLabel(T, occ.host)} · วิดีโอ`;
    $("editor-body").innerHTML = `
      <div class="clip-preview"><video id="clip-video" src="${T.base}${v.src}" ${v.poster ? `poster="${T.base}${v.poster}"` : ""} controls muted playsinline preload="metadata" crossorigin="anonymous"></video></div>
      <div class="row" style="margin:.6rem 0 1rem"><button class="btn ghost small" type="button" id="clip-frame">ใช้เฟรมที่หยุดอยู่เป็นภาพปก</button><span class="hint" id="clip-frame-note"></span></div>
      <label class="field"><span>คำบรรยาย (caption)</span><input type="text" data-k="caption" value="${esc(v.caption)}"></label>
      <label class="field"><span>คำอธิบายคลิป (สำหรับโปรแกรมอ่านหน้าจอ)</span><input type="text" data-k="label" value="${esc(v.label)}"></label>
      <label class="field"><span>เปลี่ยนเป็นคลิปใหม่</span><input type="file" accept="video/mp4,video/webm,video/quicktime,video/*" id="clip-file"><small>MP4 ไม่เกิน ${MAX_VIDEO_MB} MB · ภาพปกจะถูกสร้างจากคลิปใหม่ให้อัตโนมัติ</small></label>
      ${occ.placement ? "" : `<label class="check"><input type="checkbox" data-k="hidden"${blockNow(occ, data).hidden ? " checked" : ""}> ซ่อนคลิปนี้</label>`}`;
    $("editor-delete").hidden = !occ.placement;
    $("editor-log").innerHTML = "";
    dlg.showModal();
  }

  $("editor-body").addEventListener("click", async e => {
    if (e.target.id !== "clip-frame") return;
    const v = $("clip-video");
    try {
      if (v.readyState < 2) { await v.play().catch(() => {}); v.pause(); }
      editing.poster = await frameJpeg(v);
      $("clip-frame-note").textContent = `ใช้เฟรมที่ ${v.currentTime.toFixed(1)} วินาที`;
    } catch { $("clip-frame-note").textContent = "จับภาพจากคลิปนี้ไม่ได้"; }
  });

  $("editor-body").addEventListener("change", async e => {
    if (e.target.id !== "clip-file" || !e.target.files[0]) return;
    const file = e.target.files[0], note = $("clip-frame-note");
    if (file.size > MAX_VIDEO_MB * 1048576) { alert(`ไฟล์ใหญ่เกิน ${MAX_VIDEO_MB} MB`); e.target.value = ""; return; }
    const url = URL.createObjectURL(file);
    try {
      const info = await videoInfo(url);
      editing.file = { file, ...info };
      editing.poster = null;
      $("clip-video").removeAttribute("poster");
      $("clip-video").src = url;
      note.textContent = `คลิปใหม่ ${info.w}×${info.h} · ${Math.round(info.duration)} วินาที`;
    } catch { URL.revokeObjectURL(url); e.target.value = ""; alert(UNPLAYABLE); }
  });

  async function saveVideo() {
    const T = trip(), { occ } = editing, log = logger($("editor-log"));
    const form = $("editor-body");
    const v = Object.fromEntries([...form.querySelectorAll("[data-k]")].map(i => [i.dataset.k, i.type === "checkbox" ? i.checked : i.value.trim()]));
    const pickedFile = editing.file, pickedPoster = editing.poster;
    $("editor-save").disabled = true;
    try {
      uploads = await commit(T, `Edit clip in "${targetLabel(T, occ.host)}" via admin`, async current => {
        const data = structuredClone(current), out = [], remove = [];
        const live = occurrences(T, data).find(o => o.id === occ.id);
        if (!live) throw new Error("คลิปนี้ถูกลบหรือย้ายไปแล้ว รีเฟรชหน้าแล้วลองอีกครั้ง");
        const now = blockNow(live, data).video, change = {};
        if (v.caption !== (now.caption || "")) change.caption = v.caption;
        if (v.label !== (now.label || "")) change.label = v.label;
        if (pickedFile) {
          const src = freshVideoSrc(T, data, pickedFile.file);
          out.push({ path: T.base + src, blob: pickedFile.file });
          Object.assign(change, { src, w: pickedFile.w, h: pickedFile.h });
        }
        const poster = pickedPoster || (pickedFile && pickedFile.poster);
        if (poster) {
          const path = (change.src || now.src).replace(/\.[^.]+$/, `-poster-${Date.now().toString(36)}.jpg`);
          out.push({ path: T.base + path, blob: poster });
          change.poster = path;
        }
        // files this admin uploaded before and no longer uses (the trip's own originals stay)
        const mine = new Set([...data.placements.filter(p => p.block.video).flatMap(p => [p.block.video.src, p.block.video.poster]), ...Object.values(data.overrides.blocks).flatMap(o => o.video ? [o.video.src, o.video.poster] : [])]);
        const dropOld = key => { if (change[key] && now[key] && mine.has(now[key])) remove.push(T.base + now[key]); };
        if (live.placement) {
          dropOld("src"); dropOld("poster");
          const p = data.placements.find(x => x.id === occ.id);
          p.block.video = { ...p.block.video, ...change };
          Object.keys(p.block.video).forEach(k => { if (p.block.video[k] === "") delete p.block.video[k]; });
        } else {
          dropOld("src"); dropOld("poster");
          const o = data.overrides.blocks[occ.id] || {};
          o.video = { ...(o.video || {}), ...change };
          const orig = occ.block.video;
          Object.keys(o.video).forEach(k => { if (o.video[k] === (orig[k] ?? "")) delete o.video[k]; });
          if (!Object.keys(o.video).length) delete o.video;
          if (v.hidden) o.hidden = true; else delete o.hidden;
          if (Object.keys(o).length) data.overrides.blocks[occ.id] = o; else delete data.overrides.blocks[occ.id];
        }
        return { data, files: out, remove };
      }, log);
      log("บันทึกแล้ว · เว็บจะอัปเดตภายในประมาณ 1 นาที", "done");
      renderList();
      setTimeout(() => dlg.open && dlg.close(), 900);
    } catch (err) {
      log(`ไม่สำเร็จ: ${err.message}`, "err");
    } finally {
      $("editor-save").disabled = false;
    }
  }

  function editorSpec() {
    const { occ } = editing;
    const sel = $("editor-body").querySelector('[data-b="layout"]');
    return specFor(occ.kind, sel ? sel.value : "", itemsOf(occ.block).length);
  }

  function editorBadges() {
    const spec = editorSpec();
    $("editor-body").querySelectorAll("[data-item]").forEach(box => {
      const id = box.dataset.item, pick = editing.picks[id];
      const [w, h] = pick ? cropped(pick) : editing.sizes[id] || [0, 0];
      const el = box.querySelector("[data-size]");
      el.innerHTML = w ? sizeBadge(w, h, spec) + (pick && pick.crop ? `<span class="size-info">· ครอปแล้ว</span>` : "") : "";
    });
  }

  async function setPreview(box, url) {
    const old = box.querySelector("[data-preview]") || box.querySelector(".empty-thumb");
    const img = document.createElement("img");
    img.src = url;
    img.setAttribute("data-preview", "");
    old.replaceWith(img);
  }

  $("editor-body").addEventListener("change", async e => {
    if (e.target.matches('[data-b="layout"]')) return editorBadges();
    if (!e.target.matches("[data-pick]") || !e.target.files[0]) return;
    const box = e.target.closest("[data-item]"), file = e.target.files[0];
    const pick = editing.picks[box.dataset.item] = { file, url: URL.createObjectURL(file), crop: null, ...(await naturalSize(file)) };
    setPreview(box, pick.url);
    const side = box.querySelector(".file-side");
    if (!side.querySelector("[data-crop-item]")) side.insertAdjacentHTML("beforeend", `<button class="btn ghost small" type="button" data-crop-item>ครอป</button>`);
    editorBadges();
    const exif = await exifDate(file);
    if (exif) {
      ["time", "date"].forEach(k => { const input = box.querySelector(`[data-k="${k}"]`); if (input && !input.value) input.value = exif[k]; });
    }
  });

  // Crop: a newly picked file, or the photo already on the site (fetched from this site, then re-uploaded cropped).
  $("editor-body").addEventListener("click", async e => {
    if (!e.target.matches("[data-crop-item]")) return;
    const box = e.target.closest("[data-item]"), id = box.dataset.item;
    let pick = editing.picks[id];
    if (!pick) {
      e.target.disabled = true;
      e.target.textContent = "กำลังโหลด…";
      try {
        const src = editing.srcs[id], res = await fetch(trip().base + src);
        if (!res.ok) throw new Error(res.status);
        const blob = await res.blob();
        const file = new File([blob], src.split("/").pop(), { type: blob.type || "image/jpeg" });
        pick = { file, url: URL.createObjectURL(file), crop: null, fromSite: true, ...(await naturalSize(file)) };
      } catch {
        alert("โหลดรูปเดิมไม่ได้ ลองเลือกไฟล์ใหม่แทน");
        return;
      } finally {
        e.target.disabled = false;
        e.target.textContent = "ครอป";
      }
    }
    const crop = await openCropper(pick.url, pick.w, pick.h, editorSpec(), pick.crop);
    if (!crop) return;
    pick.crop = crop;
    editing.picks[id] = pick;
    setPreview(box, await cropPreview(pick.file, crop));
    editorBadges();
  });

  $("editor-cancel").addEventListener("click", () => dlg.close());

  $("editor").addEventListener("submit", async e => {
    e.preventDefault();
    if (editing && editing.video) return saveVideo();
    const T = trip(), { occ, picks } = editing, log = logger($("editor-log"));
    const form = $("editor-body");
    const blockValues = Object.fromEntries([...form.querySelectorAll("[data-b]")].map(i => [i.dataset.b, i.value.trim()]));
    const itemValues = [...form.querySelectorAll("[data-item]")].map(box => ({
      id: box.dataset.item, key: box.dataset.key || "",
      v: Object.fromEntries([...box.querySelectorAll("[data-k]")].map(i => [i.dataset.k, i.type === "checkbox" ? i.checked : i.value.trim()]))
    }));
    $("editor-save").disabled = true;
    try {
      const ch = chapterOf(T, occ.host), label = targetLabel(T, occ.host);
      uploads = await commit(T, `Edit photos in "${label}" via admin`, async current => {
        const data = structuredClone(current);
        const out = [], remove = [];
        const live = occurrences(T, data).find(o => o.id === occ.id);
        if (!live) throw new Error("รูปนี้ถูกลบหรือย้ายไปแล้ว รีเฟรชหน้าแล้วลองอีกครั้ง");
        const folder = occ.kind === "decoration" ? "details" : ch ? `day-${pad(ch.day)}` : "photos";

        for (const { id, key, v } of itemValues) {
          const pick = picks[id], file = pick && pick.file, crop = pick && pick.crop;
          const meta = entryFrom(v, `รูปจาก${label}`, ch && ch.date);
          if (!key) {
            // an empty slot being filled
            if (!file) continue;
            const src = freshSrc(T, data, folder, file);
            const newKey = uniqueName(src.split("/").pop().replace(/\.jpg$/, ""), takenKeys(T, data));
            const p = await prepare(T, file, src, crop);
            out.push(...p.files);
            data.images[newKey] = { src, ...meta };
            data.sizes[src] = p.size;
            if (live.placement) continue;
            const o = (data.overrides.blocks[occ.id] ||= {});
            (o.fill ||= {})[id] = newKey;
            continue;
          }
          const uploaded = !!data.images[key];
          const item = itemsOf(occ.block).find(x => JI.itemId(x) === id);
          const base = uploaded ? data.images[key] : { ...T.images[key], ...itemMeta(item) };
          let src = (uploaded ? base.src : (data.overrides.images[key] || {}).src) || null;
          if (file) {
            const fresh = freshSrc(T, data, base.src.split("/").slice(0, -1).join("/") || folder, file);
            const p = await prepare(T, file, fresh, crop);
            out.push(...p.files);
            data.sizes[fresh] = p.size;
            // drop files the admin uploaded earlier for this photo; the trip's own originals stay in the repo
            const previous = uploaded ? base.src : src;
            if (previous && data.sizes[previous]) { remove.push(...filesOf(T, previous, data.sizes[previous])); delete data.sizes[previous]; }
            src = fresh;
          }
          if (uploaded) {
            data.images[key] = { src: src || base.src, ...meta, ...(v.hidden ? { hidden: true } : {}) };
          } else {
            const o = {};
            META.forEach(k => { const now = meta[k] ?? "", was = base[k] ?? ""; if (now !== was) o[k] = now; });
            if (meta.alt === (base.alt || "")) delete o.alt;
            if (src) o.src = src;
            if (v.hidden) o.hidden = true;
            if (Object.keys(o).length) data.overrides.images[key] = o; else delete data.overrides.images[key];
          }
        }

        if (occ.kind !== "cover") {
          const layoutKey = occ.kind === "decoration" ? "size" : "layout";
          const want = { [layoutKey]: blockValues.layout || "", ...(blockValues.position !== undefined ? { position: blockValues.position } : {}), ...(blockValues.caption !== undefined ? { caption: blockValues.caption } : {}) };
          if (live.placement) {
            const p = data.placements.find(x => x.id === occ.id);
            Object.entries(want).forEach(([k, val]) => { if (val) p.block[k] = val; else delete p.block[k]; });
          } else {
            const orig = occ.block, o = data.overrides.blocks[occ.id] || {};
            Object.entries(want).forEach(([k, val]) => {
              const was = k === "layout" ? (LEGACY_LAYOUT[orig.layout] || orig.layout || "") : k === "position" ? (orig.position || orig.side || "") : (orig[k] || "");
              if (val !== was) o[k] = val; else delete o[k];
            });
            if (Object.keys(o).length) data.overrides.blocks[occ.id] = o; else delete data.overrides.blocks[occ.id];
          }
        }
        return { data, files: out, remove };
      }, log);
      log("บันทึกแล้ว · เว็บจะอัปเดตภายในประมาณ 1 นาที", "done");
      renderList();
      setTimeout(() => dlg.open && dlg.close(), 900);
    } catch (err) {
      log(`ไม่สำเร็จ: ${err.message}`, "err");
    } finally {
      $("editor-save").disabled = false;
    }
  });

  // Uploaded photos can be removed entirely (files too); the trip's own photos are hidden instead.
  $("editor-delete").addEventListener("click", async () => {
    const T = trip(), { occ } = editing, log = logger($("editor-log"));
    if (!confirm("ลบรูปชุดนี้ออกจากบันทึก และลบไฟล์รูปออกจากเว็บ?")) return;
    try {
      uploads = await commit(T, "Remove photos via admin", async current => {
        const data = structuredClone(current);
        const gone = data.placements.find(p => p.id === occ.id);
        if (!gone) return { data, files: [] };
        data.placements = data.placements.filter(p => p.id !== occ.id);
        if (gone.block.video) return { data, files: [], remove: [gone.block.video.src, gone.block.video.poster].filter(Boolean).map(p => T.base + p) };
        const stillUsed = new Set(data.placements.flatMap(p => itemsOf(p.block).map(x => x.image ?? x)));
        const remove = [];
        for (const k of itemsOf(gone.block).map(x => x.image ?? x)) {
          if (stillUsed.has(k) || !data.images[k]) continue;
          const src = data.images[k].src;
          remove.push(...filesOf(T, src, data.sizes[src]));
          delete data.images[k];
          delete data.sizes[src];
          data.gallery = data.gallery.filter(g => g !== k);
        }
        return { data, files: [], remove };
      }, log);
      log("ลบแล้ว · เว็บจะอัปเดตภายในประมาณ 1 นาที", "done");
      renderList();
      setTimeout(() => dlg.open && dlg.close(), 900);
    } catch (err) {
      log(`ไม่สำเร็จ: ${err.message}`, "err");
    }
  });

  /* ---------- cropper ---------- */
  // Drag the frame to move it, drag a corner to resize; arrow keys move it. Works with mouse and touch.
  const cdlg = $("cropper"), cimg = $("crop-img"), cbox = $("crop-box");
  let cs = null; // { nw, nh, ratio (px w/h or null), r: {x, y, w, h} fractions, spec, done }

  function openCropper(url, nw, nh, spec, current) {
    return new Promise(done => {
      cs = { nw, nh, ratio: null, r: null, spec, done };
      const choices = [...(spec.ratio ? [[spec.ratio.join(":"), `ตามรูปแบบ ${spec.ratio.join(":")}`]] : []), ["free", "อิสระ"], ["1:1", "1:1"], ["4:5", "4:5"], ["3:2", "3:2"], ["16:9", "16:9"], ["9:16", "9:16"]]
        .filter((c, i, all) => all.findIndex(x => x[0] === c[0]) === i);
      $("crop-ratios").innerHTML = choices.map(([v, l], i) => `<button type="button" class="chip" data-ratio="${v}" aria-pressed="${i === 0}">${l}</button>`).join("");
      $("crop-spec").textContent = `ขนาดที่แนะนำ: ${spec.text}`;
      cimg.onload = () => { setRatio(choices[0][0], current); cdlg.showModal(); };
      cimg.src = url;
    });
  }

  function setRatio(v, keep) {
    cs.ratio = v === "free" ? null : (([a, b]) => a / b)(v.split(":").map(Number));
    $("crop-ratios").querySelectorAll("[data-ratio]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.ratio === v)));
    if (keep) { cs.r = { ...keep }; } else {
      // largest frame of this shape, centred
      let w = 1, h = 1;
      if (cs.ratio) { h = (cs.nw / cs.ratio) / cs.nh; if (h > 1) { h = 1; w = (cs.nh * cs.ratio) / cs.nw; } }
      cs.r = { x: (1 - w) / 2, y: (1 - h) / 2, w, h };
    }
    drawCrop();
  }

  function drawCrop() {
    const r = cs.r;
    Object.assign(cbox.style, { left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` });
    const w = Math.round(r.w * cs.nw), h = Math.round(r.h * cs.nh), c = checkSize(w, h, cs.spec);
    $("crop-info").innerHTML = `${w}×${h} px${c.level === "warn" && Math.max(w, h) < cs.spec.min ? ` · <span class="size-check warn">เล็กกว่าที่แนะนำ</span>` : ""}`;
  }

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  let drag = null;
  cbox.addEventListener("pointerdown", e => {
    e.preventDefault();
    try { cbox.setPointerCapture(e.pointerId); } catch { /* some browsers refuse capture; dragging still works while over the frame */ }
    const rect = cimg.getBoundingClientRect();
    drag = { mode: e.target.dataset.h || "move", x0: e.clientX, y0: e.clientY, r0: { ...cs.r }, W: rect.width, H: rect.height };
  });
  cbox.addEventListener("pointermove", e => {
    if (!drag) return;
    const dx = (e.clientX - drag.x0) / drag.W, dy = (e.clientY - drag.y0) / drag.H, r0 = drag.r0, MIN = 0.06;
    if (drag.mode === "move") {
      cs.r = { ...r0, x: clamp(r0.x + dx, 0, 1 - r0.w), y: clamp(r0.y + dy, 0, 1 - r0.h) };
      return drawCrop();
    }
    const left = drag.mode.includes("w"), top = drag.mode.includes("n");
    const ax = left ? r0.x + r0.w : r0.x, ay = top ? r0.y + r0.h : r0.y; // the corner that stays put
    let w = clamp(r0.w + (left ? -dx : dx), MIN, left ? ax : 1 - ax);
    let h = clamp(r0.h + (top ? -dy : dy), MIN, top ? ay : 1 - ay);
    if (cs.ratio) {
      const hFromW = (w * cs.nw) / (cs.ratio * cs.nh), maxH = top ? ay : 1 - ay;
      h = hFromW;
      if (h > maxH) { h = maxH; w = (h * cs.nh * cs.ratio) / cs.nw; }
      if (h < MIN) { h = MIN; w = (h * cs.nh * cs.ratio) / cs.nw; }
    }
    cs.r = { x: left ? ax - w : ax, y: top ? ay - h : ay, w, h };
    drawCrop();
  });
  ["pointerup", "pointercancel"].forEach(t => cbox.addEventListener(t, () => { drag = null; }));
  cbox.addEventListener("keydown", e => {
    const step = e.shiftKey ? 0.05 : 0.01, r = cs.r;
    const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (!moves) return;
    e.preventDefault();
    cs.r = { ...r, x: clamp(r.x + moves[0], 0, 1 - r.w), y: clamp(r.y + moves[1], 0, 1 - r.h) };
    drawCrop();
  });
  $("crop-ratios").addEventListener("click", e => { const v = e.target.dataset.ratio; if (v) setRatio(v); });
  const finishCrop = result => { const d = cs && cs.done; cs = null; cdlg.close(); if (d) d(result); };
  $("crop-ok").addEventListener("click", () => {
    const r = cs.r;
    finishCrop(r.w > 0.995 && r.h > 0.995 ? null : { x: +r.x.toFixed(5), y: +r.y.toFixed(5), w: +r.w.toFixed(5), h: +r.h.toFixed(5) });
  });
  $("crop-cancel").addEventListener("click", () => finishCrop(null));
  cdlg.addEventListener("cancel", e => { e.preventDefault(); finishCrop(null); });

  /* ---------- connect ---------- */
  async function connect(t, remember) {
    $("connect-err").textContent = "";
    token = t.trim();
    try {
      const repo = await gh(`/repos/${REPO}`);
      if (!repo.permissions || !repo.permissions.push) throw Object.assign(new Error("token นี้ไม่มีสิทธิ์เขียน repo (ต้องการ Contents: Read and write)"), { status: 403 });
      let who = "";
      try { who = (await gh("/user")).login; } catch { /* fine-grained tokens may not read the profile */ }
      try { (remember ? localStorage : sessionStorage).setItem(STORE, token); } catch { /* storage blocked: stay connected for this visit */ }
      $("who").textContent = `เชื่อมต่อแล้ว${who ? " · @" + who : ""} · ${repo.full_name} (${BRANCH})`;
      $("connect-form").hidden = true;
      $("connected").hidden = false;
      await loadUploads();
    } catch (err) {
      token = "";
      $("connect-err").textContent = err.status === 401 ? "token ไม่ถูกต้องหรือหมดอายุ" : `เชื่อมต่อไม่ได้: ${err.message}`;
    }
    refreshLayout();
  }

  $("connect-btn").addEventListener("click", () => $("token").value && connect($("token").value, $("remember").checked));
  $("token").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); $("connect-btn").click(); } });
  $("disconnect").addEventListener("click", () => {
    try { localStorage.removeItem(STORE); sessionStorage.removeItem(STORE); } catch { /* nothing stored */ }
    token = "";
    $("token").value = "";
    $("connect-form").hidden = false;
    $("connected").hidden = true;
    refreshLayout();
    renderList();
  });

  fillTrips();
  loadUploads();
  refreshLayout();
  let saved = null;
  try { saved = localStorage.getItem(STORE) || sessionStorage.getItem(STORE); } catch { /* storage blocked */ }
  if (saved) connect(saved, (() => { try { return !!localStorage.getItem(STORE); } catch { return false; } })());
})();
