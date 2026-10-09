import createDOMPurify, { type WindowLike } from "dompurify";

/*
 * Rich text in this app is a deliberately tiny HTML subset. Everything that reaches v-html,
 * and everything saved by the editor, goes through these functions — on save AND on render,
 * so a bad row in the database still can't inject script.
 */

/** Story text: emphasis, line breaks and links only. */
const INLINE = { ALLOWED_TAGS: ["b", "strong", "i", "em", "br", "a"], ALLOWED_ATTR: ["href"] };

/** Travel notes: also short lists, sub-headings and the "tip" aside. */
const NOTES = {
  ALLOWED_TAGS: ["b", "strong", "i", "em", "br", "a", "p", "ul", "ol", "li", "h4", "aside", "span"],
  ALLOWED_ATTR: ["href", "class", "target", "rel"],
};

const SAFE_URL = /^(https?:|mailto:|tel:|#|\/)/i;

/** Classes that survive sanitizing: travel-note styles, and paragraph alignment / size / font (About page). */
export const PARAGRAPH_STYLES = { align: ["al-center", "al-right"], size: ["sz-s", "sz-l", "sz-xl"], font: ["f-hand"] } as const;
const KNOWN_CLASSES: string[] = ["tip", "tip-label", "note-link", ...PARAGRAPH_STYLES.align, ...PARAGRAPH_STYLES.size, ...PARAGRAPH_STYLES.font];

type Purifier = ReturnType<typeof createDOMPurify>;
let purifier: Purifier | null = null;

function get(): Purifier {
  if (!purifier) {
    if (typeof window === "undefined") throw new Error("sanitize: call useWindow(jsdomWindow) first outside the browser");
    useWindow(window);
  }
  return purifier as Purifier;
}

/** Node scripts pass a jsdom window; the browser uses its own. */
export function useWindow(win: WindowLike): void {
  purifier = createDOMPurify(win);
  purifier.addHook("afterSanitizeAttributes", node => {
    if (node.tagName === "A") {
      const href = node.getAttribute("href") || "";
      if (!SAFE_URL.test(href.trim())) node.removeAttribute("href");
      if (/^https?:/i.test(href)) { node.setAttribute("target", "_blank"); node.setAttribute("rel", "noopener noreferrer"); }
    }
    if (node.hasAttribute("class")) {
      // only the classes the notes stylesheet knows about
      const keep = (node.getAttribute("class") || "").split(/\s+/).filter(c => KNOWN_CLASSES.includes(c));
      if (keep.length) node.setAttribute("class", keep.join(" ")); else node.removeAttribute("class");
    }
  });
}

export const sanitizeInline = (html: string): string => String(get().sanitize(html ?? "", INLINE));
export const sanitizeNotes = (html: string): string => String(get().sanitize(html ?? "", NOTES));

/** Plain text (for alt, titles, meta tags). */
export function toText(html: string): string {
  return sanitizeInline(html).replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').trim();
}

/** Escape text for an HTML attribute or text node built as a string (prerender). */
export const escapeHtml = (s: string): string =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Keep "ๆ" on the same line as the word it repeats (Thai typesetting). */
export const thaiNbsp = (html: string): string => html.replace(/ ๆ/g, " ๆ");

/** Links people can follow: web, phone and e-mail only (no javascript:, data:, …). */
export const safeHref = (href: string): string => (/^(https?:\/\/|tel:|mailto:)/i.test((href || "").trim()) ? href.trim() : "");
/** Map frames may only show Google Maps embeds. */
export const safeMapEmbed = (src: string): string => (/^https:\/\/(www\.)?google\.com\/maps\/embed\?/i.test((src || "").trim()) ? src.trim() : "");
