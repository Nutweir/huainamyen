<script setup lang="ts">
/* Start a new trip: title, place and dates the author types in (nothing is filled in for them). */
import { ref, watch } from "vue";
import { useBackend } from "@/services";
import { slugify } from "@/utils/format";

const emit = defineEmits<{ created: [string] }>();
const { repo } = useBackend();
const dlg = ref<HTMLDialogElement | null>(null);
const form = ref({ title: "", slug: "", location: "", startDate: "", endDate: "" });
const slugTouched = ref(false);
const error = ref("");
const busy = ref(false);

watch(() => form.value.title, t => { if (!slugTouched.value) form.value.slug = slugify(t); });

function open() {
  form.value = { title: "", slug: "", location: "", startDate: "", endDate: "" };
  slugTouched.value = false; error.value = "";
  dlg.value?.showModal();
}
async function create() {
  error.value = "";
  const f = form.value;
  const slug = slugify(f.slug || f.title);
  if (!slug) { error.value = "ตั้งชื่อลิงก์ (slug) เป็นภาษาอังกฤษ ตัวเลข หรือขีด"; return; }
  if (f.endDate && f.endDate < f.startDate) { error.value = "วันกลับต้องไม่ก่อนวันไป"; return; }
  busy.value = true;
  try {
    if (await repo.isSlugTaken(slug)) { error.value = `มีทริปที่ใช้ลิงก์ “${slug}” แล้ว`; return; }
    const id = await repo.createTrip({ title: f.title.trim(), slug, location: f.location.trim(), startDate: f.startDate, endDate: f.endDate || null });
    dlg.value?.close();
    emit("created", id);
  } catch (e) { error.value = (e as Error).message; }
  finally { busy.value = false; }
}
defineExpose({ open });
</script>

<template>
  <dialog ref="dlg" class="w-[min(520px,calc(100vw-24px))] rounded-xl border border-rule bg-white p-5 backdrop:bg-black/40">
    <form class="grid gap-3" @submit.prevent="create">
      <h2 class="font-display text-xl">เริ่มทริปใหม่</h2>
      <label class="field"><span>ชื่อทริป</span><input v-model="form.title" class="input" required maxlength="160"></label>
      <label class="field"><span>ลิงก์ (slug)</span>
        <input v-model="form.slug" class="input font-mono text-sm" required pattern="[a-z0-9]+(-[a-z0-9]+)*" placeholder="เช่น doi-luang" @input="slugTouched = true">
        <small class="text-xs text-muted">/journeys/{{ form.slug || "…" }}</small>
      </label>
      <label class="field"><span>สถานที่</span><input v-model="form.location" class="input" maxlength="160"></label>
      <div class="grid grid-cols-2 gap-3">
        <label class="field"><span>วันไป</span><input v-model="form.startDate" class="input" type="date" required></label>
        <label class="field"><span>วันกลับ</span><input v-model="form.endDate" class="input" type="date" :min="form.startDate"></label>
      </div>
      <p v-if="error" class="text-sm text-danger" role="alert">{{ error }}</p>
      <div class="flex gap-2">
        <button class="btn" :disabled="busy">{{ busy ? "กำลังสร้าง…" : "สร้างเป็นฉบับร่าง" }}</button>
        <button type="button" class="btn btn-ghost" @click="dlg?.close()">ยกเลิก</button>
      </div>
    </form>
  </dialog>
</template>
