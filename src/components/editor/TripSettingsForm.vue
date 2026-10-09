<script setup lang="ts">
/*
 * Trip details: title, place, dates, summary, cover, tags, companions, SEO and share image,
 * the closing pages, and the film roll. Dates are only ever what the author enters.
 */
import { computed, ref } from "vue";
import type { MediaAsset, TripBundle, TripEnding } from "@/types/content";
import { useBackend } from "@/services";
import { slugify } from "@/utils/format";
import LinesField from "./LinesField.vue";
import MediaPicker from "@/components/admin/MediaPicker.vue";

const props = defineProps<{ bundle: TripBundle; media: Map<string, MediaAsset> }>();
const emit = defineEmits<{ media: [MediaAsset[]] }>();
const { repo } = useBackend();
const picker = ref<InstanceType<typeof MediaPicker> | null>(null);
const target = ref<"cover" | "og" | "gallery" | "ending">("cover");
const slugError = ref("");

const t = computed(() => props.bundle.trip);
const asset = (id: string | null | undefined) => (id ? props.media.get(id) : undefined);
const thumb = (id: string | null | undefined) => { const a = asset(id); return a ? repo.mediaUrl(a, 500) : ""; };
const tagText = computed({ get: () => t.value.tags.join(", "), set: v => { t.value.tags = v.split(",").map(s => s.trim()).filter(Boolean); } });
const metaText = computed({
  get: () => t.value.coverMeta.map(([k, v]) => `${k}: ${v}`).join("\n"),
  set: v => { t.value.coverMeta = v.split("\n").map(l => l.split(/:\s*/)).filter(p => p[0]?.trim()).map(([k, ...r]) => [k.trim(), r.join(": ").trim()] as [string, string]); },
});
const host = (import.meta.env.VITE_SITE_URL || location.origin).replace(/^https?:\/\//, "").split("/")[0].toUpperCase();
const seoLen = computed(() => (t.value.seoDescription || t.value.summary).length);

async function checkSlug() {
  const s = slugify(t.value.slug);
  t.value.slug = s;
  slugError.value = !s ? "ต้องมีลิงก์" : (await repo.isSlugTaken(s, t.value.id)) ? "มีทริปอื่นใช้ลิงก์นี้แล้ว" : "";
}
function pick(which: typeof target.value) {
  target.value = which;
  picker.value?.open(which === "gallery" ? [...props.bundle.gallery] : []);
}
function picked(assets: MediaAsset[]) {
  emit("media", assets);
  const ids = assets.filter(a => a.kind === "image").map(a => a.id);
  if (!ids.length) return;
  if (target.value === "cover") t.value.coverId = ids[0];
  else if (target.value === "og") t.value.ogImageId = ids[0];
  else if (target.value === "gallery") props.bundle.gallery.splice(0, props.bundle.gallery.length, ...ids);
  else if (target.value === "ending" && props.bundle.ending) props.bundle.ending.photo = { mediaId: ids[0] };
}
function addEnding() {
  const e: TripEnding = { heading: "", prelude: [], title: "", stanzas: [], signoff: "", photo: null };
  props.bundle.ending = e;
}
</script>

<template>
  <div class="grid gap-6">
    <section class="card grid gap-3 p-4" aria-labelledby="s-basic" data-preview="#top">
      <h3 id="s-basic" class="font-display text-lg">ข้อมูลทริป</h3>
      <div class="grid gap-3 md:grid-cols-2">
        <label class="field" data-field="title"><span>ชื่อทริป</span><input v-model="t.title" class="input" maxlength="160"></label>
        <label class="field"><span>ชื่อรอง / ชื่อท้องถิ่น</span><input v-model="t.titleLocal" class="input"></label>
        <label class="field"><span>ลิงก์ (slug)</span><input v-model="t.slug" class="input font-mono text-sm" @change="checkSlug"><small v-if="slugError" class="text-xs text-danger">{{ slugError }}</small><small v-else class="text-xs text-muted">/journeys/{{ t.slug }}<template v-if="t.publishedAt"> · เปลี่ยนแล้วลิงก์ที่แชร์ไปจะเสีย</template></small></label>
        <label class="field" data-field="location"><span>สถานที่</span><input v-model="t.location" class="input"></label>
        <label class="field" data-field="dates"><span>วันไป</span><input v-model="t.startDate" class="input" type="date" required></label>
        <label class="field"><span>วันกลับ</span><input v-model="t.endDate" class="input" type="date" :min="t.startDate"></label>
        <label class="field"><span>ระยะเวลา (เช่น 2 วัน 1 คืน)</span><input v-model="t.durationLabel" class="input"></label>
        <label class="field"><span>ไปกับใคร</span><input v-model="t.companions" class="input"></label>
      </div>
      <label class="field"><span>เรื่องย่อ (แสดงในรายการทริป)</span><textarea v-model="t.summary" class="input" rows="3" /></label>
      <label class="field"><span>แท็ก (คั่นด้วย ,)</span><input v-model="tagText" class="input"></label>
      <LinesField v-model:lines="t.epigraph" data-field="epigraph" label="คำนำบนหน้าปก (หนึ่งบรรทัดต่อแถว)" :rows="3" />
      <label class="field" data-field="coverMeta"><span>ข้อมูลบนหน้าปก (หัวข้อ: ค่า หนึ่งรายการต่อแถว)</span><textarea v-model.lazy="metaText" class="input" rows="3" /></label>
      <label class="flex items-center gap-2 text-sm"><input v-model="t.showPlaceholders" type="checkbox"> แสดงช่องรอรูปเมื่อเปิดด้วย ?slots</label>
    </section>

    <section class="card grid gap-3 p-4" aria-labelledby="s-img" data-preview="#top">
      <h3 id="s-img" class="font-display text-lg">รูปปกและรูปตอนแชร์</h3>
      <div class="grid gap-4 sm:grid-cols-2">
        <div data-field="cover">
          <p class="text-sm font-medium">รูปปก</p>
          <img v-if="thumb(t.coverId)" :src="thumb(t.coverId)" alt="รูปปก" class="mt-1 aspect-video w-full rounded object-cover">
          <div v-else class="mt-1 grid aspect-video place-items-center rounded bg-[#efe9dd] text-sm text-muted">ยังไม่มี</div>
          <div class="mt-2 flex gap-2"><button type="button" class="btn btn-ghost" @click="pick('cover')">เลือก</button><button v-if="t.coverId" type="button" class="btn btn-ghost" @click="t.coverId = null">เอาออก</button></div>
        </div>
        <div>
          <p class="text-sm font-medium">รูปตอนแชร์ (Open Graph 1200×630)</p>
          <img v-if="thumb(t.ogImageId || t.coverId)" :src="thumb(t.ogImageId || t.coverId)" alt="รูปตอนแชร์" class="mt-1 aspect-[1200/630] w-full rounded object-cover">
          <div v-else class="mt-1 grid aspect-[1200/630] place-items-center rounded bg-[#efe9dd] text-sm text-muted">ใช้รูปปก</div>
          <div class="mt-2 flex gap-2"><button type="button" class="btn btn-ghost" @click="pick('og')">เลือก</button><button v-if="t.ogImageId" type="button" class="btn btn-ghost" @click="t.ogImageId = null">ใช้รูปปก</button></div>
        </div>
      </div>
    </section>

    <section class="card grid gap-3 p-4" aria-labelledby="s-seo" data-preview="#top">
      <h3 id="s-seo" class="font-display text-lg">SEO</h3>
      <label class="field"><span>ชื่อหน้า (title)</span><input v-model="t.seoTitle" class="input" :placeholder="`${t.title} — Travel Journal`" maxlength="70"></label>
      <label class="field"><span>คำอธิบาย (description)</span><textarea v-model="t.seoDescription" class="input" rows="2" :placeholder="t.summary" maxlength="300" /><small class="text-xs" :class="seoLen > 160 ? 'text-earth' : 'text-muted'">{{ seoLen }}/160 ตัวอักษร</small></label>
      <div>
        <p class="text-sm font-medium">ตอนแชร์ลิงก์ (LINE, Facebook, Messenger) จะเห็นประมาณนี้</p>
        <div class="mt-1.5 max-w-md overflow-hidden rounded-lg border border-[#dcd6ca] bg-[#f3f1ed]" aria-label="ตัวอย่างการ์ดตอนแชร์">
          <img v-if="thumb(t.ogImageId || t.coverId)" :src="thumb(t.ogImageId || t.coverId)" alt="" class="aspect-[1200/630] w-full object-cover">
          <div v-else class="grid aspect-[1200/630] place-items-center bg-[#e6e1d6] text-sm text-muted">ไม่มีรูป — ควรเลือกรูปปก</div>
          <div class="px-3 py-2">
            <p class="text-[11px] uppercase tracking-wide text-muted">{{ host }}</p>
            <p class="line-clamp-2 font-semibold leading-snug">{{ t.seoTitle || `${t.title} — Travel Journal` }}</p>
            <p class="line-clamp-2 text-sm text-muted">{{ t.seoDescription || t.summary || "(ยังไม่มีคำอธิบาย)" }}</p>
          </div>
        </div>
      </div>
    </section>

    <section class="card grid gap-3 p-4" aria-labelledby="s-roll" data-preview="#roll" data-field="roll">
      <h3 id="s-roll" class="font-display text-lg">ม้วนฟิล์ม (ท้ายบันทึก)</h3>
      <div class="flex flex-wrap gap-1.5">
        <img v-for="id in bundle.gallery" :key="id" :src="thumb(id)" alt="" class="h-14 w-20 rounded object-cover">
        <p v-if="!bundle.gallery.length" class="text-sm text-muted">ยังไม่มีรูป</p>
      </div>
      <button type="button" class="btn btn-ghost w-fit" @click="pick('gallery')">เลือกรูปในม้วนฟิล์ม (เรียงตามลำดับที่เลือก)</button>
    </section>

    <section class="card grid gap-3 p-4" aria-labelledby="s-end" data-preview="#ending" data-field="ending">
      <h3 id="s-end" class="font-display text-lg">หน้าปิดท้าย</h3>
      <template v-if="bundle.ending">
        <div class="grid gap-3 md:grid-cols-2">
          <label class="field"><span>หัวข้อ (ซ่อน ใช้เป็นชื่อส่วน)</span><input v-model="bundle.ending.heading" class="input"></label>
          <label class="field"><span>ชื่อบท</span><input v-model="bundle.ending.title" class="input"></label>
        </div>
        <LinesField v-model:groups="bundle.ending.prelude" label="ก่อนชื่อบท (เว้นบรรทัดว่างระหว่างย่อหน้า)" :rows="4" />
        <LinesField v-model:groups="bundle.ending.stanzas" label="บทปิดท้าย (เว้นบรรทัดว่างระหว่างท่อน)" :rows="8" hint="ใช้ <i>…</i> ได้" />
        <label class="field"><span>ลงท้าย (ลายมือ)</span><input v-model="bundle.ending.signoff" class="input"></label>
        <div class="flex items-center gap-3">
          <img v-if="thumb(bundle.ending.photo?.mediaId)" :src="thumb(bundle.ending.photo?.mediaId)" alt="" class="h-20 w-16 rounded object-cover">
          <button type="button" class="btn btn-ghost" @click="pick('ending')">{{ bundle.ending.photo ? "เปลี่ยนรูป" : "เพิ่มรูป" }}</button>
          <button v-if="bundle.ending.photo" type="button" class="btn btn-ghost" @click="bundle.ending.photo = null">เอารูปออก</button>
        </div>
      </template>
      <button v-else type="button" class="btn btn-ghost w-fit" @click="addEnding">+ เพิ่มหน้าปิดท้าย</button>
    </section>

    <MediaPicker ref="picker" :multiple="target === 'gallery'" :trip-id="t.id" :layout="target === 'cover' ? 'hero' : target === 'ending' ? 'portrait' : ''" @pick="picked" />
  </div>
</template>
