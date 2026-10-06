<script setup lang="ts">
/* Every photo of the trip as a drifting contact strip (the auto-scroll lives in useDiaryBehaviour). */
import { computed } from "vue";
import type { MediaAsset } from "@/types/content";

const props = defineProps<{ ids: string[]; media: Map<string, MediaAsset>; url: (a: MediaAsset, edge?: number) => string; srcset: (a: MediaAsset) => string }>();
const frames = computed(() => props.ids.map(id => props.media.get(id)).filter((m): m is MediaAsset => !!m && m.kind === "image"));
const sizes = (m: MediaAsset) => `${Math.round((280 * m.width) / (m.height || 1))}px`;
</script>

<template>
  <section v-if="frames.length" id="roll" class="roll" data-mood="notes" aria-labelledby="roll-t">
    <div class="flow">
      <div class="roll-head">
        <h2 id="roll-t" class="roll-title">ม้วนฟิล์มจากทริปนี้ <small>{{ frames.length }} ภาพ · เลื่อนดูได้</small></h2>
        <button type="button" class="roll-toggle" aria-pressed="false" hidden>หยุด</button>
      </div>
    </div>
    <div class="strip" tabindex="0" role="region" aria-labelledby="roll-t">
      <ol>
        <li v-for="m in frames" :key="m.id">
          <button type="button" class="ph-open" :data-lb="url(m)" data-lb-group="roll" :data-lb-caption="m.caption" :aria-label="`ขยายภาพ: ${m.alt || m.caption}`">
            <img :src="url(m)" :srcset="srcset(m) || undefined" :sizes="srcset(m) ? sizes(m) : undefined" :alt="m.alt" :width="m.width || undefined" :height="m.height || undefined" loading="lazy" decoding="async">
          </button>
        </li>
        <!-- a second, hidden copy lets the strip loop without a jump -->
        <li v-for="m in frames" :key="`dup-${m.id}`" data-dup aria-hidden="true">
          <button type="button" class="ph-open" tabindex="-1" :data-lb="url(m)" data-lb-group="roll" :data-lb-caption="m.caption">
            <img :src="url(m)" :srcset="srcset(m) || undefined" :sizes="srcset(m) ? sizes(m) : undefined" alt="" :width="m.width || undefined" :height="m.height || undefined" loading="lazy" decoding="async">
          </button>
        </li>
      </ol>
    </div>
  </section>
</template>
