<script setup lang="ts">
/* Saved and published versions of the trip; any of them can be brought back (current work is kept as a version first). */
import { ref } from "vue";
import { useEditorStore } from "@/stores/editor";
import { useToast } from "@/composables/useToast";

const ed = useEditorStore();
const { toast } = useToast();
const label = ref("");
const busy = ref(false);

async function saveNow() {
  busy.value = true;
  try { await ed.saveVersion(label.value.trim()); label.value = ""; toast("เก็บเวอร์ชันแล้ว"); }
  catch (e) { toast((e as Error).message, true); }
  finally { busy.value = false; }
}
async function restore(id: string, name: string) {
  if (!confirm(`ย้อนกลับไปเป็น “${name}”?\nงานตอนนี้จะถูกเก็บเป็นเวอร์ชันก่อน เผื่ออยากกลับมา`)) return;
  busy.value = true;
  try { await ed.restoreVersion(id); toast("ย้อนกลับแล้ว (ยังไม่เผยแพร่ — กด Publish เมื่อพร้อม)"); }
  catch (e) { toast((e as Error).message, true); }
  finally { busy.value = false; }
}
</script>

<template>
  <div class="grid gap-4">
    <form class="card flex flex-wrap items-end gap-2 p-4" @submit.prevent="saveNow">
      <label class="field min-w-[14rem] flex-1"><span>เก็บเวอร์ชันตอนนี้ไว้</span><input v-model="label" class="input" placeholder="เช่น ก่อนเขียนวันที่ 2 ใหม่"></label>
      <button class="btn" :disabled="busy">เก็บเวอร์ชัน</button>
    </form>
    <ul class="card divide-y divide-[#f0ebe1]">
      <li v-for="v in ed.versions" :key="v.id" class="flex flex-wrap items-center gap-3 p-3">
        <div class="min-w-0 flex-1">
          <p class="font-medium">{{ v.label }}</p>
          <p class="text-xs text-muted">{{ new Date(v.createdAt).toLocaleString("th-TH") }}</p>
        </div>
        <span v-if="v.isPublished" class="chip bg-[#e5efe6] text-forest">ฉบับที่ผู้อ่านเห็นตอนนี้</span>
        <button class="btn btn-ghost min-h-8 px-3" :disabled="busy" @click="restore(v.id, v.label)">ย้อนกลับไปเวอร์ชันนี้</button>
      </li>
      <li v-if="!ed.versions.length" class="p-4 text-muted">ยังไม่มีเวอร์ชัน — ระบบเก็บให้ทุกครั้งที่กด Publish</li>
    </ul>
  </div>
</template>
