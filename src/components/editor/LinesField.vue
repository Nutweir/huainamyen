<script setup lang="ts">
/* A list of lines edited as one textarea. `groups` = paragraphs (stanzas) separated by an empty line. */
import { computed } from "vue";

const props = defineProps<{ label: string; hint?: string; rows?: number }>();
const lines = defineModel<string[]>("lines");
const groups = defineModel<string[][]>("groups");

const text = computed({
  get: () => (groups.value ? groups.value.map(g => g.join("\n")).join("\n\n") : (lines.value || []).join("\n")),
  set: (v: string) => {
    if (groups.value) groups.value = v.split(/\n\s*\n/).map(g => g.split("\n").map(l => l.trimEnd())).filter(g => g.some(l => l.trim()));
    else lines.value = v.split("\n").map(l => l.trimEnd());
  },
});
</script>

<template>
  <label class="field">
    <span>{{ props.label }}</span>
    <textarea v-model.lazy="text" class="input" :rows="rows || 4" />
    <small v-if="hint" class="text-xs text-muted">{{ hint }}</small>
  </label>
</template>
