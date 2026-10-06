<script setup lang="ts">
import { onBeforeUnmount, onMounted } from "vue";
import StatusPage from "@/components/common/StatusPage.vue";

onMounted(() => { document.body.classList.add("diary"); document.title = "ไม่พบหน้านี้ · Journeys by Nutweir"; });
onBeforeUnmount(() => document.body.classList.remove("diary"));
</script>

<template>
  <StatusPage title="ไม่พบหน้านี้" text="ลิงก์อาจเปลี่ยนไป ลองดูบันทึกการเดินทางทั้งหมด" />
</template>
