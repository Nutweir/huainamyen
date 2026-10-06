# Migration to Vue 3 + Supabase: status

Production (`main`, GitHub Pages) is untouched. Snapshot tag: `legacy-static-v1`.

## Done (branch `migrate/vue-cms`)
1. Audit + backup
   - Tag `legacy-static-v1` = the static site exactly as deployed.
   - Legacy code moved to `legacy/` (index/journeys/admin.html, assets, tools, trip.js, images.js, uploads.js).
   - All photos/videos moved to `public/trips/huai-nam-yen/` at the same URL paths, so old image links and the share card keep working.
   - Content inventory: 2 days, 17 events, 203 story blocks (133 paragraphs, 21 thoughts, 12 notes, 11 verses,
     12 single photos, 5 photo sets, 3 videos, quote, dialogue, letter, stamp, pause, mark), 25 registry photos +
     3 admin uploads, 8 travel-note sections, 3 map places, 6 expense lines.
   - Admin edits that must carry over (uploads.js overrides): milkyway → day-01/img-0185.jpg (20:48);
     goat → day-02/img-0820.jpg (10:37); uncle-phue-lue caption/alt; baby-goat slot filled with r0012050;
     afternoon clip → DJI .mov with poster.
2. Vue foundation (started): package.json, Vite (base /huainamyen/), TypeScript strict, Tailwind v4, ESLint,
   Vitest, Playwright, `.env.example`, folder structure, content model `src/types/content.ts`.

## Decisions
- Public site reads only the published snapshot (a JSON version row); drafts never reach readers.
- Story = typed blocks (not editor HTML); rich text limited to b/i/br/a and sanitized on save and render.
- Originals kept untouched in a private bucket; the site serves optimized WebP copies.
- One repository interface with two backends: Supabase, and a local IndexedDB mode for testing without credentials.
- Local test database: a throwaway PostgreSQL cluster (initdb) with a Supabase auth/storage shim, for migrations + RLS tests.

## Next
3. Database + Auth + Storage: SQL migrations, RLS, storage policies, RLS tests.
4. Data migration script legacy → bundle JSON, verification script.
5. Admin CMS (trips, block editor with autosave/versions, media library).
6. Public UI (port the diary renderer to Vue components, legacy hash redirects).
7. Tests, CI (GitHub Actions), prerendered OG pages, deploy plan.
