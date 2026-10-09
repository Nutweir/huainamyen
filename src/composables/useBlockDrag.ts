import { onBeforeUnmount, ref } from "vue";

/*
 * Drag blocks with the mouse (anywhere on the row) or a finger (on the ⋮⋮ handle, so the page still
 * scrolls by touch). Dragging starts after a few pixels, so a plain click still selects the row.
 * The row follows the pointer, a line shows where it will land, the page scrolls near the edges,
 * and dropping on a day button ([data-day-drop]) moves the block to that day. Esc cancels.
 */
export interface DragState { from: number; dy: number; to: number; line: number; day: number | null }

const THRESHOLD = 6;

export function useBlockDrag(opts: {
  list: () => HTMLElement | null;
  currentDay: () => number;
  onMove: (from: number, to: number) => void;
  onMoveToDay: (from: number, day: number) => void;
}) {
  const drag = ref<DragState | null>(null);
  let pending: { from: number; x: number; y: number; scroll: number } | null = null;
  let rows: { top: number; bottom: number }[] = [];
  let listTop = 0;
  let pointer = { x: 0, y: 0 };
  let timer = 0;
  // an edge only scrolls after the pointer has been away from it: grabbing a row near the bottom must not scroll
  let armed = { up: false, down: false };

  function start(e: PointerEvent, index: number, onHandle: boolean) {
    if (e.button !== 0 || drag.value) return;
    if (e.pointerType === "touch" && !onHandle) return; // fingers scroll; the handle drags
    if ((e.target as HTMLElement).closest("[data-no-drag]")) return;
    pending = { from: index, x: e.clientX, y: e.clientY, scroll: scrollY };
    pointer = { x: e.clientX, y: e.clientY };
    addEventListener("pointermove", move);
    addEventListener("pointerup", end);
    addEventListener("pointercancel", cancel);
    addEventListener("keydown", key);
  }

  function activate() {
    const list = opts.list();
    if (!list || !pending) return;
    // positions in page coordinates, measured once: the list doesn't change shape while dragging
    rows = [...list.querySelectorAll<HTMLElement>("[data-row]")].map(r => { const b = r.getBoundingClientRect(); return { top: b.top + scrollY, bottom: b.bottom + scrollY }; });
    listTop = list.getBoundingClientRect().top + scrollY;
    drag.value = { from: pending.from, dy: 0, to: pending.from, line: 0, day: null };
    armed = { up: pending.y >= 150, down: pending.y <= innerHeight - 60 };
    document.documentElement.classList.add("is-dragging");
    timer = window.setInterval(tick, 16);
  }

  function update() {
    const d = drag.value;
    if (!d || !pending) return;
    d.dy = pointer.y - pending.y + (scrollY - pending.scroll);
    const y = pointer.y + scrollY;
    let to = rows.findIndex(r => y < (r.top + r.bottom) / 2);
    if (to < 0) to = rows.length;
    d.to = to;
    d.line = (to < rows.length ? rows[to].top - 4 : rows[rows.length - 1].bottom + 2) - listTop;
    const over = document.elementFromPoint(pointer.x, pointer.y)?.closest<HTMLElement>("[data-day-drop]");
    const day = over ? Number(over.dataset.dayDrop) : null;
    d.day = day !== null && day !== opts.currentDay() ? day : null;
  }

  // keep scrolling while the pointer rests near the top or bottom of the window
  function tick() {
    if (!drag.value) return;
    const top = 150, bottom = innerHeight - 60;
    if (pointer.y >= top) armed.up = true;
    if (pointer.y <= bottom) armed.down = true;
    const speed = pointer.y < top && armed.up ? -Math.min(24, (top - pointer.y) / 3) : pointer.y > bottom && armed.down ? Math.min(24, (pointer.y - bottom) / 2) : 0;
    if (speed) { scrollBy({ top: speed, behavior: "instant" as ScrollBehavior }); update(); }
  }

  function move(e: PointerEvent) {
    pointer = { x: e.clientX, y: e.clientY };
    if (!drag.value && pending && Math.hypot(e.clientX - pending.x, e.clientY - pending.y) > THRESHOLD) activate();
    if (drag.value) { e.preventDefault(); update(); }
  }

  function end() {
    const d = drag.value;
    stop();
    if (!d) return;
    // the release would also click the row; it was a drag, not a click
    addEventListener("click", swallow, { capture: true, once: true });
    setTimeout(() => removeEventListener("click", swallow, { capture: true }), 0);
    if (d.day !== null) opts.onMoveToDay(d.from, d.day);
    else {
      const to = d.to > d.from ? d.to - 1 : d.to;
      if (to !== d.from) opts.onMove(d.from, to);
    }
  }
  const swallow = (e: Event) => { e.stopPropagation(); e.preventDefault(); };
  function cancel() { stop(); }
  function key(e: KeyboardEvent) { if (e.key === "Escape" && drag.value) { e.preventDefault(); stop(); } }

  function stop() {
    pending = null;
    drag.value = null;
    clearInterval(timer);
    document.documentElement.classList.remove("is-dragging");
    removeEventListener("pointermove", move);
    removeEventListener("pointerup", end);
    removeEventListener("pointercancel", cancel);
    removeEventListener("keydown", key);
  }
  onBeforeUnmount(stop);

  return { drag, start };
}
