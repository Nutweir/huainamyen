<script setup lang="ts">
/* A photo inside a set: opens in the lightbox unless the author turned that off. */
import type { MediaAsset } from "@/types/content";
import type { ResolvedPhoto } from "@/utils/media";

defineProps<{ photo: ResolvedPhoto; url: (a: MediaAsset, edge?: number) => string; srcset: (a: MediaAsset) => string; sizes: string; meta: string }>();
</script>

<template>
  <button
    v-if="photo.expandable !== false" type="button" class="ph-open"
    :data-lb="url(photo.asset)" data-lb-group="story" :data-lb-caption="photo.caption"
    :data-lb-meta="meta" :data-lb-note="photo.note" :aria-label="`ขยายภาพ: ${photo.alt || photo.caption}`"
  >
    <img
      :src="url(photo.asset)" :srcset="srcset(photo.asset) || undefined" :sizes="srcset(photo.asset) ? sizes : undefined"
      :alt="photo.alt" :width="photo.asset.width || undefined" :height="photo.asset.height || undefined"
      loading="lazy" decoding="async" :style="photo.focus ? { objectPosition: photo.focus } : undefined"
    >
  </button>
  <img
    v-else :src="url(photo.asset)" :srcset="srcset(photo.asset) || undefined" :sizes="srcset(photo.asset) ? sizes : undefined"
    :alt="photo.alt" :width="photo.asset.width || undefined" :height="photo.asset.height || undefined" loading="lazy" decoding="async"
  >
</template>
