-- iTala — Supabase schema + Row Level Security
-- Run this in the Supabase SQL Editor (Project → SQL → New query).
-- It is idempotent: safe to re-run; existing rows are preserved.

-- =============================================================================
-- 1) PROFILES: per-user role flag
-- =============================================================================
-- Supabase Auth creates a row in auth.users for every sign-in (including anonymous).
-- We mirror that into public.profiles so we can attach an is_admin flag we control.
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  is_admin   boolean not null default false,
  created_at timestamptz not null default now()
);
-- Migration: email + display name (shown in league member lists).
alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists name  text;

-- =============================================================================
-- 1b) ADMIN EMAIL ALLOWLIST — Google accounts that are admins automatically
-- =============================================================================
-- Adding/removing an admin is one row here (plus the ADMIN_EMAILS list in
-- src/store/AdminProvider.tsx, which drives the client UI). No policies on
-- this table = it is not readable or writable through the API; only the
-- security-definer functions in this file can touch it.
create table if not exists public.admin_emails (
  email    text primary key,
  added_at timestamptz not null default now()
);
alter table public.admin_emails enable row level security;

insert into public.admin_emails (email) values
  ('abejoharold@gmail.com'),
  ('abejohanna@gmail.com'),
  ('aeronjosephsantos@gmail.com'),
  ('santos.ajhea@gmail.com')
on conflict (email) do nothing;

-- Auto-create a profile row whenever a new auth user is created.
-- Google sign-ins whose email is on the admin_emails allowlist (above) are
-- flagged is_admin from the very first sign-in — no password needed.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, is_admin, email, name)
  values (
    new.id,
    coalesce(
      new.email is not null
      and exists (select 1 from public.admin_emails a where lower(a.email) = lower(new.email)),
      false
    ),
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', new.email)
  )
  on conflict (id) do update set email = excluded.email, name = excluded.name;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Called by the app right after any Google sign-in (and at boot). Promotes the
-- caller to admin if their email is on the allowlist. Deliberately never
-- DEMOTES — the password-elevation backup (elevate_to_admin) also sets
-- is_admin, and demoting here would silently undo it. Returns whether the
-- caller's email is allowlisted.
create or replace function public.sync_admin_role()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  em text;
  allowed boolean;
begin
  if auth.uid() is null then
    return false;
  end if;

  select email into em from auth.users where id = auth.uid();
  allowed := em is not null
    and exists (select 1 from public.admin_emails a where lower(a.email) = lower(em));

  -- Keep the profile's email/name fresh (used in league member lists).
  update public.profiles p
     set email = u.email,
         name  = coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', u.email)
    from auth.users u
   where p.id = auth.uid() and u.id = auth.uid();

  if allowed then
    -- Profile normally exists via the trigger; upsert covers pre-trigger users.
    insert into public.profiles (id, is_admin) values (auth.uid(), true)
    on conflict (id) do update set is_admin = true;
  end if;

  return allowed;
end;
$$;

grant execute on function public.sync_admin_role() to anon, authenticated;

-- =============================================================================
-- 1c) ACCOUNT DELETION — App Store 5.1.1(v) / Google Play policy requirement
-- =============================================================================
-- Any app offering account creation must let users delete the account in-app.
-- Deleting the auth.users row cascades to public.profiles (FK above). League
-- and game data is keyed by league entities, not auth users, so recorded
-- stats, teams, and standings are untouched.
create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in.';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

grant execute on function public.delete_own_account() to authenticated;

-- =============================================================================
-- 2) DOMAIN TABLES — mirror the client TypeScript model
-- =============================================================================
-- We use the SAME id strings the client already generates (short base36 ids like
-- 'lmk6f2x9'), stored as text. This means existing local data can be migrated
-- 1:1 without rewriting ids, and offline-created records sync cleanly.

create table if not exists public.leagues (
  id              text primary key,
  name            text not null,
  season          text not null,
  kind            text not null default 'league' check (kind in ('league','recreational')),
  foul_out_limit  int,
  track_misses    boolean,            -- per-league live-tracker setting; null = pre-migration row
  track_turnovers boolean,            -- per-league: show the TOV button (default true)
  is_shared       boolean not null default false, -- shared community drop-in space
  created_at      bigint not null,    -- client's Date.now() value
  updated_at      timestamptz not null default now()
);
-- Migrations for databases created before these columns existed:
alter table public.leagues add column if not exists track_misses boolean;
alter table public.leagues add column if not exists track_turnovers boolean;
alter table public.leagues add column if not exists is_shared boolean not null default false;
alter table public.leagues add column if not exists is_closed boolean not null default false;
alter table public.leagues add column if not exists is_archived boolean not null default false;
alter table public.teams   add column if not exists coach text;
-- Dormant breadcrumb (read by nothing yet): set by league duplication so a
-- future career-profile feature can link the same person across seasons.
-- Deliberately NOT a foreign key — the source league may be deleted later.
alter table public.players add column if not exists origin_player_id text;
-- Post-game attendance: player ids present at the game (null = not recorded;
-- the app then falls back to "played = present").
alter table public.games add column if not exists attendance text[];
-- Per-game stat-tracking overrides for drop-in games (null = inherit the
-- league-level setting; set at creation for rec games so one user's choice
-- never flips settings for everyone in the shared community space).
alter table public.games add column if not exists track_misses boolean;
alter table public.games add column if not exists track_turnovers boolean;

create table if not exists public.teams (
  id           text primary key,
  league_id    text not null references public.leagues(id) on delete cascade,
  name         text not null,
  color        text not null,
  coach           text,
  logo         text,                   -- data URI; small base64 thumbs OK
  team_only    boolean not null default false,
  player_ids   text[] not null default '{}',  -- mirrors Team.playerIds
  updated_at   timestamptz not null default now()
);

create table if not exists public.players (
  id           text primary key,
  league_id    text not null references public.leagues(id) on delete cascade,
  name         text not null,
  number       text,
  updated_at   timestamptz not null default now()
);

create table if not exists public.games (
  id              text primary key,
  league_id       text not null references public.leagues(id) on delete cascade,
  home_team_id    text not null,
  away_team_id    text not null,
  status          text not null check (status in ('scheduled','live','final')),
  scheduled_at    bigint,
  location        text,
  finished_at     bigint,
  home_on_court   text[] not null default '{}',
  away_on_court   text[] not null default '{}',
  period          int default 1,
  updated_at      timestamptz not null default now()
);

create table if not exists public.events (
  id           text primary key,
  league_id    text not null references public.leagues(id) on delete cascade,
  game_id      text not null references public.games(id) on delete cascade,
  team_id      text not null,
  player_id    text,                   -- null for team-level events (timeouts, opponent-as-team)
  type         text not null,          -- EventType union; validated client-side
  period       int not null,
  ts           bigint not null,
  note         text,
  created_at   timestamptz not null default now()
);

create index if not exists events_game_id_idx   on public.events (game_id);
create index if not exists events_league_id_idx on public.events (league_id);
create index if not exists teams_league_id_idx  on public.teams (league_id);
create index if not exists players_league_idx   on public.players (league_id);
create index if not exists games_league_idx     on public.games (league_id);

-- =============================================================================
-- 3) APP SETTINGS — a tiny key/value table for the global "trackMisses" flag
-- =============================================================================
create table if not exists public.app_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

-- =============================================================================
-- 4) ROW LEVEL SECURITY — read-anywhere, write-admin-only
-- =============================================================================
-- The goal: any signed-in user (including anonymous spectators) can READ every
-- table so they can watch live games. Only users with profiles.is_admin = true
-- can INSERT/UPDATE/DELETE. This replaces the client-side password gate with
-- real server-enforced authorization.

alter table public.profiles      enable row level security;
alter table public.leagues       enable row level security;
alter table public.teams         enable row level security;
alter table public.players       enable row level security;
alter table public.games         enable row level security;
alter table public.events        enable row level security;
alter table public.app_settings  enable row level security;

-- Helper: returns true if the current auth.uid() is an admin.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

-- Profiles: each user can read their own row; nobody can change is_admin directly
-- (that's done via the elevate_to_admin function below, which checks the password).
drop policy if exists "read own profile"  on public.profiles;
drop policy if exists "read all profiles" on public.profiles;
create policy "read own profile" on public.profiles for select using (auth.uid() = id);

-- =============================================================================
-- 4b) LEAGUE MEMBERSHIP — per-league owners & scorekeepers
-- =============================================================================
-- Roles per league:
--   owner       — full control of the league: settings, teams, members, delete.
--                 A league can have several owners (co-owners).
--   scorekeeper — runs games: create/edit/finalize games, live stat entry,
--                 add/edit players (late subs). Cannot restructure the league.
-- Super Admins (profiles.is_admin, the email allowlist) bypass membership and
-- can do anything in any league — the platform-support tier.
-- Shared recreational leagues (leagues.is_shared) are writable by ANY signed-in
-- non-anonymous user, no membership needed.

create table if not exists public.league_members (
  league_id text not null references public.leagues(id) on delete cascade,
  user_id   uuid not null references auth.users(id) on delete cascade,
  role      text not null check (role in ('owner','scorekeeper')),
  added_at  timestamptz not null default now(),
  primary key (league_id, user_id)
);
alter table public.league_members enable row level security;
drop policy if exists "read own memberships" on public.league_members;
create policy "read own memberships" on public.league_members
  for select using (user_id = auth.uid());
-- All membership mutations go through the security-definer RPCs below.

-- Single-use codes minted by Super Admins; each creates exactly one league.
create table if not exists public.creation_codes (
  code       text primary key,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  used_by    uuid,
  used_at    timestamptz
);
alter table public.creation_codes enable row level security; -- no policies: RPC-only

-- Per-league join codes (one per role); regenerating replaces the code.
create table if not exists public.league_codes (
  league_id text not null references public.leagues(id) on delete cascade,
  role      text not null check (role in ('owner','scorekeeper')),
  code      text not null unique,
  primary key (league_id, role)
);
alter table public.league_codes enable row level security; -- no policies: RPC-only

-- MIGRATION: seed the Super Admins as owners of every pre-existing league
-- (only for admins who have already signed in; supers bypass membership anyway).
insert into public.league_members (league_id, user_id, role)
select l.id, u.id, 'owner'
from public.leagues l
cross join auth.users u
where exists (select 1 from public.admin_emails a where lower(a.email) = lower(u.email))
on conflict do nothing;

-- ---- helpers -----------------------------------------------------------------
-- A real (non-anonymous) signed-in user.
create or replace function public.is_authed_user()
returns boolean language sql stable as $$
  select auth.uid() is not null
     and not coalesce((auth.jwt()->>'is_anonymous')::boolean, false);
$$;

create or replace function public.member_role(p_league_id text)
returns text language sql stable security definer set search_path = public as $$
  select role from public.league_members
  where league_id = p_league_id and user_id = auth.uid();
$$;

-- Shared community drop-in space: writable by any signed-in real user.
create or replace function public.is_shared_rec(p_league_id text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_shared and kind = 'recreational'
                   from public.leagues where id = p_league_id), false);
$$;

-- Can run games / edit players in this league.
create or replace function public.can_score(p_league_id text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin()
      or public.member_role(p_league_id) is not null
      or (public.is_shared_rec(p_league_id) and public.is_authed_user());
$$;

-- Can restructure this league (settings, teams, members, delete).
create or replace function public.is_owner(p_league_id text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or public.member_role(p_league_id) = 'owner';
$$;

-- Short human-typable code: 6 chars, no confusable characters.
create or replace function public.gen_code()
returns text language plpgsql volatile as $$
declare
  alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  out_code text := '';
  i int;
begin
  for i in 1..6 loop
    out_code := out_code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  return out_code;
end $$;

-- ---- policies ------------------------------------------------------------------
-- Read = any signed-in session (spectators). Writes are league-scoped:
--   leagues:  update/delete owner; INSERT only via the create_league RPC
--   teams:    insert/delete owner (or shared rec); update scorekeeper+ (player_ids)
--   players/games/events: scorekeeper+
--   app_settings: legacy global row, super-only
do $$
declare t text;
begin
  foreach t in array array['leagues','teams','players','games','events','app_settings']
  loop
    execute format('drop policy if exists "read_all_%1$I"  on public.%1$I;', t);
    execute format('drop policy if exists "write_admin_%1$I" on public.%1$I;', t);
    execute format('create policy "read_all_%1$I" on public.%1$I for select using (auth.uid() is not null);', t);
  end loop;
end $$;

drop policy if exists "leagues_update_owner" on public.leagues;
create policy "leagues_update_owner" on public.leagues for update
  using (public.is_owner(id)) with check (public.is_owner(id));
drop policy if exists "leagues_delete_owner" on public.leagues;
create policy "leagues_delete_owner" on public.leagues for delete
  using (public.is_owner(id));

drop policy if exists "teams_insert" on public.teams;
create policy "teams_insert" on public.teams for insert
  with check (public.can_score(league_id)); -- scorekeepers manage rosters; can_score covers shared rec too
drop policy if exists "teams_update" on public.teams;
create policy "teams_update" on public.teams for update
  using (public.can_score(league_id)) with check (public.can_score(league_id));
drop policy if exists "teams_delete" on public.teams;
create policy "teams_delete" on public.teams for delete
  using (public.is_owner(league_id));

do $$
declare t text;
begin
  foreach t in array array['players','games','events']
  loop
    execute format('drop policy if exists "%1$I_write_scorer" on public.%1$I;', t);
    execute format('create policy "%1$I_write_scorer" on public.%1$I for all
                    using (public.can_score(league_id)) with check (public.can_score(league_id));', t);
  end loop;
end $$;

drop policy if exists "app_settings_write_admin" on public.app_settings;
create policy "app_settings_write_admin" on public.app_settings for all
  using (public.is_admin()) with check (public.is_admin());

-- ---- RPCs ---------------------------------------------------------------------
-- Super Admins mint single-use league-creation codes.
create or replace function public.create_creation_code()
returns text language plpgsql security definer set search_path = public as $$
declare c text;
begin
  if not public.is_admin() then raise exception 'Only a Super Admin can create league codes.'; end if;
  c := public.gen_code();
  insert into public.creation_codes (code, created_by) values (c, auth.uid());
  return c;
end $$;

-- One field for every code. Returns what the code grants:
--   {"type":"create"}                       — valid, unused league-creation code
--   {"type":"joined","league_id":..,"role":..,"league_name":..} — joined a league
-- Raises for invalid/used codes.
create or replace function public.redeem_code(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  c text := upper(trim(p_code));
  cc record; lc record; existing text; lname text;
begin
  if not public.is_authed_user() then raise exception 'Sign in to use an invite code.'; end if;

  select * into cc from public.creation_codes where code = c;
  if found then
    if cc.used_by is not null then raise exception 'This code has already been used.'; end if;
    return jsonb_build_object('type', 'create');
  end if;

  select * into lc from public.league_codes where code = c;
  if found then
    select name into lname from public.leagues where id = lc.league_id;
    select role into existing from public.league_members
      where league_id = lc.league_id and user_id = auth.uid();
    if existing = 'owner' then
      -- never downgrade an owner via a scorekeeper code
      return jsonb_build_object('type','joined','league_id',lc.league_id,'role','owner','league_name',lname);
    end if;
    insert into public.league_members (league_id, user_id, role)
    values (lc.league_id, auth.uid(), lc.role)
    on conflict (league_id, user_id) do update set role = excluded.role;
    return jsonb_build_object('type','joined','league_id',lc.league_id,'role',lc.role,'league_name',lname);
  end if;

  raise exception 'Invalid code.';
end $$;

-- League creation. Supers need no code; everyone else consumes a single-use
-- creation code. Recreational containers need no code (personal per user, or
-- the shared community space with p_shared = true).
drop function if exists public.create_league(text,text,text,text,int,boolean,bigint,text,boolean);
drop function if exists public.create_league(text,text,text,text,int,boolean,bigint,text,boolean,boolean);
create or replace function public.create_league(
  p_id text, p_name text, p_season text, p_kind text,
  p_foul_out int, p_track_misses boolean, p_created_at bigint,
  p_code text default null, p_shared boolean default false,
  p_track_turnovers boolean default true, p_source_league text default null
) returns void language plpgsql security definer set search_path = public as $$
declare c text;
begin
  if not public.is_authed_user() then raise exception 'Sign in to create a league.'; end if;
  if exists (select 1 from public.leagues where id = p_id) then return; end if; -- idempotent

  -- Duplicating your own league is not "creating" from scratch — no code needed.
  if p_source_league is not null and public.is_owner(p_source_league) then
    null;
  elsif p_kind <> 'recreational' and not public.is_admin() then
    c := upper(trim(coalesce(p_code, '')));
    if not exists (select 1 from public.creation_codes where code = c and used_by is null) then
      raise exception 'A valid league-creation code from a Super Admin is required.';
    end if;
    update public.creation_codes set used_by = auth.uid(), used_at = now() where code = c;
  end if;

  insert into public.leagues (id, name, season, kind, foul_out_limit, track_misses, track_turnovers, is_shared, created_at)
  values (p_id, p_name, p_season, p_kind, p_foul_out, coalesce(p_track_misses, true),
          coalesce(p_track_turnovers, true), p_kind = 'recreational' and p_shared, p_created_at);

  -- Creator owns it — except the shared community space, which nobody owns.
  if not (p_kind = 'recreational' and p_shared) then
    insert into public.league_members (league_id, user_id, role)
    values (p_id, auth.uid(), 'owner') on conflict do nothing;
  end if;
end $$;

-- Owner tools ---------------------------------------------------------------
create or replace function public.get_league_codes(p_league_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare oc text; sc text;
begin
  if not public.is_owner(p_league_id) then raise exception 'Owners only.'; end if;
  insert into public.league_codes (league_id, role, code) values (p_league_id, 'owner', public.gen_code())
    on conflict (league_id, role) do nothing;
  insert into public.league_codes (league_id, role, code) values (p_league_id, 'scorekeeper', public.gen_code())
    on conflict (league_id, role) do nothing;
  select code into oc from public.league_codes where league_id = p_league_id and role = 'owner';
  select code into sc from public.league_codes where league_id = p_league_id and role = 'scorekeeper';
  return jsonb_build_object('owner', oc, 'scorekeeper', sc);
end $$;

create or replace function public.regenerate_league_code(p_league_id text, p_role text)
returns text language plpgsql security definer set search_path = public as $$
declare c text := public.gen_code();
begin
  if not public.is_owner(p_league_id) then raise exception 'Owners only.'; end if;
  insert into public.league_codes (league_id, role, code) values (p_league_id, p_role, c)
  on conflict (league_id, role) do update set code = excluded.code;
  return c;
end $$;

create or replace function public.list_members(p_league_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.is_owner(p_league_id) then raise exception 'Owners only.'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'user_id', m.user_id, 'role', m.role,
      'name', coalesce(p.name, p.email, 'Unknown'), 'email', p.email
    ) order by m.role, m.added_at)
    from public.league_members m
    left join public.profiles p on p.id = m.user_id
    where m.league_id = p_league_id
  ), '[]'::jsonb);
end $$;

create or replace function public.remove_member(p_league_id text, p_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare target_role text; owner_count int;
begin
  if not public.is_owner(p_league_id) then raise exception 'Owners only.'; end if;
  select role into target_role from public.league_members
    where league_id = p_league_id and user_id = p_user_id;
  if target_role = 'owner' then
    select count(*) into owner_count from public.league_members
      where league_id = p_league_id and role = 'owner';
    if owner_count <= 1 then raise exception 'A league must keep at least one owner.'; end if;
  end if;
  delete from public.league_members where league_id = p_league_id and user_id = p_user_id;
end $$;

create or replace function public.my_memberships()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('league_id', league_id, 'role', role)), '[]'::jsonb)
  from public.league_members where user_id = auth.uid();
$$;

grant execute on function public.create_creation_code() to authenticated;
grant execute on function public.redeem_code(text) to authenticated;
grant execute on function public.create_league(text,text,text,text,int,boolean,bigint,text,boolean,boolean,text) to authenticated;
grant execute on function public.get_league_codes(text) to authenticated;
grant execute on function public.regenerate_league_code(text,text) to authenticated;
grant execute on function public.list_members(text) to authenticated;
grant execute on function public.remove_member(text,uuid) to authenticated;
grant execute on function public.my_memberships() to authenticated;

-- Adds a player AND attaches them to their team in ONE transaction. The app
-- previously did this as two writes; a realtime re-pull landing between them
-- hydrated a player that no team claimed yet, making the new roster row
-- vanish for a beat. One transaction = every snapshot is consistent.
create or replace function public.add_player(
  p_league_id text, p_team_id text, p_player_id text, p_name text, p_number text
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.can_score(p_league_id) then raise exception 'Scorekeeper access required.'; end if;
  insert into public.players (id, league_id, name, number)
  values (p_player_id, p_league_id, p_name, p_number)
  on conflict (id) do update set name = excluded.name, number = excluded.number;
  update public.teams
     set player_ids = array_append(array_remove(player_ids, p_player_id), p_player_id)
   where id = p_team_id and league_id = p_league_id;
end $$;
grant execute on function public.add_player(text,text,text,text,text) to authenticated;

-- =============================================================================
-- 5) ADMIN ELEVATION — password verified server-side, never sent to the client
-- =============================================================================
-- The admin password is stored in a SECRETS table that only this function can
-- read (via security definer). The client calls this function with the password
-- the user typed; if it matches, the caller's profile is flipped to is_admin.
-- The password itself is never exposed to clients via SELECT, ever.
create table if not exists public.admin_secret (
  id       int primary key default 1,
  password text not null,
  check (id = 1)
);
alter table public.admin_secret enable row level security;
-- Note: no policies on admin_secret = nobody can read or write it via the API.
-- Only security-definer functions running as the table owner can access it.

-- Seed with the existing app password if not already set.
insert into public.admin_secret (id, password) values (1, 'bpblcourtside')
on conflict (id) do nothing;

create or replace function public.elevate_to_admin(password_attempt text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  ok boolean;
begin
  if auth.uid() is null then
    return false; -- must be signed in (anonymous sessions count)
  end if;

  select password = password_attempt into ok from public.admin_secret where id = 1;
  if not ok then
    return false;
  end if;

  update public.profiles set is_admin = true where id = auth.uid();
  return true;
end;
$$;

grant execute on function public.elevate_to_admin(text) to anon, authenticated;

create or replace function public.lock_admin()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then return; end if;
  update public.profiles set is_admin = false where id = auth.uid();
end;
$$;

grant execute on function public.lock_admin() to anon, authenticated;

-- =============================================================================
-- 6) REALTIME — publish event changes so live games stream to spectators
-- =============================================================================
-- The supabase_realtime publication ships with the project; we add our tables.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='events') then
    alter publication supabase_realtime add table public.events;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='games') then
    alter publication supabase_realtime add table public.games;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='leagues') then
    alter publication supabase_realtime add table public.leagues;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='teams') then
    alter publication supabase_realtime add table public.teams;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='players') then
    alter publication supabase_realtime add table public.players;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='app_settings') then
    alter publication supabase_realtime add table public.app_settings;
  end if;
end $$;

-- =============================================================================
-- 6b) SPONSOR PROMOS — Super-Admin-managed marketing cards (e.g. BPBL Clothing)
-- =============================================================================
-- Small table of sponsor promos shown on Home (rotating), the FinalScore
-- screen, and the spectator live view. Images are stored as compressed data
-- URIs for V1 (same approach as team logos); migrate to Storage if the library
-- grows. Public read (everyone sees promos); Super-Admin-only writes.
create table if not exists public.promos (
  id           text primary key,
  sponsor_name text,
  title        text not null,
  tagline      text,
  image        text,            -- data URI (compressed) or null
  link         text,            -- optional tap-through URL
  active       boolean not null default true,
  show_on_home boolean not null default false,
  taps         integer not null default 0,
  created_at   bigint not null
);
alter table public.promos add column if not exists show_on_home boolean not null default false;
alter table public.promos enable row level security;

drop policy if exists "promos_read_all"   on public.promos;
drop policy if exists "promos_write_admin" on public.promos;
-- Anyone signed in (incl. anonymous spectators) can read promos.
create policy "promos_read_all" on public.promos
  for select using (auth.uid() is not null);
-- Only Super Admins may insert/update/delete.
create policy "promos_write_admin" on public.promos
  for all using (public.is_admin()) with check (public.is_admin());

-- Tap counter: any signed-in user may increment taps (for sponsor ROI), but
-- nothing else. SECURITY DEFINER so the bump bypasses the admin-only write
-- policy while still only ever touching the taps column.
create or replace function public.bump_promo_tap(p_id text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.promos set taps = taps + 1 where id = p_id;
$$;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'promos'
  ) then
    alter publication supabase_realtime add table public.promos;
  end if;
end $$;

-- =============================================================================
-- 7) PING — keeps the project from auto-pausing after 7 idle days
-- =============================================================================
-- An external scheduler (GitHub Actions / UptimeRobot) calls this function to
-- register activity. Safe for anonymous callers — it does nothing destructive.
create or replace function public.ping()
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select now();
$$;

grant execute on function public.ping() to anon, authenticated;
