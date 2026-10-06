<script setup lang="ts">
/*
 * Drop or choose several photos/clips, check them against the recommended size for where they will go,
 * crop/rotate any of them, then upload. Emits the new assets.
 */
import { computed, nextTick, ref } from "vue";
import type { MediaAsset } from "@/types/content";
import { useUploads, type QueueItem } from "@/composables/useUploads";
import { checkSize, LAYOUT_ADVICE } from "@/utils/media";
import { LIMITS } from "@/services/files";
import CropDialog from "@/components/editor/CropDialog.vue";

const props = withDefaults(defineProps<{ meta?: Partial<MediaAsset>; layout?: string; accept?: "image" | "video" | "any"; multiple?: boolean }>(), { meta: () => ({}), layout: "", accept: "any", multiple: true });
const emit = defineEmits<{ uploaded: [MediaAsset[]] }>();

const { queue, busy, add, uploadAll, remove, clearDone } = useUploads(() => props.meta);
const input = ref<HTMLInputElement | null>(null);
const over = ref(false);
const cropping = ref<QueueItem | null>(null);
const cropDlg = ref<InstanceType<typeof CropDialog> | null>(null);
const advice = computed(() => LAYOUT_ADVICE[props.layout] || LAYOUT_ADVICE[""]);
const acceptAttr = computed(() => ({ image: "image/*,.dng,.heic", video: "video/*,.mov,.mp4", any: "image/*,video/*,.dng,.heic,.mov" })[props.accept]);
const ready = computed(() => queue.value.filter(i => i.state === "ready").length);

function pick(files: FileList | null | undefined) {
  if (!files?.length) return;
  // copy now: the browser empties a FileList when the input is reset
  const list = Array.from(files).filter(f => props.accept === "any" || (props.accept === "video") === /^video\/|\.(mov|mp4|m4v|webm)$/i.test(f.type || f.name));
  void add(props.multiple ? list : list.slice(0, 1));
  if (input.value) input.value.value = "";
}
function notes(it: QueueItem) {
  if (!it.size || it.type?.kind === "video") return [];
  let { w, h } = it.size;
  if (it.edit.rotate && it.edit.rotate % 180) [w, h] = [h, w];
  if (it.edit.crop) { w = Math.round(w * it.edit.crop.w); h = Math.round(h * it.edit.crop.h); }
  return checkSize(w, h, advice.value).notes;
}
async function openCrop(it: QueueItem) { cropping.value = it; await nextTick(); cropDlg.value?.open(); }
async function upload() {
  const done = await uploadAll();
  if (done.length) emit("uploaded", done);
}
const mb = (n: number) => `${(n / 1048576).toFixed(1)} MB`;
</script>

<template>
  <div>
    <div
      class="grid place-items-center rounded-xl border-2 border-dashed px-4 py-6 text-center transition"
      :class="over ? 'border-forest bg-[#eef4ee]' : 'border-rule bg-[#fcfaf6]'"
      @dragover.prevent="over = true" @dragleave="over = false" @drop.prevent="over = false; pick($event.dataTransfer?.files)"
    >
      <p class="font-medium">ลากไฟล์มาวางที่นี่ หรือ</p>
      <button type="button" class="btn btn-ghost mt-2" @click="input?.click()">เลือกไฟล์{{ multiple ? " (หลายไฟล์ได้)" : "" }}</button>
      <input ref="input" type="file" class="sr-only" :accept="acceptAttr" :multiple="multiple" @change="pick(($event.target as HTMLInputElement).files)">
      <p class="mt-2 text-xs text-muted">
        JPG PNG WebP HEIC DNG ≤ {{ LIMITS.imageBytes / 1048576 }} MB · MP4 MOV ≤ {{ LIMITS.videoBytes / 1048576 }} MB<br>
        แนะนำ: {{ advice.text }} · เก็บไฟล์ต้นฉบับไว้เสมอ หน้าเว็บใช้สำเนา WebP
      </p>
    </div>

    <ul v-if="queue.length" class="mt-3 grid gap-2">
      <li v-for="it in queue" :key="it.key" class="flex items-center gap-3 rounded-lg border border-[#ece6da] bg-white p-2">
        <img v-if="it.preview" :src="it.preview" alt="" class="size-14 shrink-0 rounded object-cover" :style="it.edit.rotate ? { transform: `rotate(${it.edit.rotate}deg)` } : {}">
        <div v-else class="grid size-14 shrink-0 place-items-center rounded bg-[#efe9dd] text-xs text-muted">{{ it.type?.kind === "video" ? "วิดีโอ" : "ไฟล์" }}</div>
        <div class="min-w-0 flex-1 text-sm">
          <p class="truncate font-medium">{{ it.file.name }}</p>
          <p class="text-xs text-muted">
            {{ mb(it.file.size) }}<template v-if="it.size"> · {{ it.size.w }}×{{ it.size.h }}</template><template v-if="it.edit.crop || it.edit.rotate"> · ครอป/หมุนแล้ว</template>
          </p>
          <p v-for="n in notes(it)" :key="n" class="text-xs text-earth">⚠ {{ n }}</p>
          <p v-if="it.error" class="text-xs text-danger" role="alert">{{ it.error }}</p>
        </div>
        <span v-if="it.state === 'working'" class="text-xs text-muted" role="status">กำลังอัปโหลด…</span>
        <span v-else-if="it.state === 'done'" class="text-xs text-forest">✓ เสร็จ</span>
        <template v-else>
          <button v-if="it.preview && it.state === 'ready'" type="button" class="btn btn-ghost min-h-8 px-3" @click="openCrop(it)">ครอป/หมุน</button>
          <button type="button" class="btn btn-ghost min-h-8 px-3" :aria-label="`เอา ${it.file.name} ออก`" @click="remove(it)">✕</button>
        </template>
      </li>
    </ul>
    <div v-if="queue.length" class="mt-3 flex gap-2">
      <button type="button" class="btn" :disabled="busy || !ready" @click="upload">{{ busy ? "กำลังอัปโหลด…" : `อัปโหลด ${ready} ไฟล์` }}</button>
      <button v-if="queue.some(i => i.state === 'done')" type="button" class="btn btn-ghost" @click="clearDone">ล้างรายการที่เสร็จ</button>
    </div>

    <CropDialog
      v-if="cropping" ref="cropDlg" :key="cropping.key" :src="cropping.preview" :ratio="advice.ratio || null" :advice="advice.text"
      @done="e => { cropping!.edit = e; cropping = null; }" @cancel="cropping = null"
    />
  </div>
</template>
