-- Al Dawri — core schema
-- Times are stored as timestamptz; opening hours are in Kuwait local time (Asia/Kuwait, UTC+3).

create extension if not exists btree_gist;

-- ---------------------------------------------------------------- profiles
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null default '',
  position text not null default 'MID' check (position in ('GK', 'DEF', 'MID', 'FWD')),
  level text not null default 'intermediate' check (level in ('beginner', 'intermediate', 'advanced')),
  role text not null default 'player' check (role in ('player', 'owner', 'academy', 'admin')),
  avatar_url text,
  created_at timestamptz not null default now()
);
comment on table public.profiles is 'Public player card. Phone numbers stay in auth.users and are never exposed here.';

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- pitches
create table public.pitches (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.profiles (id) on delete set null,
  name_ar text not null,
  name_en text not null,
  area_ar text not null,
  area_en text not null,
  address_ar text not null default '',
  address_en text not null default '',
  governorate text not null check (governorate in ('capital', 'hawalli', 'farwaniya', 'ahmadi', 'jahra', 'mubarak_alkabeer')),
  price_per_hour numeric(8, 3) not null check (price_per_hour > 0),
  sizes int[] not null default '{5}',
  surface text not null default 'artificial' check (surface in ('artificial', 'natural')),
  indoor boolean not null default false,
  amenities text[] not null default '{}',
  open_from int not null default 14 check (open_from between 0 and 23),
  open_to int not null default 24 check (open_to between 1 and 24 and open_to > open_from),
  lat double precision,
  lng double precision,
  rating numeric(2, 1) not null default 0,
  reviews int not null default 0,
  tint text[] not null default '{#0B2E6F,#1E56B3}',
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index pitches_owner_idx on public.pitches (owner_id);

-- ---------------------------------------------------------------- bookings
create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  pitch_id uuid not null references public.pitches (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete set null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  size int not null default 5,
  total numeric(8, 3) not null default 0,
  status text not null default 'confirmed' check (status in ('confirmed', 'cancelled', 'blocked')),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at),
  -- The database itself refuses two live bookings that overlap on the same pitch.
  constraint bookings_no_overlap exclude using gist (pitch_id with =, tstzrange(starts_at, ends_at) with &&)
    where (status <> 'cancelled')
);
create index bookings_user_idx on public.bookings (user_id, starts_at);
create index bookings_pitch_idx on public.bookings (pitch_id, starts_at);

-- ---------------------------------------------------------------- matches
create table public.matches (
  id uuid primary key default gen_random_uuid(),
  pitch_id uuid not null references public.pitches (id) on delete cascade,
  booking_id uuid references public.bookings (id) on delete set null,
  organizer_id uuid references public.profiles (id) on delete set null,
  starts_at timestamptz not null,
  duration_hours numeric(3, 1) not null default 1,
  format int not null default 5 check (format in (5, 7, 11)),
  level text not null default 'intermediate' check (level in ('beginner', 'intermediate', 'advanced')),
  price_per_player numeric(8, 3) not null default 0,
  max_players int not null check (max_players between 2 and 30),
  status text not null default 'open' check (status in ('open', 'cancelled', 'played')),
  created_at timestamptz not null default now()
);
create index matches_starts_idx on public.matches (starts_at);

create table public.match_players (
  match_id uuid not null references public.matches (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (match_id, user_id)
);
create index match_players_user_idx on public.match_players (user_id);

-- ---------------------------------------------------------------- tournaments
create table public.tournaments (
  id uuid primary key default gen_random_uuid(),
  name_ar text not null,
  name_en text not null,
  pitch_id uuid references public.pitches (id) on delete set null,
  format int not null default 5,
  status text not null default 'open' check (status in ('open', 'live', 'finished')),
  starts_on date not null,
  max_teams int not null,
  entry_fee numeric(8, 3) not null default 0,
  prize numeric(9, 3) not null default 0,
  tint text[] not null default '{#0B2E6F,#04132F}'
);

create table public.tournament_teams (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  name_ar text not null,
  name_en text not null,
  color text not null default '#0B2E6F',
  captain_id uuid references public.profiles (id) on delete set null,
  played int not null default 0,
  won int not null default 0,
  drawn int not null default 0,
  lost int not null default 0,
  gf int not null default 0,
  ga int not null default 0,
  created_at timestamptz not null default now()
);
create index tournament_teams_t_idx on public.tournament_teams (tournament_id);
create unique index tournament_teams_one_per_captain on public.tournament_teams (tournament_id, captain_id) where captain_id is not null;

create table public.fixtures (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  home_id uuid not null references public.tournament_teams (id) on delete cascade,
  away_id uuid not null references public.tournament_teams (id) on delete cascade,
  starts_at timestamptz not null,
  home_score int,
  away_score int
);
create index fixtures_t_idx on public.fixtures (tournament_id);

-- ---------------------------------------------------------------- row level security
alter table public.profiles enable row level security;
alter table public.pitches enable row level security;
alter table public.bookings enable row level security;
alter table public.matches enable row level security;
alter table public.match_players enable row level security;
alter table public.tournaments enable row level security;
alter table public.tournament_teams enable row level security;
alter table public.fixtures enable row level security;

create policy "profiles are readable by signed-in users" on public.profiles
  for select to authenticated using (true);
create policy "users update their own profile" on public.profiles
  for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
-- Players can edit their card but never their role.
revoke update on public.profiles from authenticated, anon;
grant update (name, position, level, avatar_url) on public.profiles to authenticated;

create policy "active pitches are public" on public.pitches
  for select to anon, authenticated using (active or owner_id = (select auth.uid()));
create policy "owners update their pitches" on public.pitches
  for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
-- Owners may change price and opening hours only.
revoke update on public.pitches from authenticated, anon;
grant update (price_per_hour, open_from, open_to, active) on public.pitches to authenticated;

create policy "players see their bookings, owners see bookings on their pitches" on public.bookings
  for select to authenticated using (
    user_id = (select auth.uid())
    or exists (select 1 from public.pitches p where p.id = pitch_id and p.owner_id = (select auth.uid()))
  );

create policy "matches are public" on public.matches for select to anon, authenticated using (true);
create policy "match lineups are public" on public.match_players for select to anon, authenticated using (true);
create policy "tournaments are public" on public.tournaments for select to anon, authenticated using (true);
create policy "teams are public" on public.tournament_teams for select to anon, authenticated using (true);
create policy "fixtures are public" on public.fixtures for select to anon, authenticated using (true);
-- All writes other than profile/pitch updates go through the security-definer functions below.
