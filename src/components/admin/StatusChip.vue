<script setup lang="ts">
import type { TripStatus } from "@/types/content";
defineProps<{ status: TripStatus }>();
const LABEL: Record<TripStatus, string> = { draft: "ฉบับร่าง", published: "เผยแพร่แล้ว", archived: "เก็บเข้าคลัง" };
const COLOR: Record<TripStatus, string> = { draft: "bg-[#fbf0dc] text-earth", published: "bg-[#e5efe6] text-forest", archived: "bg-[#eee] text-muted" };
</script>

<template><span class="chip shrink-0" :class="COLOR[status]">{{ LABEL[status] }}</span></template>
