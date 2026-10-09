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

/** What the links point at, for a matching little icon. */
const ICONS: [RegExp, string][] = [
  [/instagram\.com/i, "instagram"], [/tiktok\.com/i, "tiktok"], [/facebook\.com|fb\.com/i, "facebook"],
  [/youtube\.com|youtu\.be/i, "youtube"], [/^mailto:/i, "mail"], [/^tel:/i, "phone"], [/line\.me/i, "line"],
];
const links = computed(() => (site.value?.links || [])
  .map(l => ({ label: l.label.trim(), href: safeHref(l.url) }))
  .filter(l => l.label && l.href)
  .map(l => ({ ...l, icon: ICONS.find(([re]) => re.test(l.href))?.[1] || "link" })));

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
          <svg class="about-icon" viewBox="0 0 24 24" aria-hidden="true">
            <template v-if="l.icon === 'instagram'"><rect x="3.5" y="3.5" width="17" height="17" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.2" cy="6.8" r=".9" class="dot" /></template>
            <template v-else-if="l.icon === 'tiktok'"><path d="M14 4v10.5a3.5 3.5 0 1 1-3.5-3.5" /><path d="M14 4c.6 2.4 2.3 4 4.5 4.3" /></template>
            <template v-else-if="l.icon === 'facebook'"><path d="M14.5 21v-7.5h2.5l.5-3h-3V8.7c0-.9.4-1.5 1.6-1.5H17.6V4.6c-.4-.1-1.4-.2-2.5-.2-2.4 0-3.8 1.4-3.8 3.9v2.2H9v3h2.3V21" /></template>
            <template v-else-if="l.icon === 'youtube'"><rect x="2.5" y="5.5" width="19" height="13" rx="4" /><path d="M10 9.2v5.6l4.8-2.8z" class="dot" /></template>
            <template v-else-if="l.icon === 'mail'"><rect x="3" y="5.5" width="18" height="13" rx="2" /><path d="m3.5 6.5 8.5 6.5 8.5-6.5" /></template>
            <template v-else-if="l.icon === 'phone'"><path d="M6.5 3.5h3l1.5 4-2 1.3a11 11 0 0 0 6.2 6.2l1.3-2 4 1.5v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.5 5.7a2 2 0 0 1 2-2.2z" /></template>
            <template v-else-if="l.icon === 'line'"><path d="M12 4c-5 0-8.5 3-8.5 6.8 0 3.4 2.9 6.2 6.9 6.7l-.4 2.5 3.5-2.4c4.1-.4 7-3.3 7-6.8C20.5 7 17 4 12 4z" /></template>
            <template v-else><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></template>
          </svg>
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
