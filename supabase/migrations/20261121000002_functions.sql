-- Al Dawri — server-side operations.
-- Every write a player or owner makes goes through one of these functions, which check the rules
-- (opening hours, capacity, ownership) and compute prices on the server.

create or replace function public.kw_hour(ts timestamptz) returns numeric
language sql immutable set search_path = '' as $$
  select extract(hour from ts at time zone 'Asia/Kuwait') + extract(minute from ts at time zone 'Asia/Kuwait') / 60.0
$$;

create or replace function public.size_multiplier(p_size int) returns numeric
language sql immutable set search_path = '' as $$
  select case p_size when 7 then 1.5 when 11 then 2.4 else 1 end
$$;

-- Busy time ranges for a pitch on a Kuwait calendar day, without exposing who booked.
create or replace function public.pitch_busy(p_pitch uuid, p_day date)
returns table (starts_at timestamptz, ends_at timestamptz, kind text)
language sql stable security definer set search_path = '' as $$
  select b.starts_at, b.ends_at, b.status
  from public.bookings b
  where b.pitch_id = p_pitch
    and b.status <> 'cancelled'
    and b.starts_at < ((p_day + 1)::timestamp at time zone 'Asia/Kuwait')
    and b.ends_at > (p_day::timestamp at time zone 'Asia/Kuwait')
$$;

-- Off-peak: kick-off before 5 PM, Sunday to Wednesday (Kuwait time) is 20% cheaper.
create or replace function public.off_peak_factor(ts timestamptz) returns numeric
language sql immutable set search_path = '' as $$
  select case when public.kw_hour(ts) < 17 and extract(dow from ts at time zone 'Asia/Kuwait') between 0 and 3 then 0.8 else 1 end
$$;

create or replace function public._check_slot(p_pitch public.pitches, p_starts timestamptz, p_hours numeric, p_size int)
returns void language plpgsql set search_path = '' as $$
declare h numeric := public.kw_hour(p_starts);
begin
  if p_hours not in (1, 1.5, 2) then raise exception 'invalid_duration'; end if;
  if not (p_size = any (p_pitch.sizes)) then raise exception 'invalid_size'; end if;
  if p_starts < now() then raise exception 'slot_in_past'; end if;
  if p_starts > now() + interval '30 days' then raise exception 'too_far_ahead'; end if;
  if h < p_pitch.open_from or h + p_hours > p_pitch.open_to then raise exception 'outside_opening_hours'; end if;
end $$;

-- Book a pitch. Overlaps are rejected by the bookings_no_overlap constraint.
create or replace function public.book_pitch(p_pitch uuid, p_starts timestamptz, p_hours numeric, p_size int)
returns public.bookings
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_pitch public.pitches;
  v_row public.bookings;
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;
  select * into v_pitch from public.pitches where id = p_pitch and active;
  if not found then raise exception 'pitch_not_found'; end if;
  perform public._check_slot(v_pitch, p_starts, p_hours, p_size);
  insert into public.bookings (pitch_id, user_id, starts_at, ends_at, size, total, status)
  values (p_pitch, v_uid, p_starts, p_starts + make_interval(mins => (p_hours * 60)::int), p_size,
          round(v_pitch.price_per_hour * public.size_multiplier(p_size) * p_hours * public.off_peak_factor(p_starts) * 2) / 2, 'confirmed')
  returning * into v_row;
  return v_row;
exception when exclusion_violation then
  raise exception 'slot_taken';
end $$;

-- Cancel your own booking (free up to 6 hours before kick-off).
create or replace function public.cancel_booking(p_booking uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_row public.bookings;
begin
  select * into v_row from public.bookings where id = p_booking and user_id = auth.uid() and status = 'confirmed';
  if not found then raise exception 'booking_not_found'; end if;
  if v_row.starts_at < now() + interval '6 hours' then raise exception 'too_late_to_cancel'; end if;
  update public.bookings set status = 'cancelled' where id = p_booking;
  update public.matches set status = 'cancelled' where booking_id = p_booking;
end $$;

-- Create a pickup game: books the pitch, creates the match and adds the organizer.
create or replace function public.create_match(p_pitch uuid, p_starts timestamptz, p_hours numeric, p_format int, p_level text)
returns public.matches
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_pitch public.pitches;
  v_booking public.bookings;
  v_match public.matches;
  v_max int := p_format * 2;
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;
  select * into v_pitch from public.pitches where id = p_pitch and active;
  if not found then raise exception 'pitch_not_found'; end if;
  -- Reuse the organizer's own booking for that exact slot if they already booked it.
  select * into v_booking from public.bookings
    where pitch_id = p_pitch and user_id = v_uid and starts_at = p_starts and status = 'confirmed'
      and not exists (select 1 from public.matches m where m.booking_id = bookings.id and m.status = 'open');
  if not found then
    v_booking := public.book_pitch(p_pitch, p_starts, p_hours, p_format);
  end if;
  insert into public.matches (pitch_id, booking_id, organizer_id, starts_at, duration_hours, format, level, price_per_player, max_players)
  values (p_pitch, v_booking.id, v_uid, v_booking.starts_at,
          extract(epoch from (v_booking.ends_at - v_booking.starts_at)) / 3600, p_format, p_level,
          ceil(v_booking.total / v_max * 4) / 4,
          v_max)
  returning * into v_match;
  insert into public.match_players (match_id, user_id) values (v_match.id, v_uid);
  return v_match;
end $$;

create or replace function public.join_match(p_match uuid)
returns void language plpgsql security definer set search_path = '' as $$
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

create or replace function public.leave_match(p_match uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_match public.matches;
begin
  select * into v_match from public.matches where id = p_match;
  if not found then raise exception 'match_not_found'; end if;
  delete from public.match_players where match_id = p_match and user_id = auth.uid();
  -- If the organizer leaves and nobody else is in, the game and its booking are cancelled.
  if v_match.organizer_id = auth.uid() and not exists (select 1 from public.match_players where match_id = p_match) then
    update public.matches set status = 'cancelled' where id = p_match;
    if v_match.starts_at > now() + interval '6 hours' then
      update public.bookings set status = 'cancelled' where id = v_match.booking_id;
    end if;
  end if;
end $$;

create or replace function public.register_team(p_tournament uuid, p_name text)
returns public.tournament_teams language plpgsql security definer set search_path = '' as $$
declare v_t public.tournaments; v_count int; v_row public.tournament_teams;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  if length(trim(p_name)) < 2 then raise exception 'invalid_name'; end if;
  select * into v_t from public.tournaments where id = p_tournament for update;
  if not found or v_t.status <> 'open' then raise exception 'registration_closed'; end if;
  select count(*) into v_count from public.tournament_teams where tournament_id = p_tournament;
  if v_count >= v_t.max_teams then raise exception 'tournament_full'; end if;
  insert into public.tournament_teams (tournament_id, name_ar, name_en, captain_id, color)
  values (p_tournament, trim(p_name), trim(p_name), auth.uid(), '#3E8DD8')
  returning * into v_row;
  return v_row;
exception when unique_violation then
  raise exception 'already_registered';
end $$;

-- ---------------------------------------------------------------- pitch owners
create or replace function public._own_pitch(p_pitch uuid) returns public.pitches
language plpgsql security definer set search_path = '' as $$
declare v public.pitches;
begin
  select * into v from public.pitches where id = p_pitch and owner_id = auth.uid();
  if not found then raise exception 'not_your_pitch'; end if;
  return v;
end $$;

-- Owner view of a day: every live booking with the player's name.
create or replace function public.owner_day(p_pitch uuid, p_day date)
returns table (id uuid, starts_at timestamptz, ends_at timestamptz, status text, size int, total numeric, player_name text)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public._own_pitch(p_pitch);
  return query
    select b.id, b.starts_at, b.ends_at, b.status, b.size, b.total, coalesce(pr.name, '')
    from public.bookings b left join public.profiles pr on pr.id = b.user_id
    where b.pitch_id = p_pitch and b.status <> 'cancelled'
      and b.starts_at < ((p_day + 1)::timestamp at time zone 'Asia/Kuwait')
      and b.ends_at > (p_day::timestamp at time zone 'Asia/Kuwait')
    order by b.starts_at;
end $$;

create or replace function public.owner_block_slot(p_pitch uuid, p_starts timestamptz, p_hours numeric)
returns public.bookings language plpgsql security definer set search_path = '' as $$
declare v_row public.bookings;
begin
  perform public._own_pitch(p_pitch);
  insert into public.bookings (pitch_id, user_id, starts_at, ends_at, status)
  values (p_pitch, auth.uid(), p_starts, p_starts + make_interval(mins => (p_hours * 60)::int), 'blocked')
  returning * into v_row;
  return v_row;
exception when exclusion_violation then
  raise exception 'slot_taken';
end $$;

create or replace function public.owner_unblock(p_booking uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.bookings b set status = 'cancelled'
  where b.id = p_booking and b.status = 'blocked'
    and exists (select 1 from public.pitches p where p.id = b.pitch_id and p.owner_id = auth.uid());
  if not found then raise exception 'not_found'; end if;
end $$;

-- Lock down: functions are callable by signed-in users only (pitch_busy is also public).
revoke execute on all functions in schema public from public, anon;
grant execute on function public.pitch_busy(uuid, date) to anon, authenticated;
grant execute on function public.book_pitch(uuid, timestamptz, numeric, int) to authenticated;
grant execute on function public.cancel_booking(uuid) to authenticated;
grant execute on function public.create_match(uuid, timestamptz, numeric, int, text) to authenticated;
grant execute on function public.join_match(uuid) to authenticated;
grant execute on function public.leave_match(uuid) to authenticated;
grant execute on function public.register_team(uuid, text) to authenticated;
grant execute on function public.owner_day(uuid, date) to authenticated;
grant execute on function public.owner_block_slot(uuid, timestamptz, numeric) to authenticated;
grant execute on function public.owner_unblock(uuid) to authenticated;
