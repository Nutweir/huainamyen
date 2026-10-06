<script setup lang="ts">
/* The journal's cover page. */
import { computed } from "vue";
import type { MediaAsset, Trip } from "@/types/content";
import { dateRange } from "@/utils/format";

const props = defineProps<{ trip: Trip; firstDayId: string; mood: string; media: Map<string, MediaAsset>; url: (a: MediaAsset, edge?: number) => string; srcset: (a: MediaAsset) => string }>();
const cover = computed(() => (props.trip.coverId ? props.media.get(props.trip.coverId) || null : null));
</script>

<template>
  <header id="top" class="cover" :data-mood="mood">
    <div class="cover-text">
      <p class="kicker">Travel Journal</p>
      <h1 class="cover-title">{{ trip.title }}</h1>
      <p v-if="trip.location" class="cover-place">{{ trip.location }}</p>
      <p class="cover-date">
        <time :datetime="trip.startDate">{{ dateRange(trip.startDate, trip.endDate) }}</time>
        <template v-if="trip.durationLabel"><span class="sep" aria-hidden="true">·</span>{{ trip.durationLabel }}</template>
      </p>
      <p v-if="trip.epigraph.length" class="cover-epigraph"><template v-for="(l, i) in trip.epigraph" :key="i"><br v-if="i">{{ l }}</template></p>
      <a class="cover-begin" :href="`#${firstDayId}`">บันทึกการเดินทาง <span aria-hidden="true">↓</span></a>
    </div>
    <figure class="cover-photo">
      <button v-if="cover" type="button" class="ph-open" :data-lb="url(cover)" data-lb-group="cover" :aria-label="`ขยายภาพ: ${cover.alt}`">
        <img
          :src="url(cover)" :srcset="srcset(cover) || undefined" sizes="(min-width: 900px) 420px, 100vw"
          :alt="cover.alt" :width="cover.width || undefined" :height="cover.height || undefined" fetchpriority="high" decoding="async"
          :style="cover.focus ? { objectPosition: cover.focus } : undefined"
        >
      </button>
      <dl v-if="trip.coverMeta.length" class="cover-meta">
        <div v-for="([k, v], i) in trip.coverMeta" :key="i"><dt>{{ k }}</dt><dd>{{ v }}</dd></div>
      </dl>
    </figure>
  </header>
</template>
