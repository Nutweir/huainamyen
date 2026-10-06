-- Journeys by Nutweir — content schema, row level security and storage.
-- Safe to run more than once: every object is created "if not exists" / "or replace",
-- and policies are dropped before being recreated.
--
-- Access model
--   * Readers (anon) see only what is published: trip summaries of published trips and the
--     published snapshot (content_versions row). Draft edits live in trip_days / story_blocks /
--     media_assets, which only editors can read — so autosave never leaks unfinished writing.
--   * Editors are users with profiles.role in ('owner','editor'). Nobody can make themselves an
--     editor: profiles has no insert/update policy for non-owners (see docs/SETUP.md for the first owner).

-- ───────────────────────────── helpers ─────────────────────────────
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

-- ───────────────────────────── tables ─────────────────────────────
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  role text not null default 'reader' check (role in ('owner', 'editor', 'reader')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.is_editor() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('owner', 'editor'))
$$;
create or replace function public.is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner')
$$;

create table if not exists public.site_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.trips (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  title text not null default '',
  title_local text not null default '',
  location text not null default '',
  start_date date,
  end_date date,
  duration_label text not null default '',
  summary text not null default '',
  epigraph jsonb not null default '[]',
  cover_id uuid,
  cover_meta jsonb not null default '[]',
  tags text[] not null default '{}',
  companions text not null default '',
  seo_title text not null default '',
  seo_description text not null default '',
  og_image_id uuid,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  published_version_id uuid,
  published_at timestamptz,
  sort_order integer not null default 0,
  show_placeholders boolean not null default true,
  ending jsonb,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trips_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint trips_dates check (end_date is null or start_date is null or end_date >= start_date)
);
create unique index if not exists trips_slug_key on public.trips (slug);
create index if not exists trips_status_idx on public.trips (status, start_date desc);

create table if not exists public.trip_days (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  day_number integer not null check (day_number > 0),
  date date,
  route jsonb not null default '[]',
  mood text not null default 'morning',
  closing text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists trip_days_trip_idx on public.trip_days (trip_id, sort_order);

create table if not exists public.story_blocks (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  day_id uuid not null references public.trip_days (id) on delete cascade,
  type text not null check (type in ('event','paragraph','heading','thought','note','quote','dialogue','verse','letter',
                                     'pause','mark','spacer','stamp','image','images','placeholder','video','decoration')),
  data jsonb not null default '{}',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists story_blocks_day_idx on public.story_blocks (day_id, sort_order);
create index if not exists story_blocks_trip_idx on public.story_blocks (trip_id);

create table if not exists public.media_assets (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('image', 'video')),
  path text not null,
  variants jsonb not null default '{}',
  original_path text,
  mime text not null,
  width integer not null default 0,
  height integer not null default 0,
  bytes bigint not null default 0,
  alt text not null default '',
  caption text not null default '',
  taken_date date,
  taken_time text,
  location text not null default '',
  camera text not null default '',
  note text not null default '',
  focus text,
  tags text[] not null default '{}',
  album text,
  trip_id uuid references public.trips (id) on delete set null,
  poster_id uuid references public.media_assets (id) on delete set null,
  legacy_key text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists media_assets_path_key on public.media_assets (path);
create index if not exists media_assets_trip_idx on public.media_assets (trip_id, created_at desc);
create index if not exists media_assets_tags_idx on public.media_assets using gin (tags);

create table if not exists public.trip_media (
  trip_id uuid not null references public.trips (id) on delete cascade,
  media_id uuid not null references public.media_assets (id) on delete cascade,
  sort_order integer not null default 0,
  primary key (trip_id, media_id)
);

create table if not exists public.travel_notes (
  trip_id uuid primary key references public.trips (id) on delete cascade,
  data jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  label text not null default '',
  amount text not null default '',
  note text not null default '',
  sort_order integer not null default 0
);
create index if not exists expenses_trip_idx on public.expenses (trip_id, sort_order);

create table if not exists public.content_versions (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  label text not null default '',
  snapshot jsonb not null,
  is_published boolean not null default false,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists content_versions_trip_idx on public.content_versions (trip_id, created_at desc);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'trips_published_version_fk') then
    alter table public.trips add constraint trips_published_version_fk
      foreign key (published_version_id) references public.content_versions (id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'trips_cover_fk') then
    alter table public.trips add constraint trips_cover_fk foreign key (cover_id) references public.media_assets (id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'trips_og_fk') then
    alter table public.trips add constraint trips_og_fk foreign key (og_image_id) references public.media_assets (id) on delete set null;
  end if;
end $$;

-- updated_at triggers
do $$ declare t text; begin
  foreach t in array array['profiles','trips','trip_days','story_blocks','media_assets'] loop
    execute format('drop trigger if exists %I_touch on public.%I', t, t);
    execute format('create trigger %I_touch before update on public.%I for each row execute function public.touch_updated_at()', t, t);
  end loop;
end $$;

-- ───────────────────────────── row level security ─────────────────────────────
alter table public.profiles enable row level security;
alter table public.site_settings enable row level security;
alter table public.trips enable row level security;
alter table public.trip_days enable row level security;
alter table public.story_blocks enable row level security;
alter table public.media_assets enable row level security;
alter table public.trip_media enable row level security;
alter table public.travel_notes enable row level security;
alter table public.expenses enable row level security;
alter table public.content_versions enable row level security;

-- profiles: see yourself; owners manage everyone. No self-service role changes.
drop policy if exists profiles_self_read on public.profiles;
create policy profiles_self_read on public.profiles for select to authenticated using (id = auth.uid() or public.is_owner());
drop policy if exists profiles_owner_write on public.profiles;
create policy profiles_owner_write on public.profiles for all to authenticated using (public.is_owner()) with check (public.is_owner());

-- site settings: public read, editors write
drop policy if exists site_settings_read on public.site_settings;
create policy site_settings_read on public.site_settings for select to anon, authenticated using (true);
drop policy if exists site_settings_write on public.site_settings;
create policy site_settings_write on public.site_settings for all to authenticated using (public.is_editor()) with check (public.is_editor());

-- trips: everyone reads published summaries; editors read and write everything
drop policy if exists trips_public_read on public.trips;
create policy trips_public_read on public.trips for select to anon, authenticated using (status = 'published' or public.is_editor());
drop policy if exists trips_editor_write on public.trips;
create policy trips_editor_write on public.trips for all to authenticated using (public.is_editor()) with check (public.is_editor());

-- working copies: editors only (readers get the published snapshot instead)
do $$ declare t text; begin
  foreach t in array array['trip_days','story_blocks','media_assets','trip_media','travel_notes','expenses'] loop
    execute format('drop policy if exists %I_editor on public.%I', t, t);
    execute format('create policy %I_editor on public.%I for all to authenticated using (public.is_editor()) with check (public.is_editor())', t, t);
  end loop;
end $$;

-- versions: readers may read only the published version of a published trip
drop policy if exists content_versions_public_read on public.content_versions;
create policy content_versions_public_read on public.content_versions for select to anon, authenticated using (
  public.is_editor() or exists (
    select 1 from public.trips t where t.published_version_id = content_versions.id and t.status = 'published'
  )
);
drop policy if exists content_versions_editor_write on public.content_versions;
create policy content_versions_editor_write on public.content_versions for all to authenticated using (public.is_editor()) with check (public.is_editor());

grant usage on schema public to anon, authenticated;
grant select on public.trips, public.content_versions, public.site_settings to anon;
grant select, insert, update, delete on all tables in schema public to authenticated;

-- ───────────────────────────── functions (run as the caller, so RLS applies) ─────────────────────────────

-- Save the whole working copy of a trip in one transaction. Days and blocks not in the payload are removed.
-- p_expected: the updated_at the editor last saw; a different value means someone saved meanwhile.
create or replace function public.save_trip_content(
  p_trip_id uuid, p_trip jsonb, p_days jsonb, p_notes jsonb, p_gallery uuid[], p_expected timestamptz
) returns timestamptz
language plpgsql security invoker set search_path = public as $$
declare
  current_ts timestamptz;
  d jsonb; b jsonb;
  day_order int := 0; block_order int;
  keep_days uuid[] := '{}'; keep_blocks uuid[] := '{}';
  saved_at timestamptz;
begin
  if not public.is_editor() then raise exception 'not allowed' using errcode = '42501'; end if;
  select updated_at into current_ts from trips where id = p_trip_id for update;
  if not found then raise exception 'trip not found' using errcode = 'P0002'; end if;
  -- compare at millisecond precision: JavaScript clients keep timestamps in ms
  if p_expected is not null and date_trunc('milliseconds', current_ts) <> date_trunc('milliseconds', p_expected) then
    raise exception 'conflict: trip was saved elsewhere at %', current_ts using errcode = '40001';
  end if;

  update trips set
    slug = coalesce(p_trip->>'slug', slug), title = coalesce(p_trip->>'title', title),
    title_local = coalesce(p_trip->>'titleLocal', title_local), location = coalesce(p_trip->>'location', location),
    start_date = nullif(p_trip->>'startDate', '')::date, end_date = nullif(p_trip->>'endDate', '')::date,
    duration_label = coalesce(p_trip->>'durationLabel', duration_label), summary = coalesce(p_trip->>'summary', summary),
    epigraph = coalesce(p_trip->'epigraph', epigraph), cover_id = nullif(p_trip->>'coverId', '')::uuid,
    cover_meta = coalesce(p_trip->'coverMeta', cover_meta),
    tags = coalesce(array(select jsonb_array_elements_text(p_trip->'tags')), tags),
    companions = coalesce(p_trip->>'companions', companions), seo_title = coalesce(p_trip->>'seoTitle', seo_title),
    seo_description = coalesce(p_trip->>'seoDescription', seo_description), og_image_id = nullif(p_trip->>'ogImageId', '')::uuid,
    sort_order = coalesce((p_trip->>'sortOrder')::int, sort_order),
    show_placeholders = coalesce((p_trip->>'showPlaceholders')::boolean, show_placeholders),
    ending = p_trip->'ending'
  where id = p_trip_id
  returning updated_at into saved_at;

  for d in select * from jsonb_array_elements(coalesce(p_days, '[]')) loop
    day_order := day_order + 1;
    insert into trip_days (id, trip_id, day_number, date, route, mood, closing, sort_order)
    values ((d->>'id')::uuid, p_trip_id, (d->>'dayNumber')::int, nullif(d->>'date', '')::date, coalesce(d->'route', '[]'),
            coalesce(d->>'mood', 'morning'), coalesce(d->>'closing', ''), day_order)
    on conflict (id) do update set day_number = excluded.day_number, date = excluded.date, route = excluded.route,
      mood = excluded.mood, closing = excluded.closing, sort_order = excluded.sort_order
      where trip_days.trip_id = p_trip_id;
    keep_days := keep_days || (d->>'id')::uuid;
    block_order := 0;
    for b in select * from jsonb_array_elements(coalesce(d->'blocks', '[]')) loop
      block_order := block_order + 1;
      insert into story_blocks (id, trip_id, day_id, type, data, sort_order)
      values ((b->>'id')::uuid, p_trip_id, (d->>'id')::uuid, b->>'type', coalesce(b->'data', '{}'), block_order)
      on conflict (id) do update set day_id = excluded.day_id, type = excluded.type, data = excluded.data, sort_order = excluded.sort_order
        where story_blocks.trip_id = p_trip_id;
      keep_blocks := keep_blocks || (b->>'id')::uuid;
    end loop;
  end loop;
  delete from story_blocks where trip_id = p_trip_id and not (id = any (keep_blocks));
  delete from trip_days where trip_id = p_trip_id and not (id = any (keep_days));

  if p_notes is not null then
    insert into travel_notes (trip_id, data, updated_at) values (p_trip_id, p_notes - 'expenses', now())
    on conflict (trip_id) do update set data = excluded.data, updated_at = now();
    delete from expenses where trip_id = p_trip_id;
    insert into expenses (trip_id, label, amount, note, sort_order)
    select p_trip_id, e->>'label', e->>'amount', e->>'note', row_number() over ()
    from jsonb_array_elements(coalesce(p_notes->'expenses', '[]')) e;
  end if;

  delete from trip_media where trip_id = p_trip_id;
  insert into trip_media (trip_id, media_id, sort_order)
  select p_trip_id, m, ord from unnest(coalesce(p_gallery, '{}')) with ordinality as g(m, ord)
  on conflict do nothing;

  return saved_at;
end $$;

-- Publish: store the reader-facing snapshot as a version and point the trip at it, atomically.
create or replace function public.publish_trip(p_trip_id uuid, p_snapshot jsonb, p_label text default '')
returns uuid language plpgsql security invoker set search_path = public as $$
declare v_id uuid;
begin
  if not public.is_editor() then raise exception 'not allowed' using errcode = '42501'; end if;
  insert into content_versions (trip_id, label, snapshot, is_published)
  values (p_trip_id, coalesce(nullif(p_label, ''), 'Published'), p_snapshot, true) returning id into v_id;
  update content_versions set is_published = false where trip_id = p_trip_id and id <> v_id and is_published;
  update trips set status = 'published', published_version_id = v_id, published_at = now() where id = p_trip_id;
  return v_id;
end $$;

create or replace function public.set_trip_status(p_trip_id uuid, p_status text)
returns void language plpgsql security invoker set search_path = public as $$
begin
  if not public.is_editor() then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_status not in ('draft', 'published', 'archived') then raise exception 'bad status'; end if;
  if p_status = 'published' and not exists (select 1 from trips where id = p_trip_id and published_version_id is not null) then
    raise exception 'publish the trip first (no published version yet)';
  end if;
  update trips set status = p_status where id = p_trip_id;
end $$;

grant execute on function public.save_trip_content(uuid, jsonb, jsonb, jsonb, uuid[], timestamptz) to authenticated;
grant execute on function public.publish_trip(uuid, jsonb, text) to authenticated;
grant execute on function public.set_trip_status(uuid, text) to authenticated;
grant execute on function public.is_editor() to anon, authenticated;
revoke execute on function public.save_trip_content(uuid, jsonb, jsonb, jsonb, uuid[], timestamptz) from anon;
revoke execute on function public.publish_trip(uuid, jsonb, text) from anon;
revoke execute on function public.set_trip_status(uuid, text) from anon;

-- ───────────────────────────── storage ─────────────────────────────
-- media: web-ready copies, publicly readable by URL (random paths, listing is not public).
-- originals: untouched uploads, private to editors.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 52428800, array['image/jpeg','image/png','image/webp','image/avif','image/gif','video/mp4','video/webm','video/quicktime']),
       ('originals', 'originals', false, 104857600, null)
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists media_editor_insert on storage.objects;
create policy media_editor_insert on storage.objects for insert to authenticated with check (bucket_id in ('media', 'originals') and public.is_editor());
drop policy if exists media_editor_update on storage.objects;
create policy media_editor_update on storage.objects for update to authenticated using (bucket_id in ('media', 'originals') and public.is_editor());
drop policy if exists media_editor_delete on storage.objects;
create policy media_editor_delete on storage.objects for delete to authenticated using (bucket_id in ('media', 'originals') and public.is_editor());
drop policy if exists media_editor_select on storage.objects;
create policy media_editor_select on storage.objects for select to authenticated using (bucket_id in ('media', 'originals') and public.is_editor());
