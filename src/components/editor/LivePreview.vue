<script setup lang="ts">
/*
 * Live preview beside the editor: the real public page in a frame, fed the unsaved working copy.
 * Shows a phone (390px) or a desktop (1280px) scaled to fit, and follows the block being edited.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import type { TripBundle } from "@/types/content";

const props = defineProps<{ bundle: TripBundle; focus: string }>();
defineEmits<{ close: [] }>();
const router = useRouter();

const DEVICES = { phone: { w: 390, label: "มือถือ" }, desktop: { w: 1280, label: "จอใหญ่" } } as const;
type Device = keyof typeof DEVICES;
const read = (k: string, d: string) => { try { return localStorage.getItem(k) || d; } catch { return d; } };
const device = ref<Device>(read("journeys-preview-device", "phone") === "desktop" ? "desktop" : "phone");
const slots = ref(true);
watch(device, d => { try { localStorage.setItem("journeys-preview-device", d); } catch { /* fine */ } });

const frame = ref<HTMLIFrameElement | null>(null);
const box = ref<HTMLElement | null>(null);
const size = ref({ w: 0, h: 0 });
const ready = ref(false);
const src = computed(() => router.resolve(`/admin/trips/${props.bundle.trip.id}/preview?embed`).href);
const scale = computed(() => (size.value.w ? Math.min(1, size.value.w / DEVICES[device.value].w) : 1));

function send(withBundle: boolean) {
  const win = frame.value?.contentWindow;
  if (!win || !ready.value) return;
  // a JSON string: the working copy is a reactive object, which postMessage can't clone
  win.postMessage({ type: "journeys-draft", focus: props.focus, slots: slots.value, ...(withBundle ? { bundle: JSON.stringify(props.bundle) } : {}) }, location.origin);
}
let timer = 0;
watch(() => props.bundle, () => { clearTimeout(timer); timer = window.setTimeout(() => send(true), 250); }, { deep: true });
watch(() => props.focus, () => send(false));
watch(slots, () => send(false));

function onMessage(e: MessageEvent) {
  if (e.origin !== location.origin || e.source !== frame.value?.contentWindow) return;
  if ((e.data as { type?: string })?.type === "journeys-preview-ready") { ready.value = true; send(true); }
}
let ro: ResizeObserver | null = null;
onMounted(() => {
  addEventListener("message", onMessage);
  ro = new ResizeObserver(([e]) => { size.value = { w: e.contentRect.width, h: e.contentRect.height }; });
  if (box.value) ro.observe(box.value);
});
onBeforeUnmount(() => { removeEventListener("message", onMessage); ro?.disconnect(); clearTimeout(timer); });
</script>

<template>
  <section class="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-[#ece6da] bg-white" aria-label="ตัวอย่างสด">
    <div class="flex flex-wrap items-center gap-2 border-b border-[#ece6da] px-3 py-2 text-sm">
      <span class="font-medium">ตัวอย่างสด</span>
      <span class="text-xs text-muted">เห็นแบบนี้หลังเผยแพร่</span>
      <div class="ml-auto flex gap-1" role="group" aria-label="ขนาดหน้าจอ">
        <button v-for="(d, k) in DEVICES" :key="k" type="button" class="chip border border-rule" :class="device === k ? 'bg-ink text-white' : 'bg-white'" :aria-pressed="device === k" @click="device = k">{{ d.label }}</button>
      </div>
      <label class="flex items-center gap-1 text-xs"><input v-model="slots" type="checkbox"> ช่องรอรูป</label>
      <button type="button" class="rounded px-1.5 text-lg leading-none" aria-label="ปิดตัวอย่าง" @click="$emit('close')">×</button>
    </div>
    <div ref="box" class="relative min-h-0 flex-1 overflow-hidden bg-[#e9e4da]">
      <iframe
        ref="frame" :src="src" title="ตัวอย่างหน้าบันทึก" class="absolute left-1/2 top-0 origin-top border-0 bg-white"
        :style="{ width: `${DEVICES[device].w}px`, height: `${size.h / scale}px`, transform: `translateX(-50%) scale(${scale})` }"
      />
      <p v-if="!ready" class="absolute inset-0 grid place-items-center text-sm text-muted">กำลังเปิดตัวอย่าง…</p>
    </div>
  </section>
</template>
