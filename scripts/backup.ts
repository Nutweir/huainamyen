/*
 * Back up the journal content as one JSON file: npm run backup → backups/<date>.json and backups/latest.json
 *
 * Without a login it saves what readers can see (published trips + site settings).
 * With BACKUP_EMAIL / BACKUP_PASSWORD (the owner account; GitHub Actions secrets in CI) it saves
 * everything: every trip's working copy including drafts, the list of versions, the published
 * snapshots, the media catalogue and site settings. Photo files themselves stay in Storage / public/.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { JSDOM } from "jsdom";
import { createClient } from "@supabase/supabase-js";
import { useWindow } from "../src/utils/sanitize";
import { SupabaseRepository } from "../src/services/supabase/SupabaseRepository";

function loadEnv(file: string): Record<string, string> {
  if (!existsSync(file)) return {};
  return Object.fromEntries(readFileSync(file, "utf8").split(/\r?\n/).filter(l => /^[A-Z_]+=/.test(l)).map(l => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).trim()]; }));
}
const env = { ...loadEnv(".env.production"), ...loadEnv(".env.local"), ...process.env } as Record<string, string | undefined>;

async function main() {
  const url = env.VITE_SUPABASE_URL, key = env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing (.env.production or .env.local)");
  useWindow(new JSDOM("").window as never);
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const repo = new SupabaseRepository(sb, url, "/");

  let full = false;
  if (env.BACKUP_EMAIL && env.BACKUP_PASSWORD) {
    const { error } = await sb.auth.signInWithPassword({ email: env.BACKUP_EMAIL, password: env.BACKUP_PASSWORD });
    if (error) throw new Error(`Sign-in failed: ${error.message}`);
    full = (await sb.rpc("is_editor")).data === true;
    if (!full) throw new Error("The backup account is not an owner/editor");
  }

  const site = await repo.getSite().catch(() => null);
  const published = [];
  for (const t of await repo.listPublished()) { const b = await repo.getPublished(t.slug); if (b) published.push(b); }

  const out: Record<string, unknown> = { kind: "journeys-backup", version: 1, createdAt: new Date().toISOString(), scope: full ? "full" : "published-only", site, published };
  if (full) {
    const trips = await repo.listTrips();
    out.trips = [];
    for (const t of trips) {
      const { bundle } = await repo.loadTrip(t.id);
      const versions = await repo.listVersions(t.id);
      (out.trips as unknown[]).push({ ...bundle, versions });
    }
    out.media = await repo.listMedia();
  }

  const dir = resolve(env.BACKUP_DIR || "backups");
  mkdirSync(dir, { recursive: true });
  const text = JSON.stringify(out, null, 2);
  writeFileSync(join(dir, `${new Date().toISOString().slice(0, 10)}.json`), text);
  writeFileSync(join(dir, "latest.json"), text);
  const n = full ? (out.trips as unknown[]).length : published.length;
  console.log(`✓ backup (${out.scope}): ${n} trip(s), ${(text.length / 1024).toFixed(0)} KB → ${dir}`);
  if (full) await sb.auth.signOut();
}

main().catch(e => { console.error(`✗ ${(e as Error).message}`); process.exit(1); });
