-- Private games with an invite code, "invite your friends" from a booking, fixed-team invites,
-- smart team balancing (level + one goalkeeper per side), moving players and reshuffling.

alter table public.matches add column if not exists is_private boolean not null default false;
alter table public.matches add column if not exists invite_code text unique;
alter table public.match_players add column if not exists team text check (team in ('A', 'B'));

-- Who may see a game: public games for everyone; private games for the organiser and its players.
create or replace function public.can_see_match(p_match uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.matches m
    where m.id = p_match
      and (not m.is_private or m.organizer_id = (select auth.uid())
           or exists (select 1 from public.match_players mp where mp.match_id = m.id and mp.user_id = (select auth.uid())))
  )
$$;
grant execute on function public.can_see_match(uuid) to anon, authenticated;

drop policy if exists "matches are public" on public.matches;
drop policy if exists "matches are visible" on public.matches;
create policy "matches are visible" on public.matches for select to anon, authenticated
  using (not is_private or public.can_see_match(id));
drop policy if exists "match lineups are public" on public.match_players;
drop policy if exists "match lineups are visible" on public.match_players;
create policy "match lineups are visible" on public.match_players for select to anon, authenticated
  using (public.can_see_match(match_id));

create or replace function public._new_match_code() returns text
language plpgsql volatile set search_path = '' as $$
declare v text;
begin
  loop
    v := upper(substr(md5(gen_random_uuid()::text), 1, 6));
    exit when not exists (select 1 from public.matches where invite_code = v);
  end loop;
  return v;
end $$;

create or replace function public._require_organizer(p_match uuid) returns public.matches
language plpgsql security definer set search_path = '' as $$
declare m public.matches;
begin
  select * into m from public.matches where id = p_match;
  if not found then raise exception 'match_not_found'; end if;
  if m.organizer_id is distinct from auth.uid() then raise exception 'not_organizer'; end if;
  return m;
end $$;

-- Organisers and players get the game's code to share it.
create or replace function public.match_invite_code(p_match uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare m public.matches;
begin
  select * into m from public.matches where id = p_match;
  if not found then raise exception 'match_not_found'; end if;
  if m.organizer_id is distinct from auth.uid()
     and not exists (select 1 from public.match_players where match_id = p_match and user_id = auth.uid()) then
    raise exception 'not_in_match';
  end if;
  if m.invite_code is null then
    update public.matches set invite_code = public._new_match_code() where id = p_match returning invite_code into m.invite_code;
  end if;
  return m.invite_code;
end $$;

create or replace function public.set_match_private(p_match uuid, p_private boolean) returns text
language plpgsql security definer set search_path = '' as $$
begin
  perform public._require_organizer(p_match);
  update public.matches set is_private = p_private where id = p_match;
  return public.match_invite_code(p_match);
end $$;

create or replace function public._join_match(p_match uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_match public.matches; v_count int;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  select * into v_match from public.matches where id = p_match for update;  -- serialises concurrent joins
  if not found or v_match.status <> 'open' then raise exception 'match_not_open'; end if;
  if v_match.starts_at < now() then raise exception 'match_started'; end if;
  select count(*) into v_count from public.match_players where match_id = p_match;
  if v_count >= v_match.max_players then raise exception 'match_full'; end if;
  insert into public.match_players (match_id, user_id) values (p_match, auth.uid()) on conflict do nothing;
end $$;
revoke execute on function public._join_match(uuid) from public, anon, authenticated;

-- Public games: join by id. Private games need the code.
create or replace function public.join_match(p_match uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.matches where id = p_match and is_private and organizer_id is distinct from auth.uid()) then
    raise exception 'match_private';
  end if;
  perform public._join_match(p_match);
end $$;

create or replace function public.join_match_by_code(p_code text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v uuid;
begin
  select id into v from public.matches where invite_code = upper(trim(p_code));
  if not found then raise exception 'code_not_found'; end if;
  perform public._join_match(v);
  return v;
end $$;

-- Private games stay off the waitlist unless you were invited.
create or replace function public.join_waitlist(p_match uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  if exists (select 1 from public.match_players where match_id = p_match and user_id = auth.uid()) then raise exception 'already_joined'; end if;
  if exists (select 1 from public.matches where id = p_match and is_private) then raise exception 'match_private'; end if;
  insert into public.match_waitlist (match_id, user_id) values (p_match, auth.uid()) on conflict do nothing;
end $$;

-- Invite every member of one of my fixed teams to my game.
create or replace function public.invite_team_to_match(p_match uuid, p_team uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare m public.matches; v_code text; v_pitch text; v_pitch_en text; v_team text; r record; n int := 0;
begin
  m := public._require_organizer(p_match);
  if m.status <> 'open' or m.starts_at < now() then raise exception 'match_not_open'; end if;
  if not exists (select 1 from public.team_members where team_id = p_team and user_id = auth.uid()) then raise exception 'not_team_member'; end if;
  v_code := public.match_invite_code(p_match);
  select name_ar, name_en into v_pitch, v_pitch_en from public.pitches where id = m.pitch_id;
  select name into v_team from public.teams where id = p_team;
  for r in select tm.user_id from public.team_members tm
           where tm.team_id = p_team and tm.user_id <> auth.uid()
             and not exists (select 1 from public.match_players mp where mp.match_id = p_match and mp.user_id = tm.user_id) loop
    perform public._notify(r.user_id, 'match_invite', 'عزيمة على مباراة ⚽', 'You are invited to a game ⚽',
      'فريق ' || v_team || ' معزوم على مباراة بـ' || v_pitch || ' (' || public._kw_time(m.starts_at) || ')',
      v_team || ' is invited to a game at ' || v_pitch_en || ' (' || public._kw_time(m.starts_at) || ')',
      jsonb_build_object('match_code', v_code, 'match_id', p_match));
    n := n + 1;
  end loop;
  return n;
end $$;

-- Split the players into two fair sides: goalkeepers first (one each), then the strongest player
-- goes to the weaker side. p_shuffle adds noise so a reshuffle gives a different but still fair split.
create or replace function public.balance_teams(p_match uuid, p_shuffle boolean default false) returns void
language plpgsql security definer set search_path = '' as $$
declare
  r record; sa numeric := 0; sb numeric := 0; ca int := 0; cb int := 0; v_n int; v_cap int; v_t text; v_gk int := 0;
begin
  perform public._require_organizer(p_match);
  select count(*) into v_n from public.match_players where match_id = p_match;
  v_cap := ceil(v_n / 2.0);
  for r in
    select mp.user_id, coalesce(pr.position, 'MID') = 'GK' as gk,
           (case coalesce(pr.level, 'intermediate') when 'advanced' then 3 when 'beginner' then 1 else 2 end)
             + random() * (case when p_shuffle then 1.6 else 0.2 end) as score
    from public.match_players mp left join public.profiles pr on pr.id = mp.user_id
    where mp.match_id = p_match
    order by (coalesce(pr.position, 'MID') = 'GK') desc, 3 desc
  loop
    if r.gk and v_gk < 2 then
      -- The first two keepers go one to each side (randomly when reshuffling).
      v_gk := v_gk + 1;
      if v_gk = 1 then v_t := case when p_shuffle and random() < 0.5 then 'B' else 'A' end;
      else v_t := case when ca <= cb then 'A' else 'B' end; end if;
    elsif ca >= v_cap then v_t := 'B';
    elsif cb >= v_cap then v_t := 'A';
    elsif sa < sb or (sa = sb and ca <= cb) then v_t := 'A';
    else v_t := 'B';
    end if;
    update public.match_players set team = v_t where match_id = p_match and user_id = r.user_id;
    if v_t = 'A' then sa := sa + r.score; ca := ca + 1; else sb := sb + r.score; cb := cb + 1; end if;
  end loop;
end $$;

create or replace function public.set_player_team(p_match uuid, p_user uuid, p_team text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public._require_organizer(p_match);
  if p_team is not null and p_team not in ('A', 'B') then raise exception 'invalid_team'; end if;
  update public.match_players set team = p_team where match_id = p_match and user_id = p_user;
  if not found then raise exception 'not_in_match'; end if;
end $$;

do $$
declare f text;
begin
  foreach f in array array['match_invite_code(uuid)', 'set_match_private(uuid, boolean)', 'join_match(uuid)', 'join_match_by_code(text)',
    'join_waitlist(uuid)', 'invite_team_to_match(uuid, uuid)', 'balance_teams(uuid, boolean)', 'set_player_team(uuid, uuid, text)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
revoke execute on function public._new_match_code(), public._require_organizer(uuid) from public, anon, authenticated;
