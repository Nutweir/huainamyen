<script setup lang="ts">
/* Overview: counts, drafts, recently edited trips, media, and a quick way to start a new trip. */
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import type { MediaAsset, TripSummary } from "@/types/content";
import { useBackend } from "@/services";
import { dateRange } from "@/utils/format";
import NewTripDialog from "@/components/admin/NewTripDialog.vue";
import StatusChip from "@/components/admin/StatusChip.vue";

const { repo } = useBackend();
const router = useRouter();
const trips = ref<TripSummary[]>([]);
const media = ref<MediaAsset[]>([]);
const loading = ref(true);
const error = ref("");
const dlg = ref<InstanceType<typeof NewTripDialog> | null>(null);

onMounted(async () => {
  try { [trips.value, media.value] = await Promise.all([repo.listTrips(), repo.listMedia()]); }
  catch (e) { error.value = (e as Error).message; }
  finally { loading.value = false; }
});

const count = (s: string) => trips.value.filter(t => t.status === s).length;
const recent = computed(() => [...trips.value].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 6));
const drafts = computed(() => trips.value.filter(t => t.status === "draft"));
const recentMedia = computed(() => [...media.value].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 8));
const thumb = (m: MediaAsset) => repo.mediaUrl(m.kind === "video" && m.posterId ? media.value.find(x => x.id === m.posterId) || m : m, 500);
</script>

<template>
  <main class="mx-auto max-w-[1400px] px-4 py-6">
    <div class="flex flex-wrap items-end gap-3">
      <h1 class="font-display text-2xl">ภาพรวม</h1>
      <button class="btn ml-auto" @click="dlg?.open()">+ เริ่มทริปใหม่</button>
    </div>
    <p v-if="error" class="mt-4 text-danger" role="alert">โหลดข้อมูลไม่ได้: {{ error }}</p>
    <p v-else-if="loading" class="mt-4 text-muted">กำลังโหลด…</p>
    <template v-else>
      <section class="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4" aria-label="จำนวน">
        <div class="card p-4"><p class="text-sm text-muted">ทริปทั้งหมด</p><p class="font-display text-3xl">{{ trips.length }}</p></div>
        <div class="card p-4"><p class="text-sm text-muted">เผยแพร่แล้ว</p><p class="font-display text-3xl text-forest">{{ count("published") }}</p></div>
        <div class="card p-4"><p class="text-sm text-muted">ฉบับร่าง</p><p class="font-display text-3xl text-earth">{{ count("draft") }}</p></div>
        <div class="card p-4"><p class="text-sm text-muted">รูปและวิดีโอ</p><p class="font-display text-3xl">{{ media.length }}</p></div>
      </section>

      <div class="mt-6 grid gap-6 lg:grid-cols-[2fr_1fr]">
        <section class="card p-4" aria-labelledby="recent-h">
          <h2 id="recent-h" class="font-display text-lg">แก้ไขล่าสุด</h2>
          <ul class="mt-2 divide-y divide-[#f0ebe1]">
            <li v-for="t in recent" :key="t.id">
              <RouterLink :to="`/admin/trips/${t.id}`" class="flex items-center gap-3 py-2.5 hover:bg-[#faf8f3]">
                <span class="min-w-0 flex-1">
                  <span class="block truncate font-medium">{{ t.title || "(ไม่มีชื่อ)" }}</span>
                  <span class="block text-xs text-muted">{{ dateRange(t.startDate, t.endDate) }} · แก้ไข {{ new Date(t.updatedAt).toLocaleString("th-TH") }}</span>
                </span>
                <StatusChip :status="t.status" />
              </RouterLink>
            </li>
            <li v-if="!recent.length" class="py-3 text-muted">ยังไม่มีทริป</li>
          </ul>
        </section>
        <section class="card p-4" aria-labelledby="drafts-h">
          <h2 id="drafts-h" class="font-display text-lg">ฉบับร่างที่ยังไม่เผยแพร่</h2>
          <ul class="mt-2 space-y-1">
            <li v-for="t in drafts" :key="t.id"><RouterLink :to="`/admin/trips/${t.id}`" class="underline">{{ t.title || "(ไม่มีชื่อ)" }}</RouterLink></li>
            <li v-if="!drafts.length" class="text-muted">ไม่มีฉบับร่างค้าง</li>
          </ul>
        </section>
      </div>

      <section class="card mt-6 p-4" aria-labelledby="media-h">
        <div class="flex items-center"><h2 id="media-h" class="font-display text-lg">รูปที่เพิ่มล่าสุด</h2><RouterLink to="/admin/media" class="ml-auto text-sm underline">ดูคลังทั้งหมด</RouterLink></div>
        <div class="mt-3 grid grid-cols-4 gap-2 md:grid-cols-8">
          <img v-for="m in recentMedia" :key="m.id" :src="thumb(m)" :alt="m.alt || m.caption" class="aspect-square w-full rounded-md object-cover" loading="lazy">
        </div>
      </section>
    </template>
    <NewTripDialog ref="dlg" @created="id => router.push(`/admin/trips/${id}`)" />
  </main>
</template>
