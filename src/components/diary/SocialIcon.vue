<script setup lang="ts">
/** A platform's mark (utils/social), in its brand colour unless told otherwise. */
import { computed } from "vue";
import { platformById } from "@/utils/social";

const props = defineProps<{ platform: string; plain?: boolean }>();
const p = computed(() => platformById(props.platform) || platformById("other")!);
</script>

<template>
  <svg viewBox="0 0 24 24" aria-hidden="true" :style="plain ? undefined : { color: p.color }"><path :d="p.path" fill="currentColor" /></svg>
</template>
