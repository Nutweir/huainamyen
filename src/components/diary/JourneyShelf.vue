<script setup lang="ts">
/* Trips grouped by year, like volumes on a shelf. */
import { computed } from "vue";
import type { TripSummary } from "@/types/content";
import { useBackend } from "@/services";
import { dateRange, yearOf } from "@/utils/format";

const props = defineProps<{ trips: TripSummary[] }>();
const { repo } = useBackend();
const years = computed(() => {
  const by = new Map<string, TripSummary[]>();
  for (const t of [...props.trips].sort((a, b) => (b.startDate || "").localeCompare(a.startDate || ""))) {
    const y = yearOf(t.startDate) || "—";
    by.set(y, [...(by.get(y) || []), t]);
  }
  return [...by.entries()];
});
</script>

<template>
  <section v-for="[year, list] in years" :key="year" class="shelf flow" :aria-labelledby="`y-${year}`">
    <h2 :id="`y-${year}`" class="shelf-year">{{ year }}</h2>
    <ol class="shelf-list">
      <li v-for="t in list" :key="t.id">
        <RouterLink class="volume" :to="`/journeys/${t.slug}`">
          <span class="volume-photo">
            <img v-if="t.cover" :src="repo.mediaUrl(t.cover, 500)" alt="" :width="t.cover.width || undefined" :height="t.cover.height || undefined" loading="lazy" decoding="async" :style="t.cover.focus ? { objectPosition: t.cover.focus } : undefined">
          </span>
          <span class="volume-text">
            <span class="volume-date">{{ dateRange(t.startDate, t.endDate, true) }}</span>
            <span class="volume-title">{{ t.title }}</span>
            <span class="volume-place">{{ t.location }}</span>
            <span class="volume-line">{{ t.summary }}</span>
          </span>
        </RouterLink>
      </li>
    </ol>
  </section>
</template>
