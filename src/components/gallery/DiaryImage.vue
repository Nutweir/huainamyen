<script setup lang="ts">
/* One photo in the story, in one of the layout presets (hero, full, spotlight, wide, polaroid…). */
import { computed } from "vue";
import type { BlockDataMap, ImageLayout, MediaAsset } from "@/types/content";
import { IMAGE_PRESETS, autoLayout, backOfPhoto, resolvePhoto } from "@/utils/media";
import { sanitizeInline, thaiNbsp } from "@/utils/sanitize";

const props = defineProps<{
  data: BlockDataMap["image"];
  media: Map<string, MediaAsset>;
  url: (a: MediaAsset, edge?: number) => string;
  srcset: (a: MediaAsset) => string;
  dayDate: string | null;
  seed?: number;
  group?: string;
  priority?: boolean;
}>();

const photo = computed(() => resolvePhoto(props.data.item, props.media));
const layout = computed<ImageLayout>(() => (props.data.layout || autoLayout(photo.value?.asset || null)) as ImageLayout);
const preset = computed(() => IMAGE_PRESETS[layout.value] || IMAGE_PRESETS.inline);
const tilt = computed(() => photo.value?.rotation ?? (preset.value.tilt ? preset.value.tilt[(props.seed || 0) % preset.value.tilt.length] : null));
const back = computed(() => (photo.value ? backOfPhoto(photo.value, props.dayDate) : ""));
const expandable = computed(() => (photo.value?.expandable ?? preset.value.expandable ?? true));
const lbMeta = computed(() => [back.value, photo.value?.camera].filter(Boolean).join(" · "));
const classes = computed(() => [
  "ph", `ph--${layout.value}`, photo.value?.size && `size-${photo.value.size}`, props.data.tone && `tone-${props.data.tone}`,
  props.data.position && `ph--${props.data.position}`,
].filter(Boolean));
const style = computed(() => {
  const a = photo.value?.asset;
  const s: Record<string, string> = {};
  if (a?.width) s["--r"] = (a.height / a.width).toFixed(4);
  if (a?.width && layout.value === "full") s["--maxw"] = `${Math.round(a.width * 1.25)}px`;
  if (tilt.value != null) s["--tilt"] = `${tilt.value}deg`;
  return s;
});
const imgStyle = computed(() => {
  const p = photo.value;
  const s: Record<string, string> = {};
  if (p?.focus) s.objectPosition = p.focus;
  if (p?.aspectRatio) { s.aspectRatio = p.aspectRatio; s.objectFit = "cover"; }
  return s;
});
const caption = computed(() => thaiNbsp(sanitizeInline(photo.value?.caption || "")));
const overlay = computed(() => props.data.text.map(sanitizeInline).join("<br>"));
</script>

<template>
  <figure v-if="photo" :class="classes" :style="style" :data-reveal="data.reveal || ''">
    <component
      :is="expandable ? 'button' : 'div'"
      :type="expandable ? 'button' : undefined"
      :class="expandable ? 'ph-open' : undefined"
      :data-lb="expandable ? url(photo.asset) : undefined"
      :data-lb-group="expandable ? (group || 'story') : undefined"
      :data-lb-caption="expandable ? photo.caption : undefined"
      :data-lb-meta="expandable ? lbMeta : undefined"
      :data-lb-note="expandable ? photo.note : undefined"
      :aria-label="expandable ? `ขยายภาพ: ${photo.alt || photo.caption}` : undefined"
    >
      <img
        :src="url(photo.asset)"
        :srcset="srcset(photo.asset) || undefined"
        :sizes="srcset(photo.asset) ? preset.sizes : undefined"
        :alt="photo.alt"
        :width="photo.asset.width || undefined"
        :height="photo.asset.height || undefined"
        :loading="priority || preset.priority ? 'eager' : 'lazy'"
        :fetchpriority="priority || preset.priority ? 'high' : undefined"
        decoding="async"
        :style="imgStyle"
      >
    </component>
    <p v-if="layout === 'background' && overlay" class="bg-text" v-html="overlay" />
    <figcaption v-if="layout !== 'background' && (caption || back)">
      <span v-if="caption" class="hand" v-html="caption" />
      <span v-if="back" class="ph-meta">{{ back }}</span>
    </figcaption>
  </figure>
</template>
