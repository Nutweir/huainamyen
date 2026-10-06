<script setup lang="ts">
/* One day: its opening page, then each timestamped moment in order. */
import { computed } from "vue";
import type { MediaAsset, TripDay } from "@/types/content";
import { groupDay } from "@/utils/story";
import { dateRange, isTime, pad2 } from "@/utils/format";
import { sanitizeInline } from "@/utils/sanitize";
import StoryUnits from "./StoryUnits.vue";
import Decorations from "@/components/gallery/Decorations.vue";

const props = defineProps<{ day: TripDay; media: Map<string, MediaAsset>; url: (a: MediaAsset, edge?: number) => string; srcset: (a: MediaAsset) => string; showSlots: boolean }>();
const grouped = computed(() => groupDay(props.day));
const id = computed(() => `day-${pad2(props.day.dayNumber)}`);
const lastMood = computed(() => grouped.value.sections.at(-1)?.mood || props.day.mood);
</script>

<template>
  <section :id="id" class="chapter" :aria-labelledby="`${id}-t`">
    <header class="chapter-open flow" :data-mood="day.mood">
      <h2 :id="`${id}-t`">
        <span class="chapter-day">Day {{ pad2(day.dayNumber) }}</span>
        <span v-if="day.route.length" class="chapter-route">
          <template v-for="(r, i) in day.route" :key="i"><span v-if="i" class="arrow" aria-label="ไป"> → </span>{{ r }}</template>
        </span>
      </h2>
      <p v-if="day.date" class="chapter-date"><time :datetime="day.date">{{ dateRange(day.date) }}</time></p>
      <StoryUnits :units="grouped.opening.units" :media="media" :url="url" :srcset="srcset" :day-date="day.date" :show-slots="showSlots" />
      <Decorations :items="grouped.opening.decorations" :media="media" :url="url" />
    </header>

    <section
      v-for="s in grouped.sections" :id="s.event!.data.anchor" :key="s.event!.id"
      class="event flow" :data-mood="s.mood" :aria-labelledby="`${s.event!.data.anchor}-t`"
    >
      <header :class="['event-head', s.event!.data.quietTitle && 'sr-only']">
        <time v-if="s.event!.data.time && isTime(s.event!.data.time)" class="time hand" :datetime="`${day.date}T${s.event!.data.time}`">{{ s.event!.data.time }}</time>
        <span v-else-if="s.event!.data.time" class="time hand">{{ s.event!.data.time }}</span>
        <h3 :id="`${s.event!.data.anchor}-t`" v-html="sanitizeInline(s.event!.data.title)" />
      </header>
      <StoryUnits :units="s.units" :media="media" :url="url" :srcset="srcset" :day-date="day.date" :show-slots="showSlots" />
      <Decorations :items="s.decorations" :media="media" :url="url" />
    </section>

    <footer v-if="day.closing" class="chapter-close flow" :data-mood="lastMood"><p class="mark">{{ day.closing }}</p></footer>
  </section>
</template>
