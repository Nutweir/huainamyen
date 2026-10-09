<script setup lang="ts">
/*
 * "Place photos by time taken": the trip's photos that aren't in the story yet (and any uploaded here),
 * each with a suggested moment from its EXIF time. Change any suggestion, untick what you don't want,
 * then place them all at once (one photo → a photo; several in one moment → a set).
 */
import { computed, ref } from "vue";
import type { MediaAsset, TripBundle } from "@/types/content";
import { useBackend } from "@/services";
import { referencedMedia } from "@/services/snapshot";
import { eventOptions, propose, type Target } from "@/services/autoPlace";
import MediaUploader from "@/components/admin/MediaUploader.vue";

const props = defineProps<{ bundle: TripBundle }>();
const emit = defineEmits<{ apply: [{ assets: MediaAsset[]; target: Target }[]] }>();
const { repo } = useBackend();

interface Row { asset: MediaAsset; on: boolean; to: string; why: string }
const dlg = ref<HTMLDialogElement | null>(null);
const rows = ref<Row[]>([]);
const loading = ref(false);
const showUpload = ref(false);
const options = computed(() => eventOptions(props.bundle));
const key = (t: Target | null) => (t ? `${t.day}|${t.eventId || ""}` : "");
const parse = (k: string): Target => { const [d, e] = k.split("|"); return { day: Number(d), eventId: e || null }; };
const chosen = computed(() => rows.value.filter(r => r.on && r.to));

function addRows(assets: MediaAsset[]) {
  const have = new Set(rows.value.map(r => r.asset.id));
  const fresh = assets.filter(a => !have.has(a.id));
  for (const p of propose(props.bundle, fresh)) rows.value.push({ asset: p.asset, on: !!p.target, to: key(p.target), why: p.why });
  rows.value.sort((a, b) => `${a.asset.takenDate || "9"}${a.asset.takenTime || ""}`.localeCompare(`${b.asset.takenDate || "9"}${b.asset.takenTime || ""}`));
}
async function open() {
  rows.value = []; showUpload.value = false;
  dlg.value?.showModal();
  loading.value = true;
  try {
    const used = referencedMedia(props.bundle);
    const all = await repo.listMedia({ tripId: props.bundle.trip.id });
    const posters = new Set(all.map(m => m.posterId).filter(Boolean));
    addRows(all.filter(m => m.kind === "image" && !used.has(m.id) && !posters.has(m.id)));
    if (!rows.value.length) showUpload.value = true;
  } finally { loading.value = false; }
}
function uploaded(assets: MediaAsset[]) { addRows(assets.filter(a => a.kind === "image")); showUpload.value = false; }
function apply() {
  const groups = new Map<string, MediaAsset[]>();
  for (const r of chosen.value) groups.set(r.to, [...(groups.get(r.to) || []), r.asset]);
  emit("apply", [...groups].map(([k, assets]) => ({ target: parse(k), assets })));
  dlg.value?.close();
}
defineExpose({ open });
</script>

<template>
  <dialog ref="dlg" class="h-[min(820px,calc(100dvh-24px))] w-[min(860px,calc(100vw-24px))] rounded-xl border border-rule bg-white p-0 backdrop:bg-black/40" aria-labelledby="ap-title">
    <div class="flex h-full flex-col">
      <div class="border-b border-[#ece6da] p-4">
        <h2 id="ap-title" class="font-display text-xl">จัดรูปตามเวลาที่ถ่าย</h2>
        <p class="mt-1 text-sm text-muted">รูปของทริปนี้ที่ยังไม่อยู่ในเรื่อง ระบบดูวันเวลาที่ถ่ายในไฟล์แล้วเสนอช่วงเวลาที่น่าจะใช่ — เปลี่ยนได้ทุกรูปก่อนกดวาง</p>
        <button type="button" class="btn btn-ghost mt-2 min-h-8 px-3" :aria-expanded="showUpload" @click="showUpload = !showUpload">{{ showUpload ? "ซ่อนการอัปโหลด" : "+ อัปโหลดรูปจากทริปเพิ่ม" }}</button>
        <MediaUploader v-if="showUpload" class="mt-3" :meta="{ tripId: bundle.trip.id }" accept="image" @uploaded="uploaded" />
      </div>
      <div class="min-h-0 flex-1 overflow-auto p-4">
        <p v-if="loading" class="text-muted">กำลังโหลดรูป…</p>
        <p v-else-if="!rows.length" class="py-6 text-center text-muted">ทุกรูปของทริปนี้อยู่ในเรื่องแล้ว — อัปโหลดรูปใหม่ด้านบนได้เลย</p>
        <ul v-else class="grid gap-1.5">
          <li v-for="r in rows" :key="r.asset.id" class="flex items-center gap-3 rounded-lg border p-2" :class="r.on && r.to ? 'border-forest bg-[#f6faf5]' : 'border-[#ece6da]'">
            <input v-model="r.on" type="checkbox" class="size-4" :aria-label="`วางรูป ${r.asset.caption || r.asset.path}`">
            <img :src="repo.mediaUrl(r.asset, 500)" :alt="r.asset.alt" class="h-14 w-20 shrink-0 rounded object-cover">
            <div class="min-w-0 flex-1 text-sm">
              <p class="truncate">{{ r.asset.caption || r.asset.alt || r.asset.path.split("/").pop() }}</p>
              <p class="text-xs text-muted">{{ r.asset.takenDate || "ไม่มีวันที่" }} {{ r.asset.takenTime || "" }} · {{ r.why }}</p>
            </div>
            <select v-model="r.to" class="input w-56 min-h-9 text-sm" :aria-label="`ตำแหน่งของรูป ${r.asset.caption || ''}`" @change="r.on = !!r.to">
              <option value="">— ไม่วาง —</option>
              <option v-for="o in options" :key="key(o)" :value="key(o)">{{ o.label }}</option>
            </select>
          </li>
        </ul>
      </div>
      <div class="flex items-center gap-2 border-t border-[#ece6da] p-4">
        <span class="text-sm text-muted">เลือก {{ chosen.length }} รูป · รูปเดียวในช่วงเวลา = รูปเดี่ยว, หลายรูป = ชุดรูป</span>
        <button class="btn ml-auto" :disabled="!chosen.length" @click="apply">วาง {{ chosen.length }} รูป</button>
        <button class="btn btn-ghost" @click="dlg?.close()">ยกเลิก</button>
      </div>
    </div>
  </dialog>
</template>
