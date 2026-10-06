/*
 * Archive published trips as JSON files (the long-term format: plain JSON + sanitized HTML subset).
 *   npm run export:trip                 → every published trip
 *   npm run export:trip -- huai-nam-yen → one trip
 * Reads with the public anon key, so it can only see what readers see. Drafts are exported from the
 * admin (ตั้งค่าและสำรองข้อมูล → ส่งออกทุกทริป) while signed in.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { JSDOM } from "jsdom";
import { createClient } from "@supabase/supabase-js";
import { useWindow } from "../src/utils/sanitize";
import { SupabaseRepository } from "../src/services/supabase/SupabaseRepository";
import { exportBundle } from "../src/services/snapshot";

function loadEnv(file: string): Record<string, string> {
  if (!existsSync(file)) return {};
  return Object.fromEntries(readFileSync(file, "utf8").split(/\r?\n/).filter(l => /^[A-Z_]+=/.test(l)).map(l => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).trim()]; }));
}
const env = { ...loadEnv(".env"), ...loadEnv(".env.local"), ...process.env } as Record<string, string | undefined>;

async function main() {
  if (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_ANON_KEY) throw new Error("Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local");
  useWindow(new JSDOM("").window as never);
  const repo = new SupabaseRepository(createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } }), env.VITE_SUPABASE_URL, "/");
  const wanted = process.argv.slice(2).filter(a => !a.startsWith("-"));
  const slugs = wanted.length ? wanted : (await repo.listPublished()).map(t => t.slug);
  const out = resolve("exports");
  mkdirSync(out, { recursive: true });
  for (const slug of slugs) {
    const bundle = await repo.getPublished(slug);
    if (!bundle) { console.warn(`• ${slug}: not published`); continue; }
    const file = join(out, `${slug}-${new Date().toISOString().slice(0, 10)}.json`);
    writeFileSync(file, exportBundle(bundle));
    console.log(`✓ ${file}`);
  }
}

main().catch(e => { console.error(`✗ ${(e as Error).message}`); process.exit(1); });
