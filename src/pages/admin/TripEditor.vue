<script setup lang="ts">
/*
 * Write a trip: days on the left, the day's story blocks in the middle (drag or arrows to reorder),
 * the selected block's properties on the right. Autosaves; Publish makes the current state public.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { onBeforeRouteLeave, useRoute } from "vue-router";
import { BLOCK_TYPES, MOODS, type Block, type BlockType, type MediaAsset } from "@/types/content";
import { useEditorStore } from "@/stores/editor";
import { BLOCK_LABELS } from "@/services/factory";
import { exportBundle } from "@/services/snapshot";
import { useBackend } from "@/services";
import { useToast } from "@/composables/useToast";
import { toText } from "@/utils/sanitize";
import { pad2 } from "@/utils/format";
import StatusChip from "@/components/admin/StatusChip.vue";
import BlockEditor from "@/components/editor/BlockEditor.vue";
import TripSettingsForm from "@/components/editor/TripSettingsForm.vue";
import NotesForm from "@/components/editor/NotesForm.vue";
import VersionPanel from "@/components/editor/VersionPanel.vue";
import LivePreview from "@/components/editor/LivePreview.vue";
import QuickInsert, { type InsertMode } from "@/components/editor/QuickInsert.vue";
import { useBlockDrag } from "@/composables/useBlockDrag";
import { uploadFiles, useFileDrop } from "@/composables/useFileDrop";
import { checkTrip, type Issue } from "@/services/publishCheck";
import PublishCheck from "@/components/editor/PublishCheck.vue";

const route = useRoute();
const ed = useEditorStore();
const { repo } = useBackend();
const { toast } = useToast();
const loadError = ref("");
const tab = ref<"story" | "trip" | "notes" | "versions">("story");
const addOpen = ref(false);
const publishing = ref(false);
const editorPanel = ref<HTMLElement | null>(null);
const wide = typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches;

// live preview: a column beside the story on wide screens, a side panel otherwise
const xlQuery = typeof window !== "undefined" ? window.matchMedia("(min-width: 1280px)") : null;
const isXl = ref(!!xlQuery?.matches);
// on by default where it fits beside the editor; your choice is remembered
const readPref = () => { try { const v = localStorage.getItem("journeys-live-preview"); return v === null ? isXl.value : v === "1"; } catch { return isXl.value; } };
const live = ref(readPref());
watch(live, v => { try { localStorage.setItem("journeys-live-preview", v ? "1" : "0"); } catch { /* fine */ } });
const onXl = (e: MediaQueryListEvent) => { isXl.value = e.matches; };
const docked = computed(() => live.value && tab.value === "story" && isXl.value);

async function load() {
  loadError.value = "";
  try { await ed.load(route.params.id as string); }
  catch (e) { loadError.value = (e as Error).message; }
}
watch(() => route.params.id, id => { if (id) void load(); }, { immediate: true });

const b = computed(() => ed.bundle);
const media = computed(() => new Map((ed.bundle?.media || []).map(m => [m.id, m])));
const dayIndex = computed(() => Math.min(ed.selected.day, (b.value?.days.length || 1) - 1));
const day = computed(() => b.value?.days[dayIndex.value]);
const previewFocus = computed(() => {
  if (tab.value === "notes") return "#notes";
  if (tab.value !== "story") return "#top";
  return ed.selected.blockId || (day.value ? `#day-${pad2(day.value.dayNumber)}` : "#top");
});
const block = computed(() => day.value?.blocks.find(x => x.id === ed.selected.blockId) || null);
const routeText = computed({ get: () => day.value?.route.join(" → ") || "", set: v => { if (day.value) day.value.route = v.split(/→|->|,/).map(s => s.trim()).filter(Boolean); } });

const STATE_TEXT: Record<string, string> = { idle: "", unsaved: "ยังไม่บันทึก", saving: "กำลังบันทึก…", saved: "บันทึกแล้ว", offline: "ออฟไลน์ — เก็บไว้ในเครื่อง", conflict: "ชนกับการแก้จากที่อื่น", error: "บันทึกไม่สำเร็จ" };
const stateClass = computed(() => ({ saved: "text-forest", unsaved: "text-earth", saving: "text-muted", offline: "text-earth", conflict: "text-danger", error: "text-danger", idle: "" })[ed.state]);

function summary(x: Block): string {
  switch (x.type) {
    case "event": return `${x.data.time} ${x.data.title}`.trim() || "(ช่วงเวลาใหม่)";
    case "paragraph": case "heading": case "note": case "thought": case "quote": return toText(x.data.html).slice(0, 120) || "(ว่าง)";
    case "dialogue": return x.data.lines.map(l => `${l.who}: ${l.line}`).join(" / ").slice(0, 120);
    case "verse": case "letter": return toText(x.data.lines.join(" / ")).slice(0, 120);
    case "pause": case "mark": return x.data.text || "—";
    case "stamp": return `${x.data.value} ${x.data.label}`;
    case "spacer": return `ขนาด ${x.data.size}`;
    case "image": case "decoration": return media.value.get(x.data.item.mediaId)?.caption || x.data.item.caption || (x.data.item.mediaId ? "รูป" : "(ยังไม่เลือกรูป)");
    case "images": return `${x.data.items.length} รูป${x.data.caption ? ` · ${toText(x.data.caption)}` : ""}`;
    case "placeholder": return x.data.label || "ช่องรอรูป";
    case "video": return x.data.caption || (x.data.mediaId ? "คลิป" : "(ยังไม่เลือกคลิป)");
  }
}
const thumbOf = (x: Block): string => {
  const id = x.type === "image" || x.type === "decoration" ? x.data.item.mediaId : x.type === "video" ? x.data.mediaId : x.type === "images" ? (x.data.items.find(i => "mediaId" in i) as { mediaId: string } | undefined)?.mediaId : "";
  let a = id ? media.value.get(id) : undefined;
  if (a?.kind === "video" && a.posterId) a = media.value.get(a.posterId);
  return a ? repo.mediaUrl(a, 500) : "";
};

function select(id: string) {
  ed.selected = { day: dayIndex.value, blockId: id };
  if (window.matchMedia("(max-width: 1023px)").matches) requestAnimationFrame(() => editorPanel.value?.scrollIntoView({ behavior: "smooth", block: "start" }));
}
function add(type: BlockType) {
  const list = day.value!.blocks;
  const i = list.findIndex(x => x.id === ed.selected.blockId);
  ed.addBlock(dayIndex.value, type, i >= 0 ? i + 1 : list.length);
  addOpen.value = false;
}
function del(x: Block) {
  if (!confirm(`ลบ “${BLOCK_LABELS[x.type]}: ${summary(x).slice(0, 40)}”?`)) return;
  ed.removeBlock(dayIndex.value, x.id);
}
function delDay(i: number) {
  const d = b.value!.days[i];
  if (!confirm(`ลบวันที่ ${d.dayNumber} และเนื้อหา ${d.blocks.length} ส่วนในวันนั้น?\n(ย้อนกลับได้จากแท็บเวอร์ชัน ถ้าเคยเก็บไว้)`)) return;
  ed.removeDay(i);
}
function moveToDay(x: Block, to: number) {
  const from = day.value!.blocks.findIndex(y => y.id === x.id);
  ed.moveBlock(dayIndex.value, from, b.value!.days[to].blocks.length, to);
}
function discard() { if (confirm("ทิ้งการแก้ในเครื่องนี้ และโหลดฉบับล่าสุดจากเซิร์ฟเวอร์?")) void ed.discardLocal(); }
function onMedia(assets: MediaAsset[]) { assets.forEach(a => ed.useMedia(a)); }
/** Place picked photos next to the selected block; the new block becomes the selection. */
function quickInsert(mode: InsertMode, assets: MediaAsset[]) {
  onMedia(assets);
  // a clip's poster comes along for display, but isn't a photo of its own here
  const picked = assets.filter(a => !assets.some(v => v.posterId === a.id));
  if (!picked.length || !day.value) return;
  const i = day.value.blocks.findIndex(x => x.id === ed.selected.blockId);
  const after = i >= 0 ? i + 1 : day.value.blocks.length;
  if (mode === "video") ed.addBlock(dayIndex.value, "video", after, { mediaId: picked[0].id });
  else if (mode === "set") ed.addBlock(dayIndex.value, "images", after, { items: picked.map(a => ({ mediaId: a.id })) });
  // beside: the print goes before the paragraph it sits next to
  else if (mode === "beside") ed.addBlock(dayIndex.value, "image", i >= 0 ? i : after, { item: { mediaId: picked[0].id }, layout: "diary-photo", position: "right", besideCount: 1 });
  else picked.forEach((a, n) => ed.addBlock(dayIndex.value, "image", after + n, { item: { mediaId: a.id } }));
  toast(mode === "beside" ? "แปะรูปข้างย่อหน้าแล้ว — เปลี่ยนซ้าย/ขวาได้ที่ ตำแหน่ง" : "เพิ่มแล้ว — ลองเปลี่ยนรูปแบบดูในตัวอย่างสด");
}

// drag to reorder (mouse: the whole row; touch: the ⋮⋮ handle); drop on a day button to move it there
const blockList = ref<HTMLElement | null>(null);
const { drag, start: startDrag } = useBlockDrag({
  list: () => blockList.value,
  currentDay: () => dayIndex.value,
  onMove: (from, to) => ed.moveBlock(dayIndex.value, from, to),
  onMoveToDay: (from, to) => {
    const x = day.value!.blocks[from];
    moveToDay(x, to);
    toast(`ย้ายไป Day ${pad2(b.value!.days[to].dayNumber)} แล้ว (ท้ายวัน)`);
  },
});

// publish: check first; the dialog lists what to look at, each item takes you there
const checkDlg = ref<InstanceType<typeof PublishCheck> | null>(null);
const issues = ref<Issue[]>([]);
function publish() {
  if (!b.value) return;
  issues.value = checkTrip(b.value);
  checkDlg.value?.open();
}
async function confirmPublish() {
  publishing.value = true;
  try { await ed.publish(); checkDlg.value?.close(); toast("เผยแพร่แล้ว"); }
  catch (e) { toast((e as Error).message, true); }
  finally { publishing.value = false; }
}
function goTo(i: Issue) {
  if (i.where.tab !== "story") { tab.value = i.where.tab; return; }
  tab.value = "story";
  ed.selected = { day: i.where.day, blockId: i.where.blockId || null };
  revealRow(i.where.blockId);
}
const dayLabel = (d: number) => `Day ${pad2(b.value?.days[d]?.dayNumber || d + 1)}`;

/** Bring a block's row into view in the list (after the day switch has rendered). */
function revealRow(id: string) {
  if (!id) return;
  setTimeout(() => document.querySelector(`[data-row-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" }), 50);
}
// a click in the live preview picks that block
function onPick(p: { blockId?: string; where?: "trip" | "notes" }) {
  if (p.where) { tab.value = p.where; return; }
  const d = b.value?.days.findIndex(x => x.blocks.some(y => y.id === p.blockId)) ?? -1;
  if (d < 0 || !p.blockId) return;
  tab.value = "story";
  ed.selected = { day: d, blockId: p.blockId };
  revealRow(p.blockId);
}

// photos from the computer: dropped on the list (at the line) or pasted (after the selected block)
const uploading = ref<{ done: number; total: number } | null>(null);
const { over: fileOver } = useFileDrop({
  list: () => blockList.value,
  enabled: () => tab.value === "story" && !!day.value && !uploading.value,
  onFiles: (files, index) => void dropFiles(files, index),
});
async function dropFiles(files: File[], index: number | null) {
  const d = dayIndex.value, list = day.value!.blocks;
  // remember the neighbour, not the number: you may keep editing while the files upload
  const at = index ?? (list.findIndex(x => x.id === ed.selected.blockId) + 1 || list.length);
  const afterId = at > 0 ? list[at - 1]?.id : null;
  uploading.value = { done: 0, total: files.length };
  const errors: string[] = [];
  const assets = await uploadFiles(files, { tripId: b.value!.trip.id }, (done, total, err) => { uploading.value = { done, total }; if (err) errors.push(err); });
  uploading.value = null;
  if (errors.length) toast(errors.join(" · "), true);
  if (!assets.length) return;
  // clips bring their poster frame along so they show in the story
  if (assets.some(a => a.posterId)) {
    const all = await repo.listMedia({ tripId: b.value!.trip.id });
    assets.forEach(a => { const poster = all.find(m => m.id === a.posterId); if (poster) ed.useMedia(poster); });
  }
  onMedia(assets);
  const blocks = b.value!.days[d].blocks;
  let pos = afterId ? blocks.findIndex(x => x.id === afterId) + 1 : 0;
  const photos = assets.filter(a => a.kind === "image"), clips = assets.filter(a => a.kind === "video");
  if (photos.length > 1) ed.addBlock(d, "images", pos++, { items: photos.map(a => ({ mediaId: a.id })) });
  else if (photos.length) ed.addBlock(d, "image", pos++, { item: { mediaId: photos[0].id } });
  clips.forEach(c => ed.addBlock(d, "video", pos++, { mediaId: c.id }));
  toast(`เพิ่ม ${assets.length} ไฟล์แล้ว — ลองเปลี่ยนรูปแบบดูในตัวอย่างสด`);
}
async function unpublish() {
  if (!confirm("ยกเลิกการเผยแพร่? ผู้อ่านจะเปิดทริปนี้ไม่ได้จนกว่าจะเผยแพร่อีกครั้ง")) return;
  try { await ed.setStatus("draft"); toast("ยกเลิกการเผยแพร่แล้ว"); } catch (e) { toast((e as Error).message, true); }
}
function download() {
  if (!b.value) return;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([exportBundle(b.value)], { type: "application/json" }));
  a.download = `${b.value.trip.slug}-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// tell an open preview tab to refresh after each save
const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("journeys-preview") : null;
watch(() => ed.state, s => { if (s === "saved" && b.value) channel?.postMessage({ tripId: b.value.trip.id }); });
function keys(e: KeyboardEvent) {
  const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
  if (mod && k === "s") { e.preventDefault(); void ed.save(); return; }
  // inside a text field, Ctrl+Z belongs to that field; elsewhere it undoes the last change to the trip
  const typing = (document.activeElement as HTMLElement | null)?.closest("input, textarea, select, .ProseMirror");
  if (!mod || typing || document.querySelector("dialog[open]")) return;
  if (k === "z" && !e.shiftKey) { e.preventDefault(); if (!ed.undo()) toast("ไม่มีอะไรให้ย้อนแล้ว"); }
  else if (k === "y" || (k === "z" && e.shiftKey)) { e.preventDefault(); ed.redo(); }
}
onMounted(() => { addEventListener("keydown", keys); xlQuery?.addEventListener("change", onXl); });
onBeforeUnmount(() => { removeEventListener("keydown", keys); xlQuery?.removeEventListener("change", onXl); channel?.close(); });
onBeforeRouteLeave(async () => {
  if (!ed.dirty) return true;
  await ed.save();
  return !ed.dirty || confirm("ยังบันทึกขึ้นเซิร์ฟเวอร์ไม่สำเร็จ (งานยังเก็บไว้ในเครื่องนี้) ออกจากหน้านี้เลยไหม?");
});
</script>

<template>
  <main v-if="loadError" class="mx-auto max-w-xl px-4 py-10 text-center">
    <p class="text-danger">{{ loadError }}</p>
    <RouterLink to="/admin/trips" class="btn btn-ghost mt-4">กลับไปรายการทริป</RouterLink>
  </main>
  <main v-else-if="!b" class="px-4 py-10 text-center text-muted">กำลังเปิดทริป…</main>
  <main v-else class="mx-auto px-4 pb-16" :class="docked ? 'max-w-[1900px]' : 'max-w-[1400px]'">
    <!-- top bar -->
    <div class="sticky top-14 z-20 -mx-4 flex flex-wrap items-center gap-2 border-b border-[#ece6da] bg-[#faf8f3]/95 px-4 py-2 backdrop-blur">
      <RouterLink to="/admin/trips" class="text-sm text-muted" aria-label="กลับไปรายการทริป">←</RouterLink>
      <h1 class="min-w-0 max-w-[40vw] truncate font-display text-lg">{{ b.trip.title || "(ไม่มีชื่อ)" }}</h1>
      <StatusChip :status="b.trip.status" />
      <span class="text-sm" :class="stateClass" role="status" aria-live="polite">{{ STATE_TEXT[ed.state] }}</span>
      <div class="ml-auto flex flex-wrap gap-1.5">
        <span class="flex" role="group" aria-label="ย้อนกลับ / ทำซ้ำ">
          <button class="btn btn-ghost min-h-9 rounded-r-none px-3" :disabled="!ed.canUndo" title="ย้อนกลับ (Ctrl+Z)" aria-label="ย้อนกลับ" @click="ed.undo()">↶</button>
          <button class="btn btn-ghost min-h-9 rounded-l-none border-l-0 px-3" :disabled="!ed.canRedo" title="ทำซ้ำ (Ctrl+Y)" aria-label="ทำซ้ำ" @click="ed.redo()">↷</button>
        </span>
        <button v-if="ed.dirty" class="btn btn-ghost min-h-9 px-3" @click="ed.save()">บันทึก</button>
        <button class="btn btn-ghost min-h-9 px-3" :class="live ? 'bg-[#eee8dc]' : ''" :aria-pressed="live" title="ดูหน้าเว็บเปลี่ยนตามที่พิมพ์ ก่อนกดบันทึก" @click="live = !live">ตัวอย่างสด</button>
        <RouterLink :to="`/admin/trips/${b.trip.id}/preview`" target="_blank" class="btn btn-ghost min-h-9 px-3" title="เปิดตัวอย่างในแท็บใหม่">แท็บใหม่ ↗</RouterLink>
        <button class="btn btn-ghost min-h-9 px-3" title="ดาวน์โหลดทริปนี้เป็น JSON" @click="download">ส่งออก</button>
        <button v-if="b.trip.status === 'published'" class="btn btn-ghost min-h-9 px-3" @click="unpublish">ยกเลิกเผยแพร่</button>
        <button class="btn min-h-9 px-4" :disabled="publishing || ed.state === 'conflict'" title="ตรวจก่อนแล้วค่อยเผยแพร่" @click="publish">{{ publishing ? "กำลังเผยแพร่…" : b.trip.publishedAt ? "เผยแพร่ฉบับนี้" : "เผยแพร่" }}</button>
      </div>
    </div>

    <!-- banners -->
    <div v-if="ed.recoverable" class="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-[#e8d6a8] bg-[#fbf3df] p-3 text-sm" role="alert">
      <span class="flex-1">มีงานที่ยังไม่ได้บันทึกขึ้นเซิร์ฟเวอร์ เก็บไว้ในเครื่องนี้เมื่อ {{ new Date(ed.recoverable.at).toLocaleString("th-TH") }}</span>
      <button class="btn min-h-8 px-3" @click="ed.restoreDraft()">ใช้งานที่เก็บไว้</button>
      <button class="btn btn-ghost min-h-8 px-3" @click="ed.ignoreDraft()">ทิ้ง</button>
    </div>
    <div v-if="ed.state === 'conflict'" class="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-[#e7c8bf] bg-[#fbeee9] p-3 text-sm" role="alert">
      <span class="flex-1">{{ ed.message }}</span>
      <button class="btn min-h-8 px-3" @click="ed.overwrite()">ใช้ฉบับของฉัน (ทับ)</button>
      <button class="btn btn-ghost min-h-8 px-3" @click="discard">โหลดฉบับล่าสุด</button>
    </div>
    <div v-else-if="ed.state === 'offline' || ed.state === 'error'" class="mt-3 rounded-lg border border-[#e8d6a8] bg-[#fbf3df] p-3 text-sm" role="alert">
      {{ ed.message }} <button class="ml-2 underline" @click="ed.save()">ลองอีกครั้ง</button>
    </div>

    <!-- tabs -->
    <div class="mt-4 flex gap-1 overflow-x-auto" role="tablist" aria-label="ส่วนของทริป">
      <button v-for="[k, l] in ([['story', 'เรื่องราว'], ['trip', 'ข้อมูลทริป · ปก · SEO'], ['notes', 'ข้อมูลการเดินทาง'], ['versions', 'เวอร์ชัน']] as const)" :key="k" role="tab" :aria-selected="tab === k" class="shrink-0 rounded-full px-4 py-1.5 text-sm" :class="tab === k ? 'bg-ink text-white' : 'border border-rule bg-white'" @click="tab = k">{{ l }}</button>
    </div>

    <TripSettingsForm v-if="tab === 'trip'" class="mt-4" :bundle="b" :media="media" @media="onMedia" />
    <NotesForm v-else-if="tab === 'notes'" class="mt-4" :bundle="b" />
    <VersionPanel v-else-if="tab === 'versions'" class="mt-4" />

    <div v-else class="mt-4 grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_360px]" :class="docked ? 'xl:grid-cols-[minmax(0,1fr)_380px_minmax(400px,1fr)]' : 'xl:grid-cols-[220px_minmax(0,1fr)_400px]'">
      <!-- days -->
      <aside class="min-w-0 lg:col-span-2" :class="docked ? 'xl:col-span-3' : 'xl:col-span-1'" aria-label="วัน">
        <ol class="flex gap-1.5 overflow-x-auto" :class="docked ? '' : 'xl:grid'">
          <li v-for="(d, i) in b.days" :key="d.id" class="shrink-0">
            <button
              class="w-full rounded-lg px-3 py-2 text-left text-sm transition" :data-day-drop="i"
              :class="[i === dayIndex ? 'bg-ink text-white' : 'border border-rule bg-white', drag?.day === i ? 'ring-2 ring-forest ring-offset-2' : '', drag && i !== dayIndex ? 'border-dashed border-forest' : '']"
              :aria-current="i === dayIndex" @click="ed.selected = { day: i, blockId: null }"
            >
              <span class="block font-medium">Day {{ pad2(d.dayNumber) }}</span>
              <span class="block text-xs opacity-75">{{ d.date || "ไม่ระบุวันที่" }} · {{ d.blocks.length }} ส่วน</span>
            </button>
          </li>
        </ol>
        <button class="btn btn-ghost mt-2 w-full sm:w-auto" :class="docked ? '' : 'xl:w-full'" @click="ed.addDay()">+ เพิ่มวัน</button>
        <details v-if="day" class="card mt-3 p-3" :open="wide">
          <summary class="cursor-pointer text-sm font-medium">ตั้งค่า Day {{ pad2(day.dayNumber) }}</summary>
          <div class="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4" :class="docked ? '' : 'xl:grid-cols-1'">
            <label class="field"><span>วันที่</span><input v-model="day.date" class="input" type="date"></label>
            <label class="field"><span>เส้นทาง (คั่นด้วย →)</span><input v-model.lazy="routeText" class="input"></label>
            <label class="field"><span>บรรยากาศเริ่มต้น</span><select v-model="day.mood" class="input"><option v-for="m in MOODS" :key="m" :value="m">{{ m }}</option></select></label>
            <label class="field"><span>ประโยคปิดวัน</span><input v-model="day.closing" class="input"></label>
            <div class="flex gap-1 sm:col-span-full">
              <button class="btn btn-ghost min-h-8 flex-1 px-2" :disabled="dayIndex === 0" aria-label="เลื่อนวันขึ้น" @click="ed.moveDay(dayIndex, dayIndex - 1); ed.selected.day--">↑</button>
              <button class="btn btn-ghost min-h-8 flex-1 px-2" :disabled="dayIndex === b.days.length - 1" aria-label="เลื่อนวันลง" @click="ed.moveDay(dayIndex, dayIndex + 1); ed.selected.day++">↓</button>
              <button class="btn btn-danger min-h-8 px-2" :disabled="b.days.length < 2" @click="delDay(dayIndex)">ลบวัน</button>
            </div>
          </div>
        </details>
      </aside>

      <!-- blocks -->
      <section v-if="day" class="min-w-0" aria-label="เนื้อหาของวัน">
        <!-- hints float above the page: anything in the flow here would shift the rows being targeted -->
        <p v-if="uploading || fileOver || drag" class="pointer-events-none fixed bottom-6 left-1/2 z-50 max-w-[92vw] -translate-x-1/2 rounded-full bg-forest px-4 py-2 text-sm text-white shadow-lg" role="status">
          <template v-if="uploading">กำลังอัปโหลด {{ uploading.done }}/{{ uploading.total }} ไฟล์…</template>
          <template v-else-if="fileOver">{{ fileOver.overList ? "ปล่อยเพื่อวางรูปตรงเส้นสีเขียว" : "ลากมาบนรายการเนื้อหาเพื่อเลือกตำแหน่ง (ปล่อยตรงอื่น = ต่อจากส่วนที่เลือก)" }}</template>
          <template v-else>ปล่อยเพื่อวางตรงเส้นสีเขียว · ลากไปที่ปุ่ม Day เพื่อย้ายวัน · Esc ยกเลิก</template>
        </p>
        <ol ref="blockList" class="relative grid grid-cols-[minmax(0,1fr)] gap-1.5">
          <li
            v-for="(x, i) in day.blocks" :key="x.id" data-row :data-row-id="x.id"
            class="group flex min-w-0 cursor-grab items-stretch rounded-lg border bg-white"
            :class="[x.id === ed.selected.blockId ? 'border-forest ring-1 ring-forest' : 'border-[#ece6da]', x.type === 'event' ? 'mt-3 bg-[#f4f1ea]' : '', drag?.from === i ? 'pointer-events-none relative z-20 opacity-90 shadow-xl' : drag ? '' : 'transition']"
            :style="drag?.from === i ? { transform: `translateY(${drag.dy}px) rotate(-0.4deg)` } : undefined"
            @pointerdown="startDrag($event, i, false)"
          >
            <span class="flex touch-none items-center px-1.5 text-muted" title="ลากเพื่อย้าย" aria-hidden="true" @pointerdown.stop="startDrag($event, i, true)">⋮⋮</span>
            <button class="flex min-w-0 flex-1 items-center gap-2 py-2 text-left" :aria-pressed="x.id === ed.selected.blockId" @click="select(x.id)">
              <img v-if="thumbOf(x)" :src="thumbOf(x)" alt="" class="h-10 w-14 shrink-0 rounded object-cover">
              <span class="min-w-0 flex-1">
                <span class="block text-[11px] uppercase tracking-wide text-muted">{{ BLOCK_LABELS[x.type] }}</span>
                <span class="block truncate text-sm" :class="x.type === 'event' ? 'font-semibold' : ''">{{ summary(x) }}</span>
              </span>
            </button>
            <span class="flex cursor-default items-center gap-0.5 pr-1 text-sm opacity-70 group-hover:opacity-100" data-no-drag>
              <button class="rounded px-1.5 py-1 hover:bg-[#eee8dc] disabled:opacity-30" :disabled="i === 0" :aria-label="`เลื่อน ${BLOCK_LABELS[x.type]} ขึ้น`" @click="ed.moveBlock(dayIndex, i, i - 1)">↑</button>
              <button class="rounded px-1.5 py-1 hover:bg-[#eee8dc] disabled:opacity-30" :disabled="i === day.blocks.length - 1" :aria-label="`เลื่อน ${BLOCK_LABELS[x.type]} ลง`" @click="ed.moveBlock(dayIndex, i, i + 1)">↓</button>
              <button class="rounded px-1.5 py-1 hover:bg-[#eee8dc]" title="ทำสำเนา" :aria-label="`ทำสำเนา ${BLOCK_LABELS[x.type]}`" @click="ed.duplicateBlock(dayIndex, x.id)">⧉</button>
              <button class="rounded px-1.5 py-1 text-danger hover:bg-[#fbeee9]" :aria-label="`ลบ ${BLOCK_LABELS[x.type]}`" @click="del(x)">✕</button>
            </span>
          </li>
          <div v-if="drag && drag.day === null" class="pointer-events-none absolute inset-x-0 z-10 h-1 rounded-full bg-forest" :style="{ top: `${drag.line}px` }" aria-hidden="true" />
          <div v-if="fileOver && fileOver.line !== null" class="pointer-events-none absolute inset-x-0 z-10 h-1 rounded-full bg-forest" :style="{ top: `${fileOver.line}px` }" aria-hidden="true" />
        </ol>
        <p v-if="!day.blocks.length" class="rounded-lg border border-dashed border-rule p-6 text-center text-muted">วันนี้ยังว่าง — เริ่มจาก “ช่วงเวลา” แล้วเขียนต่อด้านล่าง</p>
        <div class="relative mt-2">
          <button class="btn w-full" :aria-expanded="addOpen" @click="addOpen = !addOpen">+ เพิ่มเนื้อหา{{ block ? " ต่อจากส่วนที่เลือก" : " ท้ายวัน" }}</button>
          <div v-if="addOpen" class="card absolute inset-x-0 z-10 mt-1 grid grid-cols-2 gap-1 p-2 shadow-lg sm:grid-cols-3">
            <button v-for="t in BLOCK_TYPES" :key="t" class="rounded-md px-2 py-2 text-left text-sm hover:bg-[#f4f1ea]" @click="add(t)">{{ BLOCK_LABELS[t] }}</button>
          </div>
        </div>
      </section>

      <!-- properties -->
      <aside ref="editorPanel" class="min-w-0 scroll-mt-28 lg:sticky lg:top-32 lg:max-h-[calc(100dvh-9rem)] lg:overflow-auto" aria-label="แก้ไขส่วนที่เลือก">
        <div v-if="block" class="card p-4">
          <BlockEditor :key="block.id" :block="block" :media="media" :trip-id="b.trip.id" @media="onMedia" />
          <QuickInsert :trip-id="b.trip.id" @insert="quickInsert" />
          <label v-if="b.days.length > 1" class="field mt-4 border-t border-[#f0ebe1] pt-3"><span>ย้ายไปวันอื่น</span>
            <select class="input" :value="dayIndex" @change="moveToDay(block, Number(($event.target as HTMLSelectElement).value))">
              <option v-for="(d, i) in b.days" :key="d.id" :value="i">Day {{ pad2(d.dayNumber) }}</option>
            </select>
          </label>
        </div>
        <div v-else class="card p-6 text-center text-sm text-muted">เลือกส่วนในเรื่องราวเพื่อแก้ไข</div>
      </aside>

      <!-- live preview, docked beside the story on wide screens -->
      <div v-if="docked" class="min-w-0 xl:sticky xl:top-32 xl:h-[calc(100dvh-9rem)]">
        <LivePreview :bundle="b" :focus="previewFocus" @close="live = false" @pick="onPick" />
      </div>
    </div>

    <PublishCheck ref="checkDlg" :issues="issues" :republish="!!b.trip.publishedAt" :busy="publishing" :day-label="dayLabel" @go="goTo" @publish="confirmPublish" />

    <!-- live preview as a side panel (narrower screens, and the other tabs) -->
    <div v-if="live && !docked" class="fixed bottom-2 right-2 top-[7.5rem] z-40 w-[min(440px,calc(100vw-1rem))] shadow-2xl">
      <LivePreview :bundle="b" :focus="previewFocus" @close="live = false" @pick="onPick" />
    </div>
  </main>
</template>
