<script setup lang="ts">
/* Renders one story block. Every piece of HTML passes through sanitizeInline (defence in depth). */
import { computed } from "vue";
import type { Block, MediaAsset } from "@/types/content";
import { sanitizeInline, thaiNbsp } from "@/utils/sanitize";
import DiaryImage from "@/components/gallery/DiaryImage.vue";
import PhotoSet from "@/components/gallery/PhotoSet.vue";
import PhotoSlot from "@/components/gallery/PhotoSlot.vue";
import VideoClip from "@/components/gallery/VideoClip.vue";
import { seedOf } from "@/composables/useMedia";

const props = defineProps<{
  block: Block;
  media: Map<string, MediaAsset>;
  url: (a: MediaAsset, edge?: number) => string;
  srcset: (a: MediaAsset) => string;
  dayDate: string | null;
  showSlots: boolean;
}>();
const html = (s: string) => thaiNbsp(sanitizeInline(s));
const b = computed(() => props.block);
</script>

<template>
  <p v-if="b.type === 'paragraph'" v-html="html(b.data.html)" />
  <h4 v-else-if="b.type === 'heading'" class="story-heading" v-html="html(b.data.html)" />
  <p v-else-if="b.type === 'note'" class="note hand" v-html="html(b.data.html)" />
  <p v-else-if="b.type === 'thought'" :class="['thought', b.data.size && `thought--${b.data.size}`]" data-reveal v-html="html(b.data.html)" />
  <figure v-else-if="b.type === 'quote'" class="said" data-reveal>
    <blockquote><p v-html="html(b.data.html)" /></blockquote>
    <figcaption v-if="b.data.by">— {{ b.data.by }}</figcaption>
  </figure>
  <div v-else-if="b.type === 'dialogue'" class="dialogue">
    <p v-for="(l, i) in b.data.lines" :key="i"><span class="who">{{ l.who }}</span><span class="line">“{{ l.line }}”</span></p>
  </div>
  <p v-else-if="b.type === 'verse'" class="verse" v-html="b.data.lines.map(html).join('<br>')" />
  <div v-else-if="b.type === 'letter'" class="letter" data-reveal>
    <p v-if="b.data.lead" class="letter-lead">{{ b.data.lead }}</p>
    <p v-for="(l, i) in b.data.lines" :key="i" class="hand">{{ l }}</p>
  </div>
  <p v-else-if="b.type === 'pause'" class="pause">{{ b.data.text }}</p>
  <p v-else-if="b.type === 'mark'" class="mark">{{ b.data.text }}</p>
  <div v-else-if="b.type === 'spacer'" :class="['spacer', `spacer--${b.data.size}`]" aria-hidden="true" />
  <p v-else-if="b.type === 'stamp'" class="stamp" :aria-label="`${b.data.value} ${b.data.label} ${b.data.sub}`">
    <b>{{ b.data.value }}</b><span>{{ b.data.label }}</span><small v-if="b.data.sub">{{ b.data.sub }}</small>
  </p>
  <DiaryImage v-else-if="b.type === 'image'" :data="b.data" :media="media" :url="url" :srcset="srcset" :day-date="dayDate" :seed="seedOf(b.id)" />
  <PhotoSet v-else-if="b.type === 'images'" :data="b.data" :media="media" :url="url" :srcset="srcset" :day-date="dayDate" :show-slots="showSlots" />
  <PhotoSlot v-else-if="b.type === 'placeholder' && showSlots" :label="b.data.label" :layout="b.data.layout" :position="b.data.position" />
  <VideoClip v-else-if="b.type === 'video'" :data="b.data" :media="media" :url="url" />
</template>
