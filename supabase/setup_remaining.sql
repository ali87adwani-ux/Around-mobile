-- Al Dawri: remaining database setup (run once in the Supabase SQL Editor)

-- ===== 20261121000002_functions.sql =====
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

-- Lock down: internal helpers are not callable from the API; actions need a signed-in user.
revoke execute on function public.kw_hour(timestamptz), public.size_multiplier(int), public.off_peak_factor(timestamptz),
  public._check_slot(public.pitches, timestamptz, numeric, int), public._own_pitch(uuid), public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.book_pitch(uuid, timestamptz, numeric, int), public.cancel_booking(uuid),
  public.create_match(uuid, timestamptz, numeric, int, text), public.join_match(uuid), public.leave_match(uuid),
  public.register_team(uuid, text), public.owner_day(uuid, date), public.owner_block_slot(uuid, timestamptz, numeric),
  public.owner_unblock(uuid) from public, anon;
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

-- ===== 20261121000003_seed.sql =====
-- Al Dawri — starter data (Kuwait). Pitches without an owner until a pitch owner claims them.
insert into public.pitches (name_ar, name_en, area_ar, area_en, address_ar, address_en, governorate, price_per_hour, sizes, surface, indoor, amenities, open_from, open_to, lat, lng, rating, reviews, tint) values
  ('ملعب النخبة', 'Elite Arena', 'السالمية', 'Salmiya', 'شارع البلاجات، قطعة 12', 'Gulf Road, Block 12', 'hawalli', 20, '{5,7}', 'artificial', false, '{parking,showers,lights,cafe,changing,balls}', 14, 24, 29.3339, 48.0761, 4.8, 214, '{#0B2E6F,#1E56B3}'),
  ('ملعب الفريج', 'Freej Pitch', 'حولي', 'Hawalli', 'شارع تونس، قطعة 3', 'Tunis St, Block 3', 'hawalli', 15, '{5}', 'artificial', false, '{lights,changing,balls}', 15, 24, 29.3375, 48.0286, 4.5, 132, '{#0E4D7A,#2A86C4}'),
  ('القبة الخضراء', 'Green Dome', 'مشرف', 'Mishref', 'طريق الملك فهد، بجانب أرض المعارض', 'King Fahad Rd, by the Fairground', 'hawalli', 30, '{5,7}', 'artificial', true, '{parking,showers,lights,cafe,changing,balls,wifi,ac}', 10, 24, 29.2747, 48.0658, 4.9, 341, '{#0F5F5C,#1E9B8F}'),
  ('ملاعب الأبطال', 'Champions Fields', 'الجابرية', 'Jabriya', 'شارع 101، قطعة 11', 'Street 101, Block 11', 'hawalli', 45, '{7,11}', 'natural', false, '{parking,showers,lights,changing}', 8, 23, 29.3172, 48.0306, 4.7, 98, '{#2B3A55,#55698C}'),
  ('كورة سيتي', 'Kora City', 'الجهراء', 'Jahra', 'طريق الجهراء، قطعة 5', 'Jahra Rd, Block 5', 'jahra', 12, '{5}', 'artificial', false, '{lights,cafe}', 16, 24, 29.3375, 47.6581, 4.3, 76, '{#3A2F7A,#6457C2}'),
  ('ملعب الواجهة', 'Waterfront Pitch', 'الشويخ', 'Shuwaikh', 'الشويخ الصناعية، شارع 24', 'Shuwaikh Industrial, Street 24', 'capital', 35, '{5,7}', 'artificial', false, '{parking,lights,changing,cafe}', 12, 24, 29.3436, 47.9389, 4.6, 158, '{#0B4466,#2E7FAE}');

with t as (
  insert into public.tournaments (name_ar, name_en, pitch_id, format, status, starts_on, max_teams, entry_fee, prize, tint)
  values
    ('دوري ليالي الشتاء', 'Winter Nights League', (select id from public.pitches where name_en = 'Elite Arena'), 5, 'live', current_date - 6, 8, 60, 500, '{#0B2E6F,#04132F}'),
    ('كأس المناطق', 'Areas Cup', (select id from public.pitches where name_en = 'Green Dome'), 7, 'open', current_date + 9, 12, 80, 750, '{#1E56B3,#071E4B}'),
    ('بطولة الربيع', 'Spring Classic', (select id from public.pitches where name_en = 'Champions Fields'), 11, 'finished', current_date - 40, 4, 150, 1200, '{#3B4A66,#151E30}')
  returning id, name_en
)
insert into public.tournament_teams (tournament_id, name_ar, name_en, color, played, won, drawn, lost, gf, ga)
select t.id, v.name_ar, v.name_en, v.color, v.played, v.won, v.drawn, v.played - v.won - v.drawn, v.gf, v.ga
from t join (values
  ('Winter Nights League', 'الصقور', 'Falcons', '#0B6E4F', 3, 3, 0, 14, 4),
  ('Winter Nights League', 'النمور', 'Tigers', '#E65100', 3, 2, 0, 10, 6),
  ('Winter Nights League', 'العاصفة', 'Storm', '#1D4E89', 3, 1, 1, 7, 7),
  ('Winter Nights League', 'الفرسان', 'Knights', '#6A1B9A', 3, 1, 1, 6, 8),
  ('Winter Nights League', 'الأسود', 'Lions', '#C2185B', 3, 1, 0, 5, 9),
  ('Winter Nights League', 'البرق', 'Lightning', '#00838F', 3, 0, 0, 3, 11),
  ('Areas Cup', 'شباب السالمية', 'Salmiya Youth', '#1D4E89', 0, 0, 0, 0, 0),
  ('Areas Cup', 'نجوم الجهراء', 'Jahra Stars', '#E65100', 0, 0, 0, 0, 0),
  ('Areas Cup', 'الكتيبة', 'The Squad', '#2E7D32', 0, 0, 0, 0, 0),
  ('Areas Cup', 'عيال الفريج', 'Freej Boys', '#AD1457', 0, 0, 0, 0, 0),
  ('Areas Cup', 'الأحرار', 'Free Kicks', '#283593', 0, 0, 0, 0, 0),
  ('Spring Classic', 'الصاعقة', 'Thunder', '#5D4037', 3, 3, 0, 9, 2),
  ('Spring Classic', 'الحرس', 'Guardians', '#00695C', 3, 1, 1, 5, 5),
  ('Spring Classic', 'الأمواج', 'Waves', '#1565C0', 3, 1, 0, 4, 6),
  ('Spring Classic', 'النسور', 'Eagles', '#BF360C', 3, 0, 1, 2, 7)
) as v(tname, name_ar, name_en, color, played, won, drawn, gf, ga) on v.tname = t.name_en;

insert into public.fixtures (tournament_id, home_id, away_id, starts_at, home_score, away_score)
select tt.tournament_id, h.id, a.id, (current_date + f.day_off)::timestamp at time zone 'Asia/Kuwait' + make_interval(hours => f.hour), f.hs, f.aws
from (values
  ('Falcons', 'Tigers', -3, 21, 3, 1), ('Storm', 'Knights', -3, 22, 2, 2), ('Lions', 'Lightning', -2, 21, 2, 1),
  ('Falcons', 'Storm', 1, 21, null, null), ('Tigers', 'Lions', 1, 22, null, null), ('Knights', 'Lightning', 2, 21, null, null),
  ('Thunder', 'Guardians', -40, 18, 3, 1), ('Waves', 'Eagles', -40, 20, 2, 1), ('Thunder', 'Waves', -33, 19, 4, 0)
) as f(home, away, day_off, hour, hs, aws)
join public.tournament_teams h on h.name_en = f.home
join public.tournament_teams a on a.name_en = f.away and a.tournament_id = h.tournament_id
join public.tournament_teams tt on tt.id = h.id;

-- ===== 20261121000004_avatars.sql =====
-- Profile photos: public bucket, each user writes only inside their own folder (<user id>/...).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, '{image/jpeg,image/png,image/webp}')
on conflict (id) do nothing;

create policy "users upload their own avatar" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "users replace their own avatar" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "users delete their own avatar" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ===== 20261121000005_support.sql =====
-- Technical support: tickets with a message thread. Players see their own tickets; admins see all.

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin')
$$;
grant execute on function public.is_admin() to authenticated;

create table public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  category text not null check (category in ('booking', 'payment', 'account', 'pitch', 'academy', 'other')),
  subject text not null check (length(subject) between 3 and 120),
  status text not null default 'open' check (status in ('open', 'answered', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index support_tickets_user_idx on public.support_tickets (user_id, updated_at desc);
create index support_tickets_status_idx on public.support_tickets (status, updated_at desc);

create table public.support_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  from_support boolean not null default false,
  body text not null check (length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index support_messages_ticket_idx on public.support_messages (ticket_id, created_at);

alter table public.support_tickets enable row level security;
alter table public.support_messages enable row level security;

create policy "users see their tickets, admins see all" on public.support_tickets
  for select to authenticated using (user_id = (select auth.uid()) or public.is_admin());
create policy "users open tickets" on public.support_tickets
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "users close their tickets, admins update any" on public.support_tickets
  for update to authenticated using (user_id = (select auth.uid()) or public.is_admin());

create policy "thread visible to ticket owner and admins" on public.support_messages
  for select to authenticated using (
    public.is_admin() or exists (select 1 from public.support_tickets t where t.id = ticket_id and t.user_id = (select auth.uid()))
  );
create policy "ticket owner and admins post messages" on public.support_messages
  for insert to authenticated with check (
    author_id = (select auth.uid()) and (
      (from_support and public.is_admin())
      or (not from_support and exists (select 1 from public.support_tickets t where t.id = ticket_id and t.user_id = (select auth.uid())))
    )
  );

-- Keep ticket status and ordering in step with the thread.
create or replace function public.on_support_message() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.support_tickets
     set updated_at = now(),
         status = case when new.from_support then 'answered' else 'open' end
   where id = new.ticket_id;
  return new;
end $$;
create trigger support_message_added after insert on public.support_messages
  for each row execute function public.on_support_message();

-- ===== 20261121000006_academies.sql =====
-- Football academies: programs (by age group and schedule) and child enrollments.

create table public.academies (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.profiles (id) on delete set null,
  name_ar text not null,
  name_en text not null,
  area_ar text not null,
  area_en text not null,
  governorate text not null,
  about_ar text not null default '',
  about_en text not null default '',
  rating numeric(2, 1) not null default 0,
  tint text[] not null default '{#0B2E6F,#1E56B3}',
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index academies_owner_idx on public.academies (owner_id);

create table public.academy_programs (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.academies (id) on delete cascade,
  name_ar text not null,
  name_en text not null,
  coach_ar text not null default '',
  coach_en text not null default '',
  age_min int not null check (age_min between 3 and 60),
  age_max int not null check (age_max >= age_min),
  level text not null default 'beginner' check (level in ('beginner', 'intermediate', 'advanced')),
  days int[] not null check (array_length(days, 1) between 1 and 7),  -- 0 = Sunday … 6 = Saturday
  start_hour numeric(4, 2) not null check (start_hour between 6 and 23),
  duration_hours numeric(3, 1) not null default 1.5,
  monthly_fee numeric(8, 3) not null check (monthly_fee >= 0),
  capacity int not null check (capacity between 1 and 200),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index academy_programs_academy_idx on public.academy_programs (academy_id);

create table public.academy_enrollments (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.academy_programs (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  child_name text not null check (length(child_name) between 2 and 60),
  child_age int not null check (child_age between 3 and 60),
  status text not null default 'active' check (status in ('active', 'cancelled')),
  created_at timestamptz not null default now()
);
create index academy_enrollments_program_idx on public.academy_enrollments (program_id) where status = 'active';
create index academy_enrollments_user_idx on public.academy_enrollments (user_id);

alter table public.academies enable row level security;
alter table public.academy_programs enable row level security;
alter table public.academy_enrollments enable row level security;

create or replace function public.owns_academy(p_academy uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.academies where id = p_academy and owner_id = (select auth.uid()))
$$;
grant execute on function public.owns_academy(uuid) to authenticated;

create policy "academies are public" on public.academies for select to anon, authenticated using (active or owner_id = (select auth.uid()) or public.is_admin());
create policy "owners edit their academy" on public.academies for update to authenticated using (owner_id = (select auth.uid()) or public.is_admin());

create policy "programs are public" on public.academy_programs for select to anon, authenticated using (true);
create policy "owners add programs" on public.academy_programs for insert to authenticated with check (public.owns_academy(academy_id));
create policy "owners edit programs" on public.academy_programs for update to authenticated using (public.owns_academy(academy_id)) with check (public.owns_academy(academy_id));
create policy "owners delete programs" on public.academy_programs for delete to authenticated using (public.owns_academy(academy_id));

create policy "parents, academy owners and admins see enrollments" on public.academy_enrollments
  for select to authenticated using (
    user_id = (select auth.uid()) or public.is_admin()
    or exists (select 1 from public.academy_programs p where p.id = program_id and public.owns_academy(p.academy_id))
  );

-- Active enrollment counts per program (public; no personal data).
create or replace function public.program_counts()
returns table (program_id uuid, enrolled bigint)
language sql stable security definer set search_path = '' as $$
  select program_id, count(*) from public.academy_enrollments where status = 'active' group by program_id
$$;
grant execute on function public.program_counts() to anon, authenticated;

create or replace function public.enroll_child(p_program uuid, p_child_name text, p_child_age int)
returns public.academy_enrollments language plpgsql security definer set search_path = '' as $$
declare v_p public.academy_programs; v_count int; v_row public.academy_enrollments;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  select * into v_p from public.academy_programs where id = p_program and active for update;
  if not found then raise exception 'program_not_found'; end if;
  if p_child_age < v_p.age_min or p_child_age > v_p.age_max then raise exception 'age_out_of_range'; end if;
  select count(*) into v_count from public.academy_enrollments where program_id = p_program and status = 'active';
  if v_count >= v_p.capacity then raise exception 'program_full'; end if;
  insert into public.academy_enrollments (program_id, user_id, child_name, child_age)
  values (p_program, auth.uid(), trim(p_child_name), p_child_age) returning * into v_row;
  return v_row;
end $$;
grant execute on function public.enroll_child(uuid, text, int) to authenticated;

-- Parents cancel their own; academy owners can remove a student from their programs.
create or replace function public.cancel_enrollment(p_enrollment uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.academy_enrollments e set status = 'cancelled'
  where e.id = p_enrollment and e.status = 'active'
    and (e.user_id = auth.uid() or public.is_admin()
         or exists (select 1 from public.academy_programs p where p.id = e.program_id and public.owns_academy(p.academy_id)));
  if not found then raise exception 'not_found'; end if;
end $$;
grant execute on function public.cancel_enrollment(uuid) to authenticated;

-- Starter academies (Kuwait)
with a as (
  insert into public.academies (name_ar, name_en, area_ar, area_en, governorate, about_ar, about_en, rating, tint) values
    ('أكاديمية النجوم', 'Stars Academy', 'السالمية', 'Salmiya', 'hawalli', 'تدريب كرة قدم للأطفال والناشئين بإشراف مدربين معتمدين.', 'Football coaching for kids and juniors with licensed coaches.', 4.8, '{#0B2E6F,#1E56B3}'),
    ('أكاديمية الصقر', 'Falcon Academy', 'مشرف', 'Mishref', 'hawalli', 'برامج مهارات وحراسة مرمى بملعب مغطّى ومكيّف.', 'Skills and goalkeeping programs on an air-conditioned indoor pitch.', 4.7, '{#0F5F5C,#1E9B8F}'),
    ('أكاديمية الجهراء', 'Jahra Football School', 'الجهراء', 'Jahra', 'jahra', 'تأسيس الصغار وتطوير الناشئين بأسعار مناسبة.', 'Foundations for little ones and development for juniors at fair prices.', 4.5, '{#3A2F7A,#6457C2}')
  returning id, name_en
)
insert into public.academy_programs (academy_id, name_ar, name_en, coach_ar, coach_en, age_min, age_max, level, days, start_hour, duration_hours, monthly_fee, capacity)
select a.id, v.name_ar, v.name_en, v.coach_ar, v.coach_en, v.age_min, v.age_max, v.level, v.days, v.start_hour, v.dur, v.fee, v.cap
from a join (values
  ('Stars Academy', 'البراعم', 'Little Stars', 'كابتن فهد', 'Coach Fahad', 5, 7, 'beginner', '{0,2}'::int[], 16.5, 1.0, 30, 16),
  ('Stars Academy', 'الأشبال', 'Cubs', 'كابتن فهد', 'Coach Fahad', 8, 11, 'beginner', '{1,3}'::int[], 17.0, 1.5, 35, 20),
  ('Stars Academy', 'الناشئين', 'Juniors', 'كابتن بدر', 'Coach Bader', 12, 15, 'intermediate', '{0,2,4}'::int[], 18.0, 1.5, 45, 22),
  ('Falcon Academy', 'حراس المرمى', 'Goalkeepers', 'كابتن سالم', 'Coach Salem', 9, 16, 'intermediate', '{1,4}'::int[], 17.5, 1.5, 40, 10),
  ('Falcon Academy', 'مهارات فردية', 'Skills Lab', 'كابتن مشعل', 'Coach Meshal', 7, 13, 'beginner', '{6}'::int[], 10.0, 2.0, 38, 18),
  ('Jahra Football School', 'التأسيس', 'Foundations', 'كابتن ناصر', 'Coach Nasser', 6, 9, 'beginner', '{0,3}'::int[], 16.0, 1.0, 20, 25),
  ('Jahra Football School', 'التطوير', 'Development', 'كابتن ناصر', 'Coach Nasser', 10, 14, 'intermediate', '{1,3,5}'::int[], 17.0, 1.5, 28, 25)
) as v(aname, name_ar, name_en, coach_ar, coach_en, age_min, age_max, level, days, start_hour, dur, fee, cap) on v.aname = a.name_en;

-- ===== 20261121000007_admin.sql =====
-- Super admin: platform overview and management. Every function checks is_admin().

create or replace function public._require_admin() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'admin_only'; end if;
end $$;

create or replace function public.admin_stats()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v jsonb;
begin
  perform public._require_admin();
  select jsonb_build_object(
    'users', (select count(*) from public.profiles),
    'owners', (select count(*) from public.profiles where role = 'owner'),
    'pitches', (select count(*) from public.pitches where active),
    'academies', (select count(*) from public.academies where active),
    'students', (select count(*) from public.academy_enrollments where status = 'active'),
    'bookings7', (select count(*) from public.bookings where status = 'confirmed' and created_at > now() - interval '7 days'),
    'revenue7', (select coalesce(sum(total), 0) from public.bookings where status = 'confirmed' and created_at > now() - interval '7 days'),
    'openMatches', (select count(*) from public.matches where status = 'open' and starts_at > now()),
    'openTickets', (select count(*) from public.support_tickets where status = 'open'),
    'daily', (
      select coalesce(jsonb_agg(jsonb_build_object('day', d::date, 'count', coalesce(c, 0)) order by d), '[]'::jsonb)
      from generate_series((now() at time zone 'Asia/Kuwait')::date - 6, (now() at time zone 'Asia/Kuwait')::date, interval '1 day') d
      left join (
        select (created_at at time zone 'Asia/Kuwait')::date as day, count(*) c
        from public.bookings where status = 'confirmed' and created_at > now() - interval '8 days' group by 1
      ) b on b.day = d::date
    )
  ) into v;
  return v;
end $$;

create or replace function public.admin_users(p_search text default '')
returns table (id uuid, name text, role text, phone text, email text, avatar_url text, created_at timestamptz, bookings bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public._require_admin();
  return query
    select p.id, p.name, p.role, u.phone::text, u.email::text, p.avatar_url, p.created_at,
           (select count(*) from public.bookings b where b.user_id = p.id and b.status = 'confirmed')
    from public.profiles p join auth.users u on u.id = p.id
    where p_search = '' or p.name ilike '%' || p_search || '%' or u.phone like '%' || p_search || '%' or u.email ilike '%' || p_search || '%'
    order by p.created_at desc
    limit 200;
end $$;

create or replace function public.admin_set_role(p_user uuid, p_role text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public._require_admin();
  if p_role not in ('player', 'owner', 'academy', 'admin') then raise exception 'invalid_role'; end if;
  if p_user = auth.uid() and p_role <> 'admin' then raise exception 'cannot_demote_self'; end if;
  update public.profiles set role = p_role where id = p_user;
end $$;

create or replace function public.admin_update_pitch(p_pitch uuid, p_active boolean, p_owner uuid, p_price numeric)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public._require_admin();
  update public.pitches set active = coalesce(p_active, active), owner_id = p_owner, price_per_hour = coalesce(p_price, price_per_hour) where id = p_pitch;
  if p_owner is not null then update public.profiles set role = 'owner' where id = p_owner and role = 'player'; end if;
end $$;

create or replace function public.admin_update_academy(p_academy uuid, p_active boolean, p_owner uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public._require_admin();
  update public.academies set active = coalesce(p_active, active), owner_id = p_owner where id = p_academy;
  if p_owner is not null then update public.profiles set role = 'academy' where id = p_owner and role = 'player'; end if;
end $$;

create or replace function public.admin_bookings(p_limit int default 100)
returns table (id uuid, pitch_id uuid, starts_at timestamptz, ends_at timestamptz, status text, total numeric, player_name text, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public._require_admin();
  return query
    select b.id, b.pitch_id, b.starts_at, b.ends_at, b.status, b.total, coalesce(p.name, ''), b.created_at
    from public.bookings b left join public.profiles p on p.id = b.user_id
    where b.status <> 'blocked'
    order by b.created_at desc limit least(p_limit, 500);
end $$;

create or replace function public.admin_cancel_booking(p_booking uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public._require_admin();
  update public.bookings set status = 'cancelled' where id = p_booking;
  update public.matches set status = 'cancelled' where booking_id = p_booking;
end $$;

create or replace function public.admin_set_tournament_status(p_tournament uuid, p_status text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public._require_admin();
  if p_status not in ('open', 'live', 'finished') then raise exception 'invalid_status'; end if;
  update public.tournaments set status = p_status where id = p_tournament;
end $$;

create or replace function public.admin_create_tournament(p_name text, p_pitch uuid, p_format int, p_starts_on date, p_max_teams int, p_fee numeric, p_prize numeric)
returns public.tournaments language plpgsql security definer set search_path = '' as $$
declare v public.tournaments;
begin
  perform public._require_admin();
  insert into public.tournaments (name_ar, name_en, pitch_id, format, status, starts_on, max_teams, entry_fee, prize)
  values (p_name, p_name, p_pitch, p_format, 'open', p_starts_on, p_max_teams, p_fee, p_prize) returning * into v;
  return v;
end $$;

-- Announcements shown as a banner on everyone's home screen.
create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  body_ar text not null,
  body_en text not null,
  active boolean not null default true,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.announcements enable row level security;
create policy "active announcements are public" on public.announcements for select to anon, authenticated using (active or public.is_admin());
create policy "admins post announcements" on public.announcements for insert to authenticated with check (public.is_admin());
create policy "admins edit announcements" on public.announcements for update to authenticated using (public.is_admin());

revoke execute on function public._require_admin() from public, anon;
do $$
declare f text;
begin
  foreach f in array array['admin_stats()', 'admin_users(text)', 'admin_set_role(uuid, text)', 'admin_update_pitch(uuid, boolean, uuid, numeric)',
    'admin_update_academy(uuid, boolean, uuid)', 'admin_bookings(int)', 'admin_cancel_booking(uuid)', 'admin_set_tournament_status(uuid, text)',
    'admin_create_tournament(text, uuid, int, date, int, numeric, numeric)']
  loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- Admins also see deactivated pitches.
create policy "admins see all pitches" on public.pitches for select to authenticated using (public.is_admin());

-- ===== 20261121000008_owner_reports.sql =====
-- Pitch owner reports: bookings and revenue per Kuwait day for the last N days.
create or replace function public.owner_report(p_pitch uuid, p_days int default 30)
returns table (day date, bookings bigint, hours numeric, revenue numeric)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public._own_pitch(p_pitch);
  return query
    select d::date,
           count(b.id),
           coalesce(sum(extract(epoch from (b.ends_at - b.starts_at)) / 3600), 0),
           coalesce(sum(b.total), 0)
    from generate_series((now() at time zone 'Asia/Kuwait')::date - (least(p_days, 90) - 1), (now() at time zone 'Asia/Kuwait')::date, interval '1 day') d
    left join public.bookings b
      on b.pitch_id = p_pitch and b.status = 'confirmed' and (b.starts_at at time zone 'Asia/Kuwait')::date = d::date
    group by d order by d;
end $$;
revoke execute on function public.owner_report(uuid, int) from public, anon;
grant execute on function public.owner_report(uuid, int) to authenticated;

-- ===== 20261121000009_reviews.sql =====
-- Pitch reviews. One review per player per pitch; only players who played there can review.
create table public.pitch_reviews (
  id uuid primary key default gen_random_uuid(),
  pitch_id uuid not null references public.pitches (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  comment text not null default '' check (length(comment) <= 500),
  created_at timestamptz not null default now(),
  unique (pitch_id, user_id)
);
create index pitch_reviews_pitch_idx on public.pitch_reviews (pitch_id, created_at desc);
alter table public.pitch_reviews enable row level security;
create policy "reviews are public" on public.pitch_reviews for select to anon, authenticated using (true);
create policy "admins remove reviews" on public.pitch_reviews for delete to authenticated using (public.is_admin());

create or replace function public.review_pitch(p_pitch uuid, p_rating int, p_comment text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  if not exists (select 1 from public.bookings where pitch_id = p_pitch and user_id = auth.uid() and status = 'confirmed' and starts_at < now())
     and not exists (select 1 from public.match_players mp join public.matches m on m.id = mp.match_id
                     where m.pitch_id = p_pitch and mp.user_id = auth.uid() and m.starts_at < now()) then
    raise exception 'play_before_review';
  end if;
  insert into public.pitch_reviews (pitch_id, user_id, rating, comment) values (p_pitch, auth.uid(), p_rating, coalesce(trim(p_comment), ''))
  on conflict (pitch_id, user_id) do update set rating = excluded.rating, comment = excluded.comment, created_at = now();
  update public.pitches set
    rating = (select round(avg(rating)::numeric, 1) from public.pitch_reviews where pitch_id = p_pitch),
    reviews = (select count(*) from public.pitch_reviews where pitch_id = p_pitch)
  where id = p_pitch;
end $$;
revoke execute on function public.review_pitch(uuid, int, text) from public, anon;
grant execute on function public.review_pitch(uuid, int, text) to authenticated;

-- ===== 20261121000010_engagement.sql =====
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
