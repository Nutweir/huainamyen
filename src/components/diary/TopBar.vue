<script setup lang="ts">
/* Minimal sticky bar: back to all journeys, the trip, its days and the travel notes. Shows reading progress. */
import { RouterLink } from "vue-router";
import { pad2 } from "@/utils/format";

defineProps<{ title: string; days: number[]; hasNotes: boolean; backTo?: string }>();
</script>

<template>
  <header class="topbar">
    <nav class="topbar-inner" aria-label="นำทางบันทึก">
      <RouterLink class="tb-back" :to="backTo || '/journeys'" aria-label="All Journeys — บันทึกทั้งหมด"><span aria-hidden="true">←</span><span class="tb-wide">All Journeys</span></RouterLink>
      <a class="tb-title" href="#top">{{ title }}</a>
      <ul class="tb-links">
        <li v-for="d in days" :key="d"><a :href="`#day-${pad2(d)}`" :data-sec="`day-${pad2(d)}`"><span class="tb-wide">Day </span>{{ pad2(d) }}</a></li>
        <li v-if="hasNotes"><a href="#notes" data-sec="notes"><span class="tb-wide">Travel </span>Notes</a></li>
      </ul>
    </nav>
    <div class="tb-progress" aria-hidden="true"><span /></div>
  </header>
</template>
