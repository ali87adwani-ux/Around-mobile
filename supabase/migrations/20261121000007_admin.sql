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
