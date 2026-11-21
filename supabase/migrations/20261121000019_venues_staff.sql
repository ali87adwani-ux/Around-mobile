-- Al Dawri v6
--  1. Venues with several identical courts: one listing, N courts. A booking takes any free court;
--     the hour shows as full only when every court is taken.
--  2. Staff: an owner invites staff to a pitch with a code. Staff run the daily schedule
--     (see bookings, block / unblock, cancel, no-show) but never see revenue, prices or invoices.

-- ============================================================== 1. courts
alter table public.pitches add column if not exists courts int not null default 1;
alter table public.pitches drop constraint if exists pitches_courts_check;
alter table public.pitches add constraint pitches_courts_check check (courts between 1 and 20);

alter table public.bookings add column if not exists court_no int not null default 1;
alter table public.bookings drop constraint if exists bookings_no_overlap;
alter table public.bookings add constraint bookings_no_overlap exclude using gist
  (pitch_id with =, court_no with =, tstzrange(starts_at, ends_at) with &&) where (status <> 'cancelled');

-- Busy = half-hour slots where every court is taken (same signature as before, so older apps keep working).
create or replace function public.pitch_busy(p_pitch uuid, p_day date)
returns table (starts_at timestamptz, ends_at timestamptz, kind text)
language sql stable security definer set search_path = '' as $$
  with p as (select courts from public.pitches where id = p_pitch),
  slots as (
    select (p_day::timestamp at time zone 'Asia/Kuwait') + make_interval(mins => 30 * g) s
    from generate_series(0, 47) g
  )
  select s, s + interval '30 minutes', 'full'
  from slots, p
  where (select count(*) from public.bookings b
          where b.pitch_id = p_pitch and b.status <> 'cancelled'
            and b.starts_at < slots.s + interval '30 minutes' and b.ends_at > slots.s) >= p.courts
$$;

-- Free courts per half hour for a day (owner / staff schedule and the booking screen).
create or replace function public.pitch_free_courts(p_pitch uuid, p_day date)
returns table (starts_at timestamptz, free int, courts int)
language sql stable security definer set search_path = '' as $$
  with p as (select courts from public.pitches where id = p_pitch),
  slots as (select (p_day::timestamp at time zone 'Asia/Kuwait') + make_interval(mins => 30 * g) s from generate_series(0, 47) g)
  select s, (p.courts - (select count(*) from public.bookings b where b.pitch_id = p_pitch and b.status <> 'cancelled'
                           and b.starts_at < slots.s + interval '30 minutes' and b.ends_at > slots.s))::int, p.courts
  from slots, p
$$;

-- Book any free court.
create or replace function public.book_pitch(p_pitch uuid, p_starts timestamptz, p_hours numeric, p_size int)
returns public.bookings
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_pitch public.pitches;
  v_row public.bookings;
  c int;
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;
  select * into v_pitch from public.pitches where id = p_pitch and active;
  if not found then raise exception 'pitch_not_found'; end if;
  perform public._check_slot(v_pitch, p_starts, p_hours, p_size);
  for c in 1..v_pitch.courts loop
    begin
      insert into public.bookings (pitch_id, user_id, starts_at, ends_at, size, total, status, court_no)
      values (p_pitch, v_uid, p_starts, p_starts + make_interval(mins => (p_hours * 60)::int), p_size,
              round(v_pitch.price_per_hour * public.size_multiplier(p_size) * p_hours * public.off_peak_factor(p_starts) * 2) / 2, 'confirmed', c)
      returning * into v_row;
      return v_row;
    exception when exclusion_violation then
      null;  -- try the next court
    end;
  end loop;
  raise exception 'slot_taken';
end $$;

create or replace function public.set_pitch_courts(p_pitch uuid, p_courts int) returns void
language plpgsql security definer set search_path = '' as $$
declare v public.pitches;
begin
  select * into v from public.pitches where id = p_pitch;
  if not found then raise exception 'not_found'; end if;
  if v.owner_id is distinct from auth.uid() and not public.is_admin() then raise exception 'not_your_pitch'; end if;
  if p_courts < 1 or p_courts > 20 then raise exception 'invalid_courts'; end if;
  if exists (select 1 from public.bookings where pitch_id = p_pitch and court_no > p_courts and status <> 'cancelled' and ends_at > now()) then
    raise exception 'courts_in_use';
  end if;
  update public.pitches set courts = p_courts where id = p_pitch;
end $$;

-- ============================================================== 2. staff
create table if not exists public.pitch_staff (
  pitch_id uuid not null references public.pitches (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (pitch_id, user_id)
);
create index if not exists pitch_staff_user_idx on public.pitch_staff (user_id);
alter table public.pitch_staff enable row level security;
drop policy if exists "staff and owners see staff" on public.pitch_staff;
create policy "staff and owners see staff" on public.pitch_staff for select to authenticated using (
  user_id = (select auth.uid()) or public.is_admin()
  or exists (select 1 from public.pitches p where p.id = pitch_id and p.owner_id = (select auth.uid()))
);

create table if not exists public.staff_invites (
  code text primary key,
  pitch_id uuid not null references public.pitches (id) on delete cascade,
  created_by uuid references public.profiles (id) on delete cascade,
  expires_at timestamptz not null default now() + interval '7 days'
);
alter table public.staff_invites enable row level security;  -- only through the functions below

-- Owner, staff of that pitch, or admin.
create or replace function public._operate_pitch(p_pitch uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_admin()
      or exists (select 1 from public.pitches where id = p_pitch and owner_id = (select auth.uid()))
      or exists (select 1 from public.pitch_staff where pitch_id = p_pitch and user_id = (select auth.uid()))
$$;

create or replace function public.create_staff_invite(p_pitch uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare v_code text := upper(substr(md5(random()::text || p_pitch::text || clock_timestamp()::text), 1, 6));
begin
  if not exists (select 1 from public.pitches where id = p_pitch and owner_id = auth.uid()) and not public.is_admin() then raise exception 'not_your_pitch'; end if;
  delete from public.staff_invites where expires_at < now();
  insert into public.staff_invites (code, pitch_id, created_by) values (v_code, p_pitch, auth.uid());
  return v_code;
end $$;

create or replace function public.accept_staff_invite(p_code text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v public.staff_invites; v_owner uuid; v_name text; v_pitch text;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  select * into v from public.staff_invites where code = upper(trim(p_code)) and expires_at > now();
  if not found then raise exception 'invalid_code'; end if;
  select owner_id, name_ar into v_owner, v_pitch from public.pitches where id = v.pitch_id;
  if v_owner = auth.uid() then raise exception 'already_owner'; end if;
  insert into public.pitch_staff (pitch_id, user_id) values (v.pitch_id, auth.uid()) on conflict do nothing;
  delete from public.staff_invites where code = v.code;
  select coalesce(name, '') into v_name from public.profiles where id = auth.uid();
  perform public._notify(v_owner, 'staff_joined', 'موظف جديد انضم 👤', 'New staff member 👤',
    v_name || ' صار يدير حجوزات ' || v_pitch, v_name || ' now manages bookings for ' || v_pitch, jsonb_build_object('pitch_id', v.pitch_id));
  return v.pitch_id;
end $$;

create or replace function public.remove_staff(p_pitch uuid, p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not (p_user = auth.uid() or public.is_admin() or exists (select 1 from public.pitches where id = p_pitch and owner_id = auth.uid())) then raise exception 'not_allowed'; end if;
  delete from public.pitch_staff where pitch_id = p_pitch and user_id = p_user;
end $$;

create or replace function public.pitch_staff_list(p_pitch uuid)
returns table (user_id uuid, name text, avatar_url text, added_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.pitches where id = p_pitch and owner_id = auth.uid()) and not public.is_admin() then raise exception 'not_your_pitch'; end if;
  return query select s.user_id, coalesce(pr.name, ''), pr.avatar_url, s.added_at
    from public.pitch_staff s left join public.profiles pr on pr.id = s.user_id where s.pitch_id = p_pitch order by s.added_at;
end $$;

create or replace function public.my_staff_pitches() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select pitch_id from public.pitch_staff where user_id = (select auth.uid())
$$;

-- Day view for owners and staff, with the court number and no-show flag.
create or replace function public.owner_day_v3(p_pitch uuid, p_day date)
returns table (id uuid, starts_at timestamptz, ends_at timestamptz, status text, size int, total numeric, player_name text, no_show boolean, court_no int)
language plpgsql stable security definer set search_path = '' as $$
declare v_staff boolean;
begin
  if not public._operate_pitch(p_pitch) then raise exception 'not_your_pitch'; end if;
  v_staff := not public.is_admin() and not exists (select 1 from public.pitches pp where pp.id = p_pitch and pp.owner_id = auth.uid());
  return query
    select b.id, b.starts_at, b.ends_at, b.status, b.size, case when v_staff then 0::numeric else b.total end, coalesce(pr.name, ''), b.no_show, b.court_no
    from public.bookings b left join public.profiles pr on pr.id = b.user_id
    where b.pitch_id = p_pitch and b.status <> 'cancelled'
      and b.starts_at < ((p_day + 1)::timestamp at time zone 'Asia/Kuwait') and b.ends_at > (p_day::timestamp at time zone 'Asia/Kuwait')
    order by b.starts_at, b.court_no;
end $$;

-- Block a slot on the next free court (owner or staff).
create or replace function public.owner_block_slot(p_pitch uuid, p_starts timestamptz, p_hours numeric)
returns public.bookings language plpgsql security definer set search_path = '' as $$
declare v_row public.bookings; v_courts int; c int;
begin
  if not public._operate_pitch(p_pitch) then raise exception 'not_your_pitch'; end if;
  select courts into v_courts from public.pitches where id = p_pitch;
  for c in 1..coalesce(v_courts, 1) loop
    begin
      insert into public.bookings (pitch_id, user_id, starts_at, ends_at, status, court_no)
      values (p_pitch, auth.uid(), p_starts, p_starts + make_interval(mins => (p_hours * 60)::int), 'blocked', c)
      returning * into v_row;
      return v_row;
    exception when exclusion_violation then
      null;
    end;
  end loop;
  raise exception 'slot_taken';
end $$;

create or replace function public.owner_unblock(p_booking uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_pitch uuid;
begin
  select pitch_id into v_pitch from public.bookings where id = p_booking and status = 'blocked';
  if not found or not public._operate_pitch(v_pitch) then raise exception 'not_found'; end if;
  update public.bookings set status = 'cancelled' where id = p_booking;
end $$;

create or replace function public.owner_cancel_booking(p_booking uuid, p_reason text default '') returns void
language plpgsql security definer set search_path = '' as $$
declare b public.bookings;
begin
  select * into b from public.bookings where id = p_booking and status = 'confirmed';
  if not found then raise exception 'booking_not_found'; end if;
  if not public._operate_pitch(b.pitch_id) then raise exception 'not_your_pitch'; end if;
  update public.bookings set status = 'cancelled' where id = p_booking;
  update public.matches set status = 'cancelled' where booking_id = p_booking and status = 'open';
  if coalesce(trim(p_reason), '') <> '' then
    perform public._notify(b.user_id, 'booking_cancel_reason', 'سبب إلغاء الحجز', 'Why your booking was cancelled', p_reason, p_reason, jsonb_build_object('booking_id', p_booking));
  end if;
end $$;

create or replace function public.owner_mark_no_show(p_booking uuid, p_no_show boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare b public.bookings;
begin
  select * into b from public.bookings where id = p_booking and status = 'confirmed';
  if not found then raise exception 'booking_not_found'; end if;
  if not public._operate_pitch(b.pitch_id) then raise exception 'not_your_pitch'; end if;
  if b.starts_at > now() then raise exception 'not_started'; end if;
  update public.bookings set no_show = coalesce(p_no_show, true) where id = p_booking;
end $$;

-- Staff also hear about new and cancelled bookings on their pitch.
create or replace function public._on_booking_staff() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r record; p public.pitches;
begin
  select * into p from public.pitches where id = new.pitch_id;
  for r in select user_id from public.pitch_staff where pitch_id = new.pitch_id and user_id is distinct from auth.uid() loop
    if tg_op = 'INSERT' and new.status = 'confirmed' then
      perform public._notify(r.user_id, 'booking_new', 'حجز جديد 📅', 'New booking 📅', p.name_ar || ' · ' || public._kw_time(new.starts_at), p.name_en || ' · ' || public._kw_time(new.starts_at),
        jsonb_build_object('pitch_id', p.id, 'booking_id', new.id));
    elsif tg_op = 'UPDATE' and old.status = 'confirmed' and new.status = 'cancelled' then
      perform public._notify(r.user_id, 'booking_cancelled', 'انلغى حجز', 'Booking cancelled', p.name_ar || ' · ' || public._kw_time(new.starts_at), p.name_en || ' · ' || public._kw_time(new.starts_at),
        jsonb_build_object('pitch_id', p.id, 'booking_id', new.id));
    end if;
  end loop;
  return new;
end $$;
drop trigger if exists booking_notify_staff on public.bookings;
create trigger booking_notify_staff after insert or update of status on public.bookings
  for each row execute function public._on_booking_staff();

-- ============================================================== grants
revoke execute on function public._on_booking_staff() from public, anon, authenticated;
revoke execute on function public._operate_pitch(uuid) from public, anon;
grant execute on function public._operate_pitch(uuid) to authenticated;
grant execute on function public.pitch_busy(uuid, date), public.pitch_free_courts(uuid, date) to anon, authenticated;
do $$
declare f text;
begin
  foreach f in array array[
    'set_pitch_courts(uuid, int)', 'create_staff_invite(uuid)', 'accept_staff_invite(text)', 'remove_staff(uuid, uuid)', 'pitch_staff_list(uuid)',
    'my_staff_pitches()', 'owner_day_v3(uuid, date)', 'owner_block_slot(uuid, timestamptz, numeric)', 'owner_unblock(uuid)',
    'owner_cancel_booking(uuid, text)', 'owner_mark_no_show(uuid, boolean)', 'book_pitch(uuid, timestamptz, numeric, int)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
