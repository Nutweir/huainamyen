import type { Block, Mood, TripDay } from "@/types/content";
import { IMAGE_PRESETS } from "./media";

/** One timestamped moment: its event header, its story blocks and the small prints pasted beside it. */
export interface StorySection {
  event: Block<"event"> | null;
  mood: Mood;
  units: RenderUnit[];
  decorations: Block<"decoration">[];
}
export type RenderUnit =
  | { kind: "block"; block: Block }
  | { kind: "beside"; side: "left" | "right"; figure: Block<"image"> | Block<"placeholder">; text: Block[] };

const TEXT_TYPES = new Set(["paragraph", "note", "verse", "dialogue", "quote"]);
const isText = (b: Block) => TEXT_TYPES.has(b.type) || (b.type === "thought" && !b.data.size);

/** Small photos placed left/right sit beside the text that follows them (like the static site). */
function besideOf(b: Block): "left" | "right" | null {
  if (b.type !== "image" && b.type !== "placeholder") return null;
  const pos = b.data.position;
  if (pos !== "left" && pos !== "right") return null;
  const layout = b.data.layout;
  return layout && IMAGE_PRESETS[layout]?.beside ? pos : null;
}

function toUnits(blocks: Block[]): RenderUnit[] {
  const out: RenderUnit[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const side = besideOf(b);
    if (side && (b.type === "image" || b.type === "placeholder")) {
      const max = b.type === "image" ? b.data.besideCount || 3 : 3;
      const text: Block[] = [];
      while (text.length < max && blocks[i + 1] && isText(blocks[i + 1])) text.push(blocks[++i]);
      if (text.length) { out.push({ kind: "beside", side, figure: b, text }); continue; }
    }
    out.push({ kind: "block", block: b });
  }
  return out;
}

/** Split a day's ordered blocks into its opening (before the first event) and its moments. */
export function groupDay(day: TripDay): { opening: StorySection; sections: StorySection[] } {
  const opening: StorySection = { event: null, mood: day.mood, units: [], decorations: [] };
  const sections: StorySection[] = [];
  let current = opening;
  let pending: Block[] = [];
  const flush = () => { current.units = toUnits(pending); pending = []; };
  for (const b of day.blocks) {
    if (b.type === "event") {
      flush();
      current = { event: b, mood: b.data.mood || current.mood || day.mood, units: [], decorations: [] };
      sections.push(current);
    } else if (b.type === "decoration") {
      current.decorations.push(b);
    } else {
      pending.push(b);
    }
  }
  flush();
  return { opening, sections };
}

/** Anchors used by navigation and by old links (#day-01, #d1-0700, #waterfall…). */
export function anchorsOf(days: TripDay[]): string[] {
  return days.flatMap(d => [`day-${String(d.dayNumber).padStart(2, "0")}`, ...d.blocks.filter(b => b.type === "event").map(b => (b as Block<"event">).data.anchor)]);
}
