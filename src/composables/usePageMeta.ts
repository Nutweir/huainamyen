import { watchEffect, type Ref } from "vue";

/*
 * Title, description and canonical for the current page. Social cards (og:*) are written into static
 * HTML at build time by scripts/prerender.ts — crawlers don't run JavaScript, so this is for tabs,
 * history and in-app sharing only.
 */
export function usePageMeta(meta: Ref<{ title: string; description?: string; canonical?: string } | null>) {
  watchEffect(() => {
    const m = meta.value;
    if (!m) return;
    document.title = m.title;
    const set = (selector: string, attr: string, value: string | undefined, create: () => HTMLElement) => {
      if (!value) return;
      let el = document.head.querySelector<HTMLElement>(selector);
      if (!el) { el = create(); document.head.appendChild(el); }
      el.setAttribute(attr, value);
    };
    set('meta[name="description"]', "content", m.description, () => Object.assign(document.createElement("meta"), { name: "description" }));
    set('link[rel="canonical"]', "href", m.canonical, () => Object.assign(document.createElement("link"), { rel: "canonical" }));
  });
}

export const siteUrl = (path = ""): string => `${(import.meta.env.VITE_SITE_URL || "").replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
