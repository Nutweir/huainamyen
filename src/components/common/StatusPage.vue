<script setup lang="ts">
defineProps<{ title: string; text?: string }>();
</script>

<template>
  <main id="journal" class="shelf-head flow" tabindex="-1">
    <p class="kicker">Journeys by Nutweir</p>
    <h1>{{ title }}</h1>
    <p v-if="text" class="shelf-lede">{{ text }}</p>
    <p class="shelf-lede"><RouterLink to="/journeys">← บันทึกการเดินทางทั้งหมด</RouterLink></p>
  </main>
</template>
