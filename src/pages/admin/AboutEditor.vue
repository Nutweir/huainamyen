<script setup lang="ts">
/*
 * เกี่ยวกับผู้เขียน: name, photo, a few paragraphs and links, with the real About page beside it.
 * Unlike trips there is no draft: saving puts it on the site straight away (the button says so).
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { onBeforeRouteLeave, useRouter } from "vue-router";
import type { MediaAsset, SiteSettings } from "@/types/content";
import { useBackend } from "@/services";
import { useToast } from "@/composables/useToast";
import { clone } from "@/utils/format";
import { safeHref, sanitizeInline } from "@/utils/sanitize";
import RichText from "@/components/editor/RichText.vue";
import MediaPicker from "@/components/admin/MediaPicker.vue";

const { repo } = useBackend();
const router = useRouter();
const { toast } = useToast();
const site = ref<SiteSettings | null>(null);
const saved = ref("");
const paragraphs = ref<{ key: number; html: string }[]>([]);
const saving = ref(false);
const picker = ref<InstanceType<typeof MediaPicker> | null>(null);
let keys = 0;

/** "<p>a</p><p>b</p>" ⇄ ["a", "b"] (older single-block text becomes one paragraph). */
const toParagraphs = (html: string) => (html.match(/<p>([\s\S]*?)<\/p>/g)?.map(p => p.slice(3, -4)) || (html.trim() ? [html] : [""])).map(h => ({ key: keys++, html: h }));
const toHtml = () => paragraphs.value.map(p => sanitizeInline(p.html).trim()).filter(Boolean).map(h => `<p>${h}</p>`).join("");
const draft = computed<SiteSettings | null>(() => (site.value ? { ...site.value, aboutHtml: toHtml(), links: (site.value.links || []).filter(l => l.label.trim() || l.url.trim()) } : null));
const dirty = computed(() => !!draft.value && JSON.stringify(draft.value) !== saved.value);

onMounted(async () => {
  try {
    const s = await repo.getSite();
    site.value = { ...clone(s), links: s.links?.length ? clone(s.links) : [], photo: s.photo || null };
    paragraphs.value = toParagraphs(s.aboutHtml || "");
    saved.value = JSON.stringify(draft.value);
  } catch (e) { toast((e as Error).message, true); }
});

async function save() {
  if (!draft.value) return;
  const bad = (draft.value.links || []).find(l => l.url && !safeHref(l.url));
  if (bad) { toast(`ลิงก์ “${bad.label || bad.url}” ต้องขึ้นต้นด้วย https://, mailto: หรือ tel:`, true); return; }
  saving.value = true;
  try { await repo.saveSite(clone(draft.value)); saved.value = JSON.stringify(draft.value); toast("บันทึกแล้ว — หน้าเกี่ยวกับผู้เขียนเปลี่ยนแล้ว"); }
  catch (e) { toast((e as Error).message, true); }
  finally { saving.value = false; }
}
function picked(assets: MediaAsset[]) {
  const a = assets.find(x => x.kind === "image");
  if (a && site.value) site.value.photo = { ...a, originalPath: null };
}
const move = (i: number, d: number) => { const p = paragraphs.value, j = i + d; if (j >= 0 && j < p.length) [p[i], p[j]] = [p[j], p[i]]; };

// live preview: the real About page in a frame, fed the draft
const frame = ref<HTMLIFrameElement | null>(null);
const ready = ref(false);
const src = router.resolve("/about?embed").href;
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
          <div class="flex items-center gap-3">
            <img v-if="site.photo" :src="repo.mediaUrl(site.photo, 500)" :alt="site.photo.alt" class="h-24 w-20 rounded object-cover" :style="site.photo.focus ? { objectPosition: site.photo.focus } : undefined">
            <div v-else class="grid h-24 w-20 place-items-center rounded bg-[#efe9dd] text-center text-xs text-muted">ไม่มีรูป</div>
            <div class="flex flex-wrap gap-2">
              <button type="button" class="btn btn-ghost" @click="picker?.open()">{{ site.photo ? "เปลี่ยนรูป" : "เลือกรูป" }}</button>
              <button v-if="site.photo" type="button" class="btn btn-ghost" @click="site.photo = null">เอารูปออก</button>
            </div>
          </div>
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
          </div>
          <button type="button" class="btn btn-ghost w-fit" @click="paragraphs.push({ key: keys++, html: '' })">+ เพิ่มย่อหน้า</button>
        </section>

        <section class="card grid gap-3 p-4" aria-labelledby="ab-links">
          <h2 id="ab-links" class="font-display text-lg">ลิงก์</h2>
          <div v-for="(l, i) in site.links" :key="i" class="grid grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)_auto] items-end gap-2">
            <label class="field"><span>ชื่อ</span><input v-model="l.label" class="input" placeholder="Instagram"></label>
            <label class="field"><span>ลิงก์</span><input v-model="l.url" class="input" placeholder="https://… หรือ mailto:…" :aria-invalid="!!l.url && !safeHref(l.url)"></label>
            <button type="button" class="btn btn-ghost min-h-[42px] px-3" :aria-label="`ลบลิงก์ ${l.label}`" @click="site.links!.splice(i, 1)">✕</button>
          </div>
          <button type="button" class="btn btn-ghost w-fit" @click="site.links!.push({ label: '', url: '' })">+ เพิ่มลิงก์</button>
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
