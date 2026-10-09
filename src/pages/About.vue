<script setup lang="ts">
/*
 * /about — the author, written in the admin (เกี่ยวกับผู้เขียน).
 * Embedded (?embed, the admin's live preview): shows the unsaved draft the editor sends by postMessage.
 */
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import type { SiteSettings } from "@/types/content";
import { useBackend } from "@/services";
import { safeHref, sanitizeNotes } from "@/utils/sanitize";
import { usePageMeta, siteUrl } from "@/composables/usePageMeta";

const { repo } = useBackend();
const route = useRoute();
const embed = route.query.embed !== undefined;
const site = ref<SiteSettings | null>(null);

function onMessage(e: MessageEvent) {
  if (e.origin !== location.origin || e.source !== window.parent) return;
  const m = e.data as { type?: string; site?: string };
  if (m?.type === "journeys-site-draft" && m.site) site.value = JSON.parse(m.site) as SiteSettings;
}
// in the preview, links stay put
const stay = (e: MouseEvent) => { if ((e.target as HTMLElement).closest("a")) e.preventDefault(); };
onMounted(async () => {
  if (embed) {
    addEventListener("message", onMessage);
    addEventListener("click", stay, true);
    window.parent.postMessage({ type: "journeys-preview-ready" }, location.origin);
  } else site.value = await repo.getSite();
});
onBeforeUnmount(() => { removeEventListener("message", onMessage); removeEventListener("click", stay, true); });

const about = computed(() => sanitizeNotes(site.value?.aboutHtml || ""));
const links = computed(() => (site.value?.links || []).map(l => ({ label: l.label, href: safeHref(l.url) })).filter(l => l.label && l.href));
const photo = computed(() => site.value?.photo || null);
const photoUrl = computed(() => (photo.value ? repo.mediaUrl(photo.value, 1000) : ""));
usePageMeta(computed(() => ({ title: `เกี่ยวกับผู้เขียน · ${site.value?.title || "Journeys by Nutweir"}`, canonical: siteUrl("about") })));
</script>

<template>
  <main id="journal" tabindex="-1">
    <header class="shelf-head flow" data-mood="morning">
      <p class="kicker">About</p>
      <h1>{{ site?.author || "Nutweir" }}</h1>
    </header>
    <section class="flow about-body" data-mood="morning">
      <!-- one block, so the photo can float beside the text inside the reading column -->
      <div class="about-main">
        <figure v-if="photo" class="about-photo">
          <img :src="photoUrl" :alt="photo.alt || site?.author || ''" :width="photo.width || undefined" :height="photo.height || undefined" :style="photo.focus ? { objectPosition: photo.focus } : undefined">
        </figure>
        <div v-if="about" class="about-text" v-html="about" />
        <p v-else-if="site" class="shelf-lede">เร็ว ๆ นี้</p>
      </div>
      <ul v-if="links.length" class="about-links">
        <li v-for="l in links" :key="l.href"><a :href="l.href" target="_blank" rel="noopener">{{ l.label }} ↗</a></li>
      </ul>
      <p class="shelf-lede"><RouterLink to="/journeys">← บันทึกการเดินทางทั้งหมด</RouterLink></p>
    </section>
  </main>
</template>
