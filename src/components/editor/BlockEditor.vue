<script setup lang="ts">
/* Properties of the selected block. Edits go straight into the store's working copy (autosaved). */
import { computed, ref } from "vue";
import { MOODS, isPlaceholder, type Block, type MediaAsset, type MediaRef, type SetItem } from "@/types/content";
import { BLOCK_LABELS } from "@/services/factory";
import { useBackend } from "@/services";
import { checkSize, LAYOUT_ADVICE, autoLayout } from "@/utils/media";
import RichText from "./RichText.vue";
import LinesField from "./LinesField.vue";
import MediaPicker from "@/components/admin/MediaPicker.vue";

const props = defineProps<{ block: Block; media: Map<string, MediaAsset>; tripId: string }>();
const emit = defineEmits<{ media: [MediaAsset[]] }>();
const { repo } = useBackend();
const picker = ref<InstanceType<typeof MediaPicker> | null>(null);
const pickFor = ref<"item" | "add" | "video" | { index: number }>("item");

const b = computed(() => props.block);
const IMAGE_LAYOUTS = [["", "อัตโนมัติ"], ["hero", "เต็มจอ (Hero)"], ["full", "เต็มความกว้าง"], ["spotlight", "แนวตั้งเด่น"], ["background", "พื้นหลังมีข้อความ"], ["wide", "กว้าง"], ["inline", "ในเนื้อหา"], ["portrait", "แนวตั้ง"], ["polaroid", "โพลารอยด์"], ["diary-photo", "รูปข้างบันทึก"]] as const;
const SET_LAYOUTS = [["", "อัตโนมัติ"], ["two-column", "สองคอลัมน์"], ["collage", "คอลลาจ"], ["memory-stack", "กองรูป"], ["film-strip", "แถบฟิล์ม"], ["gallery", "กริด"]] as const;
const POSITIONS = [["", "ปกติ"], ["left", "ชิดซ้าย"], ["right", "ชิดขวา"], ["center", "กึ่งกลาง"], ["bleed-left", "ล้นซ้าย"], ["bleed-right", "ล้นขวา"]] as const;
const MOOD_LABEL: Record<string, string> = { morning: "เช้า", day: "กลางวัน", golden: "แดดเย็น", dusk: "พลบค่ำ", night: "กลางคืน", dawn: "รุ่งสาง", forest: "ป่า", evening: "ค่ำ", notes: "บันทึก" };

const asset = (id: string | undefined) => (id ? props.media.get(id) : undefined);
const thumb = (a: MediaAsset | undefined) => (a ? repo.mediaUrl(a.kind === "video" && a.posterId && props.media.get(a.posterId) ? props.media.get(a.posterId)! : a, 500) : "");

const sizeNotes = computed(() => {
  const x = b.value;
  if (x.type === "image") {
    const a = asset(x.data.item.mediaId);
    if (!a) return [];
    return checkSize(a.width, a.height, LAYOUT_ADVICE[x.data.layout || autoLayout(a)] || LAYOUT_ADVICE[""]).notes;
  }
  if (x.type === "images") {
    const adv = LAYOUT_ADVICE[x.data.layout] || LAYOUT_ADVICE[""];
    return x.data.items.flatMap((it, i) => { const a = !isPlaceholder(it) ? asset(it.mediaId) : undefined; return a ? checkSize(a.width, a.height, adv).notes.map(n => `รูปที่ ${i + 1}: ${n}`) : []; });
  }
  if (x.type === "decoration") { const a = asset(x.data.item.mediaId); return a ? checkSize(a.width, a.height, LAYOUT_ADVICE.decoration).notes : []; }
  return [];
});
const advice = computed(() => {
  const x = b.value;
  if (x.type === "image" || x.type === "images" || x.type === "placeholder") return LAYOUT_ADVICE[x.data.layout] || LAYOUT_ADVICE[""];
  if (x.type === "decoration") return LAYOUT_ADVICE.decoration;
  return null;
});

function openPicker(target: typeof pickFor.value) {
  pickFor.value = target;
  const x = b.value;
  const pre = x.type === "images" && target === "add" ? [] : x.type === "image" || x.type === "decoration" ? [x.data.item.mediaId].filter(Boolean) : x.type === "video" ? [x.data.mediaId].filter(Boolean) : [];
  picker.value?.open(pre);
}
function picked(assets: MediaAsset[]) {
  emit("media", assets);
  const x = b.value, t = pickFor.value;
  const main = assets.filter(a => !(a.tags.includes("poster") && assets.some(v => v.posterId === a.id)));
  if (!main.length) return;
  if ((x.type === "image" || x.type === "decoration") && t === "item") x.data.item = { ...x.data.item, mediaId: main[0].id };
  else if (x.type === "video") x.data.mediaId = main[0].id;
  else if (x.type === "images" && t === "add") x.data.items.push(...main.map(a => ({ mediaId: a.id })));
  else if (x.type === "images" && typeof t === "object") x.data.items.splice(t.index, 1, { mediaId: main[0].id });
}
function moveItem(items: SetItem[], i: number, d: number) {
  const j = i + d;
  if (j < 0 || j >= items.length) return;
  [items[i], items[j]] = [items[j], items[i]];
}
const refOf = (it: SetItem) => it as MediaRef;
</script>

<template>
  <div class="grid gap-3">
    <h3 class="font-display text-lg">{{ BLOCK_LABELS[b.type] }}</h3>

    <template v-if="b.type === 'event'">
      <div class="grid grid-cols-[7rem_1fr] gap-2">
        <label class="field"><span>เวลา</span><input v-model="b.data.time" class="input" placeholder="07:00"></label>
        <label class="field"><span>ชื่อช่วงเวลา</span><input v-model="b.data.title" class="input"></label>
      </div>
      <div class="grid grid-cols-2 gap-2">
        <label class="field"><span>บรรยากาศ (สีพื้น)</span>
          <select v-model="b.data.mood" class="input"><option :value="null">ตามวัน</option><option v-for="m in MOODS" :key="m" :value="m">{{ MOOD_LABEL[m] }}</option></select>
        </label>
        <label class="field"><span>ลิงก์ภายใน (#anchor)</span><input v-model="b.data.anchor" class="input font-mono text-sm" pattern="[A-Za-z0-9_-]+"></label>
      </div>
      <label class="flex items-center gap-2 text-sm"><input v-model="b.data.quietTitle" type="checkbox"> ซ่อนชื่อช่วงเวลา (ให้เนื้อหาเล่าเอง)</label>
      <p class="text-xs text-muted">ลิงก์เดิมอย่าง #d1-0700 ใช้ anchor นี้ เปลี่ยนแล้วลิงก์เก่าจะไม่พามาที่นี่</p>
    </template>

    <template v-else-if="b.type === 'paragraph' || b.type === 'heading' || b.type === 'note'">
      <RichText v-model="b.data.html" :placeholder="b.type === 'note' ? 'โน้ตลายมือ…' : 'เขียนเรื่องราว…'" :display="b.type === 'heading'" />
    </template>
    <template v-else-if="b.type === 'thought'">
      <RichText v-model="b.data.html" placeholder="ประโยคที่อยากให้เด่น…" display />
      <label class="flex items-center gap-2 text-sm"><input :checked="b.data.size === 'xl'" type="checkbox" @change="b.data.size = ($event.target as HTMLInputElement).checked ? 'xl' : ''"> ตัวใหญ่พิเศษ</label>
    </template>
    <template v-else-if="b.type === 'quote'">
      <RichText v-model="b.data.html" placeholder="คำพูด…" />
      <label class="field"><span>ใครพูด</span><input v-model="b.data.by" class="input"></label>
    </template>
    <template v-else-if="b.type === 'dialogue'">
      <div v-for="(l, i) in b.data.lines" :key="i" class="grid grid-cols-[7rem_1fr_auto] items-end gap-2">
        <label class="field"><span>ใคร</span><input v-model="l.who" class="input"></label>
        <label class="field"><span>พูดว่า</span><input v-model="l.line" class="input"></label>
        <button type="button" class="btn btn-ghost min-h-[42px] px-3" :aria-label="`ลบบรรทัด ${i + 1}`" @click="b.data.lines.splice(i, 1)">✕</button>
      </div>
      <button type="button" class="btn btn-ghost w-fit" @click="b.data.lines.push({ who: '', line: '' })">+ เพิ่มบรรทัด</button>
    </template>
    <LinesField v-else-if="b.type === 'verse'" v-model:lines="b.data.lines" label="บรรทัด (หนึ่งบรรทัดต่อหนึ่งแถว)" hint="ใช้ <i>…</i> หรือ <b>…</b> ได้" />
    <template v-else-if="b.type === 'letter'">
      <label class="field"><span>ขึ้นต้น</span><input v-model="b.data.lead" class="input"></label>
      <LinesField v-model:lines="b.data.lines" label="ข้อความ (ลายมือ หนึ่งบรรทัดต่อแถว)" />
    </template>
    <label v-else-if="b.type === 'pause' || b.type === 'mark'" class="field"><span>ข้อความ</span><input v-model="b.data.text" class="input"></label>
    <label v-else-if="b.type === 'spacer'" class="field"><span>ขนาด</span>
      <select v-model="b.data.size" class="input"><option value="s">เล็ก</option><option value="m">กลาง</option><option value="l">ใหญ่</option></select>
    </label>
    <template v-else-if="b.type === 'stamp'">
      <div class="grid grid-cols-3 gap-2">
        <label class="field"><span>ตัวเลข/คำหลัก</span><input v-model="b.data.value" class="input"></label>
        <label class="field"><span>ป้าย</span><input v-model="b.data.label" class="input"></label>
        <label class="field"><span>บรรทัดล่าง</span><input v-model="b.data.sub" class="input"></label>
      </div>
    </template>

    <template v-else-if="b.type === 'image' || b.type === 'decoration'">
      <div class="flex items-center gap-3">
        <img v-if="asset(b.data.item.mediaId)" :src="thumb(asset(b.data.item.mediaId))" :alt="asset(b.data.item.mediaId)!.alt" class="h-24 w-32 rounded object-cover">
        <div v-else class="grid h-24 w-32 place-items-center rounded bg-[#efe9dd] text-xs text-muted">ยังไม่มีรูป</div>
        <button type="button" class="btn btn-ghost" @click="openPicker('item')">{{ b.data.item.mediaId ? "เปลี่ยนรูป" : "เลือกรูป" }}</button>
      </div>
      <template v-if="b.type === 'image'">
        <div class="grid grid-cols-2 gap-2">
          <label class="field"><span>รูปแบบ</span><select v-model="b.data.layout" class="input"><option v-for="[v, l] in IMAGE_LAYOUTS" :key="v" :value="v">{{ l }}</option></select></label>
          <label class="field"><span>ตำแหน่ง</span><select v-model="b.data.position" class="input"><option v-for="[v, l] in POSITIONS" :key="v" :value="v">{{ l }}</option></select></label>
          <label class="field"><span>โทน</span><select v-model="b.data.tone" class="input"><option value="">ปกติ</option><option value="forest">ป่า</option><option value="night">กลางคืน</option></select></label>
          <label class="field"><span>การปรากฏ</span><select v-model="b.data.reveal" class="input"><option value="">ปกติ</option><option value="slow">ค่อย ๆ ชัด</option></select></label>
        </div>
        <label v-if="b.data.layout === 'diary-photo'" class="field"><span>วางข้างย่อหน้าถัดไปกี่ย่อหน้า</span><input v-model.number="b.data.besideCount" class="input" type="number" min="1" max="8"></label>
        <LinesField v-if="b.data.layout === 'background'" v-model:lines="b.data.text" label="ข้อความบนรูป" :rows="3" />
      </template>
      <label v-else class="field"><span>ข้าง</span><select v-model="b.data.position" class="input"><option value="">อัตโนมัติ</option><option value="left">ซ้าย</option><option value="right">ขวา</option></select></label>
      <details class="rounded-lg border border-[#ece6da] p-2">
        <summary class="cursor-pointer text-sm font-medium">คำบรรยายเฉพาะจุดนี้ (ไม่แก้ในคลัง)</summary>
        <div class="mt-2 grid gap-2">
          <label class="field"><span>คำบรรยาย</span><input v-model="b.data.item.caption" class="input" :placeholder="asset(b.data.item.mediaId)?.caption"></label>
          <label class="field"><span>alt</span><input v-model="b.data.item.alt" class="input" :placeholder="asset(b.data.item.mediaId)?.alt"></label>
          <div class="grid grid-cols-2 gap-2">
            <label class="field"><span>เวลา</span><input v-model="b.data.item.time" class="input" :placeholder="asset(b.data.item.mediaId)?.takenTime || ''"></label>
            <label class="field"><span>สถานที่</span><input v-model="b.data.item.location" class="input" :placeholder="asset(b.data.item.mediaId)?.location"></label>
          </div>
          <label class="field"><span>โน้ตหลังรูป</span><input v-model="b.data.item.note" class="input" :placeholder="asset(b.data.item.mediaId)?.note"></label>
          <label class="flex items-center gap-2 text-sm"><input v-model="b.data.item.hidden" type="checkbox"> ซ่อนรูปนี้ชั่วคราว</label>
        </div>
      </details>
    </template>

    <template v-else-if="b.type === 'images'">
      <div class="grid grid-cols-2 gap-2">
        <label class="field"><span>รูปแบบ</span><select v-model="b.data.layout" class="input"><option v-for="[v, l] in SET_LAYOUTS" :key="v" :value="v">{{ l }}</option></select></label>
        <label class="field"><span>ตำแหน่ง</span><select v-model="b.data.position" class="input"><option v-for="[v, l] in POSITIONS" :key="v" :value="v">{{ l }}</option></select></label>
      </div>
      <label class="field"><span>คำบรรยายชุดรูป</span><input v-model="b.data.caption" class="input"></label>
      <ol class="grid gap-1.5">
        <li v-for="(it, i) in b.data.items" :key="i" class="flex items-center gap-2 rounded-lg border border-[#ece6da] p-1.5">
          <template v-if="isPlaceholder(it)">
            <div class="grid h-12 w-16 place-items-center rounded bg-[#efe9dd] text-[10px] text-muted">ช่องรอรูป</div>
            <input v-model="it.placeholder" class="input min-h-8 flex-1 text-sm" aria-label="ชื่อช่องรอรูป">
            <button type="button" class="btn btn-ghost min-h-8 px-2 text-xs" @click="openPicker({ index: i })">ใส่รูป</button>
          </template>
          <template v-else>
            <img :src="thumb(asset(refOf(it).mediaId))" alt="" class="h-12 w-16 rounded object-cover">
            <input v-model="refOf(it).caption" class="input min-h-8 flex-1 text-sm" :placeholder="asset(refOf(it).mediaId)?.caption || 'คำบรรยาย'" aria-label="คำบรรยายรูปนี้">
          </template>
          <button type="button" class="px-1" :aria-label="`เลื่อนรูปที่ ${i + 1} ขึ้น`" @click="moveItem(b.data.items, i, -1)">↑</button>
          <button type="button" class="px-1" :aria-label="`เลื่อนรูปที่ ${i + 1} ลง`" @click="moveItem(b.data.items, i, 1)">↓</button>
          <button type="button" class="px-1 text-danger" :aria-label="`เอารูปที่ ${i + 1} ออก`" @click="b.data.items.splice(i, 1)">✕</button>
        </li>
      </ol>
      <div class="flex gap-2">
        <button type="button" class="btn btn-ghost" @click="openPicker('add')">+ เพิ่มรูป</button>
        <button type="button" class="btn btn-ghost" @click="b.data.items.push({ placeholder: '' })">+ ช่องรอรูป</button>
      </div>
    </template>

    <template v-else-if="b.type === 'placeholder'">
      <label class="field"><span>ป้าย (บอกว่ารอรูปอะไร)</span><input v-model="b.data.label" class="input"></label>
      <div class="grid grid-cols-2 gap-2">
        <label class="field"><span>รูปแบบ</span><select v-model="b.data.layout" class="input"><option v-for="[v, l] in IMAGE_LAYOUTS" :key="v" :value="v">{{ l }}</option></select></label>
        <label class="field"><span>ตำแหน่ง</span><select v-model="b.data.position" class="input"><option v-for="[v, l] in POSITIONS" :key="v" :value="v">{{ l }}</option></select></label>
      </div>
      <p class="text-xs text-muted">ช่องรอรูปไม่แสดงบนหน้าเว็บจริง (ยกเว้นเปิดด้วย ?slots)</p>
    </template>

    <template v-else-if="b.type === 'video'">
      <div class="flex items-center gap-3">
        <img v-if="asset(b.data.mediaId)" :src="thumb(asset(b.data.mediaId))" alt="" class="h-24 w-32 rounded object-cover">
        <div v-else class="grid h-24 w-32 place-items-center rounded bg-[#efe9dd] text-xs text-muted">ยังไม่มีคลิป</div>
        <button type="button" class="btn btn-ghost" @click="openPicker('video')">{{ b.data.mediaId ? "เปลี่ยนคลิป" : "เลือกคลิป" }}</button>
      </div>
      <label class="field"><span>คำบรรยาย</span><input v-model="b.data.caption" class="input"></label>
      <label class="field"><span>ป้ายเล็ก</span><input v-model="b.data.label" class="input"></label>
      <p class="text-xs text-muted">คลิปเล่นเองแบบปิดเสียงเมื่อเลื่อนมาถึง · MP4 (H.264) เปิดได้ทุกเครื่อง</p>
    </template>

    <p v-if="advice" class="border-l-2 border-forest bg-[#f1f5f0] px-3 py-1.5 text-xs">แนะนำ: {{ advice.text }}</p>
    <p v-for="n in sizeNotes" :key="n" class="text-xs text-earth">⚠ {{ n }}</p>

    <MediaPicker
      ref="picker" :kind="b.type === 'video' ? 'video' : 'image'" :multiple="b.type === 'images' && pickFor === 'add'"
      :trip-id="tripId" :layout="b.type === 'decoration' ? 'decoration' : 'layout' in b.data ? b.data.layout : ''" @pick="picked"
    />
  </div>
</template>
