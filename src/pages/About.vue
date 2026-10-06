<script setup lang="ts">
/* /about — the author, written from the admin (Site settings). */
import { computed, onMounted, ref } from "vue";
import type { SiteSettings } from "@/types/content";
import { useBackend } from "@/services";
import { sanitizeNotes } from "@/utils/sanitize";
import { usePageMeta, siteUrl } from "@/composables/usePageMeta";

const { repo } = useBackend();
const site = ref<SiteSettings | null>(null);
onMounted(async () => { site.value = await repo.getSite(); });
const about = computed(() => sanitizeNotes(site.value?.aboutHtml || ""));
usePageMeta(computed(() => ({ title: `เกี่ยวกับผู้เขียน · ${site.value?.title || "Journeys by Nutweir"}`, canonical: siteUrl("about") })));
</script>

<template>
  <main id="journal" tabindex="-1">
    <header class="shelf-head flow" data-mood="morning">
      <p class="kicker">About</p>
      <h1>{{ site?.author || "Nutweir" }}</h1>
    </header>
    <section class="flow about-body" data-mood="morning">
      <div v-if="about" v-html="about" />
      <p v-else class="shelf-lede">ยังไม่ได้เขียนส่วนนี้ (แก้ได้ที่หน้าแอดมิน → การตั้งค่าเว็บไซต์)</p>
      <p class="shelf-lede"><RouterLink to="/journeys">← บันทึกการเดินทางทั้งหมด</RouterLink></p>
    </section>
  </main>
</template>
