<script setup lang="ts">
/* The working copy (draft included) shown exactly as readers would see it. Refreshes when the editor saves. */
import { onBeforeUnmount, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import type { TripBundle } from "@/types/content";
import { useBackend } from "@/services";
import { readDraft } from "@/services/draftBackup";
import TripView from "@/components/diary/TripView.vue";
import StatusPage from "@/components/common/StatusPage.vue";

const route = useRoute();
const { repo } = useBackend();
const id = route.params.id as string;
const bundle = ref<TripBundle | null>(null);
const error = ref("");
const slots = ref(true);
const stamp = ref(0);

async function load() {
  try {
    const r = await repo.loadTrip(id);
    // writing not yet on the server (it is newer than the saved copy) is what the author wants to see
    const draft = await readDraft(id);
    bundle.value = draft && draft.at > r.savedAt ? { ...draft.bundle, media: r.bundle.media.concat(draft.bundle.media.filter(m => !r.bundle.media.some(x => x.id === m.id))) } : r.bundle;
    stamp.value++;
  } catch (e) { error.value = (e as Error).message; }
}
const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("journeys-preview") : null;
onMounted(() => {
  document.body.classList.add("diary");
  void load();
  channel?.addEventListener("message", e => { if ((e.data as { tripId?: string })?.tripId === id) void load(); });
});
onBeforeUnmount(() => { channel?.close(); document.body.classList.remove("diary"); });
</script>

<template>
  <div class="fixed bottom-3 right-3 z-[60] flex items-center gap-2 rounded-full bg-[#23211d] px-3 py-1.5 font-sans text-xs text-white shadow-lg" role="status">
    <span>ตัวอย่าง (ยังไม่เผยแพร่)</span>
    <label class="flex items-center gap-1"><input v-model="slots" type="checkbox"> ช่องรอรูป</label>
    <button class="underline" @click="load">รีเฟรช</button>
  </div>
  <TripView v-if="bundle" :key="stamp" :bundle="bundle" :show-slots="slots" />
  <StatusPage v-else-if="error" title="เปิดตัวอย่างไม่ได้" :text="error" />
  <StatusPage v-else title="กำลังเปิดตัวอย่าง…" />
</template>
