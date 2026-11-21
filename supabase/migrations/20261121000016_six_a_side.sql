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
