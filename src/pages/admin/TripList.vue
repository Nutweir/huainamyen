<script setup lang="ts">
/* All trips: search, filter by status/tag, sort, create, duplicate, change status, delete. */
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import type { TripStatus, TripSummary } from "@/types/content";
import { useBackend } from "@/services";
import { dateRange } from "@/utils/format";
import { useToast } from "@/composables/useToast";
import NewTripDialog from "@/components/admin/NewTripDialog.vue";
import StatusChip from "@/components/admin/StatusChip.vue";

const { repo } = useBackend();
const router = useRouter();
const { toast } = useToast();
const trips = ref<TripSummary[]>([]);
const loading = ref(true);
const q = ref("");
const status = ref<"" | TripStatus>("");
const tag = ref("");
const sort = ref<"updated" | "date" | "title">("updated");
const dlg = ref<InstanceType<typeof NewTripDialog> | null>(null);

async function load() {
  loading.value = true;
  try { trips.value = await repo.listTrips(); } catch (e) { toast((e as Error).message, true); }
  finally { loading.value = false; }
}
onMounted(load);

const tags = computed(() => [...new Set(trips.value.flatMap(t => t.tags))].sort());
const shown = computed(() => {
  const needle = q.value.trim().toLowerCase();
  return trips.value
    .filter(t => !status.value || t.status === status.value)
    .filter(t => !tag.value || t.tags.includes(tag.value))
    .filter(t => !needle || [t.title, t.location, t.summary, t.slug, ...t.tags].join(" ").toLowerCase().includes(needle))
    .sort((a, b) => sort.value === "title" ? a.title.localeCompare(b.title, "th") : sort.value === "date" ? b.startDate.localeCompare(a.startDate) : b.updatedAt.localeCompare(a.updatedAt));
});

async function duplicate(t: TripSummary) {
  try { const id = await repo.duplicateTrip(t.id); toast("ทำสำเนาเป็นฉบับร่างแล้ว"); await router.push(`/admin/trips/${id}`); }
  catch (e) { toast((e as Error).message, true); }
}
async function setStatus(t: TripSummary, s: TripStatus) {
  try { await repo.setStatus(t.id, s); toast("เปลี่ยนสถานะแล้ว"); await load(); }
  catch (e) { toast((e as Error).message, true); }
}
async function remove(t: TripSummary) {
  const typed = window.prompt(`ลบทริป “${t.title}” ถาวร?\nรูปในคลังไม่ถูกลบ แต่เนื้อหาและเวอร์ชันทั้งหมดของทริปนี้จะหายไป\n\nพิมพ์ลิงก์ของทริป (${t.slug}) เพื่อยืนยัน`);
  if (typed === null) return;
  if (typed.trim() !== t.slug) { toast("พิมพ์ไม่ตรง — ยังไม่ได้ลบ", true); return; }
  try { await repo.deleteTrip(t.id); toast("ลบแล้ว"); await load(); }
  catch (e) { toast((e as Error).message, true); }
}
</script>

<template>
  <main class="mx-auto max-w-[1400px] px-4 py-6">
    <div class="flex flex-wrap items-end gap-3">
      <h1 class="font-display text-2xl">ทริป</h1>
      <button class="btn ml-auto" @click="dlg?.open()">+ เริ่มทริปใหม่</button>
    </div>
    <div class="mt-4 flex flex-wrap gap-2" role="search">
      <input v-model="q" class="input max-w-xs flex-1" type="search" placeholder="ค้นหาชื่อ สถานที่ แท็ก…" aria-label="ค้นหาทริป">
      <select v-model="status" class="input w-auto" aria-label="สถานะ">
        <option value="">ทุกสถานะ</option><option value="draft">ฉบับร่าง</option><option value="published">เผยแพร่แล้ว</option><option value="archived">เก็บเข้าคลัง</option>
      </select>
      <select v-if="tags.length" v-model="tag" class="input w-auto" aria-label="แท็ก">
        <option value="">ทุกแท็ก</option><option v-for="t in tags" :key="t" :value="t">{{ t }}</option>
      </select>
      <select v-model="sort" class="input w-auto" aria-label="เรียงตาม">
        <option value="updated">แก้ไขล่าสุด</option><option value="date">วันที่เดินทาง</option><option value="title">ชื่อ</option>
      </select>
    </div>
    <p v-if="loading" class="mt-4 text-muted">กำลังโหลด…</p>
    <ul v-else class="mt-4 grid gap-3">
      <li v-for="t in shown" :key="t.id" class="card flex flex-wrap items-center gap-3 p-3">
        <img v-if="t.cover" :src="repo.mediaUrl(t.cover, 500)" alt="" class="h-16 w-24 rounded-md object-cover">
        <div v-else class="h-16 w-24 rounded-md bg-[#efe9dd]" />
        <RouterLink :to="`/admin/trips/${t.id}`" class="min-w-[12rem] flex-1">
          <span class="block font-medium">{{ t.title || "(ไม่มีชื่อ)" }}</span>
          <span class="block text-sm text-muted">{{ t.location }} · {{ dateRange(t.startDate, t.endDate) }}</span>
          <span class="block text-xs text-muted">/journeys/{{ t.slug }} · แก้ไข {{ new Date(t.updatedAt).toLocaleString("th-TH") }}</span>
        </RouterLink>
        <StatusChip :status="t.status" />
        <div class="flex flex-wrap gap-1.5">
          <RouterLink :to="`/admin/trips/${t.id}`" class="btn btn-ghost min-h-8 px-3">แก้ไข</RouterLink>
          <a v-if="t.status === 'published'" :href="router.resolve(`/journeys/${t.slug}`).href" target="_blank" rel="noopener" class="btn btn-ghost min-h-8 px-3">ดู</a>
          <button class="btn btn-ghost min-h-8 px-3" @click="duplicate(t)">ทำสำเนา</button>
          <button v-if="t.status === 'published'" class="btn btn-ghost min-h-8 px-3" @click="setStatus(t, 'draft')">ยกเลิกเผยแพร่</button>
          <button v-if="t.status !== 'archived'" class="btn btn-ghost min-h-8 px-3" @click="setStatus(t, 'archived')">เก็บเข้าคลัง</button>
          <button v-else class="btn btn-ghost min-h-8 px-3" @click="setStatus(t, 'draft')">นำกลับมาเป็นร่าง</button>
          <button class="btn btn-danger min-h-8 px-3" @click="remove(t)">ลบ</button>
        </div>
      </li>
      <li v-if="!shown.length" class="py-6 text-center text-muted">ไม่พบทริปที่ตรงกับการค้นหา</li>
    </ul>
    <NewTripDialog ref="dlg" @created="id => router.push(`/admin/trips/${id}`)" />
  </main>
</template>
