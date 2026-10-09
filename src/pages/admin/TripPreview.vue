<script setup lang="ts">
/*
 * The working copy (draft included) shown exactly as readers would see it.
 * Standalone tab: refreshes when the editor saves.
 * Embedded (?embed, inside the editor's live preview): the editor sends the unsaved working copy
 * as you type and which block you are on; this page re-renders, scrolls to it and outlines it.
 */
import { nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import type { TripBundle } from "@/types/content";
import { useBackend } from "@/services";
import { readDraft } from "@/services/draftBackup";
import TripView from "@/components/diary/TripView.vue";
import StatusPage from "@/components/common/StatusPage.vue";

const route = useRoute();
const { repo } = useBackend();
const id = route.params.id as string;
const embed = route.query.embed !== undefined;
const bundle = ref<TripBundle | null>(null);
const error = ref("");
const slots = ref(true);
const stamp = ref(0);
const focusCss = ref("");
let lastFocus = "";

async function load() {
  try {
    const r = await repo.loadTrip(id);
    // writing not yet on the server (it is newer than the saved copy) is what the author wants to see
    const draft = await readDraft(id);
    bundle.value = draft && draft.at > r.savedAt ? { ...draft.bundle, media: r.bundle.media.concat(draft.bundle.media.filter(m => !r.bundle.media.some(x => x.id === m.id))) } : r.bundle;
    stamp.value++;
  } catch (e) { error.value = (e as Error).message; }
}

/** "#notes" / "#top" = an anchor; otherwise a block id (an event block is its section). */
function targetOf(focus: string): HTMLElement | null {
  if (!focus) return null;
  if (focus.startsWith("#")) return focus === "#top" ? document.querySelector(".cover") : document.getElementById(focus.slice(1));
  const el = document.querySelector<HTMLElement>(`[data-block="${CSS.escape(focus)}"]`);
  if (el) return el;
  for (const d of bundle.value?.days || []) {
    const b = d.blocks.find(x => x.id === focus);
    if (b?.type === "event") return document.getElementById(b.data.anchor);
  }
  return null;
}
async function show(focus: string) {
  await nextTick();
  const el = targetOf(focus);
  focusCss.value = el && !focus.startsWith("#") ? `[data-block="${CSS.escape(focus)}"], #${CSS.escape(el.id || "_")}{outline:2px dashed #3f5e45;outline-offset:6px;border-radius:2px}` : "";
  if (!el) return;
  const r = el.getBoundingClientRect();
  // move only when you switch blocks or the block has left the screen, so typing doesn't jump around
  // scroll this frame only: scrollIntoView would also scroll the editor page around the frame
  if (focus !== lastFocus || r.bottom < 0 || r.top > innerHeight) {
    const top = focus.startsWith("#") ? r.top + scrollY : r.top + scrollY - (innerHeight - r.height) / 2;
    scrollTo({ top: Math.max(0, top), behavior: "instant" as ScrollBehavior });
  }
  lastFocus = focus;
}

interface DraftMessage { type: "journeys-draft"; bundle?: string; focus?: string; slots?: boolean }
function onMessage(e: MessageEvent) {
  if (e.origin !== location.origin || e.source !== window.parent) return;
  const m = e.data as DraftMessage;
  if (m?.type !== "journeys-draft") return;
  if (m.bundle) { const b = JSON.parse(m.bundle) as TripBundle; if (b.trip.id === id) bundle.value = b; }
  if (typeof m.slots === "boolean") slots.value = m.slots;
  void show(m.focus || "");
}

const channel = !embed && typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("journeys-preview") : null;
onMounted(() => {
  document.body.classList.add("diary");
  if (embed) {
    addEventListener("message", onMessage);
    window.parent.postMessage({ type: "journeys-preview-ready" }, location.origin);
  } else {
    void load();
    channel?.addEventListener("message", e => { if ((e.data as { tripId?: string })?.tripId === id) void load(); });
  }
});
onBeforeUnmount(() => { channel?.close(); removeEventListener("message", onMessage); document.body.classList.remove("diary"); });
</script>

<template>
  <component :is="'style'" v-if="focusCss">{{ focusCss }}</component>
  <div v-if="!embed" class="fixed bottom-3 right-3 z-[60] flex items-center gap-2 rounded-full bg-[#23211d] px-3 py-1.5 font-sans text-xs text-white shadow-lg" role="status">
    <span>ตัวอย่าง (ยังไม่เผยแพร่)</span>
    <label class="flex items-center gap-1"><input v-model="slots" type="checkbox"> ช่องรอรูป</label>
    <button class="underline" @click="load">รีเฟรช</button>
  </div>
  <TripView v-if="bundle" :key="embed ? 'live' : stamp" :bundle="bundle" :show-slots="slots" :live="embed" />
  <StatusPage v-else-if="error" title="เปิดตัวอย่างไม่ได้" :text="error" />
  <StatusPage v-else title="กำลังเปิดตัวอย่าง…" />
</template>
