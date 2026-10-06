/*
 * Journal image system. Every photo on a trip page goes through here, so trips only
 * describe images in data (trips/<slug>/trip.js) and never need new components.
 *
 * An image item is either a key from trip.images, or an object:
 *   { src, alt, caption, date, time, location, camera, note,
 *     position, rotation, size, aspectRatio, priority, expandable, focus }
 * Blocks pick one of the PRESETS below with `layout`; anything left out gets a sensible default.
 */
window.JournalImages = (() => {
  "use strict";

  const DEV = /^(localhost|127\.0\.0\.1|\[::1\])$|\.localhost$|\.test$/.test(location.hostname) || location.protocol === "file:";
  const warned = new Set();
  const warn = msg => { if (DEV && !warned.has(msg)) { warned.add(msg); console.warn("[journal]", msg); } };
  const attr = s => String(s ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const stampDate = s => { const [y, m, d] = s.split("-").map(Number); return `${String(d).padStart(2, "0")} ${MONTHS[m - 1]} ${y}`; };

  // Smaller copies made by tools/prepare_images.py, by longest edge in px.
  const VARIANTS = [500, 1000];

  /*
   * Layout presets. single = one photo; set = several photos arranged together.
   * sizes: what the browser should download for; crop: default aspect ratio (else the photo's own).
   */
  const PRESETS = {
    hero:          { kind: "single", sizes: "100vw", priority: true },
    full:          { kind: "single", sizes: "100vw" },
    spotlight:     { kind: "single", sizes: "(min-width: 720px) 60vw, 100vw" },
    background:    { kind: "single", sizes: "100vw", expandable: false },
    wide:          { kind: "single", sizes: "(min-width: 1120px) 1080px, 100vw", crop: "3 / 2" },
    inline:        { kind: "single", sizes: "(min-width: 720px) 680px, 100vw" },
    portrait:      { kind: "single", sizes: "(min-width: 720px) 460px, 100vw", beside: true },
    polaroid:      { kind: "single", sizes: "320px", crop: "1 / 1", beside: true, tilt: [-1.6, 1.8] },
    "diary-photo": { kind: "single", sizes: "260px", beside: true, tilt: [-2.4, 2] },
    "two-column":  { kind: "set", sizes: "(min-width: 900px) 430px, 50vw", crop: "4 / 5" },
    collage:       { kind: "set", sizes: "(min-width: 900px) 520px, 60vw" },
    "memory-stack":{ kind: "set", sizes: "320px", crop: "4 / 5", tilt: [-5, 4, -1.5, 2.5] },
    "film-strip":  { kind: "set", sizes: "240px" },
    gallery:       { kind: "set", sizes: "(min-width: 720px) 220px, 33vw", crop: "1 / 1" }
  };
  const ALIASES = { stage: "spotlight", pair: "two-column", trio: "collage", stack: "memory-stack", strip: "film-strip" };
  const POSITIONS = ["left", "right", "center", "bleed-left", "bleed-right"];
  const DECO_TILT = [3, -2.5, 2, -3.5];

  function create(T) {
    const base = T.base || "";
    const sizes = (window.JOURNAL_IMAGE_SIZES || {})[T.slug] || {};
    const url = p => /^(https?:)?\/\//.test(p) || p.startsWith("/") ? p : base + p;
    let tiltTurn = 0;

    // Turn a key, an object, or a block into one plain description of the photo.
    function resolve(item) {
      if (item == null) return null;
      if (item.placeholder) return { placeholder: item.placeholder };
      const ref = typeof item === "string" ? item : item.image ?? (item.src ? item : null);
      const known = typeof ref === "string" ? T.images[ref] : ref;
      if (!known) { warn(`Image "${typeof ref === "string" ? ref : JSON.stringify(item)}" is not in trip.images of ${T.slug}`); return null; }
      const im = { ...known, ...(typeof item === "object" && item !== known ? item : {}) };
      delete im.image;
      if (!im.src) { warn(`Image without src: ${JSON.stringify(item)}`); return null; }
      const dims = im.w && im.h ? [im.w, im.h] : sizes[im.src];
      if (dims) [im.w, im.h] = dims;
      else warn(`No size for ${im.src} — run: python tools/prepare_images.py ${T.slug}`);
      if (!im.alt) warn(`Missing alt text for ${im.src}`);
      im.position = im.position || im.side;
      return im;
    }

    function srcset(im) {
      if (!im.w || !sizes[im.src]) return "";
      const long = Math.max(im.w, im.h);
      const list = VARIANTS.filter(v => long > v * 1.15).map(v => `${url(`_sized/${v}/${im.src}`)} ${Math.round(im.w * v / long)}w`);
      return list.length ? `${list.join(", ")}, ${url(im.src)} ${im.w}w` : "";
    }

    // The <img> itself: dimensions for zero layout shift, lazy unless it matters for first paint.
    function tag(im, { preset = {}, sizesAttr, priority } = {}) {
      const eager = priority ?? im.priority ?? preset.priority;
      const set = srcset(im);
      const style = [im.focus && `object-position:${im.focus}`, im.aspectRatio && `aspect-ratio:${im.aspectRatio};object-fit:cover`].filter(Boolean).join(";");
      return `<img src="${url(im.src)}"${set ? ` srcset="${set}" sizes="${sizesAttr || preset.sizes || "100vw"}"` : ""} alt="${attr(im.alt)}"${im.w ? ` width="${im.w}" height="${im.h}"` : ""}${eager ? ' fetchpriority="high"' : ' loading="lazy"'} decoding="async"${style ? ` style="${style}"` : ""}>`;
    }

    // What is written on the back of the photo: date, time, place. Camera and note only show in the lightbox.
    function stamp(im, date) {
      if (!(im.time || im.location || im.date || im.stamp)) return "";
      return [stampDate(im.date || date), im.time, im.location].filter(Boolean).join(" · ");
    }

    function wrap(im, inner, { group = "story", expandable = true, date } = {}) {
      if (!(im.expandable ?? expandable)) return inner;
      const meta = [stamp(im, date), im.camera].filter(Boolean).join(" · ");
      return `<button type="button" class="ph-open" data-lb="${url(im.src)}" data-lb-group="${group}" data-lb-caption="${attr(im.caption)}" data-lb-meta="${attr(meta)}" data-lb-note="${attr(im.note)}" aria-label="ขยายภาพ: ${attr(im.alt || im.caption)}">${inner}</button>`;
    }

    function caption(im, date, extra = "") {
      const st = stamp(im, date);
      if (!im.caption && !st && !extra) return "";
      return `<figcaption>${im.caption ? `<span class="hand">${im.caption}</span>` : ""}${st ? `<span class="ph-meta">${st}</span>` : ""}${extra}</figcaption>`;
    }

    const slot = (label, cls = "") => `<div class="slot${cls}"><span class="slot-label">ยังไม่ได้แปะรูป</span><span class="hand">${label}</span></div>`;

    function nextTilt(list) { return list[tiltTurn++ % list.length]; }

    function positionClass(p) {
      if (!p) return "";
      if (!POSITIONS.includes(p)) { warn(`Unknown position "${p}"`); return ""; }
      return ` ph--${p}`;
    }

    /* ---- single photo (DiaryImage) ---- */
    function single(b, layout, preset, date) {
      const im = resolve(b);
      if (!im) return "";
      if (im.placeholder) return T.showPlaceholders ? `<figure class="ph ph--${layout} ph--empty${positionClass(b.position || b.side)}">${slot(im.placeholder)}</figure>` : "";
      const tilt = im.rotation ?? (preset.tilt ? nextTilt(preset.tilt) : null);
      const style = [im.w && `--r:${(im.h / im.w).toFixed(4)}`, tilt != null && `--tilt:${tilt}deg`].filter(Boolean).join(";");
      const cls = ["ph", `ph--${layout}`, im.size && `size-${im.size}`, b.tone && `tone-${b.tone}`].filter(Boolean).join(" ") + positionClass(im.position);
      const reveal = ` data-reveal${b.reveal ? `="${b.reveal}"` : ""}`;
      const overlay = layout === "background" && b.text ? `<p class="bg-text">${[].concat(b.text).join("<br>")}</p>` : "";
      const body = wrap(im, tag(im, { preset }), { expandable: preset.expandable ?? true, date });
      return `<figure class="${cls}"${reveal}${style ? ` style="${style}"` : ""}>${body}${overlay}${layout === "background" ? "" : caption(im, date)}</figure>`;
    }

    /* ---- several photos (PhotoSpread / PhotoCollage / MemoryGallery / FilmStrip) ---- */
    function set(b, layout, preset, date) {
      const items = b.images.map(resolve).filter(Boolean).filter(im => !im.placeholder || T.showPlaceholders);
      if (!items.length) return "";
      const n = items.length;
      if (layout === "collage" && n === 2) layout = "two-column";
      if (layout === "collage" && n > 4) layout = "gallery";
      // One photo left (others missing or hidden): show it on its own instead of a lonely grid cell.
      if (n === 1 && layout !== "film-strip" && !items[0].placeholder) {
        const one = { ...items[0], ...(b.caption ? { caption: b.caption } : {}) };
        const l = one.w > one.h ? "wide" : "portrait";
        return single(one, l, PRESETS[l], date);
      }
      const p = PRESETS[layout];
      const cell = layout === "film-strip" ? "li" : "div";
      const showCaptions = layout === "two-column";
      const cells = items.map(im => {
        if (im.placeholder) return cell === "li" ? `<li>${slot(im.placeholder)}</li>` : slot(im.placeholder);
        const tilt = layout === "memory-stack" ? im.rotation ?? nextTilt(p.tilt) : im.rotation;
        const style = tilt != null ? ` style="--tilt:${tilt}deg"` : "";
        const cap = showCaptions && im.caption ? `<span class="set-cap">${im.caption}</span>` : "";
        return `<${cell} class="set-item"${style}>${wrap(im, tag(im, { preset: p }), { date })}${cap}</${cell}>`;
      }).join("");
      const empty = items.every(im => im.placeholder) ? " set--empty" : "";
      const cls = `set set--${layout} set--n${Math.min(n, 4)}${empty}${positionClass(b.position)}`;
      const figcap = b.caption ? `<figcaption class="hand">${b.caption}</figcaption>` : "";
      if (layout === "film-strip") {
        return `<figure class="${cls}" data-reveal><div class="strip strip--inline" tabindex="0" role="region" aria-label="${attr(b.caption || "ภาพชุด")}"><ol>${cells}</ol></div>${figcap}</figure>`;
      }
      return `<figure class="${cls}" data-reveal><div class="set-grid">${cells}</div>${figcap}</figure>`;
    }

    // Choose a preset from the data, or a fitting one when none is given.
    function pickLayout(b, items) {
      let layout = ALIASES[b.layout] || b.layout;
      if (layout && !PRESETS[layout]) { warn(`Unknown layout "${b.layout}" — using automatic layout`); layout = null; }
      if (layout) return layout;
      if (items) return items.length === 2 ? "two-column" : items.length <= 4 ? "collage" : "gallery";
      const im = resolve(b);
      return im && im.w ? (im.w > im.h ? "wide" : "portrait") : "inline";
    }

    /** Render any image block: { image, layout, ... } or { images: [...], layout, caption }. */
    function block(b, date) {
      if (b.images) {
        const layout = pickLayout(b, b.images);
        return PRESETS[layout].kind === "set" ? set(b, layout, PRESETS[layout], date)
          : b.images.map(x => single({ ...(typeof x === "string" ? { image: x } : x), layout }, layout, PRESETS[layout], date)).join("");
      }
      const layout = pickLayout(b);
      const preset = PRESETS[layout];
      if (preset.kind === "set") return set({ ...b, images: [b] }, layout, preset, date);
      return single(b, layout, preset, date);
    }

    /** Small photos pasted beside an entry. Nothing renders when the list is empty. */
    function decorations(list, date) {
      const items = (list || []).map(d => ({ d, im: resolve(d) })).filter(x => x.im && !x.im.placeholder);
      if (!items.length) return "";
      const side = { left: [], right: [] };
      items.forEach(({ im }, n) => {
        const pos = im.position === "left" || (im.position !== "right" && n % 2 === 1) ? "left" : "right";
        const tilt = im.rotation ?? DECO_TILT[n % DECO_TILT.length];
        const body = wrap(im, tag(im, { sizesAttr: "180px" }), { expandable: false, group: "deco", date });
        side[pos].push(`<figure class="deco${im.size ? ` size-${im.size}` : ""}" style="--tilt:${tilt}deg">${body}${im.caption ? `<figcaption class="hand">${im.caption}</figcaption>` : ""}</figure>`);
      });
      return ["right", "left"].filter(s => side[s].length).map(s => `<div class="decos decos--${s}">${side[s].join("")}</div>`).join("");
    }

    /** A thumbnail for lists (film roll, journeys). */
    function thumb(key, { group = "roll", expandable = true, sizesAttr = "200px" } = {}) {
      const im = resolve(key);
      if (!im || im.placeholder) return "";
      return wrap(im, tag(im, { sizesAttr }), { group, expandable });
    }

    function cover(key) {
      const im = resolve(key);
      if (!im) return "";
      return wrap(im, tag(im, { priority: true, sizesAttr: "(min-width: 900px) 420px, 100vw" }), { group: "cover" });
    }

    // Small presets placed left or right sit beside the text that follows them.
    function isBeside(b) {
      const pos = b && typeof b === "object" && (b.position || b.side);
      const preset = pos && PRESETS[ALIASES[b.layout] || b.layout];
      return !!preset && !!preset.beside && (pos === "left" || pos === "right");
    }

    return { resolve, block, decorations, thumb, cover, url, isBeside };
  }

  /** Broken or missing files: keep the layout, swap in a quiet paper note, warn in development. */
  function setupFallbacks() {
    document.addEventListener("error", e => {
      const el = e.target;
      if (!(el instanceof HTMLImageElement)) return;
      warn(`Image failed to load: ${el.currentSrc || el.src}`);
      if (el.closest(".lightbox")) { el.classList.add("is-missing"); return; }
      const deco = el.closest(".deco");
      if (deco) { const box = deco.parentElement; deco.remove(); if (box && !box.children.length) box.remove(); return; }
      const note = document.createElement("span");
      note.className = "slot slot--missing";
      if (el.width && el.height) note.style.aspectRatio = `${el.getAttribute("width")} / ${el.getAttribute("height")}`;
      note.innerHTML = `<span class="slot-label">ภาพนี้หายไป</span><span class="hand"></span>`;
      note.lastChild.textContent = el.alt || "";
      const btn = el.closest("[data-lb]");
      el.replaceWith(note);
      if (btn) btn.replaceWith(...btn.childNodes);
    }, true);
  }

  return { create, setupFallbacks, PRESETS, stampDate };
})();
