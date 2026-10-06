<script setup lang="ts">
/* /journeys/:slug — the published journal. */
import { computed, ref, watch } from "vue";
import { useRoute } from "vue-router";
import type { TripBundle } from "@/types/content";
import { useBackend } from "@/services";
import TripView from "@/components/diary/TripView.vue";
import StatusPage from "@/components/common/StatusPage.vue";
import { usePageMeta, siteUrl } from "@/composables/usePageMeta";

const route = useRoute();
const { repo } = useBackend();
const bundle = ref<TripBundle | null>(null);
const state = ref<"loading" | "ready" | "missing" | "error">("loading");
const error = ref("");

async function load(slug: string) {
  state.value = "loading";
  try {
    bundle.value = await repo.getPublished(slug);
    state.value = bundle.value ? "ready" : "missing";
  } catch (e) { error.value = (e as Error).message; state.value = "error"; }
}
watch(() => route.params.slug as string, s => load(s), { immediate: true });

usePageMeta(computed(() => bundle.value && {
  title: bundle.value.trip.seoTitle || `${bundle.value.trip.title} — Travel Journal`,
  description: bundle.value.trip.seoDescription || bundle.value.trip.summary,
  canonical: siteUrl(`journeys/${bundle.value.trip.slug}`),
}));
</script>

<template>
  <TripView v-if="state === 'ready' && bundle" :key="bundle.trip.id" :bundle="bundle" :show-slots="route.query.slots !== undefined" />
  <StatusPage v-else-if="state === 'loading'" title="กำลังเปิดบันทึก…" />
  <StatusPage v-else-if="state === 'missing'" title="ไม่พบบันทึกนี้" text="บันทึกอาจยังไม่ได้เผยแพร่ หรือลิงก์เปลี่ยนไปแล้ว" />
  <StatusPage v-else title="เปิดบันทึกไม่ได้" :text="error" />
</template>
