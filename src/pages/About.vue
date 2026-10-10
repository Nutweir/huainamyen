<script setup lang="ts">
/*
 * /about — the author, written in the admin (เกี่ยวกับผู้เขียน), laid out like a page of the journal:
 * name and a handwritten line, a taped-on print, the story signed by hand, stamps counted from the
 * published trips, links as tickets and the latest journals.
 * Embedded (?embed, the admin's live preview): shows the unsaved draft the editor sends by postMessage.
 */
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import type { SiteSettings, TripSummary } from "@/types/content";
import { useBackend } from "@/services";
import { safeHref, sanitizeNotes } from "@/utils/sanitize";
import { yearOf } from "@/utils/format";
import { usePageMeta, siteUrl } from "@/composables/usePageMeta";
import JourneyShelf from "@/components/diary/JourneyShelf.vue";
import SocialIcon from "@/components/diary/SocialIcon.vue";
import { detectPlatform, platformById } from "@/utils/social";

const { repo } = useBackend();
const route = useRoute();
const embed = route.query.embed !== undefined;
const site = ref<SiteSettings | null>(null);
let gotDraft = false;
const trips = ref<TripSummary[]>([]);

function onMessage(e: MessageEvent) {
  if (e.origin !== location.origin || e.source !== window.parent) return;
  const m = e.data as { type?: string; site?: string };
  if (m?.type === "journeys-site-draft" && m.site) { gotDraft = true; site.value = JSON.parse(m.site) as SiteSettings; }
}
// in the preview, links stay put
const stay = (e: MouseEvent) => { if ((e.target as HTMLElement).closest("a")) e.preventDefault(); };
onMounted(async () => {
  void repo.listPublished().then(t => { trips.value = t; }).catch(() => undefined);
  if (embed) {
    addEventListener("message", onMessage);
    addEventListener("click", stay, true);
    window.parent.postMessage({ type: "journeys-preview-ready" }, location.origin);
  }
  // the saved page first (also when ?embed is opened on its own); an editor's draft replaces it
  const saved = await repo.getSite().catch(() => null);
  if (!gotDraft && saved) site.value = saved;
});
onBeforeUnmount(() => { removeEventListener("message", onMessage); removeEventListener("click", stay, true); });

const name = computed(() => site.value?.author || "Nutweir");
// first paragraph reads as the lead; the rest as the letter
const paragraphs = computed(() => (sanitizeNotes(site.value?.aboutHtml || "").match(/<p[\s>][\s\S]*?<\/p>/g) || [])); // paragraphs may carry style classes
const lead = computed(() => paragraphs.value[0] || "");
const rest = computed(() => paragraphs.value.slice(1).join(""));
const facts = computed(() => (site.value?.facts || []).filter(([k, v]) => k.trim() && v.trim()));
const photo = computed(() => site.value?.photo || null);
const photoUrl = computed(() => (photo.value ? repo.mediaUrl(photo.value, 1000) : ""));

// each link with its platform's mark (older links: worked out from the address)
const links = computed(() => (site.value?.links || [])
  .map(l => ({ label: l.label.trim(), href: safeHref(l.url), platform: l.platform }))
  .filter(l => l.label && l.href)
  .map(l => ({ ...l, platform: (platformById(l.platform) || detectPlatform(l.href)).id })));

// counted from what is published — never typed in
const days = (a: string, b: string | null) => Math.max(1, Math.round((Date.parse(b || a) - Date.parse(a)) / 86400000) + 1);
const stamps = computed(() => {
  if (!trips.value.length) return [];
  const first = trips.value.map(t => yearOf(t.startDate)).filter(Boolean).sort()[0];
  return [
    { value: String(trips.value.length), label: "Journeys", sub: "บันทึกการเดินทาง" },
    { value: String(trips.value.reduce((n, t) => n + days(t.startDate, t.endDate), 0)), label: "Days", sub: "วันบนเส้นทาง" },
    ...(first ? [{ value: first, label: "Since", sub: "เริ่มจดบันทึก" }] : []),
  ];
});
const latest = computed(() => [...trips.value].sort((a, b) => (b.startDate || "").localeCompare(a.startDate || "")).slice(0, 3));

usePageMeta(computed(() => ({ title: `เกี่ยวกับผู้เขียน · ${site.value?.title || "Journeys by Nutweir"}`, description: site.value?.note || site.value?.tagline, canonical: siteUrl("about") })));
</script>

<template>
  <main id="journal" tabindex="-1" class="about">
    <header class="about-head" data-mood="golden">
      <div class="about-intro">
        <p class="kicker">About · ผู้เขียน</p>
        <h1 class="about-name">{{ name }}</h1>
        <p v-if="site?.note" class="about-note hand">{{ site.note }}</p>
        <dl v-if="facts.length" class="about-facts">
          <div v-for="([k, v], i) in facts" :key="i"><dt>{{ k }}</dt><dd>{{ v }}</dd></div>
        </dl>
      </div>
      <figure v-if="photo" class="about-photo">
        <img :src="photoUrl" :alt="photo.alt || name" :width="photo.width || undefined" :height="photo.height || undefined" :style="photo.focus ? { objectPosition: photo.focus } : undefined">
        <figcaption class="hand">{{ site?.photoCaption || name }}</figcaption>
      </figure>
    </header>

    <section class="about-story flow" data-mood="golden">
      <template v-if="lead">
        <div class="about-lead" v-html="lead" />
        <div v-if="rest" class="about-text" v-html="rest" />
        <p class="about-sign hand">— {{ name }}</p>
      </template>
      <p v-else-if="site" class="shelf-lede">เร็ว ๆ นี้</p>

      <div v-if="stamps.length" class="about-stamps" aria-label="ตัวเลขจากบันทึกที่เผยแพร่">
        <p v-for="(s, i) in stamps" :key="s.label" class="stamp" :style="{ transform: `rotate(${[-4, 3, -2][i]}deg)` }">
          <b>{{ s.value }}</b><span>{{ s.label }}</span><small>{{ s.sub }}</small>
        </p>
      </div>

      <nav v-if="links.length" class="about-links" aria-label="ช่องทางติดตาม">
        <a v-for="l in links" :key="l.href" :href="l.href" target="_blank" rel="noopener" class="about-ticket">
          <SocialIcon class="about-icon" :platform="l.platform" />
          <span>{{ l.label }}</span><span class="about-arrow" aria-hidden="true">↗</span>
        </a>
      </nav>
    </section>

    <section v-if="latest.length" class="about-latest" data-mood="notes" aria-labelledby="about-latest-t">
      <div class="flow">
        <h2 id="about-latest-t" class="kicker about-latest-t">บันทึกล่าสุด · Latest journals</h2>
      </div>
      <JourneyShelf :trips="latest" />
      <p class="flow shelf-lede"><RouterLink to="/journeys">ดูบันทึกการเดินทางทั้งหมด →</RouterLink></p>
    </section>
  </main>
</template>
