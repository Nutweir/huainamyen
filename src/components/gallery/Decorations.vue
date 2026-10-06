<script setup lang="ts">
/* Small taped prints beside an entry: in the margin on wide screens, a row under the entry elsewhere. */
import { computed } from "vue";
import type { Block, MediaAsset } from "@/types/content";
import { resolvePhoto, type ResolvedPhoto } from "@/utils/media";

const props = defineProps<{ items: Block<"decoration">[]; media: Map<string, MediaAsset>; url: (a: MediaAsset, edge?: number) => string }>();
const TILT = [3, -2.5, 2, -3.5];
const sides = computed(() => {
  const out: Record<"left" | "right", { p: ResolvedPhoto; tilt: number }[]> = { left: [], right: [] };
  props.items.forEach((b, n) => {
    const p = resolvePhoto(b.data.item, props.media);
    if (!p) return;
    const side = b.data.position === "left" || (b.data.position !== "right" && n % 2 === 1) ? "left" : "right";
    out[side].push({ p, tilt: p.rotation ?? TILT[n % TILT.length] });
  });
  return out;
});
</script>

<template>
  <template v-for="side in (['right', 'left'] as const)" :key="side">
    <div v-if="sides[side].length" :class="['decos', `decos--${side}`]">
      <figure v-for="(d, i) in sides[side]" :key="i" :class="['deco', d.p.size && `size-${d.p.size}`]" :style="{ '--tilt': `${d.tilt}deg` }">
        <img :src="url(d.p.asset, 500)" :alt="d.p.alt" :width="d.p.asset.width || undefined" :height="d.p.asset.height || undefined" loading="lazy" decoding="async">
        <figcaption v-if="d.p.caption" class="hand">{{ d.p.caption }}</figcaption>
      </figure>
    </div>
  </template>
</template>
