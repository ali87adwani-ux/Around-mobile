-- Game lifecycle and joining rules:
--  * nobody can join or leave once a game has kicked off;
--  * a player cannot be in two games at the same time;
--  * a player can switch to the other side themselves while it has room (before kickoff);
--  * reminders: players 1 hour before kickoff, organiser at the final whistle to record the result;
--  * tournament players can only leave their team (to join another) while registration is open.

alter table public.matches add column if not exists reminded_soon boolean not null default false;
alter table public.matches add column if not exists reminded_end boolean not null default false;

create or replace function public._join_match(p_match uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_match public.matches; v_count int;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  select * into v_match from public.matches where id = p_match for update;  -- serialises concurrent joins
  if not found or v_match.status <> 'open' then raise exception 'match_not_open'; end if;
  if v_match.starts_at < now() then raise exception 'match_started'; end if;
  if exists (select 1 from public.match_players where match_id = p_match and user_id = auth.uid()) then return; end if;
  if exists (
    select 1 from public.match_players mp join public.matches m on m.id = mp.match_id
    where mp.user_id = auth.uid() and m.id <> p_match and m.status = 'open'
      and tstzrange(m.starts_at, m.starts_at + make_interval(mins => (m.duration_hours * 60)::int))
          && tstzrange(v_match.starts_at, v_match.starts_at + make_interval(mins => (v_match.duration_hours * 60)::int))
  ) then raise exception 'time_clash'; end if;
  select count(*) into v_count from public.match_players where match_id = p_match;
  if v_count >= v_match.max_players then raise exception 'match_full'; end if;
  insert into public.match_players (match_id, user_id) values (p_match, auth.uid()) on conflict do nothing;
end $$;
revoke execute on function public._join_match(uuid) from public, anon, authenticated;

create or replace function public.leave_match(p_match uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_match public.matches;
begin
  select * into v_match from public.matches where id = p_match;
  if not found then raise exception 'match_not_found'; end if;
  if v_match.starts_at <= now() and v_match.status = 'open' then raise exception 'match_started'; end if;
  delete from public.match_players where match_id = p_match and user_id = auth.uid();
  -- If the organizer leaves and nobody else is in, the game and its booking are cancelled.
  if v_match.organizer_id = auth.uid() and not exists (select 1 from public.match_players where match_id = p_match) then
    update public.matches set status = 'cancelled' where id = p_match;
    if v_match.starts_at > now() + interval '6 hours' then
      update public.bookings set status = 'cancelled' where id = v_match.booking_id;
    end if;
  end if;
end $$;

-- A player moves themselves to the other side, if it has a free spot.
create or replace function public.switch_my_team(p_match uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare m public.matches; v_half int; v_mine text; v_target text; v_n int; r record; i int := 0; v_name text;
begin
  select * into m from public.matches where id = p_match for update;
  if not found then raise exception 'match_not_found'; end if;
  if m.status <> 'open' or m.starts_at <= now() then raise exception 'match_started'; end if;
  if not exists (select 1 from public.match_players where match_id = p_match and user_id = auth.uid()) then raise exception 'not_in_match'; end if;
  -- Sides not split yet: lock in the default split (alternating by join order) first.
  if not exists (select 1 from public.match_players where match_id = p_match and team is not null) then
    for r in select user_id from public.match_players where match_id = p_match order by joined_at loop
      update public.match_players set team = case when i % 2 = 0 then 'A' else 'B' end where match_id = p_match and user_id = r.user_id;
      i := i + 1;
    end loop;
  end if;
  select coalesce(team, 'A') into v_mine from public.match_players where match_id = p_match and user_id = auth.uid();
  v_target := case when v_mine = 'A' then 'B' else 'A' end;
  v_half := ceil(m.max_players / 2.0);
  select count(*) into v_n from public.match_players where match_id = p_match and team = v_target;
  if v_n >= v_half then raise exception 'side_full'; end if;
  update public.match_players set team = v_target where match_id = p_match and user_id = auth.uid();
  if m.organizer_id is distinct from auth.uid() then
    select coalesce(name, '') into v_name from public.profiles where id = auth.uid();
    perform public._notify(m.organizer_id, 'player_switched', 'لاعب غيّر فريقه 🔁', 'A player switched sides 🔁',
      v_name || ' انتقل لفريق ' || case v_target when 'A' then 'أ' else 'ب' end,
      v_name || ' moved to Team ' || v_target, jsonb_build_object('match_id', p_match));
  end if;
  return v_target;
end $$;

-- Every 10 minutes: "kick-off in 1 hour" to players, and "record the result" to the organiser at full time.
create or replace function public.send_match_reminders() returns void
language plpgsql security definer set search_path = '' as $$
declare m record; p record; v_pitch text; v_pitch_en text;
begin
  for m in select * from public.matches
           where status = 'open' and not reminded_soon and starts_at between now() and now() + interval '65 minutes' loop
    select name_ar, name_en into v_pitch, v_pitch_en from public.pitches where id = m.pitch_id;
    for p in select user_id from public.match_players where match_id = m.id loop
      perform public._notify(p.user_id, 'match_soon', 'مباراتك بعد ساعة ⏰', 'Your game starts in an hour ⏰',
        v_pitch || ' · ' || public._kw_time(m.starts_at), v_pitch_en || ' · ' || public._kw_time(m.starts_at),
        jsonb_build_object('match_id', m.id));
    end loop;
    update public.matches set reminded_soon = true where id = m.id;
  end loop;
  for m in select * from public.matches
           where status = 'open' and not reminded_end and organizer_id is not null
             and starts_at + make_interval(mins => (duration_hours * 60)::int) <= now()
             and starts_at > now() - interval '2 days' loop
    perform public._notify(m.organizer_id, 'match_ended', 'المباراة خلصت 🏁', 'Full time 🏁',
      'سجّل النتيجة واللي ما حضروا عشان يصوّتون لأفضل لاعب', 'Record the score and no-shows so players can vote for the MVP',
      jsonb_build_object('match_id', m.id));
    update public.matches set reminded_end = true where id = m.id;
  end loop;
end $$;
revoke execute on function public.send_match_reminders() from public, anon, authenticated;

do $$ begin
  create extension if not exists pg_cron;
  perform cron.schedule('aldawri-match-reminders', '*/10 * * * *', 'select public.send_match_reminders()');
exception when others then
  raise notice 'pg_cron not available: match reminders are off';
end $$;

-- Tournament: leaving your team (e.g. to join another one) is only possible while registration is open.
-- Captains and organisers can still remove players later.
create or replace function public.remove_team_player(p_team uuid, p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_tt public.tournament_teams; v_status text;
begin
  select * into v_tt from public.tournament_teams where id = p_team;
  if not found then raise exception 'not_found'; end if;
  if p_user = v_tt.captain_id then raise exception 'captain_cannot_leave'; end if;
  if not (p_user = auth.uid() or v_tt.captain_id = auth.uid() or public._can_manage_tournament(v_tt.tournament_id)) then raise exception 'not_allowed'; end if;
  select status into v_status from public.tournaments where id = v_tt.tournament_id;
  if p_user = auth.uid() and v_tt.captain_id <> auth.uid() and not public._can_manage_tournament(v_tt.tournament_id)
     and v_status <> 'open' then
    raise exception 'registration_closed';
  end if;
  delete from public.team_players where team_id = p_team and user_id = p_user;
end $$;

-- A player already in another team of this tournament gets a clear message (leave that team first).
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
  if exists (select 1 from public.team_players where tournament_id = v_t.id and user_id = auth.uid()) then raise exception 'already_in_team'; end if;
  select count(*) into v_n from public.team_players where team_id = v_team;
  if v_n >= v_t.max_players then raise exception 'team_full'; end if;
  insert into public.team_players (team_id, user_id, tournament_id) values (v_team, auth.uid(), v_t.id);
  select coalesce(name, '') into v_name from public.profiles where id = auth.uid();
  perform public._notify(v_tt.captain_id, 'team_joined', 'لاعب انضم لفريقك', 'A player joined your team',
    v_name || ' انضم لـ' || v_tt.name_ar, v_name || ' joined ' || v_tt.name_en, jsonb_build_object('tournament_id', v_t.id, 'team_id', v_team));
  return v_team;
end $$;

grant execute on function public.switch_my_team(uuid) to authenticated;
revoke execute on function public.switch_my_team(uuid) from anon;
