/*
 * Admin: add and edit a trip's photos from the browser, published as one GitHub commit.
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
        log(`อัปโหลด ${f.path.split("/").pop()}`);
        const blob = await gh(`/repos/${REPO}/git/blobs`, { method: "POST", body: JSON.stringify({ content: f.b64, encoding: "base64" }) });
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
      if (v.getUint16(0) !== 0xffd8) return null;
      let off = 2;
      while (off + 4 < v.byteLength) {
        const marker = v.getUint16(off), len = v.getUint16(off + 2);
        if (marker === 0xffe1 && v.getUint32(off + 4) === 0x45786966) {
          const t = off + 10, le = v.getUint16(t) === 0x4949;
          const u16 = o => v.getUint16(t + o, le), u32 = o => v.getUint32(t + o, le);
          const findTag = (ifd, tag) => { const n = u16(ifd); for (let i = 0; i < n; i++) { const e = ifd + 2 + i * 12; if (u16(e) === tag) return e; } return null; };
          const exifPtr = findTag(u32(4), 0x8769);
          const entry = exifPtr && (findTag(u32(exifPtr + 8), 0x9003) || findTag(u32(exifPtr + 8), 0x9004));
          if (!entry) return null;
          const s = Array.from({ length: 19 }, (_, i) => String.fromCharCode(v.getUint8(t + u32(entry + 8) + i))).join("");
          const m = s.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2})/);
          return m ? { date: `${m[1]}-${m[2]}-${m[3]}`, time: `${m[4]}:${m[5]}` } : null;
        }
        if ((marker & 0xff00) !== 0xff00) break;
        off += 2 + len;
      }
    } catch { /* no EXIF: fields stay empty */ }
    return null;
  }

  async function encode(bitmap, edge) {
    const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale), h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, w, h);
    const blob = await new Promise(ok => canvas.toBlob(ok, "image/jpeg", QUALITY));
    return { blob, w, h };
  }

  // Resize + re-encode one picked file, ready to commit: the photo and its smaller copies.
  async function prepare(T, file, src) {
    const bitmap = await createImageBitmap(file);
    const main = await encode(bitmap, MAX_EDGE);
    const out = [{ path: T.base + src, b64: await blobToB64(main.blob) }];
    for (const edge of VARIANTS) {
      if (Math.max(main.w, main.h) > edge * 1.15) out.push({ path: `${T.base}_sized/${edge}/${src}`, b64: await blobToB64((await encode(bitmap, edge)).blob) });
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
    const as = kind(), n = files.length;
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
    $("publish").disabled = !token || n === 0;
    $("publish-hint").textContent = !token ? "เชื่อมต่อ GitHub ก่อน" : n ? `${n} รูป พร้อมเผยแพร่` : "เลือกรูปก่อน";
  }

  async function addFiles(list) {
    for (const file of list) {
      if (!file.type.startsWith("image/")) continue;
      files.push({ id: Math.random().toString(36).slice(2), file, url: URL.createObjectURL(file), exif: await exifDate(file) });
    }
    renderFiles();
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

  function renderFiles() {
    $("file-list").innerHTML = files.map((f, n) => `<div class="file" data-id="${f.id}">
      <img src="${f.url}" alt="">
      <div>
        <div class="file-head"><span>${n + 1}. ${esc(f.file.name)}</span><button type="button" data-remove="${f.id}">เอาออก</button></div>
        ${metaFields(f, f.exif)}
      </div>
    </div>`).join("");
    refreshLayout();
  }

  $("file-list").addEventListener("input", e => {
    const box = e.target.closest(".file"), k = e.target.dataset.k;
    if (box && k) files.find(x => x.id === box.dataset.id)[k] = e.target.value;
  });
  $("file-list").addEventListener("click", e => {
    const id = e.target.dataset.remove;
    if (!id) return;
    URL.revokeObjectURL(files.find(x => x.id === id).url);
    files = files.filter(x => x.id !== id);
    renderFiles();
  });

  const drop = $("drop");
  ["dragenter", "dragover"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add("over"); }));
  ["dragleave", "drop"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove("over"); }));
  drop.addEventListener("drop", e => addFiles(e.dataTransfer.files));
  $("files").addEventListener("change", e => { addFiles(e.target.files); e.target.value = ""; });
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
      log(`เตรียมรูป ${files.length} รูป…`);
      const folder = folderFor(T, target, as), label = targetLabel(T, target), ch = chapterOf(T, target);
      const values = files.map(f => ({ ...f, time: f.time ?? f.exif?.time ?? "", date: f.date ?? f.exif?.date ?? "" }));
      const saved = await commit(T, `Add ${files.length} photo${files.length > 1 ? "s" : ""} to "${label}" via admin`, async current => {
        const data = structuredClone(current);
        const keys = takenKeys(T, data), out = [], added = [];
        for (const v of values) {
          const src = freshSrc(T, data, folder, v.file);
          const key = uniqueName(src.split("/").pop().replace(/\.jpg$/, ""), keys);
          const p = await prepare(T, v.file, src);
          data.images[key] = { src, ...entryFrom(v, `รูปจาก${label}`, ch && ch.date) };
          data.sizes[src] = p.size;
          out.push(...p.files);
          added.push(key);
        }
        const id = `u-${Date.now().toString(36)}`, when = new Date().toISOString();
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
    const fromTrip = (host, list, deco) => (list || []).filter(isImg).forEach(b => out.push({ id: JI.blockId(host, b, deco), host, kind: deco ? "decoration" : "story", block: b }));
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
  let editing = null; // { occ, picks: { itemId: File } }

  $("uploads").addEventListener("click", e => {
    const id = e.target.dataset.edit;
    if (!id) return;
    const T = trip(), data = uploads;
    const occ = occurrences(T, data).find(o => o.id === id);
    if (occ) openEditor(T, data, occ);
  });

  function openEditor(T, data, occ) {
    editing = { occ, picks: {} };
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
        return `<div class="file" data-item="${esc(id)}"><span class="empty-thumb big">+</span><div>
          <div class="file-head"><span>ช่องว่าง: ${esc(x.placeholder)}</span></div>
          <label class="field"><span>ใส่รูปลงช่องนี้</span><input type="file" accept="image/*" data-pick></label>
          ${metaFields({ caption: x.placeholder }, null)}</div></div>`;
      }
      const ref = filled || (typeof x === "string" ? x : x.image ?? x.photo);
      const im = photoNow(T, data, ref, filled ? null : x) || {};
      return `<div class="file" data-item="${esc(id)}" data-key="${esc(typeof ref === "string" ? ref : "")}">
        <img src="${im.src ? thumbSrc(T, data, im) : ""}" alt="" data-preview>
        <div>
          <div class="file-head"><span>${esc(im.src || "")}</span></div>
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
    dlg.showModal();
  }

  $("editor-body").addEventListener("change", async e => {
    if (!e.target.matches("[data-pick]") || !e.target.files[0]) return;
    const box = e.target.closest("[data-item]"), file = e.target.files[0];
    editing.picks[box.dataset.item] = file;
    const preview = box.querySelector("[data-preview]") || box.querySelector(".empty-thumb");
    const img = document.createElement("img");
    img.src = URL.createObjectURL(file);
    img.setAttribute("data-preview", "");
    preview.replaceWith(img);
    const exif = await exifDate(file);
    if (exif) {
      ["time", "date"].forEach(k => { const input = box.querySelector(`[data-k="${k}"]`); if (input && !input.value) input.value = exif[k]; });
    }
  });

  $("editor-cancel").addEventListener("click", () => dlg.close());

  $("editor").addEventListener("submit", async e => {
    e.preventDefault();
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
          const file = picks[id];
          const meta = entryFrom(v, `รูปจาก${label}`, ch && ch.date);
          if (!key) {
            // an empty slot being filled
            if (!file) continue;
            const src = freshSrc(T, data, folder, file);
            const newKey = uniqueName(src.split("/").pop().replace(/\.jpg$/, ""), takenKeys(T, data));
            const p = await prepare(T, file, src);
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
            const p = await prepare(T, file, fresh);
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
