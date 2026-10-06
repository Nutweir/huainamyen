<script setup lang="ts">
/* "/" — Journeys by Nutweir: the latest journal first, then the shelf. */
import { computed, onMounted, ref } from "vue";
import type { SiteSettings, TripSummary } from "@/types/content";
import { useBackend } from "@/services";
import JourneyShelf from "@/components/diary/JourneyShelf.vue";
import { usePageMeta, siteUrl } from "@/composables/usePageMeta";
import { dateRange } from "@/utils/format";

const { repo } = useBackend();
const trips = ref<TripSummary[]>([]);
const site = ref<SiteSettings | null>(null);
const loaded = ref(false);
onMounted(async () => {
  [trips.value, site.value] = await Promise.all([repo.listPublished(), repo.getSite()]);
  loaded.value = true;
});
const latest = computed(() => trips.value[0] || null);
usePageMeta(computed(() => ({ title: site.value?.title || "Journeys by Nutweir", description: site.value?.tagline, canonical: siteUrl("") })));
</script>

<template>
  <main id="journal" class="home" tabindex="-1">
    <header class="shelf-head flow" data-mood="morning">
      <p class="kicker">Journeys by Nutweir</p>
      <h1>บันทึกการเดินทาง</h1>
      <p class="shelf-lede">{{ site?.tagline || "ความทรงจำจากการเดินทาง เก็บไว้อ่านอีกครั้งในวันข้างหน้า" }}</p>
      <p class="shelf-lede home-links"><RouterLink to="/journeys">ทุกการเดินทาง →</RouterLink> · <RouterLink to="/about">เกี่ยวกับผู้เขียน</RouterLink></p>
    </header>

    <section v-if="latest" class="home-latest flow" aria-labelledby="latest-t" data-mood="morning">
      <h2 id="latest-t" class="kicker">ล่าสุด</h2>
      <RouterLink class="home-card" :to="`/journeys/${latest.slug}`">
        <img v-if="latest.cover" :src="repo.mediaUrl(latest.cover, 1000)" :alt="latest.cover.alt" :width="latest.cover.width || undefined" :height="latest.cover.height || undefined" fetchpriority="high" decoding="async">
        <span class="home-card-text">
          <span class="volume-date">{{ dateRange(latest.startDate, latest.endDate) }}</span>
          <span class="home-card-title">{{ latest.title }}</span>
          <span class="volume-place">{{ latest.location }}</span>
          <span class="volume-line">{{ latest.summary }}</span>
          <span class="cover-begin">อ่านบันทึก <span aria-hidden="true">→</span></span>
        </span>
      </RouterLink>
    </section>

    <JourneyShelf v-if="trips.length > 1" :trips="trips" />
    <p v-if="loaded && !trips.length" class="shelf-lede flow">ยังไม่มีบันทึกที่เผยแพร่</p>
  </main>
</template>

<style scoped>
.home-latest { padding: 1rem 0 4rem; }
.home-card { grid-column: wide; display: grid; gap: 1.5rem; color: var(--ink); text-decoration: none; }
.home-card img { width: 100%; height: auto; aspect-ratio: 4 / 5; object-fit: cover; box-shadow: 0 1px 2px rgb(0 0 0 / .12), 0 18px 40px -24px rgb(0 0 0 / .45); }
.home-card-text { display: grid; gap: .35rem; align-content: center; }
.home-card-title { font-family: var(--f-latin); font-size: clamp(2.4rem, 8vw, 4rem); line-height: 1; letter-spacing: .05em; text-transform: uppercase; margin: .4rem 0; }
.home-card .cover-begin { justify-self: start; margin-top: 1rem; }
@media (min-width: 900px) {
  .home-card { grid-template-columns: minmax(0, 420px) 1fr; gap: 3.5rem; align-items: center; }
}
</style>
