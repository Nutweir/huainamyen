import { onBeforeUnmount } from "vue";

/*
 * Page behaviours ported from the static site (assets/journal.js), where they were tuned and tested:
 * the colour following the story's time of day, the reading progress bar, gentle reveals,
 * clips that play when you reach them, and the drifting film roll. All respect reduced motion.
 */
const reducedMotion = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

export function useDiaryBehaviour() {
  const cleanups: (() => void)[] = [];
  onBeforeUnmount(() => { cleanups.forEach(f => f()); cleanups.length = 0; });

  function moods(root: HTMLElement) {
    const sections = root.querySelectorAll<HTMLElement>("[data-mood]");
    if (!sections.length || !("IntersectionObserver" in window)) return;
    let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (!meta) { meta = document.createElement("meta"); meta.name = "theme-color"; document.head.appendChild(meta); }
    let timer = 0;
    const set = (mood: string) => {
      document.body.dataset.mood = mood;
      clearTimeout(timer);
      timer = window.setTimeout(() => { meta!.content = getComputedStyle(document.body).getPropertyValue("--page").trim() || "#f6f1e7"; }, reducedMotion() ? 0 : 1700);
    };
    set(sections[0].dataset.mood || "morning");
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) set((e.target as HTMLElement).dataset.mood || "morning"); }), { rootMargin: "-50% 0px -50% 0px" });
    sections.forEach(s => io.observe(s));
    cleanups.push(() => { io.disconnect(); clearTimeout(timer); });
  }

  function progress(bar: HTMLElement | null, links: HTMLAnchorElement[]) {
    const targets = links.map(a => document.getElementById(a.dataset.sec || "")).filter((x): x is HTMLElement => !!x);
    let ticking = false;
    const update = () => {
      ticking = false;
      const max = document.documentElement.scrollHeight - innerHeight;
      if (bar) bar.style.transform = `scaleX(${max > 0 ? Math.min(1, scrollY / max) : 0})`;
      const line = scrollY + innerHeight * 0.35;
      let current: string | null = null;
      targets.forEach(t => { if (t.getBoundingClientRect().top + scrollY <= line) current = t.id; });
      links.forEach(a => (a.dataset.sec === current ? a.setAttribute("aria-current", "location") : a.removeAttribute("aria-current")));
    };
    const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
    addEventListener("scroll", onScroll, { passive: true });
    addEventListener("resize", update);
    update();
    cleanups.push(() => { removeEventListener("scroll", onScroll); removeEventListener("resize", update); });
  }

  function reveal(root: HTMLElement) {
    if (reducedMotion() || !("IntersectionObserver" in window)) return;
    document.documentElement.classList.add("motion");
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add("is-in"); io.unobserve(e.target); } }), { rootMargin: "0px 0px -8% 0px", threshold: 0.12 });
    root.querySelectorAll("[data-reveal]").forEach(el => io.observe(el));
    cleanups.push(() => { io.disconnect(); document.documentElement.classList.remove("motion"); });
  }

  /** Clips start muted and looping when you reach them, pause when you move on; posters load when near. */
  function videos(root: HTMLElement) {
    const vids = [...root.querySelectorAll<HTMLVideoElement>(".ph--video video")];
    if (!vids.length || !("IntersectionObserver" in window)) return;
    const loadPoster = (v: HTMLVideoElement) => { if (v.dataset.poster) { v.poster = v.dataset.poster; v.removeAttribute("data-poster"); } };
    const near = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { loadPoster(e.target as HTMLVideoElement); near.unobserve(e.target); } }), { rootMargin: "600px 0px" });
    vids.forEach(v => near.observe(v));
    cleanups.push(() => near.disconnect());
    if (reducedMotion()) return;
    const state = new WeakMap<HTMLVideoElement, { auto: boolean; user: boolean }>();
    vids.forEach(v => {
      state.set(v, { auto: false, user: false });
      v.addEventListener("pause", () => { const s = state.get(v)!; if (!s.auto && !v.ended) s.user = true; s.auto = false; });
      v.addEventListener("play", () => { state.get(v)!.user = false; });
    });
    const inView = new IntersectionObserver(es => es.forEach(({ target, isIntersecting }) => {
      const v = target as HTMLVideoElement, s = state.get(v)!;
      if (isIntersecting && !s.user) v.play().catch(() => { v.muted = true; v.play().catch(() => undefined); });
      else if (!isIntersecting && !v.paused) { s.auto = true; v.pause(); }
    }), { threshold: 0.6 });
    vids.forEach(v => inView.observe(v));
    cleanups.push(() => inView.disconnect());
  }

  /** The film roll drifts slowly and loops; pauses on hover, focus, touch, off-screen, or with its button. */
  function roll(strip: HTMLElement | null, toggle: HTMLButtonElement | null) {
    const firstDup = strip?.querySelector<HTMLElement>("[data-dup]");
    if (!strip || !firstDup || !toggle) return;
    if (reducedMotion()) { strip.querySelectorAll("[data-dup]").forEach(li => li.remove()); return; }
    toggle.hidden = false;
    const SPEED = 28;
    let pos = strip.scrollLeft, last = 0, visible = false, stopped = false, held = 0, raf = 0, touchTimer = 0;
    const loop = () => firstDup.offsetLeft - (strip.querySelector("li") as HTMLElement).offsetLeft;
    const paused = () => stopped || held > 0 || !visible || document.hidden;
    const tick = (t: number) => {
      raf = 0;
      if (paused()) return;
      const dt = last ? Math.min(t - last, 100) / 1000 : 0;
      last = t;
      if (Math.abs(strip.scrollLeft - pos) > 2) pos = strip.scrollLeft;
      pos += SPEED * dt;
      const w = loop();
      if (w > 0 && pos >= w) pos -= w;
      strip.scrollLeft = pos;
      raf = requestAnimationFrame(tick);
    };
    const run = () => { if (!raf && !paused()) { last = 0; pos = strip.scrollLeft; raf = requestAnimationFrame(tick); } };
    const hold = (d: number) => () => { held = Math.max(0, held + d); run(); };
    strip.addEventListener("pointerenter", hold(1));
    strip.addEventListener("pointerleave", hold(-1));
    strip.addEventListener("focusin", hold(1));
    strip.addEventListener("focusout", hold(-1));
    strip.addEventListener("touchstart", () => { clearTimeout(touchTimer); held = Math.max(held, 1); }, { passive: true });
    strip.addEventListener("touchend", () => { touchTimer = window.setTimeout(() => { held = 0; run(); }, 2500); }, { passive: true });
    toggle.addEventListener("click", () => { stopped = !stopped; toggle.setAttribute("aria-pressed", String(stopped)); toggle.textContent = stopped ? "เล่นต่อ" : "หยุด"; run(); });
    document.addEventListener("visibilitychange", run);
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; run(); });
    io.observe(strip);
    cleanups.push(() => { io.disconnect(); cancelAnimationFrame(raf); document.removeEventListener("visibilitychange", run); });
  }

  return { moods, progress, reveal, videos, roll };
}
