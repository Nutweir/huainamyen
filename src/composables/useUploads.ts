import { ref } from "vue";
import type { MediaAsset } from "@/types/content";
import { useBackend } from "@/services";
import { decodeImage, encode, prepareImage, prepareVideo, validateUpload, type Edit, type Sniffed } from "@/services/files";

export interface QueueItem {
  key: string;
  file: File;
  type: Sniffed | null;
  preview: string;
  edit: Edit;
  state: "ready" | "working" | "done" | "error";
  error: string;
  asset: MediaAsset | null;
  /** size of the photo as chosen (before crop), for the recommended-size check */
  size: { w: number; h: number } | null;
}

/**
 * Upload queue: real file-type check (magic bytes) and size limits first, then web copies are made in
 * the browser (WebP, crop/rotate applied) and sent together with the untouched original.
 */
export function useUploads(meta: () => Partial<MediaAsset>) {
  const { repo } = useBackend();
  const queue = ref<QueueItem[]>([]);
  const busy = ref(false);

  async function add(files: FileList | File[]) {
    for (const file of Array.from(files)) {
      const item: QueueItem = { key: `${file.name}-${file.size}-${Math.random()}`, file, type: null, preview: "", edit: {}, state: "ready", error: "", asset: null, size: null };
      queue.value.push(item);
      const it = queue.value[queue.value.length - 1];
      const check = await validateUpload(file);
      if ("error" in check) { it.state = "error"; it.error = check.error; continue; }
      it.type = check.type;
      // HEIC can only be shown by Safari; it is converted on upload
      if (check.type.kind === "image" && check.type.mime !== "image/heic") {
        it.preview = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => { it.size = { w: img.naturalWidth, h: img.naturalHeight }; };
        img.src = it.preview;
      } else if (check.type.kind === "raw") {
        // DNG: show (and crop on) the camera's embedded preview, same framing as the final photo
        try {
          const bmp = await decodeImage(file, check.type);
          it.size = { w: bmp.width, h: bmp.height };
          it.preview = URL.createObjectURL((await encode(bmp, 1600)).blob);
          bmp.close();
        } catch (e) { it.state = "error"; it.error = (e as Error).message; }
      }
    }
  }

  async function run(it: QueueItem): Promise<MediaAsset | null> {
    if (it.state === "done" || !it.type) return it.asset;
    it.state = "working"; it.error = "";
    try {
      const m = { ...meta() };
      if (it.type.kind === "video") it.asset = await repo.uploadVideo(await prepareVideo(it.file), m);
      else {
        const prepared = await prepareImage(it.file, it.edit);
        it.asset = await repo.uploadImage(prepared, m);
      }
      it.state = "done";
      return it.asset;
    } catch (e) { it.state = "error"; it.error = (e as Error).message; return null; }
  }

  /** Upload everything waiting; returns what was uploaded in this run. */
  async function uploadAll(): Promise<MediaAsset[]> {
    busy.value = true;
    const out: MediaAsset[] = [];
    try { for (const it of queue.value) if (it.state === "ready") { const a = await run(it); if (a) out.push(a); } }
    finally { busy.value = false; }
    return out;
  }

  function remove(it: QueueItem) {
    if (it.preview) URL.revokeObjectURL(it.preview);
    queue.value = queue.value.filter(x => x !== it);
  }
  function clearDone() { queue.value.filter(i => i.state === "done").forEach(remove); }

  return { queue, busy, add, uploadAll, remove, clearDone, run };
}
