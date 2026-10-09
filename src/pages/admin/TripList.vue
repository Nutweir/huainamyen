<script setup lang="ts">
/* All trips: search, filter by status/tag, sort, create, duplicate, change status, delete. */
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
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
// a card's ⋯ menu closes when you click anywhere else
const closeMenus = (e: MouseEvent) => document.querySelectorAll<HTMLDetailsElement>("main details[open]").forEach(d => { if (!d.contains(e.target as Node)) d.open = false; });
onMounted(() => document.addEventListener("click", closeMenus));
onBeforeUnmount(() => document.removeEventListener("click", closeMenus));

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
    <!-- like a design gallery: a blank card to start, then every trip as its cover -->
    <ul v-else class="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      <li>
        <button type="button" class="group grid aspect-[4/5] w-full place-items-center rounded-xl border-2 border-dashed border-[#d6cdbb] bg-white/60 text-muted transition hover:border-forest hover:bg-white hover:text-forest" @click="dlg?.open()">
          <span class="grid justify-items-center gap-2">
            <span class="grid size-12 place-items-center rounded-full bg-[#eee8dc] text-2xl transition group-hover:bg-forest group-hover:text-white" aria-hidden="true">+</span>
            <span class="font-medium">เริ่มทริปใหม่</span>
            <span class="text-xs">เปล่า · 1 วัน · 2 วัน · 3 วัน</span>
          </span>
        </button>
      </li>
      <li v-for="t in shown" :key="t.id" class="group relative">
        <RouterLink :to="`/admin/trips/${t.id}`" class="block overflow-hidden rounded-xl border border-[#ece6da] bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
          <span class="relative block aspect-[4/5] bg-[#efe9dd]">
            <img v-if="t.cover" :src="repo.mediaUrl(t.cover, 500)" alt="" class="size-full object-cover" :style="t.cover.focus ? { objectPosition: t.cover.focus } : undefined" loading="lazy">
            <span v-else class="grid size-full place-items-center text-xs text-muted">ยังไม่มีรูปปก</span>
            <StatusChip :status="t.status" class="absolute left-2 top-2 shadow-sm" />
          </span>
          <span class="block p-3">
            <span class="block truncate font-medium">{{ t.title || "(ไม่มีชื่อ)" }}</span>
            <span class="block truncate text-xs text-muted">{{ dateRange(t.startDate, t.endDate, true) }}{{ t.location ? ` · ${t.location}` : "" }}</span>
            <span class="block text-[11px] text-muted">แก้ไข {{ new Date(t.updatedAt).toLocaleDateString("th-TH", { day: "numeric", month: "short" }) }}</span>
          </span>
        </RouterLink>
        <details class="absolute right-2 top-2 z-10" @click.stop>
          <summary class="grid size-8 cursor-pointer list-none place-items-center rounded-full bg-white/90 text-lg leading-none shadow-sm [&::-webkit-details-marker]:hidden" :aria-label="`จัดการทริป ${t.title}`">⋯</summary>
          <div class="absolute right-0 mt-1 grid w-44 gap-0.5 rounded-lg border border-[#ece6da] bg-white p-1 text-sm shadow-lg">
            <RouterLink :to="`/admin/trips/${t.id}`" class="rounded px-3 py-1.5 hover:bg-[#f4f1ea]">แก้ไข</RouterLink>
            <a v-if="t.status === 'published'" :href="router.resolve(`/journeys/${t.slug}`).href" target="_blank" rel="noopener" class="rounded px-3 py-1.5 hover:bg-[#f4f1ea]">ดูหน้าจริง ↗</a>
            <button class="rounded px-3 py-1.5 text-left hover:bg-[#f4f1ea]" @click="duplicate(t)">ทำสำเนา</button>
            <button v-if="t.status === 'published'" class="rounded px-3 py-1.5 text-left hover:bg-[#f4f1ea]" @click="setStatus(t, 'draft')">ยกเลิกเผยแพร่</button>
            <button v-if="t.status !== 'archived'" class="rounded px-3 py-1.5 text-left hover:bg-[#f4f1ea]" @click="setStatus(t, 'archived')">เก็บเข้าคลัง</button>
            <button v-else class="rounded px-3 py-1.5 text-left hover:bg-[#f4f1ea]" @click="setStatus(t, 'draft')">นำกลับมาเป็นร่าง</button>
            <button class="rounded px-3 py-1.5 text-left text-danger hover:bg-[#fbeee9]" @click="remove(t)">ลบ…</button>
          </div>
        </details>
      </li>
      <li v-if="!shown.length && (q || status || tag)" class="col-span-full py-6 text-center text-muted">ไม่พบทริปที่ตรงกับการค้นหา</li>
    </ul>
    <NewTripDialog ref="dlg" @created="id => router.push(`/admin/trips/${id}`)" />
  </main>
</template>
