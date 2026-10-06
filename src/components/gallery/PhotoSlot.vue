<script setup lang="ts">
/* An empty photo slot: a note to the owner. Readers never see it (shown only with ?slots or in admin preview). */
defineProps<{ label: string; layout: string; position: string }>();
</script>

<template>
  <figure :class="['ph', `ph--${layout || 'inline'}`, 'ph--empty', position && `ph--${position}`]">
    <div class="slot"><span class="slot-label">ยังไม่ได้แปะรูป</span><span class="hand">{{ label }}</span></div>
  </figure>
</template>
