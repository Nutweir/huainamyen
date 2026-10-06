<script setup lang="ts">
/*
 * Photo viewer for everything with [data-lb] inside `root`: keyboard (← → Esc), swipe, caption,
 * the back-of-photo line, focus returns to the photo on close. Ported from the static site.
 */
import { onBeforeUnmount, onMounted, ref, watch } from "vue";

const props = defineProps<{ root: HTMLElement | null }>();
const dlg = ref<HTMLDialogElement | null>(null);
const src = ref(""), alt = ref(""), caption = ref(""), meta = ref(""), note = ref(""), count = ref("");
const missing = ref(false);
let group: HTMLElement[] = [], index = 0, opener: HTMLElement | null = null, x0: number | null = null;

function show(n: number) {
  index = (n + group.length) % group.length;
  const b = group[index];
  missing.value = false;
  src.value = b.dataset.lb || "";
  alt.value = b.querySelector("img")?.getAttribute("alt") || "";
  caption.value = b.dataset.lbCaption || "";
  meta.value = b.dataset.lbMeta || "";
  note.value = b.dataset.lbNote || "";
  count.value = group.length > 1 ? `${index + 1} / ${group.length}` : "";
}
function onClick(e: MouseEvent) {
  const b = (e.target as HTMLElement).closest<HTMLElement>("[data-lb]");
  if (!b || !props.root?.contains(b)) return;
  group = [...props.root.querySelectorAll<HTMLElement>(`[data-lb-group="${b.dataset.lbGroup}"]`)].filter(x => !x.closest("[data-dup]"));
  opener = group.find(x => x.dataset.lb === b.dataset.lb) || b;
  show(group.indexOf(opener));
  dlg.value?.showModal();
}
function onKey(e: KeyboardEvent) {
  if (e.key === "ArrowLeft") show(index - 1);
  if (e.key === "ArrowRight") show(index + 1);
}
function onBackdrop(e: MouseEvent) { if (e.target === dlg.value || (e.target as HTMLElement).tagName === "FIGURE") dlg.value?.close(); }
function onTouchStart(e: TouchEvent) { x0 = e.touches[0].clientX; }
function onTouchEnd(e: TouchEvent) {
  if (x0 === null) return;
  const dx = e.changedTouches[0].clientX - x0;
  if (Math.abs(dx) > 50) show(index + (dx < 0 ? 1 : -1));
  x0 = null;
}
function onClose() { src.value = ""; opener?.focus({ preventScroll: true }); }

watch(() => props.root, (el, old) => { old?.removeEventListener("click", onClick); el?.addEventListener("click", onClick); });
onMounted(() => props.root?.addEventListener("click", onClick));
onBeforeUnmount(() => props.root?.removeEventListener("click", onClick));
</script>

<template>
  <dialog ref="dlg" :class="['lightbox', count ? '' : 'is-single']" aria-label="ดูภาพขนาดใหญ่" @keydown="onKey" @click="onBackdrop" @touchstart.passive="onTouchStart" @touchend="onTouchEnd" @close="onClose">
    <figure>
      <img v-if="src" :src="src" :alt="alt" :class="{ 'is-missing': missing }" @error="missing = true">
      <figcaption>
        <span v-if="caption" class="hand lb-cap">{{ caption }}</span>
        <span v-if="meta" class="lb-meta">{{ meta }}</span>
        <span v-if="note" class="lb-note">{{ note }}</span>
      </figcaption>
    </figure>
    <button type="button" class="lb-btn lb-close" aria-label="ปิด" @click="dlg?.close()">×</button>
    <button type="button" class="lb-btn lb-prev" aria-label="ภาพก่อนหน้า" @click="show(index - 1)">‹</button>
    <button type="button" class="lb-btn lb-next" aria-label="ภาพถัดไป" @click="show(index + 1)">›</button>
    <p class="lb-count" aria-live="polite">{{ count }}</p>
  </dialog>
</template>
