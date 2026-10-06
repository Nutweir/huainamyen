import { computed, type Ref } from "vue";
import type { MediaAsset, TripBundle } from "@/types/content";
import { useBackend } from "@/services";
import { VARIANT_EDGES } from "@/utils/media";

/** URLs, srcset and lookup for the media of one trip. */
export function useMedia(bundle: Ref<TripBundle | null>) {
  const { repo } = useBackend();
  const byId = computed(() => new Map((bundle.value?.media || []).map(m => [m.id, m])));
  const url = (a: MediaAsset, edge?: number) => repo.mediaUrl(a, edge);
  function srcset(a: MediaAsset): string {
    if (!a.width) return "";
    const long = Math.max(a.width, a.height);
    const parts = VARIANT_EDGES.filter(e => a.variants[String(e)] && long > e * 1.15).map(e => `${url(a, e)} ${Math.round((a.width * e) / long)}w`);
    return parts.length ? `${parts.join(", ")}, ${url(a)} ${a.width}w` : "";
  }
  return { byId, url, srcset };
}

/** Stable small number from an id, used to alternate print tilts without a page-wide counter. */
export function seedOf(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h);
}
