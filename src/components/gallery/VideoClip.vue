<script setup lang="ts">
/* A clip in the story. It starts muted when scrolled into view (see useDiaryBehaviour); the poster loads when near. */
import { computed, ref, watchEffect } from "vue";
import type { BlockDataMap, MediaAsset } from "@/types/content";

const props = defineProps<{ data: BlockDataMap["video"]; media: Map<string, MediaAsset>; url: (a: MediaAsset, edge?: number) => string }>();
const clip = computed(() => props.media.get(props.data.mediaId) || null);
const poster = computed(() => (clip.value?.posterId ? props.media.get(clip.value.posterId) || null : null));
const src = computed(() => (clip.value ? props.url(clip.value) : ""));
const type = computed(() => (/\.webm$/i.test(clip.value?.path || "") ? "video/webm" : /\.mov$/i.test(clip.value?.path || "") ? undefined : "video/mp4"));
const caption = computed(() => props.data.caption || clip.value?.caption || "");
const label = computed(() => props.data.label || clip.value?.alt || caption.value || "วิดีโอ");
// Vue sets `muted` only as a property; iPhone Safari's autoplay rule looks at the attribute
const el = ref<HTMLVideoElement | null>(null);
watchEffect(() => { if (el.value) { el.value.defaultMuted = true; el.value.muted = true; el.value.setAttribute("muted", ""); } });
</script>

<template>
  <figure v-if="clip" class="ph ph--video" data-reveal>
    <video
      ref="el" controls muted loop playsinline preload="none"
      :data-poster="poster ? url(poster) : undefined"
      :width="clip.width || 540" :height="clip.height || 960" :aria-label="label"
    >
      <source :src="src" :type="type">
      เบราว์เซอร์นี้เล่นวิดีโอไม่ได้ <a :href="src">เปิดคลิป</a>
    </video>
    <figcaption>
      <span v-if="caption" class="hand">{{ caption }}</span>
      <a class="ph-dl" :href="src" download>ดาวน์โหลดคลิป</a>
    </figcaption>
  </figure>
</template>
