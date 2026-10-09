<script setup lang="ts">
/*
 * Start a new trip, Canva-style: pick a starting shape, type the basics, add a cover — and watch the
 * card it will be on the Journeys page take shape beside the form. Nothing is written for you: the
 * shapes only lay out days and moments; title, place and dates are what you type.
 */
import { computed, ref, watch } from "vue";
import type { MediaAsset } from "@/types/content";
import { useBackend } from "@/services";
import { dateRange, slugify } from "@/utils/format";
import { TRIP_TEMPLATES, applyTemplate, endDateFor, suggestSlug, type TripTemplate } from "@/services/tripTemplates";
import MediaPicker from "./MediaPicker.vue";

const emit = defineEmits<{ created: [string] }>();
const { repo } = useBackend();
const dlg = ref<HTMLDialogElement | null>(null);
const picker = ref<InstanceType<typeof MediaPicker> | null>(null);
const empty = () => ({ title: "", slug: "", location: "", startDate: "", endDate: "", summary: "" });
const form = ref(empty());
const template = ref<TripTemplate>(TRIP_TEMPLATES[0]);
const cover = ref<MediaAsset | null>(null);
const slugTouched = ref(false);
const endTouched = ref(false);
const error = ref("");
const busy = ref(false);

// the link follows the title (or the date, for Thai titles) until you edit it yourself
watch(() => [form.value.title, form.value.startDate], () => { if (!slugTouched.value) form.value.slug = suggestSlug(form.value.title, form.value.startDate); });
// the last day follows the start and the shape, until you set it yourself
watch(() => [form.value.startDate, template.value], () => { if (!endTouched.value) form.value.endDate = endDateFor(form.value.startDate, template.value); });

const days = computed(() => template.value.days.length);
const range = computed(() => (form.value.startDate ? dateRange(form.value.startDate, form.value.endDate || null, true) : "วันที่เดินทาง"));

function open() {
  form.value = empty(); template.value = TRIP_TEMPLATES[0]; cover.value = null;
  slugTouched.value = false; endTouched.value = false; error.value = "";
  dlg.value?.showModal();
}
function pickedCover(assets: MediaAsset[]) { cover.value = assets.find(a => a.kind === "image") || cover.value; }

async function create() {
  error.value = "";
  const f = form.value;
  const slug = slugify(f.slug) || suggestSlug(f.title, f.startDate);
  if (!f.title.trim()) { error.value = "ตั้งชื่อทริปก่อน"; return; }
  if (!f.startDate) { error.value = "ใส่วันไปก่อน"; return; }
  if (!slug) { error.value = "ตั้งลิงก์ (slug) เป็นภาษาอังกฤษ ตัวเลข หรือขีด"; return; }
  if (f.endDate && f.endDate < f.startDate) { error.value = "วันกลับต้องไม่ก่อนวันไป"; return; }
  busy.value = true;
  try {
    if (await repo.isSlugTaken(slug)) { error.value = `มีทริปที่ใช้ลิงก์ “${slug}” แล้ว — แก้ช่องลิงก์ได้เลย`; slugTouched.value = true; form.value.slug = slug; return; }
    const id = await repo.createTrip({ title: f.title.trim(), slug, location: f.location.trim(), startDate: f.startDate, endDate: f.endDate || null });
    // lay out the shape, the cover and the summary in the first save
    const { bundle, savedAt } = await repo.loadTrip(id);
    bundle.trip.summary = f.summary.trim();
    if (cover.value) { bundle.trip.coverId = cover.value.id; bundle.media = [...bundle.media.filter(m => m.id !== cover.value!.id), cover.value]; if (!cover.value.tripId) await repo.updateMedia(cover.value.id, { tripId: id }).catch(() => undefined); }
    await repo.saveTrip(applyTemplate(bundle, template.value), savedAt);
    dlg.value?.close();
    emit("created", id);
  } catch (e) { error.value = (e as Error).message; }
  finally { busy.value = false; }
}
defineExpose({ open });
</script>

<template>
  <dialog ref="dlg" class="w-[min(980px,calc(100vw-24px))] rounded-2xl border border-rule bg-[#faf8f3] p-0 backdrop:bg-black/40" aria-labelledby="nt-title">
    <form class="grid max-h-[calc(100dvh-24px)] overflow-auto md:grid-cols-[minmax(0,1fr)_340px]" @submit.prevent="create">
      <div class="grid content-start gap-4 p-5">
        <h2 id="nt-title" class="font-display text-2xl">เริ่มทริปใหม่</h2>

        <fieldset class="grid gap-2">
          <legend class="mb-1 text-sm font-medium">เริ่มจากแบบไหน</legend>
          <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <label v-for="t in TRIP_TEMPLATES" :key="t.id" class="relative cursor-pointer rounded-xl border-2 bg-white p-2.5 transition" :class="template.id === t.id ? 'border-forest shadow-sm' : 'border-transparent hover:border-rule'">
              <input v-model="template" type="radio" name="tpl" :value="t" class="sr-only">
              <!-- a tiny sketch of the days and moments -->
              <span class="flex h-12 items-end gap-1 rounded-md bg-[#f4f1ea] p-1.5" aria-hidden="true">
                <span v-for="(d, i) in t.days" :key="i" class="flex flex-1 flex-col justify-end gap-0.5">
                  <span v-for="(_m, j) in d" :key="j" class="h-1.5 rounded-sm bg-forest/60" />
                  <span v-if="!d.length" class="h-full rounded-sm border border-dashed border-[#c9c0ad]" />
                </span>
              </span>
              <span class="mt-1.5 block text-sm font-semibold">{{ t.label }}</span>
              <span class="block text-[11px] leading-snug text-muted">{{ t.hint }}</span>
            </label>
          </div>
        </fieldset>

        <label class="field"><span>ชื่อทริป</span><input v-model="form.title" class="input text-lg" required maxlength="160" placeholder="เช่น ดอยหลวงเชียงดาว" autofocus></label>
        <label class="field"><span>สถานที่</span><input v-model="form.location" class="input" maxlength="160" placeholder="เช่น เชียงดาว · เชียงใหม่"></label>
        <div class="grid grid-cols-2 gap-3">
          <label class="field"><span>วันไป</span><input v-model="form.startDate" class="input" type="date" required></label>
          <label class="field"><span>วันกลับ <small v-if="days > 1 && !endTouched" class="font-normal text-muted">(คิดจาก {{ template.label }})</small></span><input v-model="form.endDate" class="input" type="date" :min="form.startDate" @input="endTouched = true"></label>
        </div>
        <label class="field"><span>เรื่องย่อสั้น ๆ <small class="font-normal text-muted">(ไม่ใส่ก็ได้ · แก้ทีหลังได้)</small></span><textarea v-model="form.summary" class="input" rows="2" maxlength="300" /></label>
        <label class="field"><span>ลิงก์ (slug)</span>
          <input v-model="form.slug" class="input font-mono text-sm" pattern="[a-z0-9]+(-[a-z0-9]+)*" placeholder="ระบบตั้งให้จากชื่อหรือวันที่" @input="slugTouched = true">
          <small class="text-xs text-muted">/journeys/{{ form.slug || "…" }}</small>
        </label>
        <p v-if="error" class="text-sm text-danger" role="alert">{{ error }}</p>
      </div>

      <!-- live: the card this trip will be on the Journeys page -->
      <aside class="flex flex-col gap-4 border-t border-[#ece6da] bg-[#f3efe6] p-5 md:border-l md:border-t-0" aria-label="ตัวอย่างการ์ดทริป">
        <p class="text-xs font-medium uppercase tracking-[.2em] text-muted">ตัวอย่างบนหน้ารวมทริป</p>
        <div class="flex items-center gap-4">
          <button type="button" class="group relative w-32 shrink-0 -rotate-2 bg-white p-1.5 pb-5 shadow-[0_1px_2px_rgb(0_0_0/.12),0_10px_22px_-12px_rgb(0_0_0/.4)] transition hover:rotate-0" :aria-label="cover ? 'เปลี่ยนรูปปก' : 'เลือกรูปปก'" @click="picker?.open()">
            <img v-if="cover" :src="repo.mediaUrl(cover, 500)" :alt="cover.alt" class="aspect-[4/5] w-full object-cover" :style="cover.focus ? { objectPosition: cover.focus } : undefined">
            <span v-else class="grid aspect-[4/5] w-full place-items-center border-2 border-dashed border-[#d6cdbb] text-center text-xs text-muted">+ รูปปก</span>
          </button>
          <div class="min-w-0">
            <p class="text-[11px] font-semibold uppercase tracking-[.2em] text-muted">{{ range }}</p>
            <p class="break-words font-latin text-2xl leading-tight" :class="form.title ? '' : 'text-[#b9b09f]'">{{ form.title || "ชื่อทริป" }}</p>
            <p class="text-sm" :class="form.location ? '' : 'text-[#b9b09f]'">{{ form.location || "สถานที่" }}</p>
            <p v-if="form.summary" class="mt-1 line-clamp-3 text-xs text-muted">{{ form.summary }}</p>
          </div>
        </div>
        <div class="rounded-lg bg-white/70 p-3 text-xs text-muted">
          <p class="font-medium text-ink">จะได้</p>
          <p>{{ days }} วัน{{ template.days.flat().length ? ` · ${template.days.flat().length} ช่วงเวลารอให้เขียน` : " · ยังว่าง" }}</p>
          <p>สถานะ: ฉบับร่าง (ยังไม่มีใครเห็นจนกว่าจะกดเผยแพร่)</p>
        </div>
        <div class="mt-auto flex gap-2">
          <button class="btn flex-1" :disabled="busy">{{ busy ? "กำลังสร้าง…" : "สร้างแล้วเริ่มเขียน" }}</button>
          <button type="button" class="btn btn-ghost" @click="dlg?.close()">ยกเลิก</button>
        </div>
      </aside>
    </form>
    <MediaPicker ref="picker" layout="portrait" @pick="pickedCover" />
  </dialog>
</template>
