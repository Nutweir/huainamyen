<script setup lang="ts">
/*
 * Every photo and clip: upload many at once, search/filter, edit caption/alt/tags/album/trip,
 * crop/rotate again from the original, replace the file (same id, so every use updates), remove.
 */
import { computed, nextTick, onMounted, ref } from "vue";
import type { MediaAsset, TripSummary } from "@/types/content";
import { useBackend } from "@/services";
import { useToast } from "@/composables/useToast";
import { prepareImage, sniff, validateUpload, type Edit } from "@/services/files";
import MediaUploader from "@/components/admin/MediaUploader.vue";
import CropDialog from "@/components/editor/CropDialog.vue";

const { repo } = useBackend();
const { toast } = useToast();
const media = ref<MediaAsset[]>([]);
const trips = ref<TripSummary[]>([]);
const loading = ref(true);
const q = ref("");
const kind = ref<"" | "image" | "video">("");
const trip = ref<string>("");
const album = ref("");
const sel = ref<MediaAsset | null>(null);
const form = ref({ caption: "", alt: "", tags: "", album: "", tripId: "", location: "", takenDate: "", takenTime: "", camera: "", note: "" });
const showUpload = ref(false);
const working = ref(false);
const crop = ref<{ src: string; blob: Blob } | null>(null);
const cropDlg = ref<InstanceType<typeof CropDialog> | null>(null);
const replaceInput = ref<HTMLInputElement | null>(null);

async function load() {
  loading.value = true;
  try { [media.value, trips.value] = await Promise.all([repo.listMedia(), repo.listTrips()]); }
  catch (e) { toast((e as Error).message, true); }
  finally { loading.value = false; }
}
onMounted(load);

const byId = computed(() => new Map(media.value.map(m => [m.id, m])));
const posters = computed(() => new Set(media.value.map(m => m.posterId).filter(Boolean)));
const albums = computed(() => [...new Set(media.value.map(m => m.album).filter((a): a is string => !!a))].sort());
const tripName = (id: string | null) => trips.value.find(t => t.id === id)?.title || "";
const shown = computed(() => {
  const needle = q.value.trim().toLowerCase();
  return media.value
    .filter(m => !posters.value.has(m.id))
    .filter(m => !kind.value || m.kind === kind.value)
    .filter(m => !trip.value || (trip.value === "none" ? !m.tripId : m.tripId === trip.value))
    .filter(m => !album.value || m.album === album.value)
    .filter(m => !needle || [m.caption, m.alt, m.location, m.album || "", m.note, ...m.tags, m.path].join(" ").toLowerCase().includes(needle));
});
const thumb = (m: MediaAsset) => { const p = m.kind === "video" && m.posterId ? byId.value.get(m.posterId) || m : m; return repo.mediaUrl(p, 500); };

function select(m: MediaAsset) {
  sel.value = m;
  form.value = { caption: m.caption, alt: m.alt, tags: m.tags.join(", "), album: m.album || "", tripId: m.tripId || "", location: m.location, takenDate: m.takenDate || "", takenTime: m.takenTime || "", camera: m.camera, note: m.note };
}
async function saveMeta() {
  if (!sel.value) return;
  const f = form.value;
  try {
    const updated = await repo.updateMedia(sel.value.id, {
      caption: f.caption.trim(), alt: f.alt.trim(), tags: f.tags.split(",").map(t => t.trim()).filter(Boolean), album: f.album.trim() || null,
      tripId: f.tripId || null, location: f.location.trim(), takenDate: f.takenDate || null, takenTime: f.takenTime || null, camera: f.camera.trim(), note: f.note.trim(),
    });
    media.value = media.value.map(m => (m.id === updated.id ? updated : m));
    sel.value = updated;
    toast("บันทึกรายละเอียดแล้ว");
  } catch (e) { toast((e as Error).message, true); }
}
async function remove() {
  if (!sel.value || !confirm("ลบไฟล์นี้ออกจากคลัง? (ไฟล์ต้นฉบับยังเก็บไว้)")) return;
  try { await repo.deleteMedia(sel.value.id); media.value = media.value.filter(m => m.id !== sel.value!.id); sel.value = null; toast("ลบแล้ว"); }
  catch (e) { toast((e as Error).message, true); }
}
async function startCrop() {
  if (!sel.value) return;
  working.value = true;
  try {
    const blob = await repo.getOriginal(sel.value);
    const type = await sniff(blob);
    // DNG originals: crop on the web copy's framing (same photo)
    const show = type?.kind === "image" && type.mime !== "image/heic" ? blob : await (await fetch(repo.mediaUrl(sel.value))).blob();
    crop.value = { src: URL.createObjectURL(show), blob };
    await nextTick();
    cropDlg.value?.open();
  } catch (e) { toast((e as Error).message, true); }
  finally { working.value = false; }
}
async function applyCrop(edit: Edit) {
  const c = crop.value!;
  URL.revokeObjectURL(c.src);
  crop.value = null;
  await replaceWith(new File([c.blob], "original", { type: c.blob.type }), edit);
}
function closeCrop() { if (crop.value) URL.revokeObjectURL(crop.value.src); crop.value = null; }
async function replaceWith(file: File, edit: Edit = {}) {
  if (!sel.value) return;
  working.value = true;
  try {
    const check = await validateUpload(file);
    if ("error" in check) throw new Error(check.error);
    if (check.type.kind === "video") throw new Error("เปลี่ยนได้เฉพาะรูป");
    const updated = await repo.replaceImage(sel.value.id, await prepareImage(file, edit));
    media.value = media.value.map(m => (m.id === updated.id ? updated : m));
    sel.value = updated;
    toast("อัปเดตรูปแล้ว ทุกที่ที่ใช้รูปนี้จะเปลี่ยนตาม");
  } catch (e) { toast((e as Error).message, true); }
  finally { working.value = false; }
}
function onReplace(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0];
  (e.target as HTMLInputElement).value = "";
  if (f) void replaceWith(f);
}
async function uploaded(assets: MediaAsset[]) { toast(`อัปโหลด ${assets.filter(a => !a.tags.includes("poster")).length} ไฟล์แล้ว`); await load(); }
</script>

<template>
  <main class="mx-auto max-w-[1400px] px-4 py-6">
    <div class="flex flex-wrap items-end gap-3">
      <h1 class="font-display text-2xl">คลังรูปและวิดีโอ</h1>
      <button class="btn ml-auto" :aria-expanded="showUpload" @click="showUpload = !showUpload">{{ showUpload ? "ปิด" : "+ อัปโหลด" }}</button>
    </div>
    <div v-if="showUpload" class="card mt-4 p-4">
      <MediaUploader :meta="trip && trip !== 'none' ? { tripId: trip } : {}" @uploaded="uploaded" />
    </div>
    <div class="mt-4 flex flex-wrap gap-2" role="search">
      <input v-model="q" class="input max-w-xs flex-1" type="search" placeholder="ค้นหาคำบรรยาย แท็ก สถานที่…" aria-label="ค้นหาในคลัง">
      <select v-model="kind" class="input w-auto" aria-label="ชนิดไฟล์"><option value="">รูปและวิดีโอ</option><option value="image">รูป</option><option value="video">วิดีโอ</option></select>
      <select v-model="trip" class="input w-auto" aria-label="ทริป"><option value="">ทุกทริป</option><option value="none">ยังไม่ผูกกับทริป</option><option v-for="t in trips" :key="t.id" :value="t.id">{{ t.title }}</option></select>
      <select v-if="albums.length" v-model="album" class="input w-auto" aria-label="อัลบั้ม"><option value="">ทุกอัลบั้ม</option><option v-for="a in albums" :key="a" :value="a">{{ a }}</option></select>
      <span class="self-center text-sm text-muted">{{ shown.length }} ไฟล์</span>
    </div>

    <div class="mt-4 grid gap-4 lg:grid-cols-[1fr_380px]">
      <p v-if="loading" class="text-muted">กำลังโหลด…</p>
      <ul v-else class="grid auto-rows-min grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-5 xl:grid-cols-6">
        <li v-for="m in shown" :key="m.id">
          <button type="button" class="relative block w-full overflow-hidden rounded-md ring-offset-2" :class="sel?.id === m.id ? 'ring-[3px] ring-forest' : ''" :aria-pressed="sel?.id === m.id" @click="select(m)">
            <img :src="thumb(m)" :alt="m.alt || m.caption || 'ไฟล์ในคลัง'" class="aspect-square w-full object-cover" loading="lazy">
            <span v-if="m.kind === 'video'" class="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 text-xs text-white">▶ วิดีโอ</span>
          </button>
        </li>
        <li v-if="!shown.length" class="col-span-full py-8 text-center text-muted">ไม่พบไฟล์</li>
      </ul>

      <aside v-if="sel" class="card h-fit p-4 lg:sticky lg:top-20" aria-label="รายละเอียดไฟล์">
        <video v-if="sel.kind === 'video'" :src="repo.mediaUrl(sel)" :poster="sel.posterId && byId.get(sel.posterId) ? repo.mediaUrl(byId.get(sel.posterId)!) : undefined" controls playsinline muted class="w-full rounded" />
        <img v-else :src="repo.mediaUrl(sel, 1000)" :alt="sel.alt" class="max-h-72 w-full rounded object-contain">
        <p class="mt-2 break-all text-xs text-muted">{{ sel.width }}×{{ sel.height }} · {{ (sel.bytes / 1048576).toFixed(1) }} MB · {{ sel.mime }}<template v-if="sel.originalPath"> · เก็บต้นฉบับไว้แล้ว</template></p>
        <p v-if="sel.tripId" class="text-xs text-muted">ทริป: {{ tripName(sel.tripId) }}</p>
        <form class="mt-3 grid gap-2.5" @submit.prevent="saveMeta">
          <label class="field"><span>คำบรรยาย</span><input v-model="form.caption" class="input"></label>
          <label class="field"><span>คำอธิบายรูปสำหรับผู้พิการทางสายตา (alt)</span><input v-model="form.alt" class="input"></label>
          <label class="field"><span>แท็ก (คั่นด้วย ,)</span><input v-model="form.tags" class="input"></label>
          <div class="grid grid-cols-2 gap-2">
            <label class="field"><span>อัลบั้ม</span><input v-model="form.album" class="input" list="albums"></label>
            <label class="field"><span>ทริป</span><select v-model="form.tripId" class="input"><option value="">—</option><option v-for="t in trips" :key="t.id" :value="t.id">{{ t.title }}</option></select></label>
            <label class="field"><span>วันที่ถ่าย</span><input v-model="form.takenDate" class="input" type="date"></label>
            <label class="field"><span>เวลา</span><input v-model="form.takenTime" class="input" type="time"></label>
          </div>
          <label class="field"><span>สถานที่</span><input v-model="form.location" class="input"></label>
          <label class="field"><span>กล้อง</span><input v-model="form.camera" class="input"></label>
          <label class="field"><span>โน้ตหลังรูป</span><textarea v-model="form.note" class="input" /></label>
          <datalist id="albums"><option v-for="a in albums" :key="a" :value="a" /></datalist>
          <div class="flex flex-wrap gap-2">
            <button class="btn">บันทึก</button>
            <template v-if="sel.kind === 'image'">
              <button type="button" class="btn btn-ghost" :disabled="working" @click="startCrop">ครอป/หมุน</button>
              <button type="button" class="btn btn-ghost" :disabled="working" @click="replaceInput?.click()">เปลี่ยนไฟล์</button>
            </template>
            <button type="button" class="btn btn-danger" @click="remove">ลบ</button>
          </div>
          <p v-if="working" class="text-sm text-muted" role="status">กำลังประมวลผลรูป…</p>
          <input ref="replaceInput" type="file" class="sr-only" accept="image/*,.dng,.heic" @change="onReplace">
        </form>
      </aside>
    </div>
    <CropDialog v-if="crop" ref="cropDlg" :src="crop.src" @done="applyCrop" @cancel="closeCrop" />
  </main>
</template>
