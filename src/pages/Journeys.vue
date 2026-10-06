<script setup lang="ts">
/* /journeys — every published journal, newest first, grouped by year. */
import { onMounted, ref } from "vue";
import type { TripSummary } from "@/types/content";
import { useBackend } from "@/services";
import JourneyShelf from "@/components/diary/JourneyShelf.vue";
import { usePageMeta, siteUrl } from "@/composables/usePageMeta";

const { repo } = useBackend();
const trips = ref<TripSummary[]>([]);
const loaded = ref(false);
onMounted(async () => { trips.value = await repo.listPublished(); loaded.value = true; });
usePageMeta(ref({ title: "My Journeys · บันทึกการเดินทาง", description: "ความทรงจำจากการเดินทาง เก็บไว้อ่านอีกครั้งในวันข้างหน้า", canonical: siteUrl("journeys") }));
</script>

<template>
  <main id="journal" tabindex="-1">
    <header class="shelf-head flow" data-mood="morning">
      <p class="kicker">My Journeys</p>
      <h1>บันทึกการเดินทาง</h1>
      <p class="shelf-lede">ความทรงจำจากการเดินทาง เก็บไว้อ่านอีกครั้งในวันข้างหน้า</p>
    </header>
    <JourneyShelf :trips="trips" />
    <p v-if="loaded && !trips.length" class="shelf-lede flow">ยังไม่มีบันทึกที่เผยแพร่</p>
  </main>
</template>
