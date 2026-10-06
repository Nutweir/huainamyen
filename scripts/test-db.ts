/*
 * Database tests: apply the migrations (twice, to prove they're re-runnable) to a throwaway PostgreSQL
 * and check the row level security rules act as promised.
 *
 *   npm run test:db
 *
 * Uses DATABASE_URL if set (CI service container). Otherwise it creates its own temporary cluster
 * with the local PostgreSQL binaries (PG_BIN, default C:/Program Files/PostgreSQL/17/bin) in .tmp/,
 * on port 54329 — it never touches an existing database.
 */
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import { readFile } from "node:fs/promises";

const ROOT = process.cwd();
let url = process.env.DATABASE_URL;
let stop: (() => void) | null = null;

async function startTempCluster(): Promise<string> {
  const bin = process.env.PG_BIN || "C:/Program Files/PostgreSQL/17/bin";
  const exe = (n: string) => join(bin, process.platform === "win32" ? `${n}.exe` : n);
  if (!existsSync(exe("initdb"))) throw new Error(`PostgreSQL binaries not found in ${bin}; set PG_BIN or DATABASE_URL`);
  const data = join(ROOT, ".tmp", "pgdata");
  rmSync(data, { recursive: true, force: true });
  mkdirSync(join(ROOT, ".tmp"), { recursive: true });
  execFileSync(exe("initdb"), ["-D", data, "-U", "postgres", "-A", "trust", "-E", "UTF8", "--locale=C"], { stdio: "ignore" });
  const server = spawn(exe("postgres"), ["-D", data, "-p", "54329", "-c", "listen_addresses=127.0.0.1"], { stdio: "ignore" });
  stop = () => server.kill();
  for (let i = 0; i < 60; i++) {
    try { const c = new pg.Client({ connectionString: "postgres://postgres@127.0.0.1:54329/postgres" }); await c.connect(); await c.end(); break; }
    catch { await new Promise(r => setTimeout(r, 250)); }
  }
  return "postgres://postgres@127.0.0.1:54329/postgres";
}

let passed = 0;
const failures: string[] = [];
async function check(name: string, fn: () => Promise<void>) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failures.push(`${name}: ${(e as Error).message}`); console.log(`  ✗ ${name}\n      ${(e as Error).message}`); }
}
const assert = (cond: unknown, msg: string) => { if (!cond) throw new Error(msg); };

async function main() {
  url ||= await startTempCluster();
  const db = new pg.Client({ connectionString: url });
  await db.connect();

  console.log("migrations");
  const migrations = readdirSync(join(ROOT, "supabase/migrations")).filter(f => f.endsWith(".sql")).sort();
  await db.query(readFileSync(join(ROOT, "supabase/tests/shim.sql"), "utf8"));
  for (const run of [1, 2]) {
    await check(`apply ${migrations.length} migration(s), run ${run}`, async () => {
      for (const f of migrations) await db.query(readFileSync(join(ROOT, "supabase/migrations", f), "utf8"));
    });
  }

  // fixtures as the superuser (like the SQL editor / service role)
  const OWNER = "00000000-0000-4000-8000-000000000001", STRANGER = "00000000-0000-4000-8000-000000000002";
  await db.query(`insert into auth.users (id, email) values ($1,'owner@example.com'),($2,'someone@example.com') on conflict do nothing`, [OWNER, STRANGER]);
  await db.query(`insert into public.profiles (id, role) values ($1,'owner'),($2,'reader') on conflict (id) do update set role = excluded.role`, [OWNER, STRANGER]);
  const bundle = JSON.parse(await readFile(join(ROOT, "src/content/seed/huai-nam-yen.json"), "utf8"));
  await db.query(`delete from public.trips`);
  const pub = (await db.query(`insert into public.trips (slug, title, status) values ('published-trip','Published','draft') returning id`)).rows[0].id;
  const draft = (await db.query(`insert into public.trips (slug, title, status) values ('draft-trip','Secret draft','draft') returning id`)).rows[0].id;

  // run a query as a given API role, like PostgREST does
  async function as<T = Record<string, unknown>>(who: "anon" | "owner" | "stranger", sql: string, params: unknown[] = []): Promise<T[]> {
    await db.query("begin");
    try {
      const sub = who === "owner" ? OWNER : who === "stranger" ? STRANGER : "";
      await db.query(`select set_config('request.jwt.claims', $1, true)`, [sub ? JSON.stringify({ sub, role: "authenticated" }) : ""]);
      await db.query(`set local role ${who === "anon" ? "anon" : "authenticated"}`);
      const res = await db.query(sql, params);
      await db.query("commit");
      return res.rows as T[];
    } catch (e) { await db.query("rollback"); throw e; }
  }
  const denied = async (p: Promise<unknown>) => { try { await p; return false; } catch (e) { return /permission|not allowed|row-level security|violates/i.test((e as Error).message); } };

  console.log("editing and publishing (owner)");
  const day = bundle.days[0];
  const smallDays = [{ ...day, blocks: day.blocks.slice(0, 5) }];
  let savedAt = "";
  await check("owner saves a trip's working copy in one call", async () => {
    const r = await as<{ save_trip_content: string }>("owner", `select public.save_trip_content($1, $2, $3, $4, $5, null)`, [pub, JSON.stringify({ ...bundle.trip, slug: "published-trip", coverId: null, ogImageId: null }), JSON.stringify(smallDays), JSON.stringify({ ...bundle.notes }), []]);
    savedAt = r[0].save_trip_content;
    const n = await db.query(`select count(*)::int c from public.story_blocks where trip_id = $1`, [pub]);
    assert(n.rows[0].c === 5, `expected 5 blocks, got ${n.rows[0].c}`);
    const e = await db.query(`select count(*)::int c from public.expenses where trip_id = $1`, [pub]);
    assert(e.rows[0].c === bundle.notes.expenses.length, "expenses not saved");
  });
  await check("saving with a stale timestamp is refused (no silent overwrite)", async () => {
    let msg = "";
    try { await as("owner", `select public.save_trip_content($1, '{}', '[]', null, '{}', $2)`, [pub, "2000-01-01T00:00:00Z"]); } catch (e) { msg = (e as Error).message; }
    assert(/conflict/.test(msg), `expected conflict, got "${msg}"`);
  });
  await check("removing a block from the payload deletes it; Thai text is stored intact", async () => {
    const fewer = [{ ...day, blocks: day.blocks.slice(0, 3) }];
    await as("owner", `select public.save_trip_content($1, $2, $3, null, '{}', $4)`, [pub, JSON.stringify({ title: "Published" }), JSON.stringify(fewer), savedAt]);
    const rows = await db.query(`select data from public.story_blocks where trip_id = $1 order by sort_order`, [pub]);
    assert(rows.rows.length === 3, `expected 3 blocks, got ${rows.rows.length}`);
    const html = rows.rows.find(r => r.data.html)?.data.html || "";
    assert(/[\u0E00-\u0E7F]/.test(html), "Thai text missing");
  });
  await check("owner publishes a snapshot", async () => {
    await as("owner", `select public.publish_trip($1, $2, 'test publish')`, [pub, JSON.stringify(bundle)]);
    const t = await db.query(`select status, published_version_id from public.trips where id = $1`, [pub]);
    assert(t.rows[0].status === "published" && t.rows[0].published_version_id, "trip not published");
  });

  console.log("readers (anon)");
  await check("anon sees published trips only", async () => {
    const rows = await as<{ slug: string }>("anon", `select slug from public.trips`);
    assert(rows.length === 1 && rows[0].slug === "published-trip", `saw ${JSON.stringify(rows)}`);
  });
  await check("anon reads the published snapshot", async () => {
    const rows = await as<{ snapshot: { trip: { title: string } } }>("anon", `select v.snapshot from public.content_versions v join public.trips t on t.published_version_id = v.id where t.slug = 'published-trip'`);
    assert(rows.length === 1 && rows[0].snapshot.trip.title === bundle.trip.title, "snapshot not readable");
  });
  await check("anon cannot read draft working copies, media or other versions", async () => {
    assert(await denied(as("anon", `select * from public.story_blocks`)), "story_blocks readable");
    assert(await denied(as("anon", `select * from public.media_assets`)), "media_assets readable");
    const v = await as("anon", `select id from public.content_versions where trip_id = $1`, [draft]);
    assert(v.length === 0, "draft versions visible");
    const d = await as("anon", `select id from public.trips where id = $1`, [draft]);
    assert(d.length === 0, "draft trip visible");
  });
  await check("anon cannot create, update, delete or call write functions", async () => {
    assert(await denied(as("anon", `insert into public.trips (slug, title) values ('x','x')`)), "insert allowed");
    assert(await denied(as("anon", `update public.trips set title = 'hacked'`)), "update allowed");
    const after = await db.query(`select count(*)::int c from public.trips where title = 'hacked'`);
    assert(after.rows[0].c === 0, "update went through");
    assert(await denied(as("anon", `select public.publish_trip($1, '{}', '')`, [draft])), "publish allowed");
    assert(await denied(as("anon", `select public.save_trip_content($1, '{}', '[]', null, '{}', null)`, [draft])), "save allowed");
  });
  await check("unpublishing hides the trip and its snapshot again", async () => {
    await as("owner", `select public.set_trip_status($1, 'draft')`, [pub]);
    assert((await as("anon", `select id from public.trips`)).length === 0, "still visible");
    assert((await as("anon", `select id from public.content_versions`)).length === 0, "snapshot still visible");
    await as("owner", `select public.set_trip_status($1, 'published')`, [pub]);
    assert((await as("anon", `select id from public.trips`)).length === 1, "republish failed");
  });

  console.log("signed-in non-editor");
  await check("a signed-in reader cannot write or read drafts", async () => {
    assert(await denied(as("stranger", `insert into public.trips (slug, title) values ('y','y')`)), "insert allowed");
    const rows = await as("stranger", `select slug from public.trips`);
    assert(rows.length === 1, "saw drafts");
    assert(await denied(as("stranger", `select public.save_trip_content($1, '{}', '[]', null, '{}', null)`, [pub])), "save allowed");
    assert(await denied(as("stranger", `update public.profiles set role = 'owner' where id = $1`, [STRANGER])) ||
      (await db.query(`select role from public.profiles where id = $1`, [STRANGER])).rows[0].role === "reader", "self-promotion worked");
  });

  console.log("storage");
  await check("only editors can upload to media/originals", async () => {
    assert(await denied(as("anon", `insert into storage.objects (bucket_id, name) values ('media','x.webp')`)), "anon upload allowed");
    assert(await denied(as("stranger", `insert into storage.objects (bucket_id, name) values ('media','x.webp')`)), "reader upload allowed");
    await as("owner", `insert into storage.objects (bucket_id, name) values ('media','trip/x.webp')`);
    await as("owner", `insert into storage.objects (bucket_id, name) values ('originals','trip/x.jpg')`);
  });
  await check("originals are private; media bucket is public-by-URL but not listable by anon", async () => {
    const listing = as("anon", `select name from storage.objects`);
    assert(await denied(listing) || (await as("anon", `select name from storage.objects`)).length === 0, "anon can list objects");
    const b = await db.query(`select id, public from storage.buckets order by id`);
    assert(b.rows.find(r => r.id === "originals").public === false && b.rows.find(r => r.id === "media").public === true, "bucket visibility wrong");
  });

  await db.end();
  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) process.exitCode = 1;
}

main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => stop && stop());
