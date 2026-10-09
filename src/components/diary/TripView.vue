<script setup lang="ts">
/* A whole journal: cover, days, ending, film roll and travel notes. Used by the public page and admin preview. */
import { computed, nextTick, onBeforeUnmount, onMounted, onUpdated, ref, toRef, watch } from "vue";
import type { TripBundle } from "@/types/content";
import { useMedia } from "@/composables/useMedia";
import { useDiaryBehaviour } from "@/composables/useDiaryBehaviour";
import { pad2, yearOf } from "@/utils/format";
import TopBar from "./TopBar.vue";
import TripCover from "./TripCover.vue";
import DayChapter from "./DayChapter.vue";
import TripEnding from "./TripEnding.vue";
import FilmRoll from "./FilmRoll.vue";
import TravelNotes from "./TravelNotes.vue";
import Lightbox from "@/components/gallery/Lightbox.vue";

const props = defineProps<{ bundle: TripBundle; showSlots?: boolean; backTo?: string; live?: boolean }>();
const bundleRef = toRef(props, "bundle");
const { byId, url, srcset } = useMedia(bundleRef as never);
const root = ref<HTMLElement | null>(null);
const behaviour = useDiaryBehaviour();
const showSlots = computed(() => !!props.showSlots && props.bundle.trip.showPlaceholders);
const firstDay = computed(() => (props.bundle.days[0] ? `day-${pad2(props.bundle.days[0].dayNumber)}` : "notes"));

/** Old links: #day-02, #d1-0700, and travel-note aliases like #omkoi → #getting-there. */
function jumpToHash() {
  const raw = decodeURIComponent(location.hash.slice(1));
  if (!raw) return;
  const target = document.getElementById(raw) || document.getElementById(props.bundle.notes?.aliases?.[raw] || "");
  if (target) setTimeout(() => target.scrollIntoView({ behavior: "instant" as ScrollBehavior }), 0);
}

/** Keep "ๆ" on the same line as the word it repeats (as the static site did for the whole journal). */
function keepMaiYamok(el: HTMLElement) {
  const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) if (n.nodeValue?.includes(" ๆ")) n.nodeValue = n.nodeValue.replace(/ ๆ/g, " ๆ");
}
onUpdated(() => { if (root.value) keepMaiYamok(root.value); });

onMounted(async () => {
  await nextTick();
  const el = root.value!;
  keepMaiYamok(el);
  behaviour.moods(el);
  behaviour.progress(el.querySelector(".tb-progress span"), [...el.querySelectorAll<HTMLAnchorElement>(".tb-links a")]);
  if (!props.live) behaviour.reveal(el); // the live admin preview re-renders as you type: show everything at once
  behaviour.videos(el);
  behaviour.roll(el.querySelector(".roll .strip"), el.querySelector(".roll-toggle"));
  jumpToHash();
  addEventListener("hashchange", jumpToHash);
});
watch(() => props.bundle.trip.id, () => nextTick(jumpToHash));
onBeforeUnmount(() => removeEventListener("hashchange", jumpToHash));
</script>

<template>
  <div ref="root" class="trip-view">
    <TopBar :title="bundle.trip.title" :days="bundle.days.map(d => d.dayNumber)" :has-notes="!!bundle.notes" :back-to="backTo" />
    <main id="journal" tabindex="-1">
      <article class="journal">
        <TripCover :trip="bundle.trip" :first-day-id="firstDay" :mood="bundle.days[0]?.mood || 'morning'" :media="byId" :url="url" :srcset="srcset" />
        <DayChapter v-for="d in bundle.days" :key="d.id" :day="d" :media="byId" :url="url" :srcset="srcset" :show-slots="showSlots" />
        <TripEnding v-if="bundle.ending" :ending="bundle.ending" :title="bundle.trip.title" :year="yearOf(bundle.trip.startDate)" :end-date="bundle.trip.endDate" :media="byId" :url="url" :srcset="srcset" />
      </article>
      <FilmRoll :ids="bundle.gallery" :media="byId" :url="url" :srcset="srcset" />
      <TravelNotes v-if="bundle.notes" :notes="bundle.notes" />
    </main>
    <footer class="site-foot flow" data-mood="notes">
      <p v-if="bundle.notes">{{ bundle.notes.disclaimer }}</p>
      <p><RouterLink to="/journeys">← All Journeys</RouterLink> · <a href="#top">กลับไปหน้าปก ↑</a></p>
    </footer>
    <Lightbox :root="root" />
  </div>
</template>
