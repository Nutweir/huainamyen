<script setup lang="ts">
/* "For anyone who wants to follow": practical notes after the story, in a field-notebook style. */
import { computed, ref } from "vue";
import type { TravelNotes } from "@/types/content";
import { safeHref, safeMapEmbed, sanitizeNotes } from "@/utils/sanitize";
import { pad2 } from "@/utils/format";

const props = defineProps<{ notes: TravelNotes }>();
const place = ref(0);
const current = computed(() => props.notes.places[place.value]);
const group = ref(4);
const money = (v: number) => v.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const shared = computed(() => {
  const n = group.value, total = props.notes.split.reduce((s, [, a]) => s + a, 0);
  return `${props.notes.split.map(([l, a]) => `${l} ${money(a / n)}`).join(" · ")} · รวม ${money(total / n)} บาท/คน`;
});
const mapsLink = (coords: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(coords)}`;
</script>

<template>
  <section id="notes" class="notes" data-mood="notes" aria-labelledby="notes-t">
    <header class="notes-head flow">
      <h2 id="notes-t"><span class="kicker">Travel Notes</span>{{ notes.lede }}</h2>
      <p class="disclaimer">{{ notes.disclaimer }}</p>
      <dl class="facts"><div v-for="([k, v], i) in notes.facts" :key="i"><dt>{{ k }}</dt><dd>{{ v }}</dd></div></dl>
    </header>
    <div class="notes-body flow">
      <section v-for="(s, n) in notes.sections" :id="s.anchor" :key="s.anchor" class="note-sec" :aria-labelledby="`${s.anchor}-t`">
        <h3 :id="`${s.anchor}-t`"><span class="no">{{ pad2(n + 1) }}</span><span>{{ s.title }}<small>{{ s.en }}</small></span></h3>
        <div class="note-body">
          <div v-if="s.kind === 'html'" v-html="sanitizeNotes(s.html)" />

          <div v-else-if="s.kind === 'map' && current" class="map">
            <div class="map-tabs" role="group" aria-label="เลือกสถานที่บนแผนที่">
              <button v-for="(p, i) in notes.places" :key="p.key" type="button" :aria-pressed="i === place" @click="place = i">{{ p.name }}</button>
            </div>
            <div class="map-frame"><iframe :src="safeMapEmbed(current.embed)" :title="`แผนที่ ${current.name}`" width="600" height="380" loading="lazy" allowfullscreen referrerpolicy="strict-origin-when-cross-origin" /></div>
            <p class="map-place"><b>{{ current.name }}</b> <span>{{ current.area }}</span></p>
            <p><a class="note-link" :href="mapsLink(current.coordinates)" target="_blank" rel="noopener">เปิดใน Google Maps ↗</a></p>
            <p class="small">{{ notes.mapNote }}</p>
          </div>

          <template v-else-if="s.kind === 'expenses'">
            <p class="small">{{ notes.expensesBefore }}</p>
            <table class="ledger">
              <caption class="sr-only">ค่าใช้จ่ายแต่ละรายการ</caption>
              <thead><tr><th scope="col">รายการ</th><th scope="col">ราคา</th></tr></thead>
              <tbody><tr v-for="(e, i) in notes.expenses" :key="i"><td>{{ e.label }}<small>{{ e.note }}</small></td><td class="amt">{{ e.amount }}</td></tr></tbody>
            </table>
            <p class="disclaimer">{{ notes.disclaimer }}</p>
            <div v-if="notes.split.length" class="splitter">
              <label for="group-size">ลองหารในกลุ่ม · จำนวนคน</label>
              <select id="group-size" v-model.number="group"><option v-for="k in 10" :key="k" :value="k">{{ k }} คน</option></select>
              <output for="group-size" aria-live="polite">{{ shared }}</output>
              <p class="small">{{ notes.splitNote }}</p>
            </div>
          </template>

          <ul v-else-if="s.kind === 'contacts'" class="contacts">
            <li v-for="(c, i) in notes.contacts" :key="i">
              <a :href="safeHref(c.href) || undefined" v-bind="c.external ? { target: '_blank', rel: 'noopener' } : {}"><b>{{ c.title }}</b><span>{{ c.desc }}</span><span class="host">{{ c.host }}</span></a>
            </li>
          </ul>
        </div>
      </section>
    </div>
  </section>
</template>
