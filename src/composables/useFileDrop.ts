import { onBeforeUnmount, onMounted, ref } from "vue";
import type { MediaAsset } from "@/types/content";
import { useBackend } from "@/services";
import { prepareImage, prepareVideo, validateUpload } from "@/services/files";

/*
 * Photos straight from the computer into the story: drag files from Explorer/Finder onto the block
 * list (a line shows where they go), or paste an image (Ctrl+V). Files go through the same checks and
 * processing as the media library (real type check, WebP copies, original kept).
 */
export interface FileDropState { line: number | null; index: number; overList: boolean }

const hasFiles = (e: DragEvent) => [...(e.dataTransfer?.types || [])].includes("Files");
const isEditable = (el: Element | null) => !!el?.closest("input, textarea, select, [contenteditable=true], .ProseMirror");

export function useFileDrop(opts: {
  list: () => HTMLElement | null;
  enabled: () => boolean;
  /** index in the day's blocks where the files go, or null = after the selected block */
  onFiles: (files: File[], index: number | null) => void;
}) {
  const over = ref<FileDropState | null>(null);
  let depth = 0;

  function position(e: DragEvent): FileDropState {
    const list = opts.list();
    if (!list) return { line: null, index: 0, overList: false };
    const box = list.getBoundingClientRect();
    const overList = e.clientY >= box.top - 30 && e.clientY <= box.bottom + 60 && e.clientX >= box.left - 20 && e.clientX <= box.right + 20;
    const rows = [...list.querySelectorAll<HTMLElement>("[data-row]")].map(r => r.getBoundingClientRect());
    let index = rows.findIndex(r => e.clientY < (r.top + r.bottom) / 2);
    if (index < 0) index = rows.length;
    const line = rows.length ? (index < rows.length ? rows[index].top - 4 : rows[rows.length - 1].bottom + 2) - box.top : 0;
    return { line: overList ? line : null, index, overList };
  }

  function enter(e: DragEvent) { if (!hasFiles(e) || !opts.enabled()) return; depth++; e.preventDefault(); over.value = position(e); }
  function dragover(e: DragEvent) {
    if (!hasFiles(e) || !opts.enabled()) return;
    e.preventDefault(); // otherwise the browser opens the file
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    over.value = position(e);
  }
  function leave(e: DragEvent) { if (!hasFiles(e)) return; depth = Math.max(0, depth - 1); if (!depth) over.value = null; }
  function drop(e: DragEvent) {
    if (!hasFiles(e) || !opts.enabled()) return;
    e.preventDefault();
    const at = position(e);
    depth = 0; over.value = null;
    const files = [...(e.dataTransfer?.files || [])];
    if (files.length) opts.onFiles(files, at.overList ? at.index : null);
  }
  function paste(e: ClipboardEvent) {
    if (!opts.enabled()) return;
    const files = [...(e.clipboardData?.files || [])].filter(f => /^(image|video)\//.test(f.type));
    if (!files.length) return;
    // a pasted picture would be lost in a text field anyway; put it in the story after the selected block
    if (isEditable(document.activeElement) && !(document.activeElement as HTMLElement).closest(".ProseMirror")) return;
    e.preventDefault();
    opts.onFiles(files, null);
  }

  onMounted(() => {
    addEventListener("dragenter", enter);
    addEventListener("dragover", dragover);
    addEventListener("dragleave", leave);
    addEventListener("drop", drop);
    addEventListener("paste", paste, true);
  });
  onBeforeUnmount(() => {
    removeEventListener("dragenter", enter);
    removeEventListener("dragover", dragover);
    removeEventListener("dragleave", leave);
    removeEventListener("drop", drop);
    removeEventListener("paste", paste, true);
  });
  return { over };
}

/** Check, process and upload files one by one; reports progress, returns what made it. */
export async function uploadFiles(files: File[], meta: Partial<MediaAsset>, progress: (done: number, total: number, error?: string) => void): Promise<MediaAsset[]> {
  const { repo } = useBackend();
  const out: MediaAsset[] = [];
  let n = 0;
  for (const file of files) {
    try {
      const check = await validateUpload(file);
      if ("error" in check) throw new Error(check.error);
      if (check.type.kind === "video") out.push(await repo.uploadVideo(await prepareVideo(file), meta));
      else out.push(await repo.uploadImage(await prepareImage(file), meta));
      progress(++n, files.length);
    } catch (e) { progress(++n, files.length, (e as Error).message); }
  }
  return out;
}
