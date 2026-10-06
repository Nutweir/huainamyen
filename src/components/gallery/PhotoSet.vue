<script setup lang="ts">
/* Several photos arranged together: two-column, collage, memory-stack, film-strip or gallery. */
import { computed } from "vue";
import type { BlockDataMap, MediaAsset, MediaRef, SetLayout } from "@/types/content";
import { isPlaceholder } from "@/types/content";
import { SET_PRESETS, autoSetLayout, backOfPhoto, resolvePhoto, type ResolvedPhoto } from "@/utils/media";
import { sanitizeInline } from "@/utils/sanitize";
import DiaryImage from "./DiaryImage.vue";
import PhotoCell from "./PhotoCell.vue";

const props = defineProps<{
  data: BlockDataMap["images"];
  media: Map<string, MediaAsset>;
  url: (a: MediaAsset, edge?: number) => string;
  srcset: (a: MediaAsset) => string;
  dayDate: string | null;
  showSlots: boolean;
}>();

type Cell = { kind: "photo"; photo: ResolvedPhoto; ref: MediaRef } | { kind: "slot"; label: string };
const cells = computed<Cell[]>(() => props.data.items.flatMap((x): Cell[] => {
  if (isPlaceholder(x)) return props.showSlots ? [{ kind: "slot", label: x.placeholder }] : [];
  const p = resolvePhoto(x, props.media);
  return p ? [{ kind: "photo", photo: p, ref: x }] : [];
}));
const photos = computed(() => cells.value.filter((c): c is Extract<Cell, { kind: "photo" }> => c.kind === "photo"));
const layout = computed<SetLayout>(() => {
  const n = cells.value.length;
  let l = (props.data.layout || autoSetLayout(n)) as SetLayout;
  if (l === "collage" && n === 2) l = "two-column";
  if (l === "collage" && n > 4) l = "gallery";
  return l;
});
const preset = computed(() => SET_PRESETS[layout.value]);
// One photo left (others hidden or missing): show it on its own instead of a lonely grid cell.
const single = computed(() => (cells.value.length === 1 && photos.value.length === 1 && layout.value !== "film-strip" ? photos.value[0] : null));
const singleLayout = computed(() => (single.value && single.value.photo.asset.width > single.value.photo.asset.height ? "wide" : "portrait"));
const caption = computed(() => sanitizeInline(props.data.caption || ""));
const tiltFor = (i: number, p: ResolvedPhoto) => (layout.value === "memory-stack" ? p.rotation ?? preset.value.tilt![i % preset.value.tilt!.length] : p.rotation);
const cellStyle = (i: number, p: ResolvedPhoto) => { const t = tiltFor(i, p); return t != null ? { "--tilt": `${t}deg` } : undefined; };
const lbMeta = (p: ResolvedPhoto) => [backOfPhoto(p, props.dayDate), p.camera].filter(Boolean).join(" · ");
</script>

<template>
  <DiaryImage
    v-if="single"
    :data="{ item: { ...single.ref, ...(data.caption ? { caption: data.caption } : {}) }, layout: singleLayout, position: '', tone: '', reveal: '', besideCount: 3, text: [] }"
    :media="media" :url="url" :srcset="srcset" :day-date="dayDate"
  />
  <figure v-else-if="cells.length" :class="['set', `set--${layout}`, `set--n${Math.min(cells.length, 4)}`, photos.length === 0 && 'set--empty', data.position && `ph--${data.position}`]" data-reveal>
    <div v-if="layout === 'film-strip'" class="strip strip--inline" tabindex="0" role="region" :aria-label="data.caption || 'ภาพชุด'">
      <ol>
        <li v-for="(c, i) in cells" :key="i" :class="c.kind === 'photo' ? 'set-item' : undefined">
          <div v-if="c.kind === 'slot'" class="slot"><span class="slot-label">ยังไม่ได้แปะรูป</span><span class="hand">{{ c.label }}</span></div>
          <PhotoCell v-else :photo="c.photo" :url="url" :srcset="srcset" :sizes="preset.sizes" :meta="lbMeta(c.photo)" />
        </li>
      </ol>
    </div>
    <div v-else class="set-grid">
      <template v-for="(c, i) in cells" :key="i">
        <div v-if="c.kind === 'slot'" class="slot"><span class="slot-label">ยังไม่ได้แปะรูป</span><span class="hand">{{ c.label }}</span></div>
        <div v-else class="set-item" :style="cellStyle(i, c.photo)">
          <PhotoCell :photo="c.photo" :url="url" :srcset="srcset" :sizes="preset.sizes" :meta="lbMeta(c.photo)" />
          <span v-if="layout === 'two-column' && c.photo.caption" class="set-cap" v-html="sanitizeInline(c.photo.caption)" />
        </div>
      </template>
    </div>
    <figcaption v-if="caption" class="hand" v-html="caption" />
  </figure>
</template>
