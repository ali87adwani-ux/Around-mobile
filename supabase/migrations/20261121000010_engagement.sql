-- Match results, MVP votes, attendance (reliability), waitlists, fixed teams and points rewards.

-- ---------------------------------------------------------------- results & attendance
alter table public.match_players add column attended boolean not null default true;

create table public.match_results (
  match_id uuid primary key references public.matches (id) on delete cascade,
  score_a int not null check (score_a between 0 and 99),
  score_b int not null check (score_b between 0 and 99),
  recorded_by uuid references public.profiles (id) on delete set null,
  recorded_at timestamptz not null default now()
);
create table public.mvp_votes (
  match_id uuid not null references public.matches (id) on delete cascade,
  voter_id uuid not null references public.profiles (id) on delete cascade,
  player_id uuid not null references public.profiles (id) on delete cascade,
  primary key (match_id, voter_id)
);
alter table public.match_results enable row level security;
alter table public.mvp_votes enable row level security;
create policy "results are public" on public.match_results for select to anon, authenticated using (true);
create policy "votes are public" on public.mvp_votes for select to anon, authenticated using (true);

create or replace function public.record_result(p_match uuid, p_score_a int, p_score_b int, p_no_shows uuid[])
returns void language plpgsql security definer set search_path = '' as $$
declare v public.matches;
begin
  select * into v from public.matches where id = p_match;
  if not found then raise exception 'match_not_found'; end if;
  if v.organizer_id <> auth.uid() and not public.is_admin() then raise exception 'organizer_only'; end if;
  if v.starts_at > now() then raise exception 'match_not_played'; end if;
  insert into public.match_results (match_id, score_a, score_b, recorded_by) values (p_match, p_score_a, p_score_b, auth.uid())
  on conflict (match_id) do update set score_a = excluded.score_a, score_b = excluded.score_b, recorded_by = excluded.recorded_by, recorded_at = now();
  update public.match_players set attended = not (user_id = any (coalesce(p_no_shows, '{}'))) where match_id = p_match;
  update public.matches set status = 'played' where id = p_match;
end $$;

create or replace function public.vote_mvp(p_match uuid, p_player uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.match_players where match_id = p_match and user_id = auth.uid()) then raise exception 'players_only'; end if;
  if not exists (select 1 from public.match_players where match_id = p_match and user_id = p_player) then raise exception 'not_in_match'; end if;
  if p_player = auth.uid() then raise exception 'no_self_vote'; end if;
  insert into public.mvp_votes (match_id, voter_id, player_id) values (p_match, auth.uid(), p_player)
  on conflict (match_id, voter_id) do update set player_id = excluded.player_id;
end $$;

-- Per-player summary: games, no-shows, MVP awards (public).
create or replace function public.player_stats(p_user uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'played', (select count(*) from public.match_players mp join public.matches m on m.id = mp.match_id where mp.user_id = p_user and m.status = 'played'),
    'noShows', (select count(*) from public.match_players mp join public.matches m on m.id = mp.match_id where mp.user_id = p_user and m.status = 'played' and not mp.attended),
    'mvp', (select count(*) from (select match_id, player_id, rank() over (partition by match_id order by count(*) desc) r from public.mvp_votes group by match_id, player_id) x where x.player_id = p_user and x.r = 1),
    'bookings', (select count(*) from public.bookings where user_id = p_user and status = 'confirmed')
  )
$$;

-- ---------------------------------------------------------------- waitlist
create table public.match_waitlist (
  match_id uuid not null references public.matches (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (match_id, user_id)
);
alter table public.match_waitlist enable row level security;
create policy "waitlists are public" on public.match_waitlist for select to anon, authenticated using (true);

create or replace function public.join_waitlist(p_match uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  if exists (select 1 from public.match_players where match_id = p_match and user_id = auth.uid()) then raise exception 'already_joined'; end if;
  insert into public.match_waitlist (match_id, user_id) values (p_match, auth.uid()) on conflict do nothing;
end $$;

create or replace function public.leave_waitlist(p_match uuid)
returns void language sql security definer set search_path = '' as $$
  delete from public.match_waitlist where match_id = p_match and user_id = auth.uid()
$$;

-- When a player leaves, the first person on the waitlist takes the spot.
create or replace function public.promote_waitlist() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_next uuid;
begin
  select user_id into v_next from public.match_waitlist where match_id = old.match_id order by joined_at limit 1;
  if v_next is not null then
    delete from public.match_waitlist where match_id = old.match_id and user_id = v_next;
    insert into public.match_players (match_id, user_id) values (old.match_id, v_next) on conflict do nothing;
  end if;
  return old;
end $$;
create trigger match_player_left after delete on public.match_players
  for each row execute function public.promote_waitlist();

-- ---------------------------------------------------------------- fixed teams
create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 2 and 40),
  color text not null default '#1E56B3',
  code text not null unique default upper(substr(md5(random()::text), 1, 6)),
  captain_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);
create table public.team_members (
  team_id uuid not null references public.teams (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (team_id, user_id)
);
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
-- Security-definer helper avoids a policy that queries its own table (infinite recursion).
create or replace function public.is_team_member(p_team uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.team_members where team_id = p_team and user_id = (select auth.uid()))
$$;
grant execute on function public.is_team_member(uuid) to authenticated;
create policy "teams are visible to members" on public.teams for select to authenticated using (public.is_team_member(id));
create policy "members are visible to teammates" on public.team_members for select to authenticated using (public.is_team_member(team_id));

create or replace function public.create_team(p_name text, p_color text)
returns public.teams language plpgsql security definer set search_path = '' as $$
declare v public.teams;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  insert into public.teams (name, color, captain_id) values (trim(p_name), coalesce(p_color, '#1E56B3'), auth.uid()) returning * into v;
  insert into public.team_members (team_id, user_id) values (v.id, auth.uid());
  return v;
end $$;

create or replace function public.join_team(p_code text)
returns public.teams language plpgsql security definer set search_path = '' as $$
declare v public.teams;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  select * into v from public.teams where code = upper(trim(p_code));
  if not found then raise exception 'team_not_found'; end if;
  if (select count(*) from public.team_members where team_id = v.id) >= 25 then raise exception 'team_full'; end if;
  insert into public.team_members (team_id, user_id) values (v.id, auth.uid()) on conflict do nothing;
  return v;
end $$;

create or replace function public.leave_team(p_team uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.team_members where team_id = p_team and user_id = auth.uid();
  -- The last member leaving removes the team; a leaving captain hands over to the longest-standing member.
  if not exists (select 1 from public.team_members where team_id = p_team) then
    delete from public.teams where id = p_team;
  elsif (select captain_id from public.teams where id = p_team) = auth.uid() then
    update public.teams set captain_id = (select user_id from public.team_members where team_id = p_team order by joined_at limit 1) where id = p_team;
  end if;
end $$;

-- ---------------------------------------------------------------- points & rewards
-- Points: 10 per game played, 5 per booking, 20 per MVP award; redemptions are deducted.
create table public.reward_redemptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  reward text not null,
  cost int not null check (cost > 0),
  code text not null default upper(substr(md5(random()::text), 1, 8)),
  created_at timestamptz not null default now()
);
alter table public.reward_redemptions enable row level security;
create policy "users see their redemptions" on public.reward_redemptions for select to authenticated using (user_id = (select auth.uid()) or public.is_admin());

create or replace function public.my_points() returns int
language sql stable security definer set search_path = '' as $$
  with s as (select public.player_stats(auth.uid()) j)
  select ((j->>'played')::int * 10 + (j->>'bookings')::int * 5 + (j->>'mvp')::int * 20
          - coalesce((select sum(cost) from public.reward_redemptions where user_id = auth.uid()), 0))::int
  from s
$$;

create or replace function public.redeem_reward(p_reward text)
returns public.reward_redemptions language plpgsql security definer set search_path = '' as $$
declare v_cost int; v public.reward_redemptions;
begin
  v_cost := case p_reward when 'discount_1' then 100 when 'discount_3' then 250 when 'free_hour' then 600 else null end;
  if v_cost is null then raise exception 'invalid_reward'; end if;
  if public.my_points() < v_cost then raise exception 'not_enough_points'; end if;
  insert into public.reward_redemptions (user_id, reward, cost) values (auth.uid(), p_reward, v_cost) returning * into v;
  return v;
end $$;

do $$
declare f text;
begin
  foreach f in array array['record_result(uuid, int, int, uuid[])', 'vote_mvp(uuid, uuid)', 'join_waitlist(uuid)', 'leave_waitlist(uuid)',
    'create_team(text, text)', 'join_team(text)', 'leave_team(uuid)', 'my_points()', 'redeem_reward(text)']
  loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
grant execute on function public.player_stats(uuid) to anon, authenticated;
