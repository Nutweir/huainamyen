<script setup lang="ts">
/*
 * เกี่ยวกับผู้เขียน: name, photo, a few paragraphs and links, with the real About page beside it.
 * Unlike trips there is no draft: saving puts it on the site straight away (the button says so).
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { onBeforeRouteLeave, useRouter } from "vue-router";
import type { MediaAsset, SiteSettings } from "@/types/content";
import { useBackend } from "@/services";
import { useToast } from "@/composables/useToast";
import { clone } from "@/utils/format";
import { PARAGRAPH_STYLES, safeHref, sanitizeInline } from "@/utils/sanitize";
import RichText from "@/components/editor/RichText.vue";
import MediaPicker from "@/components/admin/MediaPicker.vue";
import SocialIcon from "@/components/diary/SocialIcon.vue";
import { PLATFORMS, detectPlatform, platformById } from "@/utils/social";

const { repo } = useBackend();
const router = useRouter();
const { toast } = useToast();
const site = ref<SiteSettings | null>(null);
const saved = ref("");
interface Para { key: number; html: string; align: "" | "al-center" | "al-right"; size: "" | "sz-s" | "sz-l" | "sz-xl"; font: "" | "f-hand" }
const paragraphs = ref<Para[]>([]);
const blank = (html = ""): Para => ({ key: keys++, html, align: "", size: "", font: "" });
const saving = ref(false);
const picker = ref<InstanceType<typeof MediaPicker> | null>(null);
let keys = 0;

/** "<p>a</p><p>b</p>" ⇄ ["a", "b"] (older single-block text becomes one paragraph). */
/** '<p class="al-center sz-l">a</p>…' ⇄ paragraphs with their style (older single-block text becomes one paragraph). */
function toParagraphs(html: string): Para[] {
  const found = [...html.matchAll(/<p(?:\s+class="([^"]*)")?>([\s\S]*?)<\/p>/g)];
  if (!found.length) return [blank(html.trim())];
  return found.map(([, cls = "", inner]) => {
    const c = cls.split(/\s+/);
    const pick = <T extends string>(list: readonly T[]) => (list.find(x => c.includes(x)) || "") as T | "";
    return { ...blank(inner), align: pick(PARAGRAPH_STYLES.align), size: pick(PARAGRAPH_STYLES.size), font: pick(PARAGRAPH_STYLES.font) };
  });
}
const toHtml = () => paragraphs.value
  .map(p => ({ h: sanitizeInline(p.html).trim(), cls: [p.align, p.size, p.font].filter(Boolean).join(" ") }))
  .filter(p => p.h)
  .map(p => (p.cls ? `<p class="${p.cls}">${p.h}</p>` : `<p>${p.h}</p>`))
  .join("");
/*
 * Links are edited as platform + username (or address); the URL is built from them.
 * A row that can't make a usable URL is left out of the page and flagged in red here.
 */
interface LinkRow { key: number; platform: string; value: string; label: string }
const rows = ref<LinkRow[]>([]);
const plat = (r: LinkRow) => platformById(r.platform) || platformById("other")!;
const urlOf = (r: LinkRow) => plat(r).toUrl(r.value);
function toRow(l: { label: string; url: string; platform?: string }): LinkRow {
  const p = platformById(l.platform) || detectPlatform(l.url);
  const short = p.fromUrl(l.url);
  // keep the saved address exactly when the short form wouldn't rebuild it
  return { key: keys++, platform: p.id, value: p.toUrl(short) === l.url ? short : l.url, label: l.label.trim() === p.label ? "" : l.label };
}
const inputs = ref<HTMLInputElement[]>([]);
async function addLink(platform: string) {
  rows.value.push({ key: keys++, platform, value: "", label: "" });
  await nextTick();
  inputs.value[rows.value.length - 1]?.focus();
}
const draft = computed<SiteSettings | null>(() => (site.value ? {
  ...site.value, aboutHtml: toHtml(),
  links: rows.value.map(r => ({ label: r.label.trim() || plat(r).label, url: urlOf(r), platform: r.platform })).filter(l => l.url),
} : null));
const dirty = computed(() => !!draft.value && JSON.stringify(draft.value) !== saved.value);

onMounted(async () => {
  try {
    const s = await repo.getSite();
    site.value = { ...clone(s), links: s.links?.length ? clone(s.links) : [], photo: s.photo || null, note: s.note || "", facts: s.facts ? clone(s.facts) : [], photoCaption: s.photoCaption || "" };
    paragraphs.value = toParagraphs(s.aboutHtml || "");
    rows.value = (s.links || []).map(toRow);
    saved.value = JSON.stringify(draft.value);
  } catch (e) { toast((e as Error).message, true); }
});

async function save() {
  if (!draft.value) return;
  const bad = rows.value.find(r => r.value.trim() && !safeHref(urlOf(r)));
  if (bad) { toast(`ลิงก์ ${plat(bad).label} “${bad.value}” ใช้ไม่ได้ — แก้หรือลบก่อนบันทึก`, true); return; }
  saving.value = true;
  try { await repo.saveSite(clone(draft.value)); saved.value = JSON.stringify(draft.value); toast("บันทึกแล้ว — หน้าเกี่ยวกับผู้เขียนเปลี่ยนแล้ว"); }
  catch (e) { toast((e as Error).message, true); }
  finally { saving.value = false; }
}
function picked(assets: MediaAsset[]) {
  const a = assets.find(x => x.kind === "image");
  if (a && site.value) site.value.photo = { ...a, originalPath: null };
}
const factsText = computed({
  get: () => (site.value?.facts || []).map(([k, v]) => `${k}: ${v}`).join(String.fromCharCode(10)),
  set: (v: string) => { if (site.value) site.value.facts = v.split(/\r?\n/).map(l => l.split(/:\s*/)).filter(p => p[0]?.trim()).map(([k, ...r]) => [k.trim(), r.join(": ").trim()] as [string, string]); },
});
const ALIGNS = [["", "ชิดซ้าย"], ["al-center", "กึ่งกลาง"], ["al-right", "ชิดขวา"]] as const;
const SIZES = [["sz-s", "เล็ก"], ["", "ปกติ"], ["sz-l", "ใหญ่"], ["sz-xl", "ใหญ่พิเศษ"]] as const;
const FONTS = [["", "ปกติ"], ["f-hand", "ลายมือ"]] as const;
const move = (i: number, d: number) => { const p = paragraphs.value, j = i + d; if (j >= 0 && j < p.length) [p[i], p[j]] = [p[j], p[i]]; };

// live preview: the real About page in a frame, fed the draft
const frame = ref<HTMLIFrameElement | null>(null);
const ready = ref(false);
// a fresh copy every time: GitHub Pages lets browsers keep pages 10 minutes, so right after a deploy
// the preview could otherwise run the previous version of the site next to the new admin
const src = router.resolve(`/about?embed&v=${Date.now()}`).href;
function send() { if (ready.value && draft.value) frame.value?.contentWindow?.postMessage({ type: "journeys-site-draft", site: JSON.stringify(draft.value) }, location.origin); }
let timer = 0;
watch(draft, () => { clearTimeout(timer); timer = window.setTimeout(send, 200); }, { deep: true });
function onMessage(e: MessageEvent) {
  if (e.origin === location.origin && e.source === frame.value?.contentWindow && (e.data as { type?: string })?.type === "journeys-preview-ready") { ready.value = true; send(); }
}
const beforeUnload = (e: BeforeUnloadEvent) => { if (dirty.value) { e.preventDefault(); e.returnValue = ""; } };
onMounted(() => { addEventListener("message", onMessage); addEventListener("beforeunload", beforeUnload); });
onBeforeUnmount(() => { removeEventListener("message", onMessage); removeEventListener("beforeunload", beforeUnload); clearTimeout(timer); });
onBeforeRouteLeave(() => !dirty.value || confirm("ยังไม่ได้บันทึกหน้าเกี่ยวกับผู้เขียน ออกเลยไหม?"));
</script>

<template>
  <main class="mx-auto max-w-[1600px] px-4 py-6">
    <div class="flex flex-wrap items-center gap-3">
      <h1 class="font-display text-2xl">เกี่ยวกับผู้เขียน</h1>
      <span class="text-sm" :class="dirty ? 'text-earth' : 'text-muted'" role="status">{{ dirty ? "ยังไม่บันทึก" : site ? "บันทึกแล้ว" : "" }}</span>
      <a :href="router.resolve('/about').href" target="_blank" rel="noopener" class="ml-auto text-sm underline">ดูหน้าจริง ↗</a>
      <button class="btn" :disabled="!dirty || saving" @click="save">{{ saving ? "กำลังบันทึก…" : "บันทึก (ขึ้นเว็บทันที)" }}</button>
    </div>
    <p v-if="!site" class="mt-4 text-muted">กำลังโหลด…</p>
    <div v-else class="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(420px,0.9fr)]">
      <div class="grid h-fit gap-4">
        <section class="card grid gap-3 p-4" aria-labelledby="ab-who">
          <h2 id="ab-who" class="font-display text-lg">ผู้เขียน</h2>
          <label class="field"><span>ชื่อที่แสดง</span><input v-model="site.author" class="input" maxlength="80"></label>
          <label class="field"><span>ประโยคลายมือใต้ชื่อ (ไม่ใส่ก็ได้)</span><input v-model="site.note" class="input" maxlength="140" placeholder="เช่น ชอบเดินทางช้า ๆ และจดทุกอย่างไว้"></label>
          <label class="field"><span>ข้อมูลสั้น ๆ (หัวข้อ: ค่า หนึ่งรายการต่อแถว)</span><textarea v-model.lazy="factsText" class="input" rows="3" placeholder="Based in: เชียงใหม่&#10;Camera: …" /></label>
          <div class="flex items-center gap-3">
            <img v-if="site.photo" :src="repo.mediaUrl(site.photo, 500)" :alt="site.photo.alt" class="h-24 w-20 rounded object-cover" :style="site.photo.focus ? { objectPosition: site.photo.focus } : undefined">
            <div v-else class="grid h-24 w-20 place-items-center rounded bg-[#efe9dd] text-center text-xs text-muted">ไม่มีรูป</div>
            <div class="flex flex-wrap gap-2">
              <button type="button" class="btn btn-ghost" @click="picker?.open()">{{ site.photo ? "เปลี่ยนรูป" : "เลือกรูป" }}</button>
              <button v-if="site.photo" type="button" class="btn btn-ghost" @click="site.photo = null">เอารูปออก</button>
            </div>
          </div>
          <label v-if="site.photo" class="field"><span>คำลายมือใต้รูป (ว่าง = ใช้ชื่อ)</span><input v-model="site.photoCaption" class="input" maxlength="60"></label>
          <p class="text-xs text-muted">แนะนำรูปแนวตั้ง 4:5 · ตั้งจุดสำคัญของรูป (หน้า) ได้ที่คลังรูป</p>
        </section>

        <section class="card grid gap-3 p-4" aria-labelledby="ab-text">
          <h2 id="ab-text" class="font-display text-lg">เรื่องเล่า</h2>
          <div v-for="(p, i) in paragraphs" :key="p.key" class="grid gap-1">
            <div class="flex items-center gap-1 text-xs text-muted">
              <span>ย่อหน้าที่ {{ i + 1 }}</span>
              <button type="button" class="ml-auto rounded px-1.5 hover:bg-[#eee8dc] disabled:opacity-30" :disabled="i === 0" :aria-label="`เลื่อนย่อหน้าที่ ${i + 1} ขึ้น`" @click="move(i, -1)">↑</button>
              <button type="button" class="rounded px-1.5 hover:bg-[#eee8dc] disabled:opacity-30" :disabled="i === paragraphs.length - 1" :aria-label="`เลื่อนย่อหน้าที่ ${i + 1} ลง`" @click="move(i, 1)">↓</button>
              <button type="button" class="rounded px-1.5 text-danger hover:bg-[#fbeee9]" :disabled="paragraphs.length < 2" :aria-label="`ลบย่อหน้าที่ ${i + 1}`" @click="paragraphs.splice(i, 1)">✕</button>
            </div>
            <RichText v-model="p.html" :placeholder="i === 0 ? 'แนะนำตัวสั้น ๆ — เป็นใคร ทำไมถึงเขียนบันทึกนี้…' : 'เขียนต่อ…'" />
            <!-- how this paragraph sits on the page -->
            <div class="flex flex-wrap items-center gap-1.5 text-xs" role="group" :aria-label="`รูปแบบย่อหน้าที่ ${i + 1}`">
              <span class="text-muted">ตำแหน่ง</span>
              <button v-for="[v, l] in ALIGNS" :key="l" type="button" class="chip border border-rule" :class="p.align === v ? 'bg-ink text-white' : 'bg-white'" :aria-pressed="p.align === v" @click="p.align = v">{{ l }}</button>
              <span class="ml-2 text-muted">ขนาด</span>
              <button v-for="[v, l] in SIZES" :key="l" type="button" class="chip border border-rule" :class="p.size === v ? 'bg-ink text-white' : 'bg-white'" :aria-pressed="p.size === v" @click="p.size = v">{{ l }}</button>
              <span class="ml-2 text-muted">ตัวอักษร</span>
              <button v-for="[v, l] in FONTS" :key="l" type="button" class="chip border border-rule" :class="p.font === v ? 'bg-ink text-white' : 'bg-white'" :aria-pressed="p.font === v" @click="p.font = v">{{ l }}</button>
            </div>
          </div>
          <button type="button" class="btn btn-ghost w-fit" @click="paragraphs.push(blank())">+ เพิ่มย่อหน้า</button>
        </section>

        <section class="card grid gap-3 p-4" aria-labelledby="ab-links">
          <h2 id="ab-links" class="font-display text-lg">ลิงก์</h2>
          <p class="text-xs text-muted">เลือกช่องทาง แล้วพิมพ์แค่ชื่อผู้ใช้ — ระบบสร้างลิงก์ให้ (วางลิงก์เต็มก็ได้)</p>
          <div v-for="(r, i) in rows" :key="r.key" class="grid gap-1.5 rounded-lg border border-rule p-2.5" :data-link="r.platform">
            <div class="flex flex-wrap items-center gap-2">
              <SocialIcon :platform="r.platform" class="h-7 w-7 shrink-0" />
              <select v-model="r.platform" class="input w-auto min-w-[8.5rem]" :aria-label="`ช่องทางของลิงก์ที่ ${i + 1}`">
                <option v-for="p in PLATFORMS" :key="p.id" :value="p.id">{{ p.label }}</option>
              </select>
              <div class="flex min-w-[12rem] flex-1 items-center overflow-hidden rounded-lg border bg-white focus-within:border-ink" :class="r.value.trim() && !urlOf(r) ? 'border-danger' : 'border-rule'">
                <span class="whitespace-nowrap border-r border-rule bg-[#f6f2ea] px-2 py-2 text-xs text-muted">{{ plat(r).prefix }}</span>
                <input :ref="el => { if (el) inputs[i] = el as HTMLInputElement }" v-model="r.value" class="min-w-0 flex-1 px-2 py-2 outline-none" :placeholder="plat(r).placeholder" :aria-label="`${plat(r).label} ของลิงก์ที่ ${i + 1}`" :aria-invalid="!!r.value.trim() && !urlOf(r)">
              </div>
              <button type="button" class="btn btn-ghost min-h-[40px] px-3" :aria-label="`ลบลิงก์ ${plat(r).label}`" @click="rows.splice(i, 1)">✕</button>
            </div>
            <label v-if="r.platform === 'website' || r.platform === 'other'" class="field"><span class="text-xs">ข้อความบนปุ่ม (ว่าง = “{{ plat(r).label }}”)</span><input v-model="r.label" class="input" maxlength="40" placeholder="เช่น บล็อกของฉัน"></label>
            <p v-if="r.value.trim() && !urlOf(r)" class="text-xs text-danger" role="alert">
              {{ r.platform === "email" ? "อีเมลไม่ถูกต้อง" : r.platform === "other" ? "ต้องขึ้นต้นด้วย https://, mailto: หรือ tel:" : `ลิงก์นี้ไม่ใช่ของ ${plat(r).label} — พิมพ์แค่ชื่อผู้ใช้ หรือวางลิงก์ของ ${plat(r).label}` }} · ยังไม่แสดงบนหน้าเว็บ
            </p>
            <p v-else-if="urlOf(r)" class="truncate text-xs text-muted">→ <a :href="urlOf(r)" target="_blank" rel="noopener" class="underline">{{ urlOf(r) }}</a></p>
          </div>
          <div class="grid gap-1.5">
            <span class="text-xs text-muted">+ เพิ่มช่องทาง</span>
            <div class="flex flex-wrap gap-1.5" role="group" aria-label="เพิ่มลิงก์">
              <button v-for="p in PLATFORMS" :key="p.id" type="button" class="chip inline-flex items-center gap-1.5 border border-rule bg-white hover:border-ink" @click="addLink(p.id)">
                <SocialIcon :platform="p.id" class="h-4 w-4" />{{ p.label }}
              </button>
            </div>
          </div>
        </section>
      </div>

      <section class="flex h-[calc(100dvh-9rem)] min-h-[480px] flex-col overflow-hidden rounded-xl border border-[#ece6da] bg-white xl:sticky xl:top-20" aria-label="ตัวอย่างหน้าเกี่ยวกับผู้เขียน">
        <div class="border-b border-[#ece6da] px-3 py-2 text-sm"><span class="font-medium">ตัวอย่างสด</span> <span class="text-xs text-muted">หน้าเกี่ยวกับผู้เขียนจะเป็นแบบนี้</span></div>
        <iframe ref="frame" :src="src" title="ตัวอย่างหน้าเกี่ยวกับผู้เขียน" class="min-h-0 flex-1 border-0" />
      </section>
    </div>
    <MediaPicker ref="picker" layout="portrait" @pick="picked" />
  </main>
</template>
