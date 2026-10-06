/*
 * Journal renderer. Reads trips pushed onto window.JOURNAL_TRIPS (trips/*.js) and renders
 * either one trip as a diary (<body data-page="trip" data-trip="slug">) or the list of
 * all trips (<body data-page="journeys">). No build step, no dependencies.
 */
(() => {
  "use strict";

  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const pad = n => String(n).padStart(2, "0");
  const ymd = s => { const [y, m, d] = s.split("-").map(Number); return { y, m, d }; };
  const attr = s => String(s ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  const lines = v => (Array.isArray(v) ? v : [v]).join("<br>");

  // "05–06 October 2026", "30 September – 02 October 2026", short: "05–06 Oct"
  function dateRange(a, b, short = false) {
    const s = ymd(a), e = ymd(b || a);
    const mon = m => short ? MONTHS[m - 1].slice(0, 3) : MONTHS[m - 1];
    const year = short ? "" : ` ${e.y}`;
    if (a === (b || a)) return `${pad(s.d)} ${mon(s.m)}${year}`;
    if (s.y === e.y && s.m === e.m) return `${pad(s.d)}–${pad(e.d)} ${mon(e.m)}${year}`;
    if (s.y === e.y) return `${pad(s.d)} ${mon(s.m)} – ${pad(e.d)} ${mon(e.m)}${year}`;
    return `${pad(s.d)} ${mon(s.m)} ${s.y} – ${pad(e.d)} ${mon(e.m)} ${e.y}`;
  }
  const stampDate = s => { const { y, m, d } = ymd(s); return `${pad(d)} ${MONTHS[m - 1].slice(0, 3)} ${y}`; };

  /* ---------- trip page ---------- */

  function renderTrip(T) {
    const image = key => {
      const i = T.images[key];
      if (!i) throw new Error(`Unknown image "${key}" in trip ${T.slug}`);
      return i;
    };
    const img = (key, { eager = false } = {}) => {
      const i = image(key);
      return `<img src="${T.imageBase}${i.src}" alt="${attr(i.alt)}" width="${i.w}" height="${i.h}"${eager ? ' fetchpriority="high"' : ' loading="lazy"'} decoding="async"${i.focus ? ` style="object-position:${i.focus}"` : ""}>`;
    };
    // Every photo opens in the lightbox; the group decides what the arrows step through.
    const openable = (key, inner, caption = "", group = "story") =>
      `<button type="button" class="ph-open" data-lb="${T.imageBase}${image(key).src}" data-lb-group="${group}" data-lb-caption="${attr(caption)}" aria-label="ขยายภาพ: ${attr(image(key).alt)}">${inner}</button>`;

    let chapter = null;

    function figcaption(b) {
      const text = b.caption ? `<span class="${b.hand ? "hand" : "ph-cap"}">${b.caption}</span>` : "";
      const meta = b.meta ? `<span class="ph-meta">${[stampDate(chapter.date), b.time, b.meta].filter(Boolean).join(" · ")}</span>` : "";
      return text || meta ? `<figcaption>${text}${meta}</figcaption>` : "";
    }

    function placeholder(b, layout = b.layout || "inline") {
      if (!T.showPlaceholders) return "";
      return `<figure class="ph ph--${layout} ph--empty${b.side ? ` ph--${b.side}` : ""}"><div class="slot"><span class="slot-label">ยังไม่ได้แปะรูป</span><span class="hand">${b.placeholder}</span></div></figure>`;
    }

    function photo(b) {
      const layout = b.layout || "inline";
      const i = image(b.photo);
      const cls = ["ph", `ph--${layout}`, b.side && `ph--${b.side}`, b.tone && `tone-${b.tone}`].filter(Boolean).join(" ");
      const reveal = ` data-reveal${b.reveal ? `="${b.reveal}"` : ""}`;
      return `<figure class="${cls}"${reveal} style="--r:${(i.h / i.w).toFixed(4)}">${openable(b.photo, img(b.photo), b.caption)}${figcaption(b)}</figure>`;
    }

    function photos(b) {
      const items = b.photos.map(p => p.placeholder
        ? (T.showPlaceholders ? `<div class="slot"><span class="slot-label">ยังไม่ได้แปะรูป</span><span class="hand">${p.placeholder}</span></div>` : "")
        : `<div class="set-item">${openable(p.photo, img(p.photo), p.caption)}${p.caption ? `<span class="set-cap">${p.caption}</span>` : ""}</div>`
      ).filter(Boolean);
      if (!items.length) return "";
      const layout = items.length === 1 ? "single" : b.layout;
      const empty = b.photos.every(p => p.placeholder) ? " set--empty" : "";
      return `<figure class="set set--${layout}${empty}" data-reveal><div class="set-grid">${items.join("")}</div>${b.caption ? `<figcaption class="hand">${b.caption}</figcaption>` : ""}</figure>`;
    }

    function block(b) {
      if (typeof b === "string") return `<p>${b}</p>`;
      if (b.photo) return photo(b);
      if (b.photos) return photos(b);
      if (b.placeholder) return placeholder(b);
      if (b.note) return `<p class="note hand">${b.note}</p>`;
      if (b.thought) return `<p class="thought${b.size ? ` thought--${b.size}` : ""}" data-reveal>${lines(b.thought)}</p>`;
      if (b.quote) return `<figure class="said" data-reveal><blockquote><p>${lines(b.quote)}</p></blockquote><figcaption>— ${b.by}</figcaption></figure>`;
      if (b.dialogue) return `<div class="dialogue">${b.dialogue.map(([who, line]) => `<p><span class="who">${who}</span><span class="line">“${line}”</span></p>`).join("")}</div>`;
      if (b.letter) return `<div class="letter" data-reveal>${b.lead ? `<p class="letter-lead">${b.lead}</p>` : ""}${b.letter.map(l => `<p class="hand">${l}</p>`).join("")}</div>`;
      if (b.verse) return `<p class="verse">${lines(b.verse)}</p>`;
      if (b.pause) return `<p class="pause">${b.pause}</p>`;
      if (b.mark) return `<p class="mark">${b.mark}</p>`;
      if (b.stamp) return `<p class="stamp" aria-label="${attr(`${b.stamp.value} ${b.stamp.label} ${b.stamp.sub || ""}`)}"><b>${b.stamp.value}</b><span>${b.stamp.label}</span>${b.stamp.sub ? `<small>${b.stamp.sub}</small>` : ""}</p>`;
      if (b.video) {
        const v = b.video;
        return `<figure class="ph ph--video" data-reveal><video controls playsinline preload="none" poster="${v.poster}" width="${v.w}" height="${v.h}" aria-label="${attr(v.label)}"><source src="${v.src}" type="video/mp4">เบราว์เซอร์นี้เล่นวิดีโอไม่ได้ <a href="${v.src}">เปิดคลิป</a></video><figcaption><span class="hand">${v.caption}</span><a class="ph-dl" href="${v.src}" download>ดาวน์โหลดคลิป</a></figcaption></figure>`;
      }
      return "";
    }

    // A polaroid or portrait with a side sits beside the text that follows it, like a print tucked next to the writing.
    const isText = b => typeof b === "string" || b.note || b.verse || b.dialogue || b.quote || (b.thought && !b.size);
    function content(blocks) {
      const out = [];
      for (let n = 0; n < blocks.length; n++) {
        const b = blocks[n];
        const sided = b.side && (b.layout === "polaroid" || b.layout === "portrait");
        const text = [];
        while (sided && text.length < (b.with || 3) && blocks[n + 1] !== undefined && isText(blocks[n + 1])) text.push(blocks[++n]);
        const fig = b.placeholder ? placeholder(b) : block(b);
        out.push(text.length && fig
          ? `<div class="beside beside--${b.side}">${fig}<div class="beside-text">${text.map(block).join("")}</div></div>`
          : fig + text.map(block).join(""));
      }
      return out.join("");
    }

    function event(e) {
      const time = !e.time ? ""
        : /^\d{1,2}:\d{2}$/.test(e.time) ? `<time class="time hand" datetime="${chapter.date}T${e.time}">${e.time}</time>`
        : `<span class="time hand">${e.time}</span>`;
      return `<section class="event flow" id="${e.id}" data-mood="${e.mood || chapter.mood}" aria-labelledby="${e.id}-t">
        <header class="event-head${e.quietTitle ? " sr-only" : ""}">${time}<h3 id="${e.id}-t">${e.title}</h3></header>
        ${content(e.content)}
      </section>`;
    }

    function chapterHtml(ch) {
      chapter = ch;
      const html = `<section class="chapter" id="${ch.id}" aria-labelledby="${ch.id}-t">
        <header class="chapter-open flow" data-mood="${ch.mood}">
          <h2 id="${ch.id}-t"><span class="chapter-day">Day ${pad(ch.day)}</span><span class="chapter-route">${ch.route.join(' <span class="arrow" aria-label="ไป">→</span> ')}</span></h2>
          <p class="chapter-date"><time datetime="${ch.date}">${dateRange(ch.date)}</time></p>
        </header>
        ${ch.events.map(event).join("")}
        ${ch.closing ? `<footer class="chapter-close flow" data-mood="${ch.events.at(-1).mood || ch.mood}"><p class="mark">${ch.closing}</p></footer>` : ""}
      </section>`;
      return html;
    }

    function cover() {
      return `<header class="cover" id="top" data-mood="${T.chapters[0].mood}">
        <div class="cover-text">
          <p class="kicker">Travel Journal</p>
          <h1 class="cover-title">${T.title}</h1>
          <p class="cover-place">${T.location}</p>
          <p class="cover-date"><time datetime="${T.startDate}">${dateRange(T.startDate, T.endDate)}</time><span class="sep" aria-hidden="true">·</span>${T.duration}</p>
          <p class="cover-epigraph">${lines(T.epigraph)}</p>
          <a class="cover-begin" href="#${T.chapters[0].id}">บันทึกการเดินทาง <span aria-hidden="true">↓</span></a>
        </div>
        <figure class="cover-photo">
          ${openable(T.coverImage, img(T.coverImage, { eager: true }), "", "cover")}
          <dl class="cover-meta">${T.coverMeta.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("")}</dl>
        </figure>
      </header>`;
    }

    function ending() {
      const e = T.ending;
      if (!e) return "";
      return `<section class="ending flow" id="ending" data-mood="evening" aria-labelledby="ending-t">
        <h2 id="ending-t" class="${e.heading ? "sr-only" : "ending-title"}">${e.heading || e.title}</h2>
        ${(e.prelude || []).map(s => `<p class="stanza stanza--prelude" data-reveal>${lines(s)}</p>`).join("")}
        ${e.heading ? `<p class="ending-title" data-reveal>${e.title}</p>` : ""}
        ${e.stanzas.map(s => `<p class="stanza" data-reveal>${lines(s)}</p>`).join("")}
        <p class="signoff hand">${e.signoff}</p>
        ${e.photo ? `<figure class="ph ph--portrait ending-photo" data-reveal>${openable(e.photo, img(e.photo))}</figure>` : ""}
        <p class="end-mark"><span>End of Journal</span><span>${T.title} · ${ymd(T.startDate).y}</span></p>
      </section>`;
    }

    function roll() {
      if (!T.gallery || !T.gallery.length) return "";
      return `<section class="roll" id="roll" data-mood="notes" aria-labelledby="roll-t">
        <div class="flow"><h2 id="roll-t" class="roll-title">ม้วนฟิล์มจากทริปนี้ <small>${T.gallery.length} ภาพ · เลื่อนดูได้</small></h2></div>
        <div class="strip" tabindex="0" role="region" aria-labelledby="roll-t">
          <ol>${T.gallery.map(key => `<li>${openable(key, img(key), "", "roll")}</li>`).join("")}</ol>
        </div>
      </section>`;
    }

    function notes() {
      const N = T.travelNotes;
      if (!N) return "";
      const ctx = { links: N.links };
      const special = {
        map: () => `<div class="map" data-map>
          <div class="map-tabs" role="group" aria-label="เลือกสถานที่บนแผนที่">${N.places.map((p, n) => `<button type="button" data-place="${n}" aria-pressed="${n === 0}">${p.name}</button>`).join("")}</div>
          <div class="map-frame"><iframe src="${N.places[0].embed}" title="แผนที่ ${attr(N.places[0].name)}" width="600" height="380" loading="lazy" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>
          <p class="map-place"><b data-place-name>${N.places[0].name}</b> <span data-place-area>${N.places[0].area}</span></p>
          <p><a class="note-link" data-place-link href="https://www.google.com/maps/search/?api=1&amp;query=${encodeURIComponent(N.places[0].coordinates)}" target="_blank" rel="noopener">เปิดใน Google Maps ↗</a></p>
          <p class="small">${N.mapNote}</p>
        </div>`,
        expenses: () => {
          const x = N.expenses;
          return `<p class="small">${x.before}</p>
          <table class="ledger"><caption class="sr-only">ค่าใช้จ่ายแต่ละรายการ</caption><thead><tr><th scope="col">รายการ</th><th scope="col">ราคา</th></tr></thead><tbody>
          ${x.items.map(([item, amt, note]) => `<tr><td>${item}<small>${note}</small></td><td class="amt">${amt}</td></tr>`).join("")}
          </tbody></table>
          <p class="disclaimer">${N.disclaimer}</p>
          <div class="splitter">
            <label for="group-size">ลองหารในกลุ่ม · จำนวนคน</label>
            <select id="group-size">${Array.from({ length: 10 }, (_, n) => `<option value="${n + 1}"${n === 3 ? " selected" : ""}>${n + 1} คน</option>`).join("")}</select>
            <output id="shared-cost" for="group-size" aria-live="polite"></output>
            <p class="small">${x.splitNote}</p>
          </div>`;
        },
        contacts: () => `<ul class="contacts">${N.contacts(ctx).map(c => `<li><a href="${c.href}"${c.external ? ' target="_blank" rel="noopener"' : ""}><b>${c.title}</b><span>${c.desc}</span><span class="host">${c.host}</span></a></li>`).join("")}</ul>`
      };
      return `<section class="notes" id="notes" data-mood="notes" aria-labelledby="notes-t">
        <header class="notes-head flow">
          <h2 id="notes-t"><span class="kicker">Travel Notes</span>${N.lede}</h2>
          <p class="disclaimer">${N.disclaimer}</p>
          <dl class="facts">${N.facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("")}</dl>
        </header>
        <div class="notes-body flow">
          ${N.sections.map((s, n) => `<section class="note-sec" id="${s.id}" aria-labelledby="${s.id}-t">
            <h3 id="${s.id}-t"><span class="no">${pad(n + 1)}</span><span>${s.title}<small>${s.en}</small></span></h3>
            <div class="note-body">${s.type ? special[s.type]() : s.html(ctx)}</div>
          </section>`).join("")}
        </div>
      </section>`;
    }

    const nav = `<header class="topbar">
      <nav class="topbar-inner" aria-label="นำทางบันทึก">
        <a class="tb-back" href="journeys.html" aria-label="All Journeys — บันทึกทั้งหมด"><span aria-hidden="true">←</span><span class="tb-wide">All Journeys</span></a>
        <a class="tb-title" href="#top">${T.title}</a>
        <ul class="tb-links">
          ${T.chapters.map(ch => `<li><a href="#${ch.id}" data-sec="${ch.id}"><span class="tb-wide">Day </span>${pad(ch.day)}</a></li>`).join("")}
          ${T.travelNotes ? `<li><a href="#notes" data-sec="notes"><span class="tb-wide">Travel </span>Notes</a></li>` : ""}
        </ul>
      </nav>
      <div class="tb-progress" aria-hidden="true"><span></span></div>
    </header>`;

    const footer = `<footer class="site-foot flow" data-mood="notes">
      <p>${T.travelNotes ? T.travelNotes.disclaimer : ""}</p>
      <p><a href="journeys.html">← All Journeys</a> · <a href="#top">กลับไปหน้าปก ↑</a></p>
    </footer>`;

    document.title = `${T.title} · ${T.titleTh} — Travel Journal`;
    const mount = document.getElementById("journal");
    mount.insertAdjacentHTML("beforebegin", nav);
    // Keep "ๆ" on the same line as the word it repeats.
    mount.innerHTML = `<article class="journal">${cover()}${T.chapters.map(chapterHtml).join("")}${ending()}</article>${roll()}${notes()}`.replace(/ ๆ/g, " ๆ");
    mount.insertAdjacentHTML("afterend", footer);

    setupMoods();
    setupNav();
    setupReveal();
    setupLightbox();
    setupMap(T);
    setupSplitter(T);
    followLegacyHash(T);
  }

  /* ---------- journeys (all trips) ---------- */

  function renderJourneys(trips) {
    const byYear = {};
    [...trips].sort((a, b) => b.startDate.localeCompare(a.startDate)).forEach(t => {
      (byYear[ymd(t.startDate).y] ||= []).push(t);
    });
    const mount = document.getElementById("journal");
    mount.innerHTML = `<header class="shelf-head flow">
        <p class="kicker">My Journeys</p>
        <h1>บันทึกการเดินทาง</h1>
        <p class="shelf-lede">ความทรงจำจากการเดินทาง เก็บไว้อ่านอีกครั้งในวันข้างหน้า</p>
      </header>
      ${Object.keys(byYear).sort((a, b) => b - a).map(y => `<section class="shelf flow" aria-labelledby="y-${y}">
        <h2 class="shelf-year" id="y-${y}">${y}</h2>
        <ol class="shelf-list">${byYear[y].map(t => {
          const c = t.images[t.coverImage];
          return `<li><a class="volume" href="${t.url}">
            <span class="volume-photo"><img src="${t.imageBase}${c.src}" alt="" width="${c.w}" height="${c.h}" loading="lazy" decoding="async"${c.focus ? ` style="object-position:${c.focus}"` : ""}></span>
            <span class="volume-text">
              <span class="volume-date">${dateRange(t.startDate, t.endDate, true)}</span>
              <span class="volume-title">${t.title}</span>
              <span class="volume-place">${t.location}</span>
              <span class="volume-line">${t.summary || ""}</span>
            </span>
          </a></li>`;
        }).join("")}</ol>
      </section>`).join("")}`;
    setupMoods();
  }

  /* ---------- behaviour ---------- */

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  // The page colour follows the time of day of whatever section crosses the middle of the screen.
  function setupMoods() {
    const sections = document.querySelectorAll("[data-mood]");
    if (!("IntersectionObserver" in window) || !sections.length) return;
    document.body.dataset.mood = sections[0].dataset.mood;
    const io = new IntersectionObserver(entries => {
      entries.forEach(en => { if (en.isIntersecting) document.body.dataset.mood = en.target.dataset.mood; });
    }, { rootMargin: "-50% 0px -50% 0px" });
    sections.forEach(s => io.observe(s));
  }

  function setupNav() {
    const bar = document.querySelector(".tb-progress span");
    const links = [...document.querySelectorAll(".tb-links a")];
    const targets = links.map(a => document.getElementById(a.dataset.sec)).filter(Boolean);
    let ticking = false;
    const update = () => {
      ticking = false;
      const max = document.documentElement.scrollHeight - innerHeight;
      bar.style.transform = `scaleX(${max > 0 ? Math.min(1, scrollY / max) : 0})`;
      const line = scrollY + innerHeight * 0.35;
      let current = null;
      targets.forEach(t => { if (t.offsetTop <= line) current = t.id; });
      // The ending and film roll belong to Day 02 until Travel Notes begins.
      links.forEach(a => a.dataset.sec === current ? a.setAttribute("aria-current", "location") : a.removeAttribute("aria-current"));
    };
    addEventListener("scroll", () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
    addEventListener("resize", update);
    update();
  }

  function setupReveal() {
    if (reducedMotion.matches || !("IntersectionObserver" in window)) return;
    document.documentElement.classList.add("motion");
    const io = new IntersectionObserver(entries => {
      entries.forEach(en => { if (en.isIntersecting) { en.target.classList.add("is-in"); io.unobserve(en.target); } });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.12 });
    document.querySelectorAll("[data-reveal]").forEach(el => io.observe(el));
  }

  function setupLightbox() {
    const dlg = document.createElement("dialog");
    dlg.className = "lightbox";
    dlg.setAttribute("aria-label", "ดูภาพขนาดใหญ่");
    dlg.innerHTML = `<figure><img alt=""><figcaption class="hand"></figcaption></figure>
      <button type="button" class="lb-btn lb-close" aria-label="ปิด">×</button>
      <button type="button" class="lb-btn lb-prev" aria-label="ภาพก่อนหน้า">‹</button>
      <button type="button" class="lb-btn lb-next" aria-label="ภาพถัดไป">›</button>
      <p class="lb-count" aria-live="polite"></p>`;
    document.body.appendChild(dlg);
    const im = dlg.querySelector("img"), cap = dlg.querySelector("figcaption"), count = dlg.querySelector(".lb-count");
    let group = [], index = 0, opener = null;

    const show = n => {
      index = (n + group.length) % group.length;
      const b = group[index], thumb = b.querySelector("img");
      im.src = b.dataset.lb;
      im.alt = thumb.alt;
      cap.textContent = b.dataset.lbCaption || "";
      count.textContent = group.length > 1 ? `${index + 1} / ${group.length}` : "";
      dlg.classList.toggle("is-single", group.length < 2);
    };
    document.addEventListener("click", e => {
      const b = e.target.closest("[data-lb]");
      if (!b) return;
      opener = b;
      group = [...document.querySelectorAll(`[data-lb-group="${b.dataset.lbGroup}"]`)];
      show(group.indexOf(b));
      dlg.showModal();
    });
    dlg.querySelector(".lb-close").addEventListener("click", () => dlg.close());
    dlg.querySelector(".lb-prev").addEventListener("click", () => show(index - 1));
    dlg.querySelector(".lb-next").addEventListener("click", () => show(index + 1));
    dlg.addEventListener("click", e => { if (e.target === dlg || e.target.tagName === "FIGURE") dlg.close(); });
    dlg.addEventListener("keydown", e => {
      if (e.key === "ArrowLeft") show(index - 1);
      if (e.key === "ArrowRight") show(index + 1);
    });
    let x0 = null;
    dlg.addEventListener("touchstart", e => { x0 = e.touches[0].clientX; }, { passive: true });
    dlg.addEventListener("touchend", e => {
      if (x0 === null) return;
      const dx = e.changedTouches[0].clientX - x0;
      if (Math.abs(dx) > 50) show(index + (dx < 0 ? 1 : -1));
      x0 = null;
    });
    dlg.addEventListener("close", () => { im.removeAttribute("src"); opener && opener.focus({ preventScroll: true }); });
  }

  function setupMap(T) {
    const box = document.querySelector("[data-map]");
    if (!box) return;
    const places = T.travelNotes.places;
    box.addEventListener("click", e => {
      const b = e.target.closest("[data-place]");
      if (!b) return;
      const p = places[Number(b.dataset.place)];
      box.querySelectorAll("[data-place]").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
      const frame = box.querySelector("iframe");
      frame.src = p.embed;
      frame.title = `แผนที่ ${p.name}`;
      box.querySelector("[data-place-name]").textContent = p.name;
      box.querySelector("[data-place-area]").textContent = p.area;
      box.querySelector("[data-place-link]").href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.coordinates)}`;
    });
  }

  function setupSplitter(T) {
    const select = document.getElementById("group-size");
    if (!select) return;
    const split = T.travelNotes.expenses.split;
    const money = v => v.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const update = () => {
      const n = Number(select.value);
      const total = split.reduce((sum, [, amt]) => sum + amt, 0);
      document.getElementById("shared-cost").textContent =
        `${split.map(([label, amt]) => `${label} ${money(amt / n)}`).join(" · ")} · รวม ${money(total / n)} บาท/คน`;
    };
    select.addEventListener("change", update);
    update();
  }

  function followLegacyHash(T) {
    const jump = () => {
      const id = location.hash.slice(1);
      const alias = T.travelNotes && T.travelNotes.aliases && T.travelNotes.aliases[id];
      const el = alias && document.getElementById(alias);
      if (el) requestAnimationFrame(() => el.scrollIntoView());
    };
    addEventListener("hashchange", jump);
    jump();
  }

  /* ---------- boot ---------- */

  function boot() {
    const trips = window.JOURNAL_TRIPS || [];
    const page = document.body.dataset.page;
    if (page === "journeys") return renderJourneys(trips);
    const slug = new URLSearchParams(location.search).get("trip") || document.body.dataset.trip;
    const trip = trips.find(t => t.slug === slug);
    if (!trip) {
      document.getElementById("journal").innerHTML = `<p class="flow">ไม่พบบันทึกนี้ · <a href="journeys.html">ดูบันทึกทั้งหมด</a></p>`;
      return;
    }
    renderTrip(trip);
    // Anchor targets only exist after rendering, so jump to the requested one now.
    const target = location.hash && document.getElementById(decodeURIComponent(location.hash.slice(1)));
    if (target) requestAnimationFrame(() => target.scrollIntoView());
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
