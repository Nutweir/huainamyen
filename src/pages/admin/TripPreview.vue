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
const PICKABLE = "[data-block], section.event > header, .cover-text > *, .cover-photo, .cover-meta, #ending, #roll, #notes .note-sec, #notes > header";
const PICK_CSS = `${PICKABLE.split(", ").map(s => `.preview-pick ${s}`).join(", ")} { cursor: pointer; } ${PICKABLE.split(", ").map(s => `.preview-pick ${s}:hover`).join(", ")} { outline: 1px dashed rgb(63 94 69 / .55); outline-offset: 6px; border-radius: 2px; }`;

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

/** Which form field shows this part of the page (cover, closing pages, film roll, travel notes). */
function fieldAt(t: HTMLElement): string | null {
  const parts: [string, string][] = [
    [".cover-title, .kicker", "title"], [".cover-place", "location"], [".cover-date", "dates"], [".cover-epigraph", "epigraph"],
    [".cover-meta", "coverMeta"], [".cover-photo", "cover"], [".cover", "title"], ["#ending", "ending"], ["#roll", "roll"],
  ];
  for (const [sel, field] of parts) if (t.closest(sel)) return field;
  const sec = t.closest<HTMLElement>("#notes section[id]");
  if (sec) return `notes:${sec.id}`;
  if (t.closest("#notes")) return "notes-intro";
  return null;
}

/** In the editor's preview a click picks that block for editing (instead of following links or opening photos). */
function onPick(e: MouseEvent) {
  const t = e.target as HTMLElement;
  if (t.closest(".topbar")) {
    // the reading bar's day jumps still work; links that would leave this page don't
    const a = t.closest("a");
    if (a && !(a.getAttribute("href") || "").startsWith("#")) e.preventDefault();
    return;
  }
  e.preventDefault();
  e.stopPropagation();
  const el = t.closest<HTMLElement>("[data-block]");
  let blockId = el?.dataset.block || "";
  if (!blockId) {
    // a moment's heading: its section id is the event's anchor
    const section = t.closest<HTMLElement>("section.event[id]");
    for (const d of bundle.value?.days || []) {
      const ev = d.blocks.find(x => x.type === "event" && x.data.anchor === section?.id);
      if (ev) blockId = ev.id;
    }
  }
  if (!blockId) {
    const field = fieldAt(t);
    if (field) window.parent.postMessage({ type: "journeys-pick", field }, location.origin);
    return;
  }
  window.parent.postMessage({ type: "journeys-pick", blockId }, location.origin);
}

const channel = !embed && typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("journeys-preview") : null;
onMounted(() => {
  document.body.classList.add("diary");
  if (embed) {
    addEventListener("message", onMessage);
    addEventListener("click", onPick, true);
    document.documentElement.classList.add("preview-pick");
    window.parent.postMessage({ type: "journeys-preview-ready" }, location.origin);
  } else {
    void load();
    channel?.addEventListener("message", e => { if ((e.data as { tripId?: string })?.tripId === id) void load(); });
  }
});
onBeforeUnmount(() => { channel?.close(); removeEventListener("message", onMessage); removeEventListener("click", onPick, true); document.documentElement.classList.remove("preview-pick"); document.body.classList.remove("diary"); });
</script>

<template>
  <component :is="'style'" v-if="focusCss">{{ focusCss }}</component>
  <component :is="'style'" v-if="embed">{{ PICK_CSS }}</component>
  <div v-if="!embed" class="fixed bottom-3 right-3 z-[60] flex items-center gap-2 rounded-full bg-[#23211d] px-3 py-1.5 font-sans text-xs text-white shadow-lg" role="status">
    <span>ตัวอย่าง (ยังไม่เผยแพร่)</span>
    <label class="flex items-center gap-1"><input v-model="slots" type="checkbox"> ช่องรอรูป</label>
    <button class="underline" @click="load">รีเฟรช</button>
  </div>
  <TripView v-if="bundle" :key="embed ? 'live' : stamp" :bundle="bundle" :show-slots="slots" :live="embed" />
  <StatusPage v-else-if="error" title="เปิดตัวอย่างไม่ได้" :text="error" />
  <StatusPage v-else title="กำลังเปิดตัวอย่าง…" />
</template>
