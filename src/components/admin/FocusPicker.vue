<script setup lang="ts">
/*
 * Click the part of the photo that matters (a face, the waterfall). Layouts that crop the photo
 * (square, 4:5, wide) keep that point in frame. Stored as a CSS position, e.g. "42% 30%".
 */
import { computed } from "vue";

defineProps<{ src: string; alt: string }>();
const focus = defineModel<string | null>({ required: true });
const point = computed(() => {
  const m = (focus.value || "").match(/^([\d.]+)%\s+([\d.]+)%$/);
  return m ? { x: Number(m[1]), y: Number(m[2]) } : null;
});
function pick(e: MouseEvent) {
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
  const x = Math.round(((e.clientX - r.left) / r.width) * 100), y = Math.round(((e.clientY - r.top) / r.height) * 100);
  focus.value = `${Math.min(100, Math.max(0, x))}% ${Math.min(100, Math.max(0, y))}%`;
}
function nudge(e: KeyboardEvent) {
  const p = point.value || { x: 50, y: 50 };
  const d = ({ ArrowLeft: [-2, 0], ArrowRight: [2, 0], ArrowUp: [0, -2], ArrowDown: [0, 2] } as Record<string, number[]>)[e.key];
  if (!d) return;
  e.preventDefault();
  focus.value = `${Math.min(100, Math.max(0, p.x + d[0]))}% ${Math.min(100, Math.max(0, p.y + d[1]))}%`;
}
const SHAPES = [["1 / 1", "จัตุรัส"], ["4 / 5", "แนวตั้ง"], ["16 / 9", "กว้าง"]] as const;
</script>

<template>
  <div>
    <div
      class="relative cursor-crosshair overflow-hidden rounded" tabindex="0" role="slider"
      :aria-label="`จุดสำคัญของรูป ${focus || 'กึ่งกลาง'} คลิกหรือใช้ปุ่มลูกศรเพื่อย้าย`" :aria-valuetext="focus || 'กึ่งกลาง'"
      @click="pick" @keydown="nudge"
    >
      <img :src="src" :alt="alt" class="block w-full" draggable="false">
      <span v-if="point" class="pointer-events-none absolute size-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_2px_rgb(0_0_0/.45)]" :style="{ left: `${point.x}%`, top: `${point.y}%` }" aria-hidden="true" />
    </div>
    <div class="mt-2 flex items-end gap-2">
      <figure v-for="[ratio, label] in SHAPES" :key="ratio" class="w-1/4">
        <img :src="src" alt="" class="w-full rounded object-cover" :style="{ aspectRatio: ratio, objectPosition: focus || '50% 50%' }">
        <figcaption class="text-center text-[11px] text-muted">{{ label }}</figcaption>
      </figure>
      <button v-if="focus" type="button" class="btn btn-ghost ml-auto min-h-8 px-3" @click="focus = null">กึ่งกลาง</button>
    </div>
  </div>
</template>
