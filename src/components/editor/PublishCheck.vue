<script setup lang="ts">
/* Shown when you press Publish: what the check found, each item a link to the spot. Errors hold publishing back. */
import { computed, ref } from "vue";
import type { Issue } from "@/services/publishCheck";

const props = defineProps<{ issues: Issue[]; republish: boolean; busy: boolean; dayLabel: (d: number) => string }>();
const emit = defineEmits<{ go: [Issue]; publish: [] }>();
const dlg = ref<HTMLDialogElement | null>(null);
const errors = computed(() => props.issues.filter(i => i.level === "error"));
const warns = computed(() => props.issues.filter(i => i.level === "warn"));
const place = (i: Issue) => (i.where.tab === "story" ? props.dayLabel(i.where.day) : i.where.tab === "trip" ? "ข้อมูลทริป" : "ข้อมูลการเดินทาง");
function go(i: Issue) { dlg.value?.close(); emit("go", i); }
defineExpose({ open: () => dlg.value?.showModal(), close: () => dlg.value?.close() });
</script>

<template>
  <dialog ref="dlg" class="w-[min(620px,calc(100vw-24px))] rounded-xl border border-rule bg-white p-0 backdrop:bg-black/40" aria-labelledby="pc-title">
    <div class="max-h-[80dvh] overflow-auto p-5">
      <h2 id="pc-title" class="font-display text-xl">{{ republish ? "เผยแพร่ฉบับนี้แทนฉบับที่ผู้อ่านเห็นอยู่?" : "เผยแพร่ทริปนี้ให้ทุกคนอ่านได้?" }}</h2>
      <p v-if="!issues.length" class="mt-3 rounded-lg bg-[#e5efe6] px-3 py-2 text-sm text-forest">✓ ตรวจแล้ว ไม่พบอะไรที่ต้องแก้</p>

      <section v-if="errors.length" class="mt-4">
        <h3 class="text-sm font-semibold text-danger">ต้องแก้ก่อนเผยแพร่ ({{ errors.length }})</h3>
        <ul class="mt-1.5 grid gap-1">
          <li v-for="(i, n) in errors" :key="`e${n}`">
            <button type="button" class="flex w-full items-start gap-2 rounded-lg border border-[#e7c8bf] bg-[#fbeee9] px-3 py-2 text-left text-sm hover:border-danger" @click="go(i)">
              <span class="min-w-0 flex-1">{{ i.message }}</span><span class="shrink-0 text-xs text-muted">{{ place(i) }} →</span>
            </button>
          </li>
        </ul>
      </section>

      <section v-if="warns.length" class="mt-4">
        <h3 class="text-sm font-semibold text-earth">ควรดู ({{ warns.length }}) — เผยแพร่ได้แม้ยังไม่แก้</h3>
        <ul class="mt-1.5 grid gap-1">
          <li v-for="(i, n) in warns" :key="`w${n}`">
            <button type="button" class="flex w-full items-start gap-2 rounded-lg border border-[#ece6da] px-3 py-2 text-left text-sm hover:border-earth" @click="go(i)">
              <span class="min-w-0 flex-1">{{ i.message }}</span><span class="shrink-0 text-xs text-muted">{{ place(i) }} →</span>
            </button>
          </li>
        </ul>
      </section>
    </div>
    <div class="flex flex-wrap items-center gap-2 border-t border-[#ece6da] p-4">
      <span v-if="errors.length" class="text-sm text-danger">แก้รายการสีแดงก่อน แล้วกดเผยแพร่อีกครั้ง</span>
      <button class="btn ml-auto" :disabled="!!errors.length || busy" @click="emit('publish')">{{ busy ? "กำลังเผยแพร่…" : warns.length ? "เผยแพร่เลย" : "เผยแพร่" }}</button>
      <button class="btn btn-ghost" @click="dlg?.close()">กลับไปแก้</button>
    </div>
  </dialog>
</template>
