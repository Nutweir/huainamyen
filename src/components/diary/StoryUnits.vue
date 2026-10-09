<script setup lang="ts">
/* A run of blocks, with small photos placed beside the text that follows them. data-block lets the admin preview find a block. */
import type { MediaAsset } from "@/types/content";
import type { RenderUnit } from "@/utils/story";
import BlockView from "./BlockView.vue";

defineProps<{ units: RenderUnit[]; media: Map<string, MediaAsset>; url: (a: MediaAsset, edge?: number) => string; srcset: (a: MediaAsset) => string; dayDate: string | null; showSlots: boolean }>();
</script>

<template>
  <template v-for="(u, i) in units" :key="i">
    <BlockView v-if="u.kind === 'block'" :data-block="u.block.id" :block="u.block" :media="media" :url="url" :srcset="srcset" :day-date="dayDate" :show-slots="showSlots" />
    <div v-else :class="['beside', `beside--${u.side}`]">
      <BlockView :data-block="u.figure.id" :block="u.figure" :media="media" :url="url" :srcset="srcset" :day-date="dayDate" :show-slots="showSlots" />
      <div class="beside-text">
        <BlockView v-for="t in u.text" :key="t.id" :data-block="t.id" :block="t" :media="media" :url="url" :srcset="srcset" :day-date="dayDate" :show-slots="showSlots" />
      </div>
    </div>
  </template>
</template>
