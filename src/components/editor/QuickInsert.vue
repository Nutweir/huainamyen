<script setup lang="ts">
/*
 * "Add a photo here": pick from the library or upload, and it is placed next to the block you are on.
 * The new block is selected afterwards, so its layout can be tried right away in the live preview.
 */
import { ref } from "vue";
import type { MediaAsset } from "@/types/content";
import MediaPicker from "@/components/admin/MediaPicker.vue";

export type InsertMode = "after" | "beside" | "set" | "video";
defineProps<{ tripId: string }>();
const emit = defineEmits<{ insert: [InsertMode, MediaAsset[]] }>();

const picker = ref<InstanceType<typeof MediaPicker> | null>(null);
const mode = ref<InsertMode>("after");
const OPTIONS: { mode: InsertMode; label: string; hint: string }[] = [
  { mode: "after", label: "รูปต่อจากนี้", hint: "รูปเดี่ยวคั่นระหว่างย่อหน้า" },
  { mode: "beside", label: "รูปเล็กข้างข้อความ", hint: "รูปลายมือแปะข้างย่อหน้านี้" },
  { mode: "set", label: "หลายรูป", hint: "ชุดรูป / คอลลาจ ต่อจากนี้" },
  { mode: "video", label: "วิดีโอ", hint: "คลิปต่อจากนี้" },
];
function open(m: InsertMode) { mode.value = m; picker.value?.open(); }
</script>

<template>
  <div class="mt-4 border-t border-[#f0ebe1] pt-3">
    <p class="text-sm font-medium">เพิ่มรูปตรงนี้</p>
    <div class="mt-2 grid grid-cols-2 gap-1.5">
      <button v-for="o in OPTIONS" :key="o.mode" type="button" class="rounded-lg border border-rule bg-white px-2.5 py-2 text-left hover:border-forest" @click="open(o.mode)">
        <span class="block text-sm font-medium">+ {{ o.label }}</span>
        <span class="block text-xs text-muted">{{ o.hint }}</span>
      </button>
    </div>
    <p class="mt-1.5 text-xs text-muted">เลือกจากคลังหรืออัปโหลดใหม่ แล้วลองเปลี่ยนรูปแบบดูในตัวอย่างสดได้เลย</p>
    <MediaPicker
      ref="picker" :kind="mode === 'video' ? 'video' : 'image'" :multiple="mode === 'set'" :trip-id="tripId"
      :layout="mode === 'beside' ? 'diary-photo' : mode === 'set' ? 'collage' : ''" @pick="a => emit('insert', mode, a)"
    />
  </div>
</template>
