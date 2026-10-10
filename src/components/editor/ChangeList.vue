<script setup lang="ts">
/* "What changes for readers": each line before → after, clickable to the spot, and undoable on its own. */
import type { Change } from "@/services/diff";

defineProps<{ changes: Change[] }>();
const emit = defineEmits<{ go: [Change]; revert: [Change] }>();
const BADGE: Record<Change["kind"], { label: string; cls: string }> = {
  added: { label: "เพิ่ม", cls: "bg-[#e5efe6] text-forest" },
  removed: { label: "ลบ", cls: "bg-[#fbeee9] text-danger" },
  changed: { label: "แก้", cls: "bg-[#fbf3df] text-earth" },
  moved: { label: "ย้าย", cls: "bg-[#eee8dc] text-ink" },
};
</script>

<template>
  <ul class="grid gap-1">
    <li v-for="(c, n) in changes" :key="n" class="flex items-stretch gap-1">
      <button type="button" class="flex min-w-0 flex-1 items-start gap-2 rounded-lg border border-[#ece6da] px-3 py-2 text-left text-sm hover:border-forest" @click="emit('go', c)">
        <span class="chip shrink-0" :class="BADGE[c.kind].cls">{{ BADGE[c.kind].label }}</span>
        <span class="min-w-0 flex-1">
          <span class="block font-medium">{{ c.what }}</span>
          <span v-if="c.before !== undefined && c.kind !== 'added'" class="block text-xs text-muted line-through decoration-[#c9a79c]">{{ c.before }}</span>
          <span v-if="c.after !== undefined && c.kind !== 'removed'" class="block text-xs">{{ c.after }}</span>
        </span>
      </button>
      <button v-if="c.revert" type="button" class="shrink-0 rounded-lg border border-[#ece6da] px-2.5 text-xs text-muted hover:border-earth hover:text-ink" :title="`ย้อน “${c.what}” กลับเป็นแบบที่ผู้อ่านเห็นอยู่`" :aria-label="`ย้อนกลับ: ${c.what}`" @click="emit('revert', c)">↶ ย้อนกลับ</button>
    </li>
  </ul>
</template>
