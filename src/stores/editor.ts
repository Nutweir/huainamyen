import { defineStore } from "pinia";
import { computed, ref, shallowRef, watch } from "vue";
import type { Block, BlockType, ContentVersion, MediaAsset, TripBundle } from "@/types/content";
import { useBackend } from "@/services";
import { ConflictError, AuthError } from "@/services/repository";
import { keepDraft, readDraft, dropDraft } from "@/services/draftBackup";
import { newBlock, newDay } from "@/services/factory";
import { clone, uid } from "@/utils/format";

export type SaveState = "idle" | "unsaved" | "saving" | "saved" | "offline" | "conflict" | "error";
const AUTOSAVE_MS = 1500;

/**
 * The trip being edited. Edits mutate `bundle` directly; a deep watch marks it unsaved, copies it to
 * the local draft store at once, and saves to the server after a short pause (debounce).
 */
export const useEditorStore = defineStore("editor", () => {
  const { repo } = useBackend();
  const bundle = ref<TripBundle | null>(null);
  const savedAt = ref<string | null>(null);
  const state = ref<SaveState>("idle");
  const message = ref("");
  const lastSaved = ref<Date | null>(null);
  const recoverable = shallowRef<{ bundle: TripBundle; at: string } | null>(null);
  const selected = ref<{ day: number; blockId: string | null }>({ day: 0, blockId: null });
  const versions = ref<Omit<ContentVersion, "snapshot">[]>([]);
  /** What readers see now, to compare the working copy against. */
  const published = shallowRef<TripBundle | null>(null);
  async function loadPublished() {
    const id = bundle.value?.trip.publishedVersionId;
    published.value = id ? (await repo.getVersion(id).catch(() => null))?.snapshot || null : null;
  }

  let timer = 0, retry = 0, version = 0, savingVersion = 0, quiet = false, saving: Promise<void> | null = null;

  // ── undo / redo: whole-content snapshots; a burst of typing is one step, structure changes are steps at once ──
  const HISTORY = 60, GROUP_MS = 700;
  const undoStack = ref<string[]>([]), redoStack = ref<string[]>([]);
  let committed = "", historyTimer = 0, applyingHistory = false;
  const pendingEdit = ref(false);
  const snap = () => (bundle.value ? JSON.stringify({ ...bundle.value, media: [] }) : "");
  let batching = false;
  /** Several changes as one undo step (e.g. placing a batch of photos). */
  function batch(fn: () => void) {
    commit();
    batching = true;
    try { fn(); } finally { batching = false; queueMicrotask(commit); }
  }
  function commit() {
    if (batching) return;
    clearTimeout(historyTimer);
    pendingEdit.value = false;
    const now = snap();
    if (!now || now === committed) return;
    if (committed) { undoStack.value.push(committed); if (undoStack.value.length > HISTORY) undoStack.value.shift(); }
    committed = now;
    redoStack.value = [];
  }
  function resetHistory() { clearTimeout(historyTimer); pendingEdit.value = false; undoStack.value = []; redoStack.value = []; committed = snap(); }
  function applyHistory(json: string) {
    const prev = JSON.parse(json) as TripBundle;
    applyingHistory = true;
    bundle.value = { ...prev, media: bundle.value!.media };
    committed = json;
    // the restored state still has to be saved, so the autosave watcher runs; only history skips it
    queueMicrotask(() => { applyingHistory = false; });
    const d = Math.min(selected.value.day, prev.days.length - 1);
    const keep = prev.days[d]?.blocks.some(x => x.id === selected.value.blockId);
    selected.value = { day: Math.max(0, d), blockId: keep ? selected.value.blockId : null };
  }
  function undo() {
    commit();
    const prev = undoStack.value.pop();
    if (!prev) return false;
    redoStack.value.push(committed);
    applyHistory(prev);
    return true;
  }
  function redo() {
    commit();
    const next = redoStack.value.pop();
    if (!next) return false;
    undoStack.value.push(committed);
    applyHistory(next);
    return true;
  }
  const canUndo = computed(() => undoStack.value.length > 0 || pendingEdit.value);
  const canRedo = computed(() => redoStack.value.length > 0);

  const dirty = computed(() => ["unsaved", "saving", "offline", "error", "conflict"].includes(state.value));
  // compare content only (timestamps and publish state change on every save)
  const contentOf = (b: TripBundle) => JSON.stringify({ ...b, media: [], trip: { ...b.trip, updatedAt: "", status: "", publishedVersionId: null, publishedAt: null } });

  function replace(b: TripBundle) {
    quiet = true;
    bundle.value = b;
    queueMicrotask(() => { quiet = false; });
  }

  async function load(id: string) {
    clearTimeout(timer);
    state.value = "idle"; message.value = ""; recoverable.value = null;
    const r = await repo.loadTrip(id);
    replace(r.bundle);
    savedAt.value = r.savedAt;
    selected.value = { day: 0, blockId: null };
    resetHistory();
    // unsaved writing left in this browser (closed tab, lost connection) → offer to bring it back
    const draft = await readDraft(id);
    if (draft && contentOf(draft.bundle) !== contentOf(r.bundle)) recoverable.value = { bundle: draft.bundle, at: draft.at };
    else if (draft) await dropDraft(id);
    void refreshVersions();
    void loadPublished();
  }

  watch(bundle, () => {
    if (quiet || !bundle.value) return;
    if (!applyingHistory) { pendingEdit.value = true; clearTimeout(historyTimer); historyTimer = window.setTimeout(commit, GROUP_MS); }
    version++;
    state.value = "unsaved";
    void keepDraft(bundle.value, savedAt.value);
    clearTimeout(timer);
    timer = window.setTimeout(() => { void save(); }, AUTOSAVE_MS);
  }, { deep: true });

  async function save(force = false): Promise<void> {
    if (!bundle.value) return;
    if (saving) { await saving; if (version === savingVersion) return; }
    if (state.value === "conflict" && !force) return;
    clearTimeout(timer);
    const v = version;
    state.value = "saving";
    saving = (async () => {
      try {
        const at = await repo.saveTrip(bundle.value!, force ? null : savedAt.value);
        savedAt.value = at;
        savingVersion = v;
        lastSaved.value = new Date();
        retry = 0;
        if (version === v) { state.value = "saved"; await dropDraft(bundle.value!.trip.id); }
        else { state.value = "unsaved"; timer = window.setTimeout(() => { void save(); }, AUTOSAVE_MS); }
      } catch (e) {
        if (e instanceof ConflictError) { state.value = "conflict"; message.value = "มีการแก้ทริปนี้จากที่อื่นระหว่างนี้ — งานของคุณยังเก็บไว้ในเครื่อง"; }
        else if (e instanceof AuthError) { state.value = "error"; message.value = e.message; }
        else {
          state.value = navigator.onLine ? "error" : "offline";
          message.value = navigator.onLine ? (e as Error).message : "ออฟไลน์อยู่ — เก็บไว้ในเครื่องแล้ว จะบันทึกให้เมื่อกลับมาออนไลน์";
          retry = Math.min(retry + 1, 6);
          timer = window.setTimeout(() => { void save(); }, 2000 * 2 ** retry);
        }
      } finally { saving = null; }
    })();
    return saving;
  }
  if (typeof window !== "undefined") {
    addEventListener("online", () => { if (state.value === "offline" || state.value === "error") void save(); });
    addEventListener("beforeunload", e => { if (dirty.value) { e.preventDefault(); e.returnValue = ""; } });
  }

  /** Keep my version anyway (after a conflict). */
  const overwrite = () => save(true);
  /** Throw my local changes away and take the server copy. */
  async function discardLocal() { if (bundle.value) { await dropDraft(bundle.value.trip.id); await load(bundle.value.trip.id); } }
  function restoreDraft() { if (recoverable.value && bundle.value) { bundle.value = { ...recoverable.value.bundle, media: bundle.value.media }; recoverable.value = null; } }
  async function ignoreDraft() { if (bundle.value) { await dropDraft(bundle.value.trip.id); recoverable.value = null; } }

  // ── structure ──
  const day = (i: number) => bundle.value!.days[i];
  function addBlock<K extends BlockType>(dayIndex: number, type: K, at?: number, data?: Partial<Block<K>["data"]>): Block<K> {
    commit(); queueMicrotask(commit);
    const b = newBlock(type, data as never) as Block<K>;
    const list = day(dayIndex).blocks;
    list.splice(at ?? list.length, 0, b as Block);
    selected.value = { day: dayIndex, blockId: b.id };
    return b;
  }
  function removeBlock(dayIndex: number, id: string) {
    commit(); queueMicrotask(commit);
    const list = day(dayIndex).blocks, i = list.findIndex(b => b.id === id);
    if (i >= 0) list.splice(i, 1);
    if (selected.value.blockId === id) selected.value = { day: dayIndex, blockId: null };
  }
  function duplicateBlock(dayIndex: number, id: string) {
    commit(); queueMicrotask(commit);
    const list = day(dayIndex).blocks, i = list.findIndex(b => b.id === id);
    if (i < 0) return;
    const copy = { ...clone(list[i]), id: uid() } as Block;
    if (copy.type === "event") copy.data.anchor = `${copy.data.anchor}-copy`;
    list.splice(i + 1, 0, copy);
    selected.value = { day: dayIndex, blockId: copy.id };
  }
  function moveBlock(dayIndex: number, from: number, to: number, toDay = dayIndex) {
    commit(); queueMicrotask(commit);
    const src = day(dayIndex).blocks;
    const [b] = src.splice(from, 1);
    if (!b) return;
    day(toDay).blocks.splice(Math.max(0, Math.min(to, day(toDay).blocks.length)), 0, b);
    selected.value = { day: toDay, blockId: b.id };
  }
  function addDay() {
    commit(); queueMicrotask(commit);
    const days = bundle.value!.days;
    const last = days.at(-1);
    let date: string | null = null;
    if (last?.date) { const d = new Date(`${last.date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); date = d.toISOString().slice(0, 10); }
    days.push(newDay((last?.dayNumber || 0) + 1, date));
    selected.value = { day: days.length - 1, blockId: null };
  }
  function removeDay(i: number) {
    commit(); queueMicrotask(commit);
    bundle.value!.days.splice(i, 1);
    bundle.value!.days.forEach((d, n) => { d.dayNumber = n + 1; });
    selected.value = { day: Math.max(0, i - 1), blockId: null };
  }
  function moveDay(from: number, to: number) {
    commit(); queueMicrotask(commit);
    const days = bundle.value!.days;
    const [d] = days.splice(from, 1);
    days.splice(to, 0, d);
    days.forEach((x, n) => { x.dayNumber = n + 1; });
  }
  /** Days in calendar order, renumbered; days without a date keep their place after the dated ones before them. */
  function sortDaysByDate() {
    commit(); queueMicrotask(commit);
    const days = bundle.value!.days;
    const keep = days[selected.value.day]?.id;
    const sorted = [...days].map((d, i) => ({ d, i })).sort((a, b) => (a.d.date && b.d.date ? a.d.date.localeCompare(b.d.date) : 0) || a.i - b.i).map(x => x.d);
    days.splice(0, days.length, ...sorted);
    days.forEach((x, n) => { x.dayNumber = n + 1; });
    selected.value = { day: Math.max(0, days.findIndex(d => d.id === keep)), blockId: selected.value.blockId };
  }
  function useMedia(asset: MediaAsset) {
    if (!bundle.value) return;
    const i = bundle.value.media.findIndex(m => m.id === asset.id);
    if (i >= 0) bundle.value.media.splice(i, 1, asset); else bundle.value.media.push(asset);
  }

  // ── publishing and versions ──
  async function publish(label = "") {
    await save();
    if (state.value === "conflict" || state.value === "error" || state.value === "offline") throw new Error("บันทึกให้เรียบร้อยก่อนเผยแพร่");
    await repo.publishTrip(bundle.value!, label || `Published ${new Date().toLocaleString("th-TH")}`);
    await reloadMeta();
  }
  async function setStatus(status: "draft" | "published" | "archived") {
    await repo.setStatus(bundle.value!.trip.id, status);
    await reloadMeta();
  }
  async function reloadMeta() {
    const r = await repo.loadTrip(bundle.value!.trip.id);
    quiet = true;
    bundle.value!.trip.status = r.bundle.trip.status;
    bundle.value!.trip.publishedVersionId = r.bundle.trip.publishedVersionId;
    bundle.value!.trip.publishedAt = r.bundle.trip.publishedAt;
    queueMicrotask(() => { quiet = false; });
    savedAt.value = r.savedAt;
    await refreshVersions();
    await loadPublished();
  }
  async function refreshVersions() { if (bundle.value) versions.value = await repo.listVersions(bundle.value.trip.id); }
  async function saveVersion(label: string) { await save(); await repo.saveVersion(bundle.value!, label || "บันทึกเวอร์ชัน"); await refreshVersions(); }
  async function restoreVersion(id: string) {
    commit();
    const v = await repo.getVersion(id);
    await repo.saveVersion(bundle.value!, "ก่อนย้อนกลับ (สำรองอัตโนมัติ)");
    const keep = bundle.value!.trip;
    const media = [...bundle.value!.media];
    v.snapshot.media.forEach(m => { if (!media.some(x => x.id === m.id)) media.push(m); });
    bundle.value = { ...clone(v.snapshot), trip: { ...v.snapshot.trip, id: keep.id, status: keep.status, publishedVersionId: keep.publishedVersionId, publishedAt: keep.publishedAt }, media };
    await save();
    await refreshVersions();
  }

  return {
    bundle, savedAt, state, message, lastSaved, recoverable, selected, versions, dirty,
    undo, redo, canUndo, canRedo, published, batch,
    load, save, overwrite, discardLocal, restoreDraft, ignoreDraft,
    addBlock, removeBlock, duplicateBlock, moveBlock, addDay, removeDay, moveDay, sortDaysByDate, useMedia,
    publish, setStatus, saveVersion, restoreVersion, refreshVersions,
  };
});
