/*
 * Admin: add photos to a trip from the browser and publish them with one GitHub commit.
 * Photos are resized and re-encoded here (which drops EXIF/GPS), and placements are
 * written to trips/<slug>/uploads.js — the story in trip.js is never touched.
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

  const LAYOUTS = {
    single: [["", "อัตโนมัติ"], ["wide", "wide · กว้าง"], ["full", "full · เต็มจอ"], ["spotlight", "spotlight · ทั้งใบบนแถบสี"], ["inline", "inline · ในคอลัมน์ข้อความ"],
      ["portrait", "portrait · แนวตั้ง"], ["polaroid", "polaroid · โพลารอยด์"], ["diary-photo", "diary-photo · รูปแปะเทป"], ["background", "background · ภาพบรรยากาศ"], ["hero", "hero · ภาพเปิดเต็มจอ"]],
    set: [["", "อัตโนมัติ"], ["two-column", "two-column · สองรูปคู่"], ["collage", "collage · คอลลาจ (3–4 รูป)"], ["memory-stack", "memory-stack · รูปซ้อนกัน"],
      ["film-strip", "film-strip · แถบฟิล์ม"], ["gallery", "gallery · ตารางรูป"], ["separate", "แยกเป็นทีละรูป"]],
    decoration: [["", "ขนาดปกติ"], ["s", "เล็ก"], ["l", "ใหญ่"]]
  };

  const $ = id => document.getElementById(id);
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
  const emptyUploads = () => ({ images: {}, sizes: {}, placements: [], gallery: [] });

  function parseUploads(text) {
    const start = text.indexOf("= {"), end = text.lastIndexOf("};");
    if (start < 0 || end < 0) throw new Error("uploads.js อ่านไม่ได้");
    return { ...emptyUploads(), ...JSON.parse(text.slice(start + 2, end + 1)) };
  }
  const writeUploads = (T, data) =>
    `/* Managed by admin.html — photos added online. Edit through the admin page, not by hand. */\n(window.JOURNAL_UPLOADS = window.JOURNAL_UPLOADS || {})["${T.slug}"] = ${JSON.stringify(data, null, 2)};\n`;

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

  const slugify = name => name.replace(/\.[^.]+$/, "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);

  function uniqueName(base, taken) {
    let name = base || `photo-${Date.now().toString(36)}`, n = 2;
    while (taken.has(name)) name = `${base || "photo"}-${n++}`;
    taken.add(name);
    return name;
  }

  /* ---------- form ---------- */
  const trip = () => trips.find(t => t.slug === $("trip").value);
  const kind = () => document.querySelector('input[name="as"]:checked').value;

  function fillTrips() {
    $("trip").innerHTML = trips.map(t => `<option value="${t.slug}">${t.title}</option>`).join("");
    fillTargets();
  }

  function fillTargets() {
    const T = trip();
    if (!T) return;
    $("target").innerHTML = T.chapters.map(ch => `<optgroup label="Day ${String(ch.day).padStart(2, "0")} · ${ch.route.join(" → ")}">
      <option value="chapter:${ch.id}">หน้าเปิด Day ${String(ch.day).padStart(2, "0")}</option>
      ${ch.events.map(e => `<option value="${e.id}">${e.time ? e.time + " · " : ""}${e.title.replace(/<[^>]+>/g, "")}</option>`).join("")}
    </optgroup>`).join("");
  }

  function chapterOf(T, target) {
    const id = target.replace(/^chapter:/, "");
    return T.chapters.find(c => c.id === id || c.events.some(e => e.id === id));
  }

  function folderFor(T, target, as) {
    if (as === "decoration") return "details";
    const ch = chapterOf(T, target);
    return ch ? `day-${String(ch.day).padStart(2, "0")}` : "photos";
  }

  function refreshLayout() {
    const as = kind(), n = files.length;
    $("layout-box").hidden = n === 0;
    $("as-hint").textContent = as === "story"
      ? "รูปจะต่อท้ายข้อความของช่วงที่เลือก ถ้าอยากแทรกกลางเรื่องให้แก้ใน trip.js"
      : "รูปเล็กแปะข้างบันทึก จอกว้างอยู่ขอบนอก จอเล็กเรียงท้ายช่วงนั้น กดดูภาพใหญ่ไม่ได้";
    const options = as === "decoration" ? LAYOUTS.decoration : n > 1 ? LAYOUTS.set : LAYOUTS.single;
    const keep = $("layout").value;
    $("layout").innerHTML = options.map(([v, label]) => `<option value="${v}">${label}</option>`).join("");
    if (options.some(([v]) => v === keep)) $("layout").value = keep;
    $("layout").previousElementSibling.textContent = as === "decoration" ? "ขนาด" : "รูปแบบการแสดง";
    $("position-box").hidden = n > 1 && as === "story" && $("layout").value !== "separate";
    $("group-caption-box").hidden = !(as === "story" && n > 1 && $("layout").value !== "separate");
    $("roll-box").hidden = as !== "story";
    const ready = !!token && n > 0;
    $("publish").disabled = !ready;
    $("publish-hint").textContent = !token ? "เชื่อมต่อ GitHub ก่อน" : n ? `${n} รูป พร้อมเผยแพร่` : "เลือกรูปก่อน";
  }

  async function addFiles(list) {
    for (const file of list) {
      if (!file.type.startsWith("image/")) continue;
      const id = Math.random().toString(36).slice(2);
      const meta = await exifDate(file);
      files.push({ id, file, url: URL.createObjectURL(file), exif: meta });
    }
    renderFiles();
  }

  function renderFiles() {
    $("file-list").innerHTML = files.map((f, n) => `<div class="file" data-id="${f.id}">
      <img src="${f.url}" alt="">
      <div>
        <div class="file-head"><span>${n + 1}. ${f.file.name}</span><button type="button" data-remove="${f.id}">เอาออก</button></div>
        <label class="field"><span>คำบรรยาย (caption)</span><input type="text" data-k="caption" value="${f.caption || ""}" placeholder="เช่น แสงสุดท้ายก่อนเย็น"></label>
        <label class="field"><span>คำอธิบายรูปสำหรับคนที่มองไม่เห็นภาพ (alt)</span><input type="text" data-k="alt" value="${f.alt || ""}" placeholder="บอกว่าในภาพมีอะไร"></label>
        <div class="grid2">
          <label class="field"><span>เวลา</span><input type="time" data-k="time" value="${f.time ?? f.exif?.time ?? ""}"></label>
          <label class="field"><span>สถานที่</span><input type="text" data-k="location" value="${f.location || ""}" placeholder="เช่น Ban Na Kian"></label>
        </div>
        <label class="field"><span>วันที่ถ่าย</span><input type="date" data-k="date" value="${f.date ?? f.exif?.date ?? ""}"><small>ถ้าตรงกับวันของบทนั้นไม่ต้องแก้ ${f.exif ? "· อ่านจากไฟล์รูปแล้ว" : ""}</small></label>
      </div>
    </div>`).join("");
    refreshLayout();
  }

  $("file-list").addEventListener("input", e => {
    const box = e.target.closest(".file"), k = e.target.dataset.k;
    if (!box || !k) return;
    const f = files.find(x => x.id === box.dataset.id);
    f[k] = e.target.value;
  });
  $("file-list").addEventListener("click", e => {
    const id = e.target.dataset.remove;
    if (!id) return;
    const f = files.find(x => x.id === id);
    URL.revokeObjectURL(f.url);
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

  /* ---------- publish ---------- */
  function logger() {
    $("log").innerHTML = "";
    return (msg, cls = "") => { const li = document.createElement("li"); li.textContent = msg; if (cls) li.className = cls; $("log").appendChild(li); };
  }

  $("form").addEventListener("submit", async e => {
    e.preventDefault();
    const T = trip(), target = $("target").value, as = kind(), layout = $("layout").value, position = $("position").value;
    const log = logger();
    $("publish").disabled = true;
    try {
      log(`เตรียมรูป ${files.length} รูป…`);
      const folder = folderFor(T, target, as);
      const prepared = [];
      for (const f of files) {
        const bitmap = await createImageBitmap(f.file);
        const main = await encode(bitmap, MAX_EDGE);
        const small = [];
        for (const edge of VARIANTS) if (Math.max(main.w, main.h) > edge * 1.15) small.push({ edge, ...(await encode(bitmap, edge)) });
        bitmap.close && bitmap.close();
        prepared.push({ f, main, small });
      }
      const targetTitle = $("target").selectedOptions[0].textContent;
      const saved = await commit(T, `Add ${files.length} photo${files.length > 1 ? "s" : ""} to "${targetTitle}" via admin`, async current => {
        const data = structuredClone(current);
        const taken = new Set([...Object.keys(T.images || {}), ...Object.keys(data.images)]);
        const out = [], keys = [];
        for (const { f, main, small } of prepared) {
          const key = uniqueName(slugify(f.file.name), taken);
          const src = `${folder}/${key}.jpg`;
          const ch = chapterOf(T, target);
          const entry = { src, alt: (f.alt || f.caption || `รูปจาก${targetTitle}`).trim() };
          if (f.caption) entry.caption = f.caption.trim();
          const time = f.time ?? f.exif?.time, date = f.date ?? f.exif?.date;
          if (f.location) entry.location = f.location.trim();
          if (time) entry.time = time;
          if (date && ch && date !== ch.date) entry.date = date;
          data.images[key] = entry;
          data.sizes[src] = [main.w, main.h];
          out.push({ path: T.base + src, b64: await blobToB64(main.blob) });
          for (const s of small) out.push({ path: `${T.base}_sized/${s.edge}/${src}`, b64: await blobToB64(s.blob) });
          keys.push(key);
        }
        const id = `u-${Date.now().toString(36)}`, added = new Date().toISOString();
        if (as === "decoration") {
          keys.forEach((k, n) => data.placements.push({ id: `${id}-${n}`, target, as, added, block: { image: k, ...(position ? { position } : {}), ...(layout ? { size: layout } : {}) } }));
        } else if (keys.length === 1 || layout === "separate") {
          keys.forEach((k, n) => data.placements.push({ id: `${id}-${n}`, target, as, added, block: { image: k, ...(layout && layout !== "separate" ? { layout } : {}), ...(position ? { position } : {}) } }));
        } else {
          const caption = $("group-caption").value.trim();
          data.placements.push({ id, target, as, added, block: { images: keys, ...(layout ? { layout } : {}), ...(caption ? { caption } : {}) } });
        }
        if (as === "story" && $("add-roll").checked) data.gallery.push(...keys);
        return { data, files: out };
      }, log);
      uploads = saved;
      log("เผยแพร่แล้ว · เว็บจะอัปเดตภายในประมาณ 1 นาที", "done");
      files.forEach(f => URL.revokeObjectURL(f.url));
      files = [];
      $("group-caption").value = "";
      renderFiles();
      renderUploads();
    } catch (err) {
      log(`ไม่สำเร็จ: ${err.message}`, "err");
      if (err.status === 401 || err.status === 403) log("token ไม่ถูกต้อง หมดอายุ หรือไม่มีสิทธิ์ Contents: Read and write", "err");
    } finally {
      refreshLayout();
    }
  });

  /* ---------- existing uploads ---------- */
  async function loadUploads() {
    const T = trip();
    if (!T) return;
    uploads = token ? await readUploads(T).catch(() => null) : null;
    if (!uploads) uploads = (window.JOURNAL_UPLOADS || {})[T.slug] || emptyUploads();
    renderUploads();
  }

  function targetLabel(T, target) {
    const ch = chapterOf(T, target);
    if (!ch) return target;
    if (target.startsWith("chapter:")) return `หน้าเปิด Day ${String(ch.day).padStart(2, "0")}`;
    const ev = ch.events.find(e => e.id === target);
    return `Day ${String(ch.day).padStart(2, "0")} · ${ev.time ? ev.time + " · " : ""}${ev.title.replace(/<[^>]+>/g, "")}`;
  }

  function renderUploads() {
    const T = trip(), list = (uploads && uploads.placements) || [];
    $("uploads-empty").hidden = list.length > 0;
    $("uploads").innerHTML = [...list].reverse().map(p => {
      const keys = p.block.images || [p.block.image];
      const thumbs = keys.map(k => uploads.images[k] ? `<img src="${T.base}${uploads.images[k].src}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">` : "").join("");
      const what = p.as === "decoration" ? "รูปตกแต่ง" : (p.block.layout || "อัตโนมัติ");
      const cap = p.block.caption || (uploads.images[keys[0]] || {}).caption || "";
      return `<li><span class="thumbs">${thumbs}</span><span><b>${targetLabel(T, p.target)}</b><span>${what}${cap ? " · " + cap : ""} · ${new Date(p.added).toLocaleDateString("th-TH")}</span></span>
        <button class="btn ghost small" type="button" data-del="${p.id}"${token ? "" : " disabled"}>ลบ</button></li>`;
    }).join("");
  }

  $("uploads").addEventListener("click", async e => {
    const id = e.target.dataset.del;
    if (!id) return;
    if (!confirm("ลบรูปชุดนี้ออกจากบันทึก และลบไฟล์รูปออกจากเว็บ?")) return;
    const T = trip(), log = logger();
    e.target.disabled = true;
    try {
      uploads = await commit(T, "Remove photos via admin", async current => {
        const data = structuredClone(current);
        const gone = data.placements.find(p => p.id === id);
        if (!gone) return { data, files: [] };
        data.placements = data.placements.filter(p => p.id !== id);
        const stillUsed = new Set(data.placements.flatMap(p => p.block.images || [p.block.image]));
        const remove = [];
        for (const k of gone.block.images || [gone.block.image]) {
          if (stillUsed.has(k) || !data.images[k]) continue;
          const src = data.images[k].src;
          remove.push(T.base + src);
          for (const edge of VARIANTS) {
            const [w, h] = data.sizes[src] || [0, 0];
            if (Math.max(w, h) > edge * 1.15) remove.push(`${T.base}_sized/${edge}/${src}`);
          }
          delete data.images[k];
          delete data.sizes[src];
          data.gallery = data.gallery.filter(g => g !== k);
        }
        return { data, files: [], remove };
      }, log);
      log("ลบแล้ว · เว็บจะอัปเดตภายในประมาณ 1 นาที", "done");
      renderUploads();
    } catch (err) {
      log(`ไม่สำเร็จ: ${err.message}`, "err");
      e.target.disabled = false;
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
      (remember ? localStorage : sessionStorage).setItem(STORE, token);
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
    localStorage.removeItem(STORE);
    sessionStorage.removeItem(STORE);
    token = "";
    $("token").value = "";
    $("connect-form").hidden = false;
    $("connected").hidden = true;
    refreshLayout();
    renderUploads();
  });

  fillTrips();
  loadUploads();
  refreshLayout();
  let saved = null;
  try { saved = localStorage.getItem(STORE) || sessionStorage.getItem(STORE); } catch { /* storage blocked */ }
  if (saved) connect(saved, !!localStorage.getItem(STORE));
})();
