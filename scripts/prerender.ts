/*
 * After `vite build`: give every public page its own HTML file with the right <title>, description and
 * social card (Open Graph / Twitter), so links shared on LINE/Facebook show the trip, and GitHub Pages
 * serves real files for /journeys/<slug>/. Content still renders in the browser.
 *
 * Published trips come from Supabase (anon key — RLS only returns published content) when
 * VITE_SUPABASE_URL is set at build time, otherwise from the migrated seed in src/content/seed.
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import type { MediaAsset, SiteSettings, TripBundle } from "../src/types/content";

const DIST = resolve("dist");
const env = { ...loadEnv(".env"), ...loadEnv(".env.production"), ...loadEnv(".env.local"), ...process.env } as Record<string, string | undefined>;
const SITE = (env.VITE_SITE_URL || "https://nutweir.github.io/huainamyen").replace(/\/$/, "");
const SUPABASE = env.VITE_BACKEND !== "local" && env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY ? { url: env.VITE_SUPABASE_URL.replace(/\/$/, ""), key: env.VITE_SUPABASE_ANON_KEY } : null;

function loadEnv(file: string): Record<string, string> {
  if (!existsSync(file)) return {};
  return Object.fromEntries(readFileSync(file, "utf8").split(/\r?\n/).filter(l => /^[A-Z_]+=/.test(l)).map(l => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).trim()]; }));
}
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function mediaUrl(m: MediaAsset): string {
  if (m.path.startsWith("trips/")) return `${SITE}/${m.path}`;
  return `${SUPABASE?.url}/storage/v1/object/public/media/${m.path.split("/").map(encodeURIComponent).join("/")}`;
}

interface Page { path: string; title: string; description: string; image?: { url: string; width: number; height: number; alt: string }; type?: string; noindex?: boolean }

function render(template: string, p: Page): string {
  const url = `${SITE}/${p.path}`;
  const tags = [
    `<meta name="description" content="${esc(p.description)}">`,
    `<link rel="canonical" href="${esc(url)}">`,
    p.noindex ? `<meta name="robots" content="noindex, nofollow">` : "",
    `<meta property="og:type" content="${p.type || "website"}">`,
    `<meta property="og:site_name" content="Journeys by Nutweir · บันทึกการเดินทาง">`,
    `<meta property="og:locale" content="th_TH">`,
    `<meta property="og:url" content="${esc(url)}">`,
    `<meta property="og:title" content="${esc(p.title)}">`,
    `<meta property="og:description" content="${esc(p.description)}">`,
    ...(p.image ? [
      `<meta property="og:image" content="${esc(p.image.url)}">`,
      `<meta property="og:image:width" content="${p.image.width}">`,
      `<meta property="og:image:height" content="${p.image.height}">`,
      `<meta property="og:image:alt" content="${esc(p.image.alt)}">`,
      `<meta name="twitter:card" content="summary_large_image">`,
      `<meta name="twitter:image" content="${esc(p.image.url)}">`,
    ] : [`<meta name="twitter:card" content="summary">`]),
    `<meta name="twitter:title" content="${esc(p.title)}">`,
    `<meta name="twitter:description" content="${esc(p.description)}">`,
  ].filter(Boolean).join("\n");
  return template
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(p.title)}</title>`)
    .replace(/<meta name="description"[^>]*>\n?/, "")
    .replace("<!--meta-->", tags);
}

function write(path: string, html: string) {
  const dir = join(DIST, path);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "index.html"), html);
}

async function published(): Promise<{ trips: TripBundle[]; site: SiteSettings | null }> {
  if (SUPABASE) {
    const get = async (q: string) => {
      const r = await fetch(`${SUPABASE.url}/rest/v1/${q}`, { headers: { apikey: SUPABASE.key, ...(SUPABASE.key.startsWith("eyJ") ? { Authorization: `Bearer ${SUPABASE.key}` } : {}) } });
      if (!r.ok) throw new Error(`${q}: ${r.status} ${await r.text()}`);
      return r.json();
    };
    const rows = (await get("trips?select=published_version_id&status=eq.published")) as { published_version_id: string }[];
    const ids = rows.map(r => r.published_version_id).filter(Boolean);
    const versions = ids.length ? ((await get(`content_versions?select=snapshot&id=in.(${ids.join(",")})`)) as { snapshot: TripBundle }[]) : [];
    const site = ((await get("site_settings?select=value&key=eq.site")) as { value: SiteSettings }[])[0]?.value || null;
    return { trips: versions.map(v => v.snapshot), site };
  }
  const dir = resolve("src/content/seed");
  const trips: TripBundle[] = [];
  let site: SiteSettings | null = null;
  for (const f of readdirSync(dir).filter(f => f.endsWith(".json"))) {
    const data = JSON.parse(readFileSync(join(dir, f), "utf8"));
    if (f === "site.json") site = data; else if (data.trip?.status === "published") trips.push(data);
  }
  return { trips, site };
}

async function main() {
  const template = readFileSync(join(DIST, "index.html"), "utf8");
  if (!template.includes("<!--meta-->")) throw new Error("dist/index.html has no <!--meta--> placeholder");
  const { trips, site } = await published();
  const siteTitle = site?.title || "Journeys by Nutweir";
  const latest = [...trips].sort((a, b) => b.trip.startDate.localeCompare(a.trip.startDate))[0];

  const cardOf = (b: TripBundle): Page["image"] => {
    const m = b.media.find(x => x.id === (b.trip.ogImageId || b.trip.coverId));
    return m ? { url: mediaUrl(m), width: m.width, height: m.height, alt: m.alt || b.trip.title } : undefined;
  };
  const home: Page = { path: "", title: `${siteTitle} · บันทึกการเดินทาง`, description: site?.tagline || "บันทึกการเดินทาง ความทรงจำจากแต่ละทริป", image: latest && cardOf(latest) };

  writeFileSync(join(DIST, "index.html"), render(template, home));
  // unknown paths (admin deep links, typos): GitHub Pages serves this and the app routes it
  writeFileSync(join(DIST, "404.html"), render(template, { ...home, title: `ไม่พบหน้านี้ · ${siteTitle}`, noindex: true }));
  write("journeys", render(template, { path: "journeys/", title: `My Journeys · ${siteTitle}`, description: "รวมบันทึกการเดินทางทั้งหมด", image: home.image }));
  write("about", render(template, { path: "about/", title: `เกี่ยวกับ · ${siteTitle}`, description: site?.tagline || "เกี่ยวกับบันทึกการเดินทางนี้", image: home.image }));
  write("admin", render(template, { path: "admin/", title: `หลังบ้าน · ${siteTitle}`, description: "สำหรับผู้เขียน", noindex: true }));
  for (const b of trips) {
    const t = b.trip;
    write(`journeys/${t.slug}`, render(template, {
      path: `journeys/${t.slug}/`, type: "article",
      title: t.seoTitle || `${t.title} — Travel Journal`,
      description: t.seoDescription || t.summary,
      image: cardOf(b),
    }));
  }
  // old static-site addresses keep working as real files too
  for (const old of ["journeys.html", "admin.html"]) writeFileSync(join(DIST, old), render(template, { ...home, noindex: true }));

  const urls = ["", "journeys/", "about/", ...trips.map(b => `journeys/${b.trip.slug}/`)];
  writeFileSync(join(DIST, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(u => `  <url><loc>${SITE}/${u}</loc></url>`).join("\n")}\n</urlset>\n`);
  console.log(`prerender: ${trips.length} trip page(s) from ${SUPABASE ? "Supabase" : "seed"} → ${SITE}`);
}

main().catch(e => { console.error(e); process.exit(1); });
