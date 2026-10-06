# Migration to Vue 3 + Supabase: status

Production (`main`, GitHub Pages, static site) is untouched. Snapshot tag: `legacy-static-v1`.
All work is on branch `migrate/vue-cms`. How to connect Supabase and go live: [SETUP.md](SETUP.md).

## Done
1. **Audit + backup** — tag `legacy-static-v1`; legacy code in `legacy/`; every photo/clip moved to
   `public/trips/huai-nam-yen/` at the same URL paths (old image links and the share card keep working).
   Inventory: 2 days, 17 moments, 221 blocks, 33 media (incl. admin uploads/overrides from uploads.js).
2. **Vue foundation** — Vue 3 + TypeScript (strict) + Vite (base `/huainamyen/`) + Pinia + Vue Router +
   Tailwind v4 (admin only; the journal keeps its own stylesheet) + Tiptap + ESLint + Vitest + Playwright.
3. **Database, auth, storage** — `supabase/migrations/20261006000001_journal_schema.sql` (re-runnable):
   profiles, trips, trip_days, story_blocks, media_assets, trip_media, travel_notes, expenses,
   content_versions, site_settings; RLS on every table; atomic save with conflict check, publish,
   status, media-in-use; buckets `media` (public by URL, not listable) and `originals` (private).
   `npm run test:db`: 16 checks on a real PostgreSQL (anon sees published only; no anon writes;
   readers can't read drafts; storage write rules; migrations run twice).
4. **Data migration** — `npm run migrate:legacy` → `src/content/seed/*.json` (deterministic ids from
   legacy keys); `npm run verify:migration` compares every text, photo, clip and note against the
   legacy source. In the browser, the new page's text matches the old page line for line.
5. **Admin CMS** (`/admin`) — dashboard; trips (search, filter, sort, create, duplicate, status, delete
   with typed confirmation); story editor (days, typed blocks, drag & drop + arrows, duplicate, move
   between days, rich text b/i/link sanitized, recommended photo sizes, autosave with
   saved/saving/unsaved/offline states, local draft copy + recovery, conflict banner, leave protection,
   preview, publish/unpublish, versions + restore); trip details/cover/SEO/OG/tags/companions/ending/
   film roll; travel notes/expenses/contacts; media library (multi-upload, drag & drop, magic-byte type
   check, size limits, crop/rotate, WebP copies 2000/1000/500, original kept untouched, caption/alt/tags/
   album/trip, replace keeping the same id, delete refused while in use); site settings; JSON backup
   export/import (import always creates drafts).
6. **Public UI** — `/`, `/journeys`, `/journeys/:slug`, `/about`; the journal renderer ported to Vue
   components; old addresses (`/#day-02`, `/?trip=…#omkoi`, `/index.html`, `/journeys.html`,
   `/admin.html`) redirect to the same place; placeholders only with `?slots`.
7. **Tests + build** — 27 unit tests, 13 e2e tests (desktop + phone), 16 DB tests; `npm run build`
   prerenders a page per published trip with its social card + 404 SPA fallback + sitemap;
   GitHub Actions: CI on push (lint, typecheck, unit, migration check, build, DB, e2e) and a
   **manual-only** deploy workflow that requires typing `deploy`.

## Decisions
- Readers only ever get the published snapshot (one JSON version row). Drafts live in editor-only tables.
- The story is typed blocks, not editor HTML; rich text is a small sanitized subset, cleaned on save and render.
- One repository interface, two backends: Supabase, and local IndexedDB for testing without credentials.
- No GitHub token anywhere in the new system; no service-role key in the frontend (the seed script signs in as the owner instead).

## Needs you
- Create the Supabase project and owner account, fill `.env.local`, run `npm run seed:supabase` (SETUP.md §2–4).
- Go live when satisfied (SETUP.md §6). Until then the static site stays as it is.

## Known limits
- `seed:supabase` and the Supabase repository are covered by the SQL/RLS tests and typechecks, but
  have not run against a live Supabase project yet (none is connected).
- AVIF output depends on the browser; uploads are encoded to WebP (JPEG fallback), which every browser shows.
- HEIC photos can only be converted in Safari (other browsers cannot decode them).
