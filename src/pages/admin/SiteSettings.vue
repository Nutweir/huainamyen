<script setup lang="ts">
/* Site name and About page, plus backup: export every trip as JSON and import a trip back (as a draft). */
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import type { SiteSettings } from "@/types/content";
import { useBackend } from "@/services";
import { exportBundle, parseImport } from "@/services/snapshot";
import { useToast } from "@/composables/useToast";

const { repo, configured } = useBackend();
const router = useRouter();
const { toast } = useToast();
const site = ref<SiteSettings | null>(null);
const busy = ref(false);
const importInput = ref<HTMLInputElement | null>(null);

onMounted(async () => { try { site.value = await repo.getSite(); } catch (e) { toast((e as Error).message, true); } });

async function save() {
  if (!site.value) return;
  try { await repo.saveSite(site.value); toast("บันทึกแล้ว"); } catch (e) { toast((e as Error).message, true); }
}
function file(name: string, text: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
async function exportAll() {
  busy.value = true;
  try {
    const trips = await repo.listTrips();
    const bundles = [];
    for (const t of trips) bundles.push(JSON.parse(exportBundle((await repo.loadTrip(t.id)).bundle)));
    file(`journeys-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ kind: "journeys-backup", exportedAt: new Date().toISOString(), site: site.value, trips: bundles }, null, 2));
    toast(`ส่งออก ${bundles.length} ทริปแล้ว`);
  } catch (e) { toast((e as Error).message, true); }
  finally { busy.value = false; }
}
/** Import makes a new draft trip: nothing existing is overwritten. */
async function importFile(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0];
  (e.target as HTMLInputElement).value = "";
  if (!f) return;
  busy.value = true;
  try {
    const raw = JSON.parse(await f.text());
    const list = raw?.kind === "journeys-backup" ? raw.trips : [raw];
    let last = "";
    for (const item of list) {
      const b = parseImport(JSON.stringify(item));
      let slug = b.trip.slug;
      for (let n = 1; await repo.isSlugTaken(slug); n++) slug = `${b.trip.slug}-import${n > 1 ? `-${n}` : ""}`;
      const id = await repo.createTrip({ title: b.trip.title, slug, startDate: b.trip.startDate, endDate: b.trip.endDate, location: b.trip.location });
      const { bundle, savedAt } = await repo.loadTrip(id);
      // media must already be in this library (ids are kept); missing ones show as empty spots
      const known = new Set((await repo.listMedia()).map(m => m.id));
      await repo.saveTrip({ ...b, trip: { ...b.trip, id, slug, status: "draft", publishedVersionId: null, publishedAt: null }, days: b.days, media: bundle.media.concat(b.media.filter(m => known.has(m.id))) }, savedAt);
      last = id;
    }
    toast(`นำเข้า ${list.length} ทริปเป็นฉบับร่างแล้ว`);
    if (list.length === 1 && last) await router.push(`/admin/trips/${last}`);
  } catch (err) { toast(`นำเข้าไม่ได้: ${(err as Error).message}`, true); }
  finally { busy.value = false; }
}
</script>

<template>
  <main class="mx-auto grid max-w-3xl gap-6 px-4 py-6">
    <h1 class="font-display text-2xl">ตั้งค่าและสำรองข้อมูล</h1>
    <form v-if="site" class="card grid gap-3 p-4" @submit.prevent="save">
      <h2 class="font-display text-lg">เว็บไซต์</h2>
      <label class="field"><span>ชื่อเว็บไซต์</span><input v-model="site.title" class="input"></label>
      <label class="field"><span>คำโปรย</span><input v-model="site.tagline" class="input"></label>
      <p class="text-sm">หน้าเกี่ยวกับผู้เขียน (รูป เรื่องเล่า ลิงก์) แก้ที่เมนู <RouterLink to="/admin/about" class="underline">เกี่ยวกับผู้เขียน →</RouterLink></p>
      <button class="btn w-fit">บันทึก</button>
    </form>

    <section class="card grid gap-3 p-4" aria-labelledby="bk">
      <h2 id="bk" class="font-display text-lg">สำรองข้อมูล</h2>
      <p class="text-sm text-muted">ไฟล์ JSON เก็บเนื้อหาทั้งหมด (รวมฉบับร่าง) และรายละเอียดรูป ไม่รวมไฟล์รูป — รูปอยู่ใน Storage / โฟลเดอร์ public/trips</p>
      <div class="flex flex-wrap gap-2">
        <button class="btn" :disabled="busy" @click="exportAll">ส่งออกทุกทริป</button>
        <button class="btn btn-ghost" :disabled="busy" @click="importInput?.click()">นำเข้าจากไฟล์…</button>
        <input ref="importInput" type="file" accept="application/json,.json" class="sr-only" @change="importFile">
      </div>
      <p class="text-xs text-muted">การนำเข้าสร้างเป็นทริปฉบับร่างใหม่เสมอ ไม่ทับของเดิม</p>
    </section>

    <section class="card grid gap-2 p-4 text-sm" aria-labelledby="be">
      <h2 id="be" class="font-display text-lg">ระบบหลังบ้าน</h2>
      <p v-if="configured">เชื่อมต่อ Supabase แล้ว — สิทธิ์การอ่าน/เขียนควบคุมด้วย Row Level Security ในฐานข้อมูล</p>
      <p v-else>โหมดทดสอบในเครื่อง: ข้อมูลอยู่ใน IndexedDB ของเบราว์เซอร์นี้เท่านั้น ดูวิธีเชื่อม Supabase ใน docs/SETUP.md</p>
    </section>
  </main>
</template>
