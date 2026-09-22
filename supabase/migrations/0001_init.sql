-- ============================================================
-- VoiceChessmate — initial schema
--
-- Design note: the browser never talks to these tables. All access goes
-- through Next.js route handlers using the service role key, because identity
-- here is two-tier (anonymous device OR Supabase user) and RLS alone cannot
-- express the anonymous half. RLS is still enabled on every table and denies
-- everything by default, so a leaked anon key grants nothing.
--
-- See contracts/identity-and-quota.md and contracts/game-persistence.md
-- ============================================================

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- profiles — one row per signed-in account
-- ------------------------------------------------------------
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  rating       integer not null default 1200 check (rating >= 100),
  games_played integer not null default 0 check (games_played >= 0),
  tier         text    not null default 'free',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ------------------------------------------------------------
-- devices — anonymous identity, and the link to an account once claimed
-- ------------------------------------------------------------
create table if not exists public.devices (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  last_seen  timestamptz not null default now()
);

create index if not exists devices_user_id_idx on public.devices(user_id);

-- ------------------------------------------------------------
-- voice_budget — the thing that stops the bill running away
--
-- One row per identity. `subject` is 'device:<uuid>' or 'user:<uuid>' so a
-- single unique key covers both tiers. Reservations are decremented
-- atomically by reserve_voice_seconds() below; never read-then-write.
-- ------------------------------------------------------------
create table if not exists public.voice_budget (
  subject         text primary key,
  reserved_seconds integer not null default 0 check (reserved_seconds >= 0),
  window_start    timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ------------------------------------------------------------
-- voice_ledger — one row per minted token, so spend is attributable
-- ------------------------------------------------------------
create table if not exists public.voice_ledger (
  id               uuid primary key default gen_random_uuid(),
  subject          text not null,
  reserved_seconds integer not null check (reserved_seconds > 0),
  actual_seconds   integer check (actual_seconds >= 0),
  reconciled_at    timestamptz,
  created_at       timestamptz not null default now()
);

create index if not exists voice_ledger_subject_idx on public.voice_ledger(subject, created_at desc);

-- ------------------------------------------------------------
-- games
-- ------------------------------------------------------------
do $$ begin
  create type game_status as enum ('in_progress', 'complete', 'abandoned');
exception when duplicate_object then null; end $$;

do $$ begin
  create type game_result as enum ('win', 'loss', 'draw');
exception when duplicate_object then null; end $$;

create table if not exists public.games (
  id           uuid primary key default gen_random_uuid(),
  subject      text not null,                       -- owning identity
  user_id      uuid references auth.users(id) on delete cascade,
  device_id    uuid references public.devices(id) on delete set null,
  pgn          text not null default '',
  fen          text not null,
  move_count   integer not null default 0 check (move_count >= 0),
  difficulty   text not null default 'intermediate',
  time_control text not null default 'casual',
  status       game_status not null default 'in_progress',
  result       game_result,
  end_reason   text,
  rating_delta integer,
  rated_at     timestamptz,                         -- set once; guards double-rating
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists games_subject_idx  on public.games(subject, updated_at desc);
create index if not exists games_resume_idx   on public.games(subject, status, updated_at desc);
create index if not exists games_user_idx     on public.games(user_id, updated_at desc);

-- Guard case 13 of the persistence contract at the storage layer too: a row
-- claiming to be complete must say how it ended.
alter table public.games drop constraint if exists games_complete_has_result;
alter table public.games add constraint games_complete_has_result
  check (status <> 'complete' or result is not null);

-- ------------------------------------------------------------
-- reserve_voice_seconds — atomic budget decrement
--
-- Returns the number of seconds actually granted (0 = refused). The row lock
-- is what makes contract case 17 hold: two concurrent mints with one session
-- of budget left cannot both succeed.
-- ------------------------------------------------------------
create or replace function public.reserve_voice_seconds(
  p_subject     text,
  p_want        integer,
  p_allowance   integer,
  p_window_secs integer
) returns integer
language plpgsql
as $$
declare
  v_reserved integer;
  v_start    timestamptz;
  v_granted  integer;
begin
  insert into public.voice_budget (subject, reserved_seconds, window_start, updated_at)
  values (p_subject, 0, now(), now())
  on conflict (subject) do nothing;

  -- FOR UPDATE serialises concurrent mints for this subject. Without it two
  -- requests can both read the same remaining budget and both succeed, which
  -- is exactly what contract case 17 forbids.
  select reserved_seconds, window_start
    into v_reserved, v_start
    from public.voice_budget
   where subject = p_subject
     for update;

  -- Roll the window if it has elapsed (contract case 9).
  if now() - v_start > make_interval(secs => p_window_secs) then
    v_reserved := 0;
    update public.voice_budget
       set reserved_seconds = 0, window_start = now(), updated_at = now()
     where subject = p_subject;
  end if;

  -- Grant what is left, up to what was asked. Case 7: a partial grant is a
  -- grant, not a refusal. Case 8: zero remaining returns 0, and the caller
  -- turns that into a 429.
  v_granted := least(p_want, greatest(p_allowance - v_reserved, 0));

  if v_granted > 0 then
    update public.voice_budget
       set reserved_seconds = reserved_seconds + v_granted, updated_at = now()
     where subject = p_subject;
  end if;

  return v_granted;
end;
$$;

-- ------------------------------------------------------------
-- release_voice_seconds — refund on reconcile or failed mint
-- ------------------------------------------------------------
create or replace function public.release_voice_seconds(
  p_subject text,
  p_seconds integer
) returns void
language sql
as $$
  update public.voice_budget
     set reserved_seconds = greatest(reserved_seconds - greatest(p_seconds, 0), 0),
         updated_at       = now()
   where subject = p_subject;
$$;

-- ------------------------------------------------------------
-- Row Level Security — deny by default on everything.
--
-- The service role bypasses RLS, which is how the route handlers work. These
-- policies exist so that the public anon key (which ships to the browser for
-- auth) can never read or write application data.
-- ------------------------------------------------------------
alter table public.profiles     enable row level security;
alter table public.devices      enable row level security;
alter table public.voice_budget enable row level security;
alter table public.voice_ledger enable row level security;
alter table public.games        enable row level security;

-- The one exception: a signed-in user may read their own profile directly,
-- which keeps the account header cheap. Still no writes from the browser.
drop policy if exists profiles_self_read on public.profiles;
create policy profiles_self_read on public.profiles
  for select using (auth.uid() = id);

-- No policies on the remaining tables. With RLS enabled and no policy, every
-- anon/authenticated request is denied. That is deliberate, not an omission.

-- ------------------------------------------------------------
-- Create a profile row automatically on signup
-- ------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, split_part(coalesce(new.email, ''), '@', 1))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
