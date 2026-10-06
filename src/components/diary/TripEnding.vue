<script setup lang="ts">
/* The closing pages of a journal, ending with "End of Journal". */
import type { MediaAsset, TripEnding } from "@/types/content";
import { sanitizeInline } from "@/utils/sanitize";
import DiaryImage from "@/components/gallery/DiaryImage.vue";

defineProps<{ ending: TripEnding; title: string; year: string; endDate: string | null; media: Map<string, MediaAsset>; url: (a: MediaAsset, edge?: number) => string; srcset: (a: MediaAsset) => string }>();
const lines = (s: string[]) => s.map(sanitizeInline).join("<br>");
</script>

<template>
  <section id="ending" class="ending flow" data-mood="evening" aria-labelledby="ending-t">
    <h2 id="ending-t" :class="ending.heading ? 'sr-only' : 'ending-title'">{{ ending.heading || ending.title }}</h2>
    <p v-for="(s, i) in ending.prelude" :key="`p${i}`" class="stanza stanza--prelude" data-reveal v-html="lines(s)" />
    <p v-if="ending.heading && ending.title" class="ending-title" data-reveal>{{ ending.title }}</p>
    <p v-for="(s, i) in ending.stanzas" :key="`s${i}`" class="stanza" data-reveal v-html="lines(s)" />
    <p v-if="ending.signoff" class="signoff hand">{{ ending.signoff }}</p>
    <div v-if="ending.photo" class="ending-photo">
      <DiaryImage :data="{ item: ending.photo, layout: 'portrait', position: '', tone: '', reveal: '', besideCount: 3, text: [] }" :media="media" :url="url" :srcset="srcset" :day-date="endDate" />
    </div>
    <p class="end-mark"><span>End of Journal</span><span>{{ title }} · {{ year }}</span></p>
  </section>
</template>
