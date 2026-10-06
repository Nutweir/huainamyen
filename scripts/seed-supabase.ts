/*
 * Put the migrated journal(s) into a real Supabase project — run once after the SQL migration and after
 * the owner account exists (docs/SETUP.md). Runs in YOUR terminal only:
 *
 *   npm run seed:supabase              # asks for the owner e-mail and password (hidden); skips trips that exist
 *   npm run seed:supabase -- --force   # re-save + re-publish them
 *
 * It signs in as the owner and uses the same database functions as the admin, so RLS applies exactly
 * as it does in the browser. No service-role key is needed. Photos keep their static-site paths
 * (public/trips/…), which the site itself serves — nothing is uploaded, moved or deleted.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { JSDOM } from "jsdom";
import { createClient } from "@supabase/supabase-js";
import { createInterface } from "node:readline";
import type { SiteSettings, TripBundle } from "../src/types/content";
import { useWindow } from "../src/utils/sanitize";
import { SupabaseRepository, mediaToRow } from "../src/services/supabase/SupabaseRepository";

function loadEnv(file: string): Record<string, string> {
  if (!existsSync(file)) return {};
  return Object.fromEntries(readFileSync(file, "utf8").split(/\r?\n/).filter(l => /^[A-Z_]+=/.test(l)).map(l => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).trim()]; }));
}
const env = { ...loadEnv(".env"), ...loadEnv(".env.local"), ...process.env } as Record<string, string | undefined>;
const force = process.argv.includes("--force");

/** Ask for the owner's e-mail and password in the terminal; the password is not echoed. */
async function askCredentials(): Promise<{ email: string; password: string }> {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY === true });
  const out = rl as unknown as { _writeToOutput: (s: string) => void; output: NodeJS.WriteStream };
  const write = out._writeToOutput.bind(rl);
  let hide = false;
  out._writeToOutput = (str: string) => { if (!hide) write(str); else if (!str.includes(String.fromCharCode(10)) && !str.includes(String.fromCharCode(13))) out.output.write("*"); };
  const lines = rl[Symbol.asyncIterator]();
  const next = async (prompt: string) => { process.stdout.write(prompt); const r = await lines.next(); return r.done ? "" : String(r.value).trim(); };
  try {
    const email = env.SEED_EMAIL || (await next("Owner e-mail: "));
    hide = true;
    const password = env.SEED_PASSWORD || (await next("Password (hidden): "));
    process.stdout.write(String.fromCharCode(10));
    return { email, password };
  } finally { rl.close(); }
}

async function main() {
  const url = env.VITE_SUPABASE_URL, key = env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local");
  const { email, password } = await askCredentials();
  if (!email || !password) throw new Error("E-mail and password are required");
  useWindow(new JSDOM("").window as never);

  const sb = createClient(url, key, { auth: { persistSession: false } });
  const { error: signInError } = await sb.auth.signInWithPassword({ email, password });
  if (signInError) throw new Error(`Sign-in failed: ${signInError.message}`);
  const { data: editor } = await sb.rpc("is_editor");
  if (editor !== true) throw new Error("This account is not an owner/editor yet — run the profile SQL in docs/SETUP.md first");
  const repo = new SupabaseRepository(sb, url, "/");

  const dir = resolve("src/content/seed");
  for (const file of readdirSync(dir).filter(f => f.endsWith(".json"))) {
    const data = JSON.parse(readFileSync(join(dir, file), "utf8"));
    if (file === "site.json") {
      const { data: existing } = await sb.from("site_settings").select("key").eq("key", "site").maybeSingle();
      if (!existing || force) { await repo.saveSite(data as SiteSettings); console.log("✓ site settings"); }
      continue;
    }
    const bundle = data as TripBundle;
    const t = bundle.trip;
    const { data: found } = await sb.from("trips").select("id, updated_at").eq("id", t.id).maybeSingle();
    if (found && !force) { console.log(`• ${t.slug}: already there (use --force to re-save)`); continue; }

    // the trip row first (media rows belong to it), then media (the story, cover and film roll point at them)
    if (!found) {
      const { error } = await sb.from("trips").insert({ id: t.id, slug: t.slug, title: t.title, location: t.location, start_date: t.startDate, end_date: t.endDate, status: "draft" });
      if (error) throw new Error(`trip: ${error.message}`);
    }
    const { error: mErr } = await sb.from("media_assets").upsert(bundle.media.map(m => mediaToRow({ ...m, tripId: t.id })));
    if (mErr) throw new Error(`media: ${mErr.message}`);
    await repo.saveTrip(bundle, null);
    if (t.status === "published") await repo.publishTrip((await repo.loadTrip(t.id)).bundle, "Migrated from the static site");
    const check = await repo.loadTrip(t.id);
    const blocks = check.bundle.days.reduce((n, d) => n + d.blocks.length, 0);
    const want = bundle.days.reduce((n, d) => n + d.blocks.length, 0);
    if (blocks !== want) throw new Error(`${t.slug}: saved ${blocks} blocks, expected ${want}`);
    console.log(`✓ ${t.slug}: ${check.bundle.days.length} days, ${blocks} blocks, ${bundle.media.length} media${t.status === "published" ? ", published" : ""}`);
  }
  await sb.auth.signOut();
}

main().catch(e => { console.error(`✗ ${(e as Error).message}`); process.exit(1); });
