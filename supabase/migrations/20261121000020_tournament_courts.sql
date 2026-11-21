-- Tournament matches at multi-court venues use any free court (not only court 1).

create or replace function public._schedule(p_t uuid, p_start date, p_days int[], p_start_hour int)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v public.tournaments; p public.pitches; f record;
  v_day date := p_start; v_min int; v_slot int; v_first int;
  v_b uuid; v_ts timestamptz; v_guard int; c int; v_done boolean;
begin
  select * into v from public.tournaments where id = p_t;
  select * into p from public.pitches where id = v.pitch_id;
  v_slot := coalesce(v.slot_minutes, 60);
  v_first := greatest(p_start_hour, p.open_from) * 60;
  v_min := v_first;
  for f in select id from public.fixtures where tournament_id = p_t and status = 'scheduled' and starts_at is null
           order by case stage when 'knockout' then 1 else 0 end, round_no, group_label nulls first, bracket_pos nulls first, id loop
    v_guard := 0;
    loop
      v_guard := v_guard + 1;
      if v_guard > 5000 then raise exception 'no_free_slots'; end if;
      if v_min + v_slot > p.open_to * 60 then v_day := v_day + 1; v_min := v_first; continue; end if;
      if not (extract(dow from v_day)::int = any (p_days)) then v_day := v_day + 1; v_min := v_first; continue; end if;
      v_ts := (v_day + make_interval(mins => v_min))::timestamp at time zone 'Asia/Kuwait';
      if v_ts < now() then v_min := v_min + v_slot; continue; end if;
      v_done := false;
      for c in 1..coalesce(p.courts, 1) loop
        begin
          insert into public.bookings (pitch_id, user_id, starts_at, ends_at, status, court_no)
          values (v.pitch_id, v.organizer_id, v_ts, v_ts + make_interval(mins => v_slot), 'blocked', c) returning id into v_b;
          update public.fixtures set starts_at = v_ts, booking_id = v_b where id = f.id;
          v_done := true;
          exit;
        exception when exclusion_violation then
          null;  -- next court
        end;
      end loop;
      -- One match per time slot keeps the tournament on one court at a time (players and referee move together).
      v_min := v_min + (case when v_done then v_slot else 30 end);
      exit when v_done;
    end loop;
  end loop;
end $$;

create or replace function public.reschedule_fixture(p_fixture uuid, p_starts timestamptz)
returns void language plpgsql security definer set search_path = '' as $$
declare f public.fixtures; v public.tournaments; v_b uuid; v_courts int; c int;
begin
  select * into f from public.fixtures where id = p_fixture;
  if not found then raise exception 'not_found'; end if;
  v := public._require_manage(f.tournament_id);
  if f.status <> 'scheduled' then raise exception 'invalid_status'; end if;
  if p_starts < now() then raise exception 'slot_in_past'; end if;
  select courts into v_courts from public.pitches where id = v.pitch_id;
  if f.booking_id is not null then update public.bookings set status = 'cancelled' where id = f.booking_id; end if;
  for c in 1..coalesce(v_courts, 1) loop
    begin
      insert into public.bookings (pitch_id, user_id, starts_at, ends_at, status, court_no)
      values (v.pitch_id, v.organizer_id, p_starts, p_starts + make_interval(mins => coalesce(v.slot_minutes, 60)), 'blocked', c) returning id into v_b;
      exit;
    exception when exclusion_violation then
      null;
    end;
  end loop;
  if v_b is null then
    if f.booking_id is not null then update public.bookings set status = 'blocked' where id = f.booking_id; end if;
    raise exception 'slot_taken';
  end if;
  update public.fixtures set starts_at = p_starts, booking_id = v_b, reminded = false where id = p_fixture;
  if f.home_id is not null then
    perform public._notify_team(f.home_id, 'fixture_moved', 'تغيّر موعد مباراتكم 📅', 'Match time changed 📅', public._kw_time(p_starts), public._kw_time(p_starts), jsonb_build_object('fixture_id', p_fixture));
  end if;
  if f.away_id is not null then
    perform public._notify_team(f.away_id, 'fixture_moved', 'تغيّر موعد مباراتكم 📅', 'Match time changed 📅', public._kw_time(p_starts), public._kw_time(p_starts), jsonb_build_object('fixture_id', p_fixture));
  end if;
end $$;
