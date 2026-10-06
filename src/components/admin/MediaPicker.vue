<script setup lang="ts">
/* Choose photos/clips from the library (or upload new ones) for a spot in the story. */
import { computed, ref } from "vue";
import type { MediaAsset } from "@/types/content";
import { useBackend } from "@/services";
import MediaUploader from "./MediaUploader.vue";

const props = withDefaults(defineProps<{ kind?: "image" | "video"; multiple?: boolean; tripId?: string | null; layout?: string }>(), { kind: "image", multiple: false, tripId: null, layout: "" });
const emit = defineEmits<{ pick: [MediaAsset[]] }>();
const { repo } = useBackend();

const dlg = ref<HTMLDialogElement | null>(null);
const all = ref<MediaAsset[]>([]);
const q = ref("");
const onlyTrip = ref(true);
const chosen = ref<string[]>([]);
const tab = ref<"library" | "upload">("library");
const loading = ref(false);

const posters = computed(() => new Set(all.value.map(m => m.posterId).filter(Boolean)));
const list = computed(() => {
  const needle = q.value.trim().toLowerCase();
  return all.value
    .filter(m => m.kind === props.kind && !posters.value.has(m.id))
    .filter(m => !onlyTrip.value || !props.tripId || m.tripId === props.tripId)
    .filter(m => !needle || [m.caption, m.alt, m.location, m.album || "", ...m.tags, m.path].join(" ").toLowerCase().includes(needle));
});
const thumb = (m: MediaAsset) => {
  const p = m.kind === "video" && m.posterId ? all.value.find(x => x.id === m.posterId) : m;
  return p ? repo.mediaUrl(p, 500) : "";
};

async function open(preselect: string[] = []) {
  chosen.value = [...preselect]; q.value = ""; tab.value = "library";
  dlg.value?.showModal();
  loading.value = true;
  try { all.value = await repo.listMedia(); onlyTrip.value = !!props.tripId && all.value.some(m => m.tripId === props.tripId && m.kind === props.kind); }
  finally { loading.value = false; }
}
function toggle(id: string) {
  if (!props.multiple) { chosen.value = [id]; return; }
  chosen.value = chosen.value.includes(id) ? chosen.value.filter(x => x !== id) : [...chosen.value, id];
}
function done() {
  const map = new Map(all.value.map(m => [m.id, m]));
  const picked = chosen.value.map(id => map.get(id)).filter((m): m is MediaAsset => !!m);
  // a clip's poster travels with it, so the trip can show it
  const extra = picked.flatMap(m => (m.posterId && map.get(m.posterId) ? [map.get(m.posterId)!] : []));
  emit("pick", [...picked, ...extra]);
  dlg.value?.close();
}
async function uploaded(assets: MediaAsset[]) {
  all.value = await repo.listMedia();
  const mine = assets.filter(a => a.kind === props.kind).map(a => a.id);
  chosen.value = props.multiple ? [...chosen.value, ...mine] : mine.slice(0, 1);
  tab.value = "library";
  onlyTrip.value = false;
}
defineExpose({ open });
</script>

<template>
  <dialog ref="dlg" class="h-[min(760px,calc(100dvh-24px))] w-[min(980px,calc(100vw-24px))] rounded-xl border border-rule bg-white p-0 backdrop:bg-black/40">
    <div class="flex h-full flex-col">
      <div class="flex flex-wrap items-center gap-2 border-b border-[#ece6da] p-3">
        <h2 class="font-display text-lg">{{ kind === "video" ? "เลือกวิดีโอ" : multiple ? "เลือกรูป (หลายรูปได้)" : "เลือกรูป" }}</h2>
        <div class="ml-auto flex gap-1" role="tablist">
          <button role="tab" :aria-selected="tab === 'library'" class="chip border border-rule" :class="tab === 'library' ? 'bg-ink text-white' : ''" @click="tab = 'library'">จากคลัง</button>
          <button role="tab" :aria-selected="tab === 'upload'" class="chip border border-rule" :class="tab === 'upload' ? 'bg-ink text-white' : ''" @click="tab = 'upload'">อัปโหลดใหม่</button>
        </div>
      </div>
      <div v-if="tab === 'library'" class="flex min-h-0 flex-1 flex-col">
        <div class="flex flex-wrap items-center gap-3 p-3">
          <input v-model="q" class="input max-w-xs" type="search" placeholder="ค้นหาคำบรรยาย แท็ก สถานที่…" aria-label="ค้นหาในคลัง">
          <label v-if="tripId" class="flex items-center gap-2 text-sm"><input v-model="onlyTrip" type="checkbox"> เฉพาะของทริปนี้</label>
        </div>
        <p v-if="loading" class="px-3 text-muted">กำลังโหลด…</p>
        <ul v-else class="grid min-h-0 flex-1 auto-rows-min grid-cols-3 gap-2 overflow-auto p-3 sm:grid-cols-5 lg:grid-cols-6">
          <li v-for="m in list" :key="m.id">
            <button
              type="button" class="relative block w-full overflow-hidden rounded-md ring-offset-2" :class="chosen.includes(m.id) ? 'ring-[3px] ring-forest' : ''"
              :aria-pressed="chosen.includes(m.id)" :title="m.caption || m.path" @click="toggle(m.id)" @dblclick="!multiple && (toggle(m.id), done())"
            >
              <img :src="thumb(m)" :alt="m.alt || m.caption || 'รูปในคลัง'" class="aspect-square w-full object-cover" loading="lazy">
              <span v-if="m.kind === 'video'" class="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 text-xs text-white">▶</span>
              <span v-if="chosen.includes(m.id) && multiple" class="absolute right-1 top-1 grid size-6 place-items-center rounded-full bg-forest text-xs text-white">{{ chosen.indexOf(m.id) + 1 }}</span>
            </button>
          </li>
          <li v-if="!list.length" class="col-span-full py-6 text-center text-muted">ไม่มีไฟล์ในคลัง — ลองแท็บ “อัปโหลดใหม่”</li>
        </ul>
      </div>
      <div v-else class="min-h-0 flex-1 overflow-auto p-3">
        <MediaUploader :meta="{ tripId }" :layout="layout" :accept="kind" :multiple="multiple" @uploaded="uploaded" />
      </div>
      <div class="flex items-center gap-2 border-t border-[#ece6da] p-3">
        <span class="text-sm text-muted">เลือกแล้ว {{ chosen.length }}</span>
        <button class="btn ml-auto" :disabled="!chosen.length" @click="done">ใช้ที่เลือก</button>
        <button class="btn btn-ghost" @click="dlg?.close()">ยกเลิก</button>
      </div>
    </div>
  </dialog>
</template>
