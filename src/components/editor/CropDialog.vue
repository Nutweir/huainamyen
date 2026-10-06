<script setup lang="ts">
/*
 * Crop and rotate before upload. Drag the frame to move it, drag a corner to resize, arrow keys move it.
 * `src` is a displayable copy of the photo (for DNG: its decoded preview). The frame can lock to the layout's shape. The original file is never changed: the crop only applies
 * to the web copies; the untouched upload is kept in the originals bucket.
 */
import { computed, nextTick, ref } from "vue";
import type { Crop, Edit } from "@/services/files";

const props = defineProps<{ src: string; ratio?: [number, number] | null; advice?: string }>();
const emit = defineEmits<{ done: [Edit]; cancel: [] }>();

const dlg = ref<HTMLDialogElement | null>(null);
const img = ref<HTMLImageElement | null>(null);
const rotate = ref<0 | 90 | 180 | 270>(0);
const nat = ref({ w: 0, h: 0 });
const lock = ref<number | null>(props.ratio ? props.ratio[0] / props.ratio[1] : null);
const r = ref<Crop>({ x: 0, y: 0, w: 1, h: 1 });

// size of the photo after rotation
const rw = computed(() => (rotate.value % 180 ? nat.value.h : nat.value.w));
const rh = computed(() => (rotate.value % 180 ? nat.value.w : nat.value.h));
const px = computed(() => `${Math.round(r.value.w * rw.value)}×${Math.round(r.value.h * rh.value)} px`);

const choices = computed(() => [
  ...(props.ratio ? [{ label: `ตามรูปแบบ ${props.ratio.join(":")}`, v: props.ratio[0] / props.ratio[1] }] : []),
  { label: "อิสระ", v: null }, { label: "1:1", v: 1 }, { label: "4:5", v: 0.8 }, { label: "3:2", v: 1.5 }, { label: "16:9", v: 16 / 9 }, { label: "9:16", v: 9 / 16 },
]);

function fit() {
  let w = 1, h = 1;
  if (lock.value) { h = rw.value / lock.value / rh.value; if (h > 1) { h = 1; w = (rh.value * lock.value) / rw.value; } }
  r.value = { x: (1 - w) / 2, y: (1 - h) / 2, w, h };
}
function onLoad() { nat.value = { w: img.value!.naturalWidth, h: img.value!.naturalHeight }; fit(); }
function turn() { rotate.value = (((rotate.value + 90) % 360) as 0 | 90 | 180 | 270); nextTick(fit); }
function choose(v: number | null) { lock.value = v; fit(); }

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
let drag: { mode: string; x0: number; y0: number; r0: Crop; W: number; H: number } | null = null;
const stage = ref<HTMLElement | null>(null);
function down(e: PointerEvent) {
  e.preventDefault();
  try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* fine */ }
  const box = stage.value!.getBoundingClientRect();
  drag = { mode: (e.target as HTMLElement).dataset.h || "move", x0: e.clientX, y0: e.clientY, r0: { ...r.value }, W: box.width, H: box.height };
}
function move(e: PointerEvent) {
  if (!drag) return;
  const dx = (e.clientX - drag.x0) / drag.W, dy = (e.clientY - drag.y0) / drag.H, r0 = drag.r0, MIN = 0.06;
  if (drag.mode === "move") { r.value = { ...r0, x: clamp(r0.x + dx, 0, 1 - r0.w), y: clamp(r0.y + dy, 0, 1 - r0.h) }; return; }
  const left = drag.mode.includes("w"), top = drag.mode.includes("n");
  const ax = left ? r0.x + r0.w : r0.x, ay = top ? r0.y + r0.h : r0.y;
  let w = clamp(r0.w + (left ? -dx : dx), MIN, left ? ax : 1 - ax);
  let h = clamp(r0.h + (top ? -dy : dy), MIN, top ? ay : 1 - ay);
  if (lock.value) {
    const maxH = top ? ay : 1 - ay;
    h = (w * rw.value) / (lock.value * rh.value);
    if (h > maxH) { h = maxH; w = (h * rh.value * lock.value) / rw.value; }
    if (h < MIN) { h = MIN; w = (h * rh.value * lock.value) / rw.value; }
  }
  r.value = { x: left ? ax - w : ax, y: top ? ay - h : ay, w, h };
}
function key(e: KeyboardEvent) {
  const step = e.shiftKey ? 0.05 : 0.01;
  const d = ({ ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] } as Record<string, number[]>)[e.key];
  if (!d) return;
  e.preventDefault();
  r.value = { ...r.value, x: clamp(r.value.x + d[0], 0, 1 - r.value.w), y: clamp(r.value.y + d[1], 0, 1 - r.value.h) };
}
function finish() {
  const full = r.value.w > 0.995 && r.value.h > 0.995;
  emit("done", { crop: full ? null : { ...r.value }, rotate: rotate.value });
}
function cancel() { emit("cancel"); }
defineExpose({ open: () => dlg.value?.showModal() });
</script>

<template>
  <dialog ref="dlg" class="w-[min(760px,calc(100vw-24px))] rounded-xl border border-rule bg-white p-4 backdrop:bg-black/50" @cancel.prevent="cancel">
    <h2 class="font-display text-lg">ครอป / หมุนรูป</h2>
    <p v-if="advice" class="mt-1 border-l-2 border-forest bg-[#f1f5f0] px-3 py-1.5 text-sm">ขนาดที่แนะนำ: {{ advice }}</p>
    <div class="my-3 flex flex-wrap gap-1.5">
      <button v-for="c in choices" :key="c.label" type="button" class="chip border border-rule" :class="lock === c.v ? 'bg-ink text-white' : 'bg-white'" @click="choose(c.v)">{{ c.label }}</button>
      <button type="button" class="chip ml-auto border border-rule bg-white" @click="turn">หมุน 90°</button>
    </div>
    <div class="grid place-items-center rounded bg-[#1a1814] p-2">
      <div ref="stage" class="relative overflow-hidden" style="line-height:0;touch-action:none" :style="rotate % 180 ? { aspectRatio: `${nat.h} / ${nat.w}`, height: 'min(56dvh, 520px)' } : {}">
        <img
          ref="img" :src="src" alt="รูปที่กำลังครอป" class="pointer-events-none max-h-[min(56dvh,520px)] max-w-full select-none"
          :style="rotate % 180 ? { position: 'absolute', left: '50%', top: '50%', width: 'auto', height: `${(nat.w / nat.h) * 100}%`, maxHeight: 'none', transform: `translate(-50%,-50%) rotate(${rotate}deg)` } : { transform: `rotate(${rotate}deg)` }"
          @load="onLoad"
        >
        <div
          class="absolute cursor-move outline outline-[1.5px] outline-white" tabindex="0" role="slider" aria-label="กรอบครอป ลากเพื่อย้าย ลากมุมเพื่อย่อขยาย ใช้ปุ่มลูกศรเพื่อเลื่อน"
          :style="{ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%`, boxShadow: '0 0 0 9999px rgb(0 0 0 / .55)', touchAction: 'none' }"
          @pointerdown="down" @pointermove="move" @pointerup="drag = null" @pointercancel="drag = null" @keydown="key"
        >
          <span v-for="h in ['nw', 'ne', 'sw', 'se']" :key="h" :data-h="h" class="absolute size-6 border-white" :class="{ 'left-[-3px] top-[-3px] border-l-[3px] border-t-[3px] cursor-nwse-resize': h === 'nw', 'right-[-3px] top-[-3px] border-r-[3px] border-t-[3px] cursor-nesw-resize': h === 'ne', 'left-[-3px] bottom-[-3px] border-l-[3px] border-b-[3px] cursor-nesw-resize': h === 'sw', 'right-[-3px] bottom-[-3px] border-r-[3px] border-b-[3px] cursor-nwse-resize': h === 'se' }" />
        </div>
      </div>
    </div>
    <p class="mt-2 text-sm text-muted">{{ px }}</p>
    <div class="mt-3 flex gap-2">
      <button type="button" class="btn" @click="finish">ใช้ส่วนนี้</button>
      <button type="button" class="btn btn-ghost" @click="cancel">ยกเลิก</button>
    </div>
  </dialog>
</template>
