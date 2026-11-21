-- Al Dawri update 4: full tournaments + 6-a-side (6×6).
-- Paste all of this in Supabase → SQL Editor → Run.

-- Al Dawri — full tournaments.
-- Pitch owners (on their own pitches) and admins organise tournaments; owners' tournaments need admin
-- approval and carry an organising fee (commission) owed to Al Dawri. Captains register teams and
-- invite players with a code. Organisers confirm payment, generate the schedule (league, knockout, or
-- groups then knockout; the pitch is blocked automatically), record results with scorers, cards and
-- MVP, upload goal clips, and the table, bracket, suspensions and awards update themselves.

-- ---------------------------------------------------------------- settings & commission
create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null
);
alter table public.app_settings enable row level security;
drop policy if exists "settings are readable" on public.app_settings;
create policy "settings are readable" on public.app_settings for select to anon, authenticated using (true);
insert into public.app_settings (key, value) values ('commission_rate', '0.05') on conflict (key) do nothing;

alter table public.pitches add column if not exists commission_rate numeric(5, 4);

-- ---------------------------------------------------------------- tournaments
alter table public.tournaments drop constraint if exists tournaments_status_check;
alter table public.tournaments add constraint tournaments_status_check
  check (status in ('pending', 'open', 'closed', 'live', 'finished', 'rejected', 'cancelled'));
alter table public.tournaments
  add column if not exists organizer_id uuid references public.profiles (id) on delete set null,
  add column if not exists format_type text not null default 'league' check (format_type in ('league', 'knockout', 'groups')),
  add column if not exists groups_count int not null default 2 check (groups_count in (2, 4)),
  add column if not exists min_players int not null default 5 check (min_players between 1 and 30),
  add column if not exists max_players int not null default 10 check (max_players between 1 and 30),
  add column if not exists age_category text not null default 'open',
  add column if not exists prize_second numeric(9, 3) not null default 0,
  add column if not exists rules text not null default '',
  add column if not exists commission_rate numeric(5, 4) not null default 0,
  add column if not exists reject_reason text not null default '',
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists finished_at timestamptz;

alter table public.tournament_teams
  add column if not exists status text not null default 'approved' check (status in ('pending', 'approved', 'rejected', 'withdrawn')),
  add column if not exists paid boolean not null default false,
  add column if not exists group_label text;

-- Invite codes are private to the team and the organiser.
create table if not exists public.team_invites (
  team_id uuid primary key references public.tournament_teams (id) on delete cascade,
  code text not null unique
);
alter table public.team_invites enable row level security;

create table if not exists public.team_players (
  team_id uuid not null references public.tournament_teams (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (team_id, user_id),
  unique (tournament_id, user_id)
);
create index if not exists team_players_user_idx on public.team_players (user_id);
alter table public.team_players enable row level security;
drop policy if exists "rosters are public" on public.team_players;
create policy "rosters are public" on public.team_players for select to anon, authenticated using (true);

-- Existing captains become the first player of their team.
insert into public.team_players (team_id, user_id, tournament_id)
select id, captain_id, tournament_id from public.tournament_teams where captain_id is not null
on conflict do nothing;

-- ---------------------------------------------------------------- fixtures
alter table public.fixtures alter column home_id drop not null;
alter table public.fixtures alter column away_id drop not null;
alter table public.fixtures alter column starts_at drop not null;
alter table public.fixtures
  add column if not exists stage text not null default 'league' check (stage in ('league', 'group', 'knockout')),
  add column if not exists round_no int not null default 1,
  add column if not exists group_label text,
  add column if not exists bracket_pos int,
  add column if not exists next_fixture uuid references public.fixtures (id) on delete set null,
  add column if not exists next_slot text check (next_slot in ('home', 'away')),
  add column if not exists status text not null default 'scheduled' check (status in ('scheduled', 'played', 'walkover', 'bye')),
  add column if not exists pens_home int,
  add column if not exists pens_away int,
  add column if not exists mvp_id uuid references public.profiles (id) on delete set null,
  add column if not exists booking_id uuid references public.bookings (id) on delete set null,
  add column if not exists reminded boolean not null default false;
update public.fixtures set status = 'played' where home_score is not null and status = 'scheduled';

create table if not exists public.match_events (
  id uuid primary key default gen_random_uuid(),
  fixture_id uuid not null references public.fixtures (id) on delete cascade,
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  team_id uuid not null references public.tournament_teams (id) on delete cascade,
  player_id uuid references public.profiles (id) on delete set null,
  kind text not null check (kind in ('goal', 'own_goal', 'yellow', 'red')),
  minute int check (minute between 0 and 200)
);
create index if not exists match_events_fixture_idx on public.match_events (fixture_id);
create index if not exists match_events_tournament_idx on public.match_events (tournament_id, kind);
alter table public.match_events enable row level security;
drop policy if exists "match events are public" on public.match_events;
create policy "match events are public" on public.match_events for select to anon, authenticated using (true);

create table if not exists public.tournament_awards (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  kind text not null check (kind in ('champion', 'runner_up', 'top_scorer', 'best_player', 'best_keeper')),
  team_id uuid references public.tournament_teams (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete cascade,
  value int
);
create index if not exists tournament_awards_t_idx on public.tournament_awards (tournament_id);
alter table public.tournament_awards enable row level security;
drop policy if exists "awards are public" on public.tournament_awards;
create policy "awards are public" on public.tournament_awards for select to anon, authenticated using (true);

create table if not exists public.highlights (
  id uuid primary key default gen_random_uuid(),
  fixture_id uuid not null references public.fixtures (id) on delete cascade,
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  uploader_id uuid references public.profiles (id) on delete set null,
  player_id uuid references public.profiles (id) on delete set null,
  path text not null,
  likes int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists highlights_fixture_idx on public.highlights (fixture_id);
create index if not exists highlights_tournament_idx on public.highlights (tournament_id, created_at desc);
alter table public.highlights enable row level security;
drop policy if exists "highlights are public" on public.highlights;
create policy "highlights are public" on public.highlights for select to anon, authenticated using (true);

create table if not exists public.highlight_likes (
  highlight_id uuid not null references public.highlights (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  primary key (highlight_id, user_id)
);
alter table public.highlight_likes enable row level security;
drop policy if exists "users see their likes" on public.highlight_likes;
create policy "users see their likes" on public.highlight_likes for select to authenticated using (user_id = (select auth.uid()));

create table if not exists public.tournament_dues (
  tournament_id uuid primary key references public.tournaments (id) on delete cascade,
  amount numeric(9, 3) not null,
  paid_at timestamptz not null default now(),
  marked_by uuid references public.profiles (id) on delete set null
);
alter table public.tournament_dues enable row level security;

-- Pending / rejected tournaments are only visible to their organiser and admins.
drop policy if exists "tournaments are public" on public.tournaments;
drop policy if exists "published tournaments are public" on public.tournaments;
drop policy if exists "organisers and admins see their tournaments" on public.tournaments;
create policy "published tournaments are public" on public.tournaments for select to anon, authenticated
  using (status in ('open', 'closed', 'live', 'finished'));
create policy "organisers and admins see their tournaments" on public.tournaments for select to authenticated
  using (organizer_id = (select auth.uid()) or public.is_admin());

-- ---------------------------------------------------------------- video storage
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('highlights', 'highlights', true, 62914560, '{video/mp4,video/quicktime,video/webm,video/3gpp}')
on conflict (id) do nothing;

create or replace function public._can_manage_tournament(p_t uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.tournaments where id = p_t and organizer_id = (select auth.uid())) or public.is_admin()
$$;

-- Storage paths look like "<tournament id>/<fixture id>/<file>"; only the organiser may write there.
create or replace function public._can_manage_tournament_path(p_name text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  return public._can_manage_tournament(split_part(p_name, '/', 1)::uuid);
exception when others then
  return false;
end $$;

drop policy if exists "organisers upload highlights" on storage.objects;
drop policy if exists "organisers delete highlights" on storage.objects;
create policy "organisers upload highlights" on storage.objects for insert to authenticated
  with check (bucket_id = 'highlights' and public._can_manage_tournament_path(name));
create policy "organisers delete highlights" on storage.objects for delete to authenticated
  using (bucket_id = 'highlights' and public._can_manage_tournament_path(name));

-- ---------------------------------------------------------------- helpers
create or replace function public._require_manage(p_t uuid) returns public.tournaments
language plpgsql security definer set search_path = '' as $$
declare v public.tournaments;
begin
  select * into v from public.tournaments where id = p_t;
  if not found then raise exception 'not_found'; end if;
  if not public._can_manage_tournament(p_t) then raise exception 'not_organizer'; end if;
  return v;
end $$;

create or replace function public._notify_team(p_team uuid, p_kind text, p_title_ar text, p_title_en text, p_body_ar text, p_body_en text, p_data jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  for r in select user_id from public.team_players where team_id = p_team loop
    perform public._notify(r.user_id, p_kind, p_title_ar, p_title_en, p_body_ar, p_body_en, p_data);
  end loop;
end $$;

create or replace function public._team_name(p_team uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((select name_ar from public.tournament_teams where id = p_team), '؟')
$$;

create or replace function public.commission_rate_for(p_pitch uuid) returns numeric
language sql stable security definer set search_path = '' as $$
  select coalesce((select commission_rate from public.pitches where id = p_pitch),
                  (select (value #>> '{}')::numeric from public.app_settings where key = 'commission_rate'), 0.05)
$$;

-- Organising fee owed for a tournament: rate × entry fee × teams that paid.
create or replace function public._dues_amount(p_t uuid) returns numeric
language sql stable security definer set search_path = '' as $$
  select round(t.commission_rate * t.entry_fee * (select count(*) from public.tournament_teams tt where tt.tournament_id = t.id and tt.paid), 3)
  from public.tournaments t where t.id = p_t
$$;

-- ---------------------------------------------------------------- create & review
create or replace function public.create_tournament(
  p_name text, p_pitch uuid, p_format int, p_type text, p_groups int, p_starts_on date, p_max_teams int,
  p_min_players int, p_max_players int, p_age text, p_fee numeric, p_prize numeric, p_prize2 numeric, p_rules text
) returns public.tournaments
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_admin boolean := public.is_admin();
  v_pitch public.pitches;
  v public.tournaments;
  v_tints text[][] := array[array['#0B2E6F', '#04132F'], array['#5A1E1E', '#1F0A0A'], array['#0F4A3A', '#05201A'], array['#3A2A6F', '#140D2F'], array['#6A4A0B', '#2A1D04']];
  v_i int := 1 + floor(random() * 5)::int;
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;
  select * into v_pitch from public.pitches where id = p_pitch and status = 'approved';
  if not found then raise exception 'pitch_not_found'; end if;
  if not v_admin and v_pitch.owner_id is distinct from v_uid then raise exception 'not_your_pitch'; end if;
  if length(trim(coalesce(p_name, ''))) < 3 then raise exception 'invalid_name'; end if;
  if p_format not in (5, 6, 7, 11) or not (p_format = any (v_pitch.sizes)) then raise exception 'invalid_size'; end if;
  if p_type not in ('league', 'knockout', 'groups') then raise exception 'invalid_format'; end if;
  if p_max_teams < 3 or p_max_teams > 32 then raise exception 'invalid_teams'; end if;
  if p_type = 'groups' and p_max_teams < coalesce(p_groups, 2) * 2 then raise exception 'invalid_teams'; end if;
  if p_min_players < 1 or p_max_players < p_min_players or p_max_players > 30 then raise exception 'invalid_players'; end if;
  if p_starts_on < (now() at time zone 'Asia/Kuwait')::date then raise exception 'invalid_date'; end if;
  if coalesce(p_fee, 0) < 0 or coalesce(p_prize, 0) < 0 or coalesce(p_prize2, 0) < 0 then raise exception 'invalid_price'; end if;
  -- Owners must settle organising fees of finished tournaments first.
  if not v_admin and exists (
    select 1 from public.tournaments t
    where t.organizer_id = v_uid and t.status = 'finished' and public._dues_amount(t.id) > 0
      and not exists (select 1 from public.tournament_dues d where d.tournament_id = t.id)
  ) then raise exception 'unpaid_dues'; end if;

  insert into public.tournaments (name_ar, name_en, pitch_id, format, status, starts_on, max_teams, entry_fee, prize, prize_second,
                                  organizer_id, format_type, groups_count, min_players, max_players, age_category, rules, commission_rate, tint)
  values (trim(p_name), trim(p_name), p_pitch, p_format, case when v_admin then 'open' else 'pending' end, p_starts_on, p_max_teams,
          coalesce(p_fee, 0), coalesce(p_prize, 0), coalesce(p_prize2, 0), v_uid, p_type, coalesce(p_groups, 2), p_min_players, p_max_players,
          coalesce(nullif(trim(p_age), ''), 'open'), left(coalesce(p_rules, ''), 1500),
          case when v_admin and v_pitch.owner_id is distinct from v_uid then 0 else public.commission_rate_for(p_pitch) end,
          array[v_tints[v_i][1], v_tints[v_i][2]])
  returning * into v;
  -- Admins running a tournament on their own account owe nothing to themselves.
  if v_admin then update public.tournaments set commission_rate = 0 where id = v.id and organizer_id in (select id from public.profiles where role = 'admin') returning * into v; end if;
  return v;
end $$;

create or replace function public.admin_review_tournament(p_t uuid, p_approve boolean, p_reason text default '')
returns void language plpgsql security definer set search_path = '' as $$
declare v public.tournaments;
begin
  perform public._require_admin();
  select * into v from public.tournaments where id = p_t and status = 'pending';
  if not found then raise exception 'not_found'; end if;
  update public.tournaments set status = case when p_approve then 'open' else 'rejected' end, reject_reason = left(coalesce(p_reason, ''), 300) where id = p_t;
  if p_approve then
    perform public._notify(v.organizer_id, 'tournament_approved', 'بطولتك انقبلت 🏆', 'Your tournament is live 🏆',
      v.name_ar || ' صارت ظاهرة والتسجيل مفتوح للفرق.', v.name_en || ' is published and open for team registration.', jsonb_build_object('tournament_id', p_t));
  else
    perform public._notify(v.organizer_id, 'tournament_rejected', 'البطولة ما انقبلت', 'Tournament not approved',
      coalesce(nullif(p_reason, ''), 'تواصل مع الدعم الفني للتفاصيل.'), coalesce(nullif(p_reason, ''), 'Contact support for details.'), jsonb_build_object('tournament_id', p_t));
  end if;
end $$;

create or replace function public.admin_set_tournament_status(p_tournament uuid, p_status text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public._require_admin();
  if p_status not in ('open', 'closed', 'live', 'finished', 'cancelled') then raise exception 'invalid_status'; end if;
  update public.tournaments set status = p_status, finished_at = case when p_status = 'finished' then now() else finished_at end where id = p_tournament;
end $$;

-- ---------------------------------------------------------------- teams
create or replace function public.register_team(p_tournament uuid, p_name text)
returns public.tournament_teams language plpgsql security definer set search_path = '' as $$
declare v_t public.tournaments; v_count int; v_row public.tournament_teams; v_colors text[] := array['#3E8DD8', '#E65100', '#2E7D32', '#AD1457', '#6A1B9A', '#00838F', '#C62828', '#283593'];
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  if length(trim(p_name)) < 2 then raise exception 'invalid_name'; end if;
  select * into v_t from public.tournaments where id = p_tournament for update;
  if not found or v_t.status <> 'open' then raise exception 'registration_closed'; end if;
  if exists (select 1 from public.team_players where tournament_id = p_tournament and user_id = auth.uid()) then raise exception 'already_registered'; end if;
  select count(*) into v_count from public.tournament_teams where tournament_id = p_tournament and status in ('pending', 'approved');
  if v_count >= v_t.max_teams then raise exception 'tournament_full'; end if;
  insert into public.tournament_teams (tournament_id, name_ar, name_en, captain_id, color, status)
  values (p_tournament, trim(p_name), trim(p_name), auth.uid(), v_colors[1 + (v_count % 8)], case when v_t.entry_fee > 0 then 'pending' else 'approved' end)
  returning * into v_row;
  insert into public.team_players (team_id, user_id, tournament_id) values (v_row.id, auth.uid(), p_tournament);
  insert into public.team_invites (team_id, code) values (v_row.id, upper(substr(md5(random()::text || v_row.id::text), 1, 6)));
  perform public._notify(v_t.organizer_id, 'team_registered', 'فريق جديد سجّل 🛡️', 'New team registered 🛡️',
    trim(p_name) || ' سجّل في ' || v_t.name_ar, trim(p_name) || ' registered for ' || v_t.name_en, jsonb_build_object('tournament_id', p_tournament));
  return v_row;
exception when unique_violation then
  raise exception 'already_registered';
end $$;

create or replace function public.team_invite_code(p_team uuid) returns text
language plpgsql stable security definer set search_path = '' as $$
declare v_tt public.tournament_teams;
begin
  select * into v_tt from public.tournament_teams where id = p_team;
  if not found then raise exception 'not_found'; end if;
  if not (exists (select 1 from public.team_players where team_id = p_team and user_id = auth.uid()) or public._can_manage_tournament(v_tt.tournament_id)) then
    raise exception 'not_allowed';
  end if;
  return (select code from public.team_invites where team_id = p_team);
end $$;

create or replace function public.join_team_by_code(p_code text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_team uuid; v_tt public.tournament_teams; v_t public.tournaments; v_n int; v_name text;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  select team_id into v_team from public.team_invites where code = upper(trim(p_code));
  if not found then raise exception 'invalid_code'; end if;
  select * into v_tt from public.tournament_teams where id = v_team;
  select * into v_t from public.tournaments where id = v_tt.tournament_id;
  if v_tt.status in ('rejected', 'withdrawn') or v_t.status not in ('open', 'closed', 'live') then raise exception 'registration_closed'; end if;
  if exists (select 1 from public.team_players where tournament_id = v_t.id and user_id = auth.uid()) then raise exception 'already_registered'; end if;
  select count(*) into v_n from public.team_players where team_id = v_team;
  if v_n >= v_t.max_players then raise exception 'team_full'; end if;
  insert into public.team_players (team_id, user_id, tournament_id) values (v_team, auth.uid(), v_t.id);
  select coalesce(name, '') into v_name from public.profiles where id = auth.uid();
  perform public._notify(v_tt.captain_id, 'team_joined', 'لاعب انضم لفريقك', 'A player joined your team',
    v_name || ' انضم لـ' || v_tt.name_ar, v_name || ' joined ' || v_tt.name_en, jsonb_build_object('tournament_id', v_t.id, 'team_id', v_team));
  return v_team;
end $$;

-- A player leaves, or the captain / organiser removes them. The captain cannot leave their own team.
create or replace function public.remove_team_player(p_team uuid, p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_tt public.tournament_teams;
begin
  select * into v_tt from public.tournament_teams where id = p_team;
  if not found then raise exception 'not_found'; end if;
  if p_user = v_tt.captain_id then raise exception 'captain_cannot_leave'; end if;
  if not (p_user = auth.uid() or v_tt.captain_id = auth.uid() or public._can_manage_tournament(v_tt.tournament_id)) then raise exception 'not_allowed'; end if;
  delete from public.team_players where team_id = p_team and user_id = p_user;
end $$;

-- Organiser decision on a team: approve / reject, and whether the entry fee was paid at the pitch.
create or replace function public.organizer_review_team(p_team uuid, p_status text, p_paid boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_tt public.tournament_teams; v_t public.tournaments; v_count int;
begin
  select * into v_tt from public.tournament_teams where id = p_team;
  if not found then raise exception 'not_found'; end if;
  v_t := public._require_manage(v_tt.tournament_id);
  if p_status not in ('pending', 'approved', 'rejected') then raise exception 'invalid_status'; end if;
  update public.tournament_teams set status = p_status, paid = coalesce(p_paid, paid) where id = p_team;
  if p_status = 'approved' and v_tt.status <> 'approved' then
    perform public._notify_team(p_team, 'team_approved', 'فريقك انقبل بالبطولة ✅', 'Your team is in ✅',
      v_tt.name_ar || ' صار رسمياً في ' || v_t.name_ar, v_tt.name_en || ' is confirmed for ' || v_t.name_en, jsonb_build_object('tournament_id', v_t.id, 'team_id', p_team));
  elsif p_status = 'rejected' and v_tt.status <> 'rejected' then
    perform public._notify(v_tt.captain_id, 'team_rejected', 'تسجيل الفريق ما انقبل', 'Team registration declined',
      v_tt.name_ar || ' · ' || v_t.name_ar, v_tt.name_en || ' · ' || v_t.name_en, jsonb_build_object('tournament_id', v_t.id));
  end if;
  if coalesce(p_paid, false) and not v_tt.paid then
    perform public._notify(v_tt.captain_id, 'team_paid', 'تم تأكيد الدفع 💵', 'Payment confirmed 💵',
      'المنظم أكد استلام رسوم ' || v_tt.name_ar, 'The organiser confirmed the entry fee for ' || v_tt.name_en, jsonb_build_object('tournament_id', v_t.id));
  end if;
end $$;

create or replace function public.close_registration(p_t uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v public.tournaments;
begin
  v := public._require_manage(p_t);
  if v.status <> 'open' then raise exception 'invalid_status'; end if;
  update public.tournaments set status = 'closed' where id = p_t;
end $$;

-- ---------------------------------------------------------------- results engine
create or replace function public._recalc_standings(p_t uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.tournament_teams tt set
    played = s.p, won = s.w, drawn = s.d, lost = s.l, gf = s.f, ga = s.a
  from (
    select tt2.id,
      count(f.id) as p,
      count(f.id) filter (where (f.home_id = tt2.id and f.home_score > f.away_score) or (f.away_id = tt2.id and f.away_score > f.home_score)) as w,
      count(f.id) filter (where f.home_score = f.away_score) as d,
      count(f.id) filter (where (f.home_id = tt2.id and f.home_score < f.away_score) or (f.away_id = tt2.id and f.away_score < f.home_score)) as l,
      coalesce(sum(case when f.home_id = tt2.id then f.home_score else f.away_score end), 0) as f,
      coalesce(sum(case when f.home_id = tt2.id then f.away_score else f.home_score end), 0) as a
    from public.tournament_teams tt2
    left join public.fixtures f on f.tournament_id = tt2.tournament_id and f.stage in ('league', 'group')
      and f.status in ('played', 'walkover') and (f.home_id = tt2.id or f.away_id = tt2.id)
    where tt2.tournament_id = p_t
    group by tt2.id
  ) s
  where tt.id = s.id;
end $$;

create or replace function public._advance(p_fixture uuid, p_winner uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare f public.fixtures;
begin
  select * into f from public.fixtures where id = p_fixture;
  if f.next_fixture is null then return; end if;
  if f.next_slot = 'home' then update public.fixtures set home_id = p_winner where id = f.next_fixture;
  else update public.fixtures set away_id = p_winner where id = f.next_fixture; end if;
end $$;

-- Group table order: points, goal difference, goals scored.
create or replace function public._group_rank(p_t uuid, p_group text)
returns table (team_id uuid, pos int) language sql stable security definer set search_path = '' as $$
  select id, (row_number() over (order by won * 3 + drawn desc, gf - ga desc, gf desc, created_at))::int
  from public.tournament_teams where tournament_id = p_t and group_label = p_group and status = 'approved'
$$;

-- When the whole group stage is played, place the qualifiers into the first knockout round.
create or replace function public._advance_groups(p_t uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v public.tournaments;
  v_first int;
  pairs text[];
  i int := 0;
  r record;
  v_home uuid; v_away uuid;
begin
  select * into v from public.tournaments where id = p_t;
  if exists (select 1 from public.fixtures where tournament_id = p_t and stage = 'group' and status = 'scheduled') then return; end if;
  select min(round_no) into v_first from public.fixtures where tournament_id = p_t and stage = 'knockout';
  if v_first is null then return; end if;
  if exists (select 1 from public.fixtures where tournament_id = p_t and stage = 'knockout' and round_no = v_first and (home_id is not null or away_id is not null)) then return; end if;
  pairs := case when v.groups_count = 4 then array['A1:B2', 'C1:D2', 'B1:A2', 'D1:C2'] else array['A1:B2', 'B1:A2'] end;
  for r in select id from public.fixtures where tournament_id = p_t and stage = 'knockout' and round_no = v_first order by bracket_pos loop
    i := i + 1;
    select team_id into v_home from public._group_rank(p_t, substr(split_part(pairs[i], ':', 1), 1, 1)) where pos = substr(split_part(pairs[i], ':', 1), 2)::int;
    select team_id into v_away from public._group_rank(p_t, substr(split_part(pairs[i], ':', 2), 1, 1)) where pos = substr(split_part(pairs[i], ':', 2), 2)::int;
    update public.fixtures set home_id = v_home, away_id = v_away where id = r.id;
  end loop;
end $$;

-- Final played: close the tournament and hand out the automatic awards.
create or replace function public._finish_if_done(p_t uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v public.tournaments; v_champ uuid; v_runner uuid; f public.fixtures; r record; v_top int;
begin
  select * into v from public.tournaments where id = p_t;
  if v.status = 'finished' then return; end if;
  if exists (select 1 from public.fixtures where tournament_id = p_t and status = 'scheduled') then return; end if;
  if not exists (select 1 from public.fixtures where tournament_id = p_t) then return; end if;

  if v.format_type = 'league' then
    select id into v_champ from public.tournament_teams where tournament_id = p_t and status = 'approved' order by won * 3 + drawn desc, gf - ga desc, gf desc limit 1;
    select id into v_runner from public.tournament_teams where tournament_id = p_t and status = 'approved' and id <> v_champ order by won * 3 + drawn desc, gf - ga desc, gf desc limit 1;
  else
    select * into f from public.fixtures where tournament_id = p_t and stage = 'knockout' and next_fixture is null order by round_no desc limit 1;
    if f.home_score > f.away_score or (f.home_score = f.away_score and coalesce(f.pens_home, 0) > coalesce(f.pens_away, 0)) then
      v_champ := f.home_id; v_runner := f.away_id;
    else
      v_champ := f.away_id; v_runner := f.home_id;
    end if;
  end if;

  update public.tournaments set status = 'finished', finished_at = now() where id = p_t;
  delete from public.tournament_awards where tournament_id = p_t and kind in ('champion', 'runner_up', 'top_scorer');
  if v_champ is not null then insert into public.tournament_awards (tournament_id, kind, team_id) values (p_t, 'champion', v_champ); end if;
  if v_runner is not null then insert into public.tournament_awards (tournament_id, kind, team_id) values (p_t, 'runner_up', v_runner); end if;
  select max(c) into v_top from (select count(*) c from public.match_events where tournament_id = p_t and kind = 'goal' and player_id is not null group by player_id) x;
  if v_top is not null then
    insert into public.tournament_awards (tournament_id, kind, user_id, team_id, value)
    select p_t, 'top_scorer', player_id, (array_agg(team_id))[1], count(*) from public.match_events
    where tournament_id = p_t and kind = 'goal' and player_id is not null group by player_id having count(*) = v_top;
  end if;
  for r in select distinct tp.user_id from public.team_players tp where tp.tournament_id = p_t loop
    perform public._notify(r.user_id, 'tournament_finished', 'انتهت البطولة 🏆', 'Tournament finished 🏆',
      'بطل ' || v.name_ar || ': ' || public._team_name(v_champ), v.name_en || ' champion: ' || coalesce((select name_en from public.tournament_teams where id = v_champ), '?'),
      jsonb_build_object('tournament_id', p_t));
  end loop;
end $$;

create or replace function public._after_result(p_fixture uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare f public.fixtures; v_winner uuid;
begin
  select * into f from public.fixtures where id = p_fixture;
  if f.stage = 'knockout' then
    if f.home_score > f.away_score or (f.home_score = f.away_score and coalesce(f.pens_home, 0) > coalesce(f.pens_away, 0)) then v_winner := f.home_id; else v_winner := f.away_id; end if;
    perform public._advance(p_fixture, v_winner);
  else
    perform public._recalc_standings(f.tournament_id);
    if f.stage = 'group' then perform public._advance_groups(f.tournament_id); end if;
  end if;
  perform public._finish_if_done(f.tournament_id);
end $$;

-- Organiser records a result. p_events: [{"team_id","player_id","kind","minute"}, ...]
create or replace function public.record_fixture_result(p_fixture uuid, p_home int, p_away int, p_pens_home int, p_pens_away int, p_events jsonb, p_mvp uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare f public.fixtures; v public.tournaments; e jsonb; v_nf public.fixtures;
begin
  select * into f from public.fixtures where id = p_fixture for update;
  if not found then raise exception 'not_found'; end if;
  v := public._require_manage(f.tournament_id);
  if v.status not in ('live', 'finished') then raise exception 'invalid_status'; end if;
  if f.home_id is null or f.away_id is null then raise exception 'teams_not_set'; end if;
  if p_home < 0 or p_away < 0 or p_home > 99 or p_away > 99 then raise exception 'invalid_score'; end if;
  if f.stage = 'knockout' and p_home = p_away and (p_pens_home is null or p_pens_away is null or p_pens_home = p_pens_away) then raise exception 'penalties_required'; end if;
  if f.stage = 'knockout' and f.next_fixture is not null then
    select * into v_nf from public.fixtures where id = f.next_fixture;
    if v_nf.status in ('played', 'walkover') then raise exception 'next_round_played'; end if;
  end if;

  update public.fixtures set home_score = p_home, away_score = p_away, status = 'played', mvp_id = p_mvp,
    pens_home = case when f.stage = 'knockout' and p_home = p_away then p_pens_home end,
    pens_away = case when f.stage = 'knockout' and p_home = p_away then p_pens_away end
  where id = p_fixture;

  delete from public.match_events where fixture_id = p_fixture;
  for e in select * from jsonb_array_elements(coalesce(p_events, '[]'::jsonb)) loop
    if (e->>'team_id')::uuid not in (f.home_id, f.away_id) then raise exception 'invalid_team'; end if;
    insert into public.match_events (fixture_id, tournament_id, team_id, player_id, kind, minute)
    values (p_fixture, f.tournament_id, (e->>'team_id')::uuid, nullif(e->>'player_id', '')::uuid, e->>'kind', nullif(e->>'minute', '')::int);
  end loop;

  perform public._after_result(p_fixture);
  perform public._notify_team(f.home_id, 'fixture_result', 'النتيجة: ' || public._team_name(f.home_id) || ' ' || p_home || ' - ' || p_away || ' ' || public._team_name(f.away_id),
    'Result: ' || p_home || ' - ' || p_away, v.name_ar, v.name_en, jsonb_build_object('fixture_id', p_fixture, 'tournament_id', v.id));
  perform public._notify_team(f.away_id, 'fixture_result', 'النتيجة: ' || public._team_name(f.home_id) || ' ' || p_home || ' - ' || p_away || ' ' || public._team_name(f.away_id),
    'Result: ' || p_home || ' - ' || p_away, v.name_ar, v.name_en, jsonb_build_object('fixture_id', p_fixture, 'tournament_id', v.id));
end $$;

-- No-show or withdrawal: the other team wins 3-0.
create or replace function public.record_walkover(p_fixture uuid, p_winner uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare f public.fixtures; v public.tournaments;
begin
  select * into f from public.fixtures where id = p_fixture for update;
  if not found then raise exception 'not_found'; end if;
  v := public._require_manage(f.tournament_id);
  if p_winner not in (f.home_id, f.away_id) then raise exception 'invalid_team'; end if;
  update public.fixtures set status = 'walkover', home_score = case when p_winner = f.home_id then 3 else 0 end,
    away_score = case when p_winner = f.away_id then 3 else 0 end, pens_home = null, pens_away = null where id = p_fixture;
  delete from public.match_events where fixture_id = p_fixture;
  perform public._after_result(p_fixture);
end $$;

create or replace function public.withdraw_team(p_team uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_tt public.tournament_teams; r record;
begin
  select * into v_tt from public.tournament_teams where id = p_team;
  if not found then raise exception 'not_found'; end if;
  if not (v_tt.captain_id = auth.uid() or public._can_manage_tournament(v_tt.tournament_id)) then raise exception 'not_allowed'; end if;
  update public.tournament_teams set status = 'withdrawn' where id = p_team;
  for r in select * from public.fixtures where tournament_id = v_tt.tournament_id and status = 'scheduled'
             and (home_id = p_team or away_id = p_team) and home_id is not null and away_id is not null loop
    update public.fixtures set status = 'walkover', home_score = case when r.home_id = p_team then 0 else 3 end,
      away_score = case when r.away_id = p_team then 0 else 3 end where id = r.id;
    perform public._after_result(r.id);
  end loop;
  perform public._notify((select organizer_id from public.tournaments where id = v_tt.tournament_id), 'team_withdrew', 'فريق انسحب', 'A team withdrew',
    v_tt.name_ar, v_tt.name_en, jsonb_build_object('tournament_id', v_tt.tournament_id));
end $$;

-- ---------------------------------------------------------------- schedule generation
-- Books one-hour slots on the tournament pitch for every fixture that needs one, in order,
-- starting p_start at p_start_hour on the chosen weekdays (0 = Sunday … 6 = Saturday).
create or replace function public._schedule(p_t uuid, p_start date, p_days int[], p_start_hour int)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v public.tournaments; p public.pitches; f record;
  v_day date := p_start; v_hour int := greatest(p_start_hour, 0);
  v_b uuid; v_ts timestamptz; v_guard int;
begin
  select * into v from public.tournaments where id = p_t;
  select * into p from public.pitches where id = v.pitch_id;
  v_hour := greatest(v_hour, p.open_from);
  for f in select id from public.fixtures where tournament_id = p_t and status = 'scheduled' and starts_at is null
           order by case stage when 'knockout' then 1 else 0 end, round_no, group_label nulls first, bracket_pos nulls first, id loop
    v_guard := 0;
    loop
      v_guard := v_guard + 1;
      if v_guard > 3000 then raise exception 'no_free_slots'; end if;
      if v_hour + 1 > p.open_to then v_day := v_day + 1; v_hour := greatest(p_start_hour, p.open_from); continue; end if;
      if not (extract(dow from v_day)::int = any (p_days)) then v_day := v_day + 1; v_hour := greatest(p_start_hour, p.open_from); continue; end if;
      v_ts := (v_day + make_interval(hours => v_hour))::timestamp at time zone 'Asia/Kuwait';
      if v_ts < now() then v_hour := v_hour + 1; continue; end if;
      begin
        insert into public.bookings (pitch_id, user_id, starts_at, ends_at, status)
        values (v.pitch_id, v.organizer_id, v_ts, v_ts + interval '1 hour', 'blocked') returning id into v_b;
        update public.fixtures set starts_at = v_ts, booking_id = v_b where id = f.id;
        v_hour := v_hour + 1;
        exit;
      exception when exclusion_violation then
        v_hour := v_hour + 1;
      end;
    end loop;
  end loop;
end $$;

-- Knockout bracket. p_teams may be null (slots filled later from the group stage).
create or replace function public._build_knockout(p_t uuid, p_teams uuid[], p_slots int, p_first_round int)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_size int := 2; v_rounds int := 1; k int; i int; cnt int;
  prev uuid[] := '{}'; cur uuid[]; v_id uuid; v_n int := coalesce(array_length(p_teams, 1), 0);
  v_home uuid; v_away uuid; first_ids uuid[];
begin
  while v_size < p_slots loop v_size := v_size * 2; v_rounds := v_rounds + 1; end loop;
  -- Create from the final backwards so each fixture knows where its winner goes.
  for k in reverse v_rounds..1 loop
    cnt := v_size / (2 ^ k)::int;
    cur := '{}';
    for i in 0..cnt - 1 loop
      insert into public.fixtures (tournament_id, stage, round_no, bracket_pos, next_fixture, next_slot, status)
      values (p_t, 'knockout', p_first_round + k - 1, i,
              case when k < v_rounds then prev[i / 2 + 1] end,
              case when k < v_rounds then case when i % 2 = 0 then 'home' else 'away' end end, 'scheduled')
      returning id into v_id;
      cur := cur || v_id;
    end loop;
    prev := cur;
  end loop;
  first_ids := prev;
  if v_n = 0 then return; end if;
  -- Seed: team i meets team (size-1-i); missing opponents are byes and go straight through.
  for i in 0..(v_size / 2) - 1 loop
    v_home := case when i < v_n then p_teams[i + 1] end;
    v_away := case when v_size - 1 - i < v_n then p_teams[v_size - i] end;
    update public.fixtures set home_id = v_home, away_id = v_away where id = first_ids[i + 1];
    if v_home is null or v_away is null then
      update public.fixtures set status = 'bye' where id = first_ids[i + 1];
      perform public._advance(first_ids[i + 1], coalesce(v_home, v_away));
    end if;
  end loop;
end $$;

create or replace function public.generate_fixtures(p_t uuid, p_start date, p_days int[], p_start_hour int)
returns int language plpgsql security definer set search_path = '' as $$
declare
  v public.tournaments;
  teams uuid[]; n int; arr uuid[]; r int; i int; a uuid; b uuid;
  g int; labels text[] := array['A', 'B', 'C', 'D']; gl text; gteams uuid[]; v_count int; rec record;
begin
  v := public._require_manage(p_t);
  if v.status not in ('open', 'closed') then raise exception 'invalid_status'; end if;
  if p_days is null or array_length(p_days, 1) is null then raise exception 'invalid_days'; end if;
  if exists (select 1 from public.fixtures where tournament_id = p_t and status in ('played', 'walkover')) then raise exception 'already_started'; end if;

  -- Start clean: drop any earlier draft schedule and free its slots.
  update public.bookings set status = 'cancelled' where id in (select booking_id from public.fixtures where tournament_id = p_t and booking_id is not null);
  delete from public.fixtures where tournament_id = p_t;

  select array_agg(id order by random()) into teams from public.tournament_teams where tournament_id = p_t and status = 'approved';
  n := coalesce(array_length(teams, 1), 0);
  if n < 2 or (v.format_type = 'groups' and n < v.groups_count * 2) then raise exception 'not_enough_teams'; end if;

  if v.format_type = 'league' then
    arr := teams;
    if n % 2 = 1 then arr := arr || null::uuid; n := n + 1; end if;
    for r in 1..n - 1 loop
      for i in 1..n / 2 loop
        a := arr[i]; b := arr[n + 1 - i];
        if a is not null and b is not null then
          insert into public.fixtures (tournament_id, stage, round_no, home_id, away_id, status)
          values (p_t, 'league', r, case when r % 2 = 0 then b else a end, case when r % 2 = 0 then a else b end, 'scheduled');
        end if;
      end loop;
      arr := arr[1:1] || arr[n:n] || arr[2:n - 1];
    end loop;

  elsif v.format_type = 'knockout' then
    perform public._build_knockout(p_t, teams, n, 1);

  else
    update public.tournament_teams set group_label = null where tournament_id = p_t;
    for i in 1..n loop
      -- snake draft into groups
      g := case when ((i - 1) / v.groups_count) % 2 = 0 then (i - 1) % v.groups_count else v.groups_count - 1 - (i - 1) % v.groups_count end;
      update public.tournament_teams set group_label = labels[g + 1] where id = teams[i];
    end loop;
    for g in 1..v.groups_count loop
      gl := labels[g];
      select array_agg(id order by random()) into gteams from public.tournament_teams where tournament_id = p_t and group_label = gl;
      arr := gteams; n := array_length(arr, 1);
      if n % 2 = 1 then arr := arr || null::uuid; n := n + 1; end if;
      for r in 1..n - 1 loop
        for i in 1..n / 2 loop
          a := arr[i]; b := arr[n + 1 - i];
          if a is not null and b is not null then
            insert into public.fixtures (tournament_id, stage, round_no, group_label, home_id, away_id, status)
            values (p_t, 'group', r, gl, a, b, 'scheduled');
          end if;
        end loop;
        arr := arr[1:1] || arr[n:n] || arr[2:n - 1];
      end loop;
    end loop;
    perform public._build_knockout(p_t, null, v.groups_count * 2, 100);
  end if;

  perform public._schedule(p_t, p_start, p_days, p_start_hour);
  update public.tournaments set status = 'live' where id = p_t;
  perform public._recalc_standings(p_t);
  select count(*) into v_count from public.fixtures where tournament_id = p_t and status = 'scheduled';

  for rec in select distinct tp.user_id from public.team_players tp join public.tournament_teams tt on tt.id = tp.team_id
             where tp.tournament_id = p_t and tt.status = 'approved' loop
    perform public._notify(rec.user_id, 'schedule_published', 'جدول البطولة نزل 📅', 'Tournament schedule is out 📅',
      'شوف مواعيد مباريات فريقك في ' || v.name_ar, 'See your team''s matches in ' || v.name_en, jsonb_build_object('tournament_id', p_t));
  end loop;
  return v_count;
end $$;

-- Organiser moves one fixture to another time (the pitch slot moves with it).
create or replace function public.reschedule_fixture(p_fixture uuid, p_starts timestamptz)
returns void language plpgsql security definer set search_path = '' as $$
declare f public.fixtures; v public.tournaments; v_b uuid;
begin
  select * into f from public.fixtures where id = p_fixture;
  if not found then raise exception 'not_found'; end if;
  v := public._require_manage(f.tournament_id);
  if f.status <> 'scheduled' then raise exception 'invalid_status'; end if;
  if f.booking_id is not null then update public.bookings set status = 'cancelled' where id = f.booking_id; end if;
  begin
    insert into public.bookings (pitch_id, user_id, starts_at, ends_at, status)
    values (v.pitch_id, v.organizer_id, p_starts, p_starts + interval '1 hour', 'blocked') returning id into v_b;
  exception when exclusion_violation then
    if f.booking_id is not null then update public.bookings set status = 'blocked' where id = f.booking_id; end if;
    raise exception 'slot_taken';
  end;
  update public.fixtures set starts_at = p_starts, booking_id = v_b, reminded = false where id = p_fixture;
end $$;

create or replace function public.cancel_tournament(p_t uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v public.tournaments; r record;
begin
  v := public._require_manage(p_t);
  if v.status = 'finished' then raise exception 'invalid_status'; end if;
  update public.tournaments set status = 'cancelled' where id = p_t;
  update public.bookings set status = 'cancelled' where status = 'blocked' and starts_at > now()
    and id in (select booking_id from public.fixtures where tournament_id = p_t);
  for r in select distinct user_id from public.team_players where tournament_id = p_t loop
    perform public._notify(r.user_id, 'tournament_cancelled', 'انلغت البطولة', 'Tournament cancelled', v.name_ar, v.name_en, jsonb_build_object('tournament_id', p_t));
  end loop;
end $$;

-- ---------------------------------------------------------------- awards & clips
create or replace function public.set_award(p_t uuid, p_kind text, p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_team uuid;
begin
  perform public._require_manage(p_t);
  if p_kind not in ('best_player', 'best_keeper') then raise exception 'invalid_award'; end if;
  delete from public.tournament_awards where tournament_id = p_t and kind = p_kind;
  if p_user is null then return; end if;
  select team_id into v_team from public.team_players where tournament_id = p_t and user_id = p_user;
  insert into public.tournament_awards (tournament_id, kind, user_id, team_id) values (p_t, p_kind, p_user, v_team);
  perform public._notify(p_user, 'award', case when p_kind = 'best_player' then 'أفضل لاعب في البطولة 🌟' else 'أفضل حارس في البطولة 🧤' end,
    case when p_kind = 'best_player' then 'Best player of the tournament 🌟' else 'Best goalkeeper of the tournament 🧤' end,
    (select name_ar from public.tournaments where id = p_t), (select name_en from public.tournaments where id = p_t), jsonb_build_object('tournament_id', p_t));
end $$;

create or replace function public.add_highlight(p_fixture uuid, p_path text, p_player uuid)
returns public.highlights language plpgsql security definer set search_path = '' as $$
declare f public.fixtures; v_row public.highlights;
begin
  select * into f from public.fixtures where id = p_fixture;
  if not found then raise exception 'not_found'; end if;
  perform public._require_manage(f.tournament_id);
  if split_part(p_path, '/', 1) <> f.tournament_id::text or split_part(p_path, '/', 2) <> f.id::text then raise exception 'invalid_path'; end if;
  if (select count(*) from public.highlights where fixture_id = p_fixture) >= 10 then raise exception 'too_many_clips'; end if;
  insert into public.highlights (fixture_id, tournament_id, uploader_id, player_id, path)
  values (p_fixture, f.tournament_id, auth.uid(), p_player, p_path) returning * into v_row;
  if f.home_id is not null then
    perform public._notify_team(f.home_id, 'highlight', 'لقطة جديدة من مباراتكم 🎬', 'New clip from your match 🎬',
      public._team_name(f.home_id) || ' × ' || public._team_name(f.away_id), 'Watch it in the app', jsonb_build_object('fixture_id', p_fixture));
  end if;
  if f.away_id is not null then
    perform public._notify_team(f.away_id, 'highlight', 'لقطة جديدة من مباراتكم 🎬', 'New clip from your match 🎬',
      public._team_name(f.home_id) || ' × ' || public._team_name(f.away_id), 'Watch it in the app', jsonb_build_object('fixture_id', p_fixture));
  end if;
  return v_row;
end $$;

create or replace function public.delete_highlight(p_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare h public.highlights;
begin
  select * into h from public.highlights where id = p_id;
  if not found then raise exception 'not_found'; end if;
  if not (h.uploader_id = auth.uid() or public._can_manage_tournament(h.tournament_id)) then raise exception 'not_allowed'; end if;
  delete from public.highlights where id = p_id;
  return h.path;
end $$;

create or replace function public.toggle_highlight_like(p_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  delete from public.highlight_likes where highlight_id = p_id and user_id = auth.uid();
  if found then
    update public.highlights set likes = greatest(likes - 1, 0) where id = p_id;
    return false;
  end if;
  insert into public.highlight_likes (highlight_id, user_id) values (p_id, auth.uid());
  update public.highlights set likes = likes + 1 where id = p_id;
  return true;
end $$;

-- Red card = suspended for the team's next match.
create or replace function public.tournament_suspensions(p_t uuid)
returns table (user_id uuid, team_id uuid, fixture_id uuid)
language sql stable security definer set search_path = '' as $$
  select e.player_id, e.team_id, nf.id
  from public.match_events e
  join public.fixtures f on f.id = e.fixture_id
  join lateral (
    select f2.id from public.fixtures f2
    where f2.tournament_id = p_t and (f2.home_id = e.team_id or f2.away_id = e.team_id)
      and f2.starts_at > f.starts_at order by f2.starts_at limit 1
  ) nf on true
  where e.tournament_id = p_t and e.kind = 'red' and e.player_id is not null
$$;

-- Trophies on a player's card (team titles through the roster, individual awards directly).
create or replace function public.player_trophies(p_user uuid)
returns table (tournament_id uuid, name_ar text, name_en text, kind text, value int)
language sql stable security definer set search_path = '' as $$
  select t.id, t.name_ar, t.name_en, a.kind, a.value
  from public.tournament_awards a join public.tournaments t on t.id = a.tournament_id
  where a.user_id = p_user
     or (a.kind in ('champion', 'runner_up') and exists (select 1 from public.team_players tp where tp.team_id = a.team_id and tp.user_id = p_user))
  order by t.finished_at desc nulls last
$$;

-- ---------------------------------------------------------------- organising fees (dues)
create or replace function public.tournament_dues_list(p_mine boolean default true)
returns table (tournament_id uuid, name_ar text, name_en text, organizer_id uuid, organizer_name text, status text,
               entry_fee numeric, paid_teams int, rate numeric, amount numeric, settled boolean, finished_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not p_mine then perform public._require_admin(); end if;
  return query
    select t.id, t.name_ar, t.name_en, t.organizer_id, coalesce(pr.name, ''), t.status, t.entry_fee,
      (select count(*)::int from public.tournament_teams tt where tt.tournament_id = t.id and tt.paid), t.commission_rate,
      public._dues_amount(t.id), exists (select 1 from public.tournament_dues d where d.tournament_id = t.id), t.finished_at
    from public.tournaments t left join public.profiles pr on pr.id = t.organizer_id
    where t.commission_rate > 0 and t.status not in ('pending', 'rejected')
      and (case when p_mine then t.organizer_id = auth.uid() else true end)
    order by t.finished_at desc nulls first, t.created_at desc;
end $$;

create or replace function public.admin_mark_dues(p_t uuid, p_paid boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public._require_admin();
  if p_paid then
    insert into public.tournament_dues (tournament_id, amount, marked_by) values (p_t, public._dues_amount(p_t), auth.uid())
    on conflict (tournament_id) do update set amount = excluded.amount, paid_at = now(), marked_by = excluded.marked_by;
  else
    delete from public.tournament_dues where tournament_id = p_t;
  end if;
end $$;

create or replace function public.admin_set_commission(p_rate numeric, p_pitch uuid default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public._require_admin();
  if p_rate is not null and (p_rate < 0 or p_rate > 0.5) then raise exception 'invalid_rate'; end if;
  if p_pitch is null then
    update public.app_settings set value = to_jsonb(coalesce(p_rate, 0.05)) where key = 'commission_rate';
  else
    update public.pitches set commission_rate = p_rate where id = p_pitch;
  end if;
end $$;

-- ---------------------------------------------------------------- reminders (an hour before each match)
create or replace function public.send_fixture_reminders() returns void
language plpgsql security definer set search_path = '' as $$
declare f record;
begin
  for f in select fx.*, t.name_ar, t.name_en from public.fixtures fx join public.tournaments t on t.id = fx.tournament_id
           where fx.status = 'scheduled' and not fx.reminded and fx.starts_at between now() and now() + interval '70 minutes'
             and fx.home_id is not null and fx.away_id is not null and t.status = 'live' loop
    perform public._notify_team(f.home_id, 'fixture_reminder', 'مباراتكم بعد ساعة ⏰', 'Your match is in an hour ⏰',
      public._team_name(f.home_id) || ' × ' || public._team_name(f.away_id) || ' · ' || public._kw_time(f.starts_at), f.name_en || ' · ' || public._kw_time(f.starts_at), jsonb_build_object('fixture_id', f.id));
    perform public._notify_team(f.away_id, 'fixture_reminder', 'مباراتكم بعد ساعة ⏰', 'Your match is in an hour ⏰',
      public._team_name(f.home_id) || ' × ' || public._team_name(f.away_id) || ' · ' || public._kw_time(f.starts_at), f.name_en || ' · ' || public._kw_time(f.starts_at), jsonb_build_object('fixture_id', f.id));
    update public.fixtures set reminded = true where id = f.id;
  end loop;
end $$;

do $$ begin
  create extension if not exists pg_cron;
  perform cron.schedule('aldawri-fixture-reminders', '*/10 * * * *', 'select public.send_fixture_reminders()');
exception when others then
  raise notice 'pg_cron not available: fixture reminders are off';
end $$;

-- ---------------------------------------------------------------- grants
revoke execute on function public._can_manage_tournament_path(text), public._require_manage(uuid), public._notify_team(uuid, text, text, text, text, text, jsonb),
  public._team_name(uuid), public._dues_amount(uuid), public._recalc_standings(uuid), public._advance(uuid, uuid), public._group_rank(uuid, text),
  public._advance_groups(uuid), public._finish_if_done(uuid), public._after_result(uuid), public._schedule(uuid, date, int[], int),
  public._build_knockout(uuid, uuid[], int, int), public.send_fixture_reminders() from public, anon, authenticated;
grant execute on function public._can_manage_tournament_path(text) to authenticated;  -- used by the storage policy
revoke execute on function public._can_manage_tournament(uuid) from public, anon;
grant execute on function public._can_manage_tournament(uuid) to authenticated;
grant execute on function public.commission_rate_for(uuid), public.tournament_suspensions(uuid), public.player_trophies(uuid) to anon, authenticated;

do $$
declare f text;
begin
  foreach f in array array[
    'create_tournament(text, uuid, int, text, int, date, int, int, int, text, numeric, numeric, numeric, text)',
    'admin_review_tournament(uuid, boolean, text)', 'admin_set_tournament_status(uuid, text)', 'register_team(uuid, text)',
    'team_invite_code(uuid)', 'join_team_by_code(text)', 'remove_team_player(uuid, uuid)', 'organizer_review_team(uuid, text, boolean)',
    'close_registration(uuid)', 'record_fixture_result(uuid, int, int, int, int, jsonb, uuid)', 'record_walkover(uuid, uuid)',
    'withdraw_team(uuid)', 'generate_fixtures(uuid, date, int[], int)', 'reschedule_fixture(uuid, timestamptz)', 'cancel_tournament(uuid)',
    'set_award(uuid, text, uuid)', 'add_highlight(uuid, text, uuid)', 'delete_highlight(uuid)', 'toggle_highlight_like(uuid)',
    'tournament_dues_list(boolean)', 'admin_mark_dues(uuid, boolean)', 'admin_set_commission(numeric, uuid)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- ---------------------------------------------------------------- clip retention
-- Clips stay downloadable for a while after the tournament ends, then are deleted to save storage.
insert into public.app_settings (key, value) values ('clip_retention_days', '14') on conflict (key) do nothing;

create or replace function public.expired_highlights()
returns table (id uuid, path text) language sql stable security definer set search_path = '' as $$
  select h.id, h.path from public.highlights h join public.tournaments t on t.id = h.tournament_id
  where (t.status = 'finished' and t.finished_at < now() - make_interval(days => coalesce((select (value #>> '{}')::int from public.app_settings where key = 'clip_retention_days'), 14)))
     or (t.status = 'cancelled' and t.created_at < now() - interval '7 days')
$$;
create or replace function public.forget_highlights(p_ids uuid[]) returns void
language sql security definer set search_path = '' as $$
  delete from public.highlights where id = any (p_ids)
$$;
revoke execute on function public.expired_highlights(), public.forget_highlights(uuid[]) from public, anon, authenticated;
grant execute on function public.expired_highlights(), public.forget_highlights(uuid[]) to service_role;

-- Daily: ask the cleanup function to remove expired clips from storage.
do $$ begin
  perform cron.schedule('aldawri-clip-cleanup', '17 3 * * *',
    $c$select net.http_post(url := 'https://lkvnnounochppuhoneou.supabase.co/functions/v1/cleanup-highlights', body := '{}'::jsonb, headers := '{"Content-Type": "application/json"}'::jsonb)$c$);
exception when others then
  raise notice 'pg_cron not available: clip cleanup is off';
end $$;

-- 6-a-side pitches and games (6×6), alongside 5, 7 and 11.

create or replace function public.size_multiplier(p_size int) returns numeric
language sql immutable set search_path = '' as $$
  select case p_size when 6 then 1.2 when 7 then 1.5 when 11 then 2.4 else 1 end
$$;
revoke execute on function public.size_multiplier(int) from public, anon, authenticated;

alter table public.matches drop constraint if exists matches_format_check;
alter table public.matches add constraint matches_format_check check (format in (5, 6, 7, 11));

create or replace function public.submit_pitch(
  p_name text, p_area text, p_governorate text, p_address text, p_price numeric, p_sizes int[],
  p_surface text, p_indoor boolean, p_amenities text[], p_open_from int, p_open_to int,
  p_phone text, p_note text default '', p_lat double precision default null, p_lng double precision default null
) returns public.pitches
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_row public.pitches;
  v_tints text[][] := array[array['#0B2E6F', '#1E56B3'], array['#0E3B52', '#1C7C9C'], array['#123A2A', '#2E8B57'], array['#2B1F5C', '#5A4BB5'], array['#3A1F2B', '#9C3D54']];
  v_i int := 1 + floor(random() * 5)::int;
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;
  if length(trim(coalesce(p_name, ''))) < 3 or length(trim(coalesce(p_area, ''))) < 2 then raise exception 'invalid_name'; end if;
  if p_price is null or p_price <= 0 or p_price > 500 then raise exception 'invalid_price'; end if;
  if p_sizes is null or array_length(p_sizes, 1) is null or not (p_sizes <@ array[5, 6, 7, 11]) then raise exception 'invalid_size'; end if;
  if p_open_from is null or p_open_to is null or p_open_to <= p_open_from then raise exception 'invalid_hours'; end if;
  if length(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')) < 8 then raise exception 'invalid_phone'; end if;
  if (select count(*) from public.pitches where owner_id = v_uid and status = 'pending') >= 3 then raise exception 'too_many_pending'; end if;

  insert into public.pitches (owner_id, name_ar, name_en, area_ar, area_en, address_ar, address_en, governorate, price_per_hour,
                              sizes, surface, indoor, amenities, open_from, open_to, lat, lng, tint, active, status, submitted_at)
  values (v_uid, trim(p_name), trim(p_name), trim(p_area), trim(p_area), trim(coalesce(p_address, '')), trim(coalesce(p_address, '')),
          p_governorate, p_price, p_sizes, coalesce(p_surface, 'artificial'), coalesce(p_indoor, false),
          coalesce(p_amenities, '{}'), p_open_from, p_open_to, p_lat, p_lng, array[v_tints[v_i][1], v_tints[v_i][2]], false, 'pending', now())
  returning * into v_row;

  insert into public.pitch_submissions (pitch_id, owner_id, contact_phone, note)
  values (v_row.id, v_uid, trim(p_phone), left(trim(coalesce(p_note, '')), 500));
  return v_row;
end $$;

-- Sample pitches: offer 6-a-side on two of them so it can be tried out (sample data is removed at launch).
update public.pitches set sizes = array[5, 6] where name_en = 'Freej Pitch' and submitted_at is null;
update public.pitches set sizes = array[5, 6, 7] where name_en = 'Elite Arena' and submitted_at is null;
