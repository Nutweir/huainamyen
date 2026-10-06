<script setup lang="ts">
/* Public pages wear the diary: paper, moods and grain (body.diary). */
import { onBeforeUnmount, onMounted } from "vue";
import { RouterView } from "vue-router";

onMounted(() => { document.body.classList.add("diary"); document.body.dataset.mood ||= "morning"; });
onBeforeUnmount(() => { document.body.classList.remove("diary"); delete document.body.dataset.mood; });
</script>

<template>
  <a class="skip" href="#journal">ข้ามไปเนื้อหา</a>
  <RouterView />
</template>
