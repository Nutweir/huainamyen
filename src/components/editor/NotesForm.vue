<script setup lang="ts">
/* Travel notes at the end of a journal: facts, sections, places, expenses and contacts. */
import { computed } from "vue";
import type { TravelNotes, TripBundle } from "@/types/content";

const props = defineProps<{ bundle: TripBundle }>();
const n = computed(() => props.bundle.notes);

function create() {
  const notes: TravelNotes = { lede: "", disclaimer: "", facts: [], sections: [], places: [], mapNote: "", expensesBefore: "", expenses: [], split: [], splitNote: "", contacts: [], aliases: {} };
  props.bundle.notes = notes;
}
const pairs = (list: [string, string | number][]) => list.map(([k, v]) => `${k}: ${v}`).join("\n");
const parse = (v: string) => v.split("\n").map(l => l.split(/:\s*/)).filter(p => p[0]?.trim()).map(([k, ...r]) => [k.trim(), r.join(": ").trim()] as [string, string]);
const facts = computed({ get: () => pairs(n.value?.facts || []), set: v => { n.value!.facts = parse(v); } });
const split = computed({ get: () => pairs(n.value?.split || []), set: v => { n.value!.split = parse(v).map(([k, x]) => [k, Number(x.replace(/[^\d.]/g, "")) || 0]); } });
const anchorOf = (kind: string) => `#${n.value?.sections.find(s => s.kind === kind)?.anchor || "notes"}`;
const total = computed(() => (n.value?.expenses || []).reduce((s, e) => s + (Number(String(e.amount).replace(/[^\d.]/g, "")) || 0), 0));
</script>

<template>
  <div v-if="!n" class="card p-6 text-center">
    <p class="text-muted">ทริปนี้ยังไม่มีข้อมูลการเดินทาง</p>
    <button type="button" class="btn mt-3" @click="create">+ เพิ่มข้อมูลการเดินทาง</button>
  </div>
  <div v-else class="grid gap-6">
    <section class="card grid gap-3 p-4" aria-labelledby="n-intro" data-preview="#notes" data-field="notes-intro">
      <h3 id="n-intro" class="font-display text-lg">บทนำ</h3>
      <label class="field"><span>คำนำ</span><textarea v-model="n.lede" class="input" rows="2" /></label>
      <label class="field"><span>หมายเหตุ</span><textarea v-model="n.disclaimer" class="input" rows="2" /></label>
      <label class="field"><span>ข้อมูลสั้น (หัวข้อ: ค่า หนึ่งรายการต่อแถว)</span><textarea v-model.lazy="facts" class="input" rows="4" /></label>
    </section>

    <section class="card grid gap-3 p-4" aria-labelledby="n-sec">
      <h3 id="n-sec" class="font-display text-lg">หัวข้อ</h3>
      <details v-for="(s, i) in n.sections" :key="i" class="rounded-lg border border-[#ece6da] p-3" :data-preview="`#${s.anchor}`" :data-field="`notes:${s.anchor}`">
        <summary class="cursor-pointer font-medium">{{ s.title || "(ไม่มีชื่อ)" }} <span class="text-xs text-muted">#{{ s.anchor }}</span></summary>
        <div class="mt-3 grid gap-2">
          <div class="grid grid-cols-3 gap-2">
            <label class="field"><span>ชื่อ</span><input v-model="s.title" class="input"></label>
            <label class="field"><span>ชื่ออังกฤษ</span><input v-model="s.en" class="input"></label>
            <label class="field"><span>#anchor</span><input v-model="s.anchor" class="input font-mono text-sm"></label>
          </div>
          <label class="field"><span>ชนิด</span>
            <select v-model="s.kind" class="input"><option value="html">ข้อความ</option><option value="map">แผนที่ (ใช้รายการสถานที่)</option><option value="expenses">ค่าใช้จ่าย (ใช้ตารางด้านล่าง)</option><option value="contacts">ติดต่อ (ใช้รายการด้านล่าง)</option></select>
          </label>
          <label class="field"><span>เนื้อหา (HTML: p, ul, li, b, i, a, h4)</span><textarea v-model="s.html" class="input font-mono text-sm" rows="6" /></label>
          <button type="button" class="btn btn-danger w-fit" @click="n.sections.splice(i, 1)">ลบหัวข้อนี้</button>
        </div>
      </details>
      <button type="button" class="btn btn-ghost w-fit" @click="n.sections.push({ anchor: `note-${n.sections.length + 1}`, title: '', en: '', kind: 'html', html: '' })">+ เพิ่มหัวข้อ</button>
    </section>

    <section class="card grid gap-3 p-4" aria-labelledby="n-place" :data-preview="anchorOf('map')">
      <h3 id="n-place" class="font-display text-lg">สถานที่</h3>
      <div v-for="(p, i) in n.places" :key="i" class="grid gap-2 rounded-lg border border-[#ece6da] p-3 md:grid-cols-2">
        <label class="field"><span>ชื่อ</span><input v-model="p.name" class="input"></label>
        <label class="field"><span>พื้นที่</span><input v-model="p.area" class="input"></label>
        <label class="field"><span>พิกัด</span><input v-model="p.coordinates" class="input" placeholder="17.xxxx, 98.xxxx"></label>
        <label class="field"><span>ลิงก์ฝังแผนที่ (https://www.google.com/maps/embed?…)</span><input v-model="p.embed" class="input"></label>
        <button type="button" class="btn btn-danger w-fit" @click="n.places.splice(i, 1)">ลบ</button>
      </div>
      <button type="button" class="btn btn-ghost w-fit" @click="n.places.push({ key: `place-${n.places.length + 1}`, name: '', area: '', coordinates: '', embed: '' })">+ เพิ่มสถานที่</button>
      <label class="field"><span>หมายเหตุใต้แผนที่</span><input v-model="n.mapNote" class="input"></label>
    </section>

    <section class="card grid gap-3 p-4" aria-labelledby="n-exp" :data-preview="anchorOf('expenses')">
      <h3 id="n-exp" class="font-display text-lg">ค่าใช้จ่าย</h3>
      <label class="field"><span>ข้อความก่อนตาราง</span><textarea v-model="n.expensesBefore" class="input" rows="2" /></label>
      <div class="overflow-x-auto">
        <table class="w-full min-w-[520px] text-sm">
          <thead><tr class="text-left text-muted"><th class="p-1 font-medium">รายการ</th><th class="w-32 p-1 font-medium">จำนวนเงิน</th><th class="p-1 font-medium">หมายเหตุ</th><th class="w-10" /></tr></thead>
          <tbody>
            <tr v-for="(e, i) in n.expenses" :key="i">
              <td class="p-1"><input v-model="e.label" class="input min-h-9" aria-label="รายการ"></td>
              <td class="p-1"><input v-model="e.amount" class="input min-h-9" inputmode="decimal" aria-label="จำนวนเงิน"></td>
              <td class="p-1"><input v-model="e.note" class="input min-h-9" aria-label="หมายเหตุ"></td>
              <td class="p-1"><button type="button" class="text-danger" :aria-label="`ลบ ${e.label}`" @click="n.expenses.splice(i, 1)">✕</button></td>
            </tr>
          </tbody>
          <tfoot><tr><td class="p-1 font-medium">รวม</td><td class="p-1 font-medium">{{ total.toLocaleString("th-TH") }}</td><td colspan="2" /></tr></tfoot>
        </table>
      </div>
      <button type="button" class="btn btn-ghost w-fit" @click="n.expenses.push({ label: '', amount: '', note: '' })">+ เพิ่มรายการ</button>
      <label class="field"><span>หารกัน (ชื่อ: จำนวนเงิน หนึ่งคนต่อแถว)</span><textarea v-model.lazy="split" class="input" rows="3" /></label>
      <label class="field"><span>หมายเหตุการหาร</span><input v-model="n.splitNote" class="input"></label>
    </section>

    <section class="card grid gap-3 p-4" aria-labelledby="n-con" :data-preview="anchorOf('contacts')">
      <h3 id="n-con" class="font-display text-lg">ติดต่อ</h3>
      <div v-for="(c, i) in n.contacts" :key="i" class="grid gap-2 rounded-lg border border-[#ece6da] p-3 md:grid-cols-2">
        <label class="field"><span>ชื่อ</span><input v-model="c.title" class="input"></label>
        <label class="field"><span>ลิงก์ (https://, tel:, mailto:)</span><input v-model="c.href" class="input"></label>
        <label class="field"><span>รายละเอียด</span><input v-model="c.desc" class="input"></label>
        <label class="field"><span>ข้อความลิงก์</span><input v-model="c.host" class="input"></label>
        <label class="flex items-center gap-2 text-sm"><input v-model="c.external" type="checkbox"> เปิดในแท็บใหม่</label>
        <button type="button" class="btn btn-danger w-fit" @click="n.contacts.splice(i, 1)">ลบ</button>
      </div>
      <button type="button" class="btn btn-ghost w-fit" @click="n.contacts.push({ href: '', title: '', desc: '', host: '', external: true })">+ เพิ่มช่องทางติดต่อ</button>
    </section>
  </div>
</template>
