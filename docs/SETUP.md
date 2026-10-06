# Setup guide — Journeys by Nutweir (Vue 3 + Supabase)

The site runs in two modes:

| Mode | `VITE_BACKEND` | Data lives in | Use for |
|---|---|---|---|
| Local test | `local` (default) | this browser's IndexedDB, seeded from `src/content/seed/` | development, demos, tests — no account needed |
| Real | `supabase` | Supabase Postgres + Storage, protected by RLS | the live site and its admin |

Nothing below touches the current live site. Going live is a separate, manual step at the end.

---

## 1. Run it on your computer (local test mode)

```bash
npm ci
```

```bash
npm run dev
```

Open http://localhost:5173/huainamyen/ — the Huai Nam Yen journal is there, migrated from the static site.
Admin: http://localhost:5173/huainamyen/admin — local test login: any e-mail, password `local`.
In this mode, edits stay in that browser only.

Checks:

```bash
npm run lint && npm run typecheck && npm test && npm run verify:migration
```

```bash
npm run test:e2e
```

```bash
npm run test:db
```

`test:db` applies the SQL migrations twice to a throwaway PostgreSQL (its own cluster in `.tmp/`, port 54329,
using the binaries in `PG_BIN`, default `C:/Program Files/PostgreSQL/17/bin`) and checks every RLS rule.
It never touches an existing database. In CI it uses a Postgres service container (`DATABASE_URL`).

---

## 2. Create the Supabase project

1. https://supabase.com → New project (region: Singapore is closest to Thailand). Keep the database password somewhere safe.
2. **SQL Editor** → paste all of `supabase/migrations/20261006000001_journal_schema.sql` → Run.
   It is safe to run again later (every statement is re-runnable). It creates the tables, RLS policies,
   database functions and the two storage buckets (`media` public-by-URL, `originals` private).
3. **Authentication → Providers → Email**: keep e-mail enabled. **Turn off "Allow new users to sign up"**
   (Authentication → Sign In / Up) — only you should have an account.
4. **Authentication → Users → Add user** → your e-mail + a strong password (tick "Auto confirm").
5. Make that user the owner — **SQL Editor**:

   ```sql
   insert into public.profiles (id, role, display_name)
   select id, 'owner', 'Nutweir' from auth.users where email = 'YOUR-EMAIL'
   on conflict (id) do update set role = 'owner';
   ```

   Nobody can give themselves this role from the website: `profiles` has no write policy for non-owners.
6. **Authentication → URL Configuration**: Site URL `https://nutweir.github.io/huainamyen/`;
   add redirect URLs `https://nutweir.github.io/huainamyen/admin` and `http://localhost:5173/huainamyen/admin`
   (needed for the e-mail sign-in link).

## 3. Connect the site

Copy `.env.example` to `.env.local` and fill in (Project Settings → API):

```
VITE_BACKEND=supabase
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...   (the "anon public" key)
```

- The anon key is meant to be public; RLS decides what it can do (readers: published content only;
  nobody can write without being signed in as owner/editor).
- **Never** put the `service_role` key in any `VITE_` variable or anywhere in the frontend. This project does not need it.
- `.env.local` is git-ignored.

## 4. Move the migrated journal into Supabase

In **your own terminal** (PowerShell or bash). It asks for the owner e-mail and password; the password
is hidden while you type and is not saved anywhere:

```bash
npm run seed:supabase
```

It signs in as the owner and saves the journal through the same database functions the admin uses
(so RLS applies), then publishes it as the version "Migrated from the static site".
Photos keep their current paths (`public/trips/huai-nam-yen/…`) and are served by the site itself —
nothing is uploaded, moved or deleted. New uploads from the admin go to Supabase Storage.
Running it again skips trips that already exist (`-- --force` re-saves them).

Then `npm run dev` → the site now reads from Supabase. Sign in at `/admin` with your real account.

## 5. Check before going live

- `/journeys/huai-nam-yen` shows the full journal; old links like `/#day-02`, `/?trip=huai-nam-yen#omkoi` land in the right place.
- In a private window (signed out): drafts are not visible; `/admin/...` asks to sign in.
- Admin: edit a paragraph → "บันทึกแล้ว"; preview shows it; the public page does not until you publish.
- Publish → the public page updates; "ยกเลิกเผยแพร่" hides it; Versions → restore works.
- Upload a photo (JPG, iPhone HEIC in Safari, DNG) and a clip (MP4/MOV) in the media library.
- `npm run build` → `dist/journeys/huai-nam-yen/index.html` has the trip's social card.

## 6. Go live (replaces the static site — only when everything above passes)

The current site is served straight from the `main` branch ("Deploy from a branch"). The tag
`legacy-static-v1` keeps it forever. Order matters: if `main` received the Vue code while Pages still
builds from the branch, the live site would break — so switch the source first.

1. Make the rollback branch once:

   ```bash
   git fetch origin && git branch legacy-static origin/main && git push origin legacy-static
   ```

2. Repository → Settings → Secrets and variables → Actions → **Variables**:
   `VITE_BACKEND=supabase`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
3. Settings → Pages → Build and deployment → Source: **GitHub Actions**.
4. Merge `migrate/vue-cms` into `main` (pull request; CI must be green).
5. Actions → **Deploy (manual)** → Run workflow (branch `main`) → type `deploy`. Takes 2–3 minutes;
   between steps 3 and 5 the site may be briefly unavailable, so do them together.

**Roll back:** Settings → Pages → Source: "Deploy from a branch" → `legacy-static` / root.
The static site is back within a minute or two; Supabase data is untouched.

## Backups

- Admin → ตั้งค่าและสำรองข้อมูล → **ส่งออกทุกทริป**: one JSON file with every trip, drafts included.
  Import always creates new draft trips; it never overwrites.
- `npm run export:trip` writes each published trip to `exports/` (public data only).
- Supabase: Database → Backups (daily on paid plans); Storage files can be downloaded from the dashboard.
- The JSON format is plain data + a small sanitized HTML subset, readable without this app.
