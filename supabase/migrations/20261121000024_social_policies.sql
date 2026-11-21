-- Cancellation, no-show and refund policy per pitch; a chat for every game; friends ("ربعي");
-- sportsmanship ratings and reports.

-- ================================================================ cancellation & refund policy
-- Payment happens at the pitch, so the app shows each pitch's policy and records what happened;
-- the refund itself is settled at the pitch.
alter table public.pitches add column if not exists cancel_hours int not null default 6;
alter table public.pitches add column if not exists late_refund_pct int not null default 0;
do $$ begin
  alter table public.pitches add constraint pitches_cancel_hours_check check (cancel_hours in (0, 2, 3, 6, 12, 24, 48));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.pitches add constraint pitches_late_refund_check check (late_refund_pct in (0, 25, 50, 100));
exception when duplicate_object then null; end $$;
alter table public.bookings add column if not exists cancelled_late boolean not null default false;
alter table public.bookings add column if not exists cancelled_at timestamptz;

-- Players can cancel any time before kick-off. Inside the pitch's free-cancellation window it counts
-- as a late cancellation (the owner is told, and the pitch's late refund rule applies).
drop function if exists public.cancel_booking(uuid);
create or replace function public.cancel_booking(p_booking uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_row public.bookings; p public.pitches; v_late boolean;
begin
  select * into v_row from public.bookings where id = p_booking and user_id = auth.uid() and status = 'confirmed';
  if not found then raise exception 'booking_not_found'; end if;
  if v_row.starts_at <= now() then raise exception 'too_late_to_cancel'; end if;
  select * into p from public.pitches where id = v_row.pitch_id;
  v_late := v_row.starts_at < now() + make_interval(hours => coalesce(p.cancel_hours, 6));
  update public.bookings set status = 'cancelled', cancelled_late = v_late, cancelled_at = now() where id = p_booking;
  update public.matches set status = 'cancelled' where booking_id = p_booking and status = 'open';
  return jsonb_build_object('late', v_late, 'refund_pct', case when v_late then coalesce(p.late_refund_pct, 0) else 100 end);
end $$;
grant execute on function public.cancel_booking(uuid) to authenticated;

create or replace function public.set_pitch_policy(p_pitch uuid, p_cancel_hours int, p_late_refund_pct int)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public._own_pitch(p_pitch);
  update public.pitches set cancel_hours = p_cancel_hours, late_refund_pct = p_late_refund_pct where id = p_pitch;
end $$;

-- How reliable is the player behind a booking (for owners and staff of that pitch).
create or replace function public.booking_reliability(p_booking uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare b public.bookings;
begin
  select * into b from public.bookings where id = p_booking;
  if not found or not public._operate_pitch(b.pitch_id) then raise exception 'not_your_pitch'; end if;
  return jsonb_build_object(
    'bookings', (select count(*) from public.bookings where user_id = b.user_id and status in ('confirmed', 'cancelled')),
    'no_shows', (select count(*) from public.bookings where user_id = b.user_id and no_show),
    'late_cancels', (select count(*) from public.bookings where user_id = b.user_id and cancelled_late),
    'conduct', public.player_conduct(b.user_id));
end $$;

-- Owner gets told when a cancellation is late.
create or replace function public._on_booking() returns trigger
language plpgsql security definer set search_path = '' as $$
declare p public.pitches; v_name text;
begin
  select * into p from public.pitches where id = new.pitch_id;
  select coalesce(name, '') into v_name from public.profiles where id = new.user_id;
  if tg_op = 'INSERT' then
    if new.status = 'confirmed' and p.owner_id is not null and p.owner_id is distinct from new.user_id then
      perform public._notify(p.owner_id, 'booking_new', 'حجز جديد 📅', 'New booking 📅',
        v_name || ' حجز ' || p.name_ar || ' · ' || public._kw_time(new.starts_at),
        v_name || ' booked ' || p.name_en || ' · ' || public._kw_time(new.starts_at),
        jsonb_build_object('pitch_id', p.id, 'booking_id', new.id));
    end if;
  elsif old.status = 'confirmed' and new.status = 'cancelled' then
    if p.owner_id is not null and p.owner_id is distinct from auth.uid() and p.owner_id is distinct from new.user_id then
      if new.cancelled_late then
        perform public._notify(p.owner_id, 'booking_cancelled_late', 'إلغاء متأخر ⚠️', 'Late cancellation ⚠️',
          v_name || ' لغى حجز ' || p.name_ar || ' · ' || public._kw_time(new.starts_at) || ' بعد مهلة الإلغاء المجاني.',
          v_name || ' cancelled ' || p.name_en || ' · ' || public._kw_time(new.starts_at) || ' after the free-cancellation window.',
          jsonb_build_object('pitch_id', p.id, 'booking_id', new.id));
      else
        perform public._notify(p.owner_id, 'booking_cancelled', 'انلغى حجز', 'Booking cancelled',
          p.name_ar || ' · ' || public._kw_time(new.starts_at) || ' صار فاضي.',
          p.name_en || ' · ' || public._kw_time(new.starts_at) || ' is free again.',
          jsonb_build_object('pitch_id', p.id, 'booking_id', new.id));
      end if;
    end if;
    if new.user_id is not null and new.user_id is distinct from auth.uid() then
      perform public._notify(new.user_id, 'booking_cancelled_by_staff', 'انلغى حجزك', 'Your booking was cancelled',
        'حجزك بـ' || p.name_ar || ' (' || public._kw_time(new.starts_at) || ') انلغى. تواصل مع الدعم إذا عندك سؤال.',
        'Your booking at ' || p.name_en || ' (' || public._kw_time(new.starts_at) || ') was cancelled. Contact support with any questions.',
        jsonb_build_object('pitch_id', p.id, 'booking_id', new.id));
    end if;
  end if;
  return new;
end $$;

-- ================================================================ sportsmanship ratings
create table if not exists public.player_ratings (
  match_id uuid not null references public.matches (id) on delete cascade,
  rater_id uuid not null references public.profiles (id) on delete cascade,
  ratee_id uuid not null references public.profiles (id) on delete cascade,
  stars int not null check (stars between 1 and 5),
  created_at timestamptz not null default now(),
  primary key (match_id, rater_id, ratee_id),
  check (rater_id <> ratee_id)
);
alter table public.player_ratings enable row level security;
drop policy if exists "raters see their own ratings" on public.player_ratings;
create policy "raters see their own ratings" on public.player_ratings for select to authenticated using (rater_id = (select auth.uid()));

-- Average sportsmanship (only shown once a player has 3+ ratings, so one grudge can't define anyone).
create or replace function public.player_conduct(p_user uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('avg', case when count(*) >= 3 then round(avg(stars)::numeric, 1) end, 'count', count(*))
  from public.player_ratings where ratee_id = p_user
$$;

create or replace function public.rate_player(p_match uuid, p_ratee uuid, p_stars int) returns void
language plpgsql security definer set search_path = '' as $$
declare m public.matches;
begin
  if p_ratee = auth.uid() then raise exception 'no_self_rating'; end if;
  if p_stars not between 1 and 5 then raise exception 'invalid_rating'; end if;
  select * into m from public.matches where id = p_match;
  if not found then raise exception 'match_not_found'; end if;
  if m.starts_at + make_interval(mins => (m.duration_hours * 60)::int) > now() then raise exception 'match_not_played'; end if;
  if m.starts_at < now() - interval '7 days' then raise exception 'rating_closed'; end if;
  if not exists (select 1 from public.match_players where match_id = p_match and user_id = auth.uid()) then raise exception 'players_only'; end if;
  if not exists (select 1 from public.match_players where match_id = p_match and user_id = p_ratee) then raise exception 'not_in_match'; end if;
  insert into public.player_ratings (match_id, rater_id, ratee_id, stars) values (p_match, auth.uid(), p_ratee, p_stars)
  on conflict (match_id, rater_id, ratee_id) do update set stars = excluded.stars, created_at = now();
end $$;

-- ================================================================ reports
create table if not exists public.user_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  reported_id uuid not null references public.profiles (id) on delete cascade,
  match_id uuid references public.matches (id) on delete set null,
  reason text not null check (reason in ('abuse', 'violence', 'unsporting', 'no_show', 'cheating', 'other')),
  details text not null default '' check (length(details) <= 1000),
  status text not null default 'open' check (status in ('open', 'reviewed', 'dismissed')),
  admin_note text,
  created_at timestamptz not null default now(),
  check (reporter_id <> reported_id)
);
alter table public.user_reports enable row level security;
drop policy if exists "reporters see their reports" on public.user_reports;
create policy "reporters see their reports" on public.user_reports for select to authenticated using (reporter_id = (select auth.uid()));

create or replace function public.report_user(p_user uuid, p_reason text, p_details text, p_match uuid default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v uuid;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  if p_user = auth.uid() then raise exception 'no_self_report'; end if;
  if exists (select 1 from public.user_reports where reporter_id = auth.uid() and reported_id = p_user and created_at > now() - interval '1 day') then
    raise exception 'already_reported';
  end if;
  insert into public.user_reports (reporter_id, reported_id, match_id, reason, details)
  values (auth.uid(), p_user, p_match, p_reason, left(coalesce(p_details, ''), 1000)) returning id into v;
  return v;
end $$;

create or replace function public.admin_reports(p_status text default 'open')
returns table (id uuid, reporter_id uuid, reporter_name text, reported_id uuid, reported_name text, match_id uuid,
               reason text, details text, status text, admin_note text, created_at timestamptz, reports_against int)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'admin_only'; end if;
  return query
    select r.id, r.reporter_id, coalesce(a.name, ''), r.reported_id, coalesce(b.name, ''), r.match_id, r.reason, r.details, r.status, r.admin_note, r.created_at,
           (select count(*)::int from public.user_reports x where x.reported_id = r.reported_id)
    from public.user_reports r
    left join public.profiles a on a.id = r.reporter_id
    left join public.profiles b on b.id = r.reported_id
    where p_status = 'all' or r.status = p_status
    order by r.created_at desc limit 200;
end $$;

create or replace function public.admin_resolve_report(p_id uuid, p_status text, p_note text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'admin_only'; end if;
  if p_status not in ('open', 'reviewed', 'dismissed') then raise exception 'invalid_status'; end if;
  update public.user_reports set status = p_status, admin_note = nullif(trim(coalesce(p_note, '')), '') where id = p_id;
end $$;

-- ================================================================ match chat
create table if not exists public.match_messages (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  body text not null check (length(trim(body)) between 1 and 500),
  created_at timestamptz not null default now()
);
create index if not exists match_messages_match_idx on public.match_messages (match_id, created_at);
alter table public.match_messages enable row level security;

create or replace function public.in_match(p_match uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.matches where id = p_match and organizer_id = (select auth.uid()))
      or exists (select 1 from public.match_players where match_id = p_match and user_id = (select auth.uid()))
$$;
grant execute on function public.in_match(uuid) to authenticated;

drop policy if exists "players read the game chat" on public.match_messages;
create policy "players read the game chat" on public.match_messages for select to authenticated using (public.in_match(match_id));
drop policy if exists "players write in the game chat" on public.match_messages;
create policy "players write in the game chat" on public.match_messages for insert to authenticated
  with check (user_id = (select auth.uid()) and public.in_match(match_id));
drop policy if exists "authors delete their messages" on public.match_messages;
create policy "authors delete their messages" on public.match_messages for delete to authenticated using (user_id = (select auth.uid()));
grant select, insert, delete on public.match_messages to authenticated;

drop trigger if exists block_suspended on public.match_messages;
create trigger block_suspended before insert on public.match_messages for each row execute function public._block_suspended();

do $$ begin
  alter publication supabase_realtime add table public.match_messages;
exception when others then null;
end $$;

-- ================================================================ friends ("ربعي")
create table if not exists public.friendships (
  requester_id uuid not null references public.profiles (id) on delete cascade,
  addressee_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  primary key (requester_id, addressee_id),
  check (requester_id <> addressee_id)
);
alter table public.friendships enable row level security;
drop policy if exists "see your own friendships" on public.friendships;
create policy "see your own friendships" on public.friendships for select to authenticated
  using (requester_id = (select auth.uid()) or addressee_id = (select auth.uid()));

create or replace function public.friend_request(p_user uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare v_name text;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  if p_user = auth.uid() then raise exception 'invalid_user'; end if;
  if not exists (select 1 from public.profiles where id = p_user) then raise exception 'invalid_user'; end if;
  select coalesce(name, '') into v_name from public.profiles where id = auth.uid();
  -- They already asked me: accept straight away.
  if exists (select 1 from public.friendships where requester_id = p_user and addressee_id = auth.uid()) then
    update public.friendships set status = 'accepted' where requester_id = p_user and addressee_id = auth.uid() and status = 'pending';
    perform public._notify(p_user, 'friend_accepted', 'صرتوا ربع 🤝', 'You are now friends 🤝',
      v_name || ' قبل طلبك', v_name || ' accepted your request', jsonb_build_object('user_id', auth.uid()));
    return 'accepted';
  end if;
  if exists (select 1 from public.friendships where requester_id = auth.uid() and addressee_id = p_user) then return 'pending'; end if;
  insert into public.friendships (requester_id, addressee_id) values (auth.uid(), p_user);
  perform public._notify(p_user, 'friend_request', 'طلب صداقة 👋', 'Friend request 👋',
    v_name || ' يبي يضيفك لربعه', v_name || ' wants to add you as a friend', jsonb_build_object('user_id', auth.uid()));
  return 'pending';
end $$;

create or replace function public.friend_respond(p_user uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare v_name text;
begin
  if p_accept then
    update public.friendships set status = 'accepted' where requester_id = p_user and addressee_id = auth.uid() and status = 'pending';
    if not found then raise exception 'not_found'; end if;
    select coalesce(name, '') into v_name from public.profiles where id = auth.uid();
    perform public._notify(p_user, 'friend_accepted', 'صرتوا ربع 🤝', 'You are now friends 🤝',
      v_name || ' قبل طلبك', v_name || ' accepted your request', jsonb_build_object('user_id', auth.uid()));
  else
    delete from public.friendships where requester_id = p_user and addressee_id = auth.uid() and status = 'pending';
  end if;
end $$;

create or replace function public.friend_remove(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.friendships
  where (requester_id = auth.uid() and addressee_id = p_user) or (requester_id = p_user and addressee_id = auth.uid());
end $$;

-- My friends and pending requests, with names and photos.
create or replace function public.my_friends()
returns table (user_id uuid, name text, avatar_url text, player_position text, level text, status text, incoming boolean)
language sql stable security definer set search_path = '' as $$
  select case when f.requester_id = (select auth.uid()) then f.addressee_id else f.requester_id end,
         coalesce(p.name, ''), p.avatar_url, p.position, p.level, f.status, f.addressee_id = (select auth.uid())
  from public.friendships f
  join public.profiles p on p.id = case when f.requester_id = (select auth.uid()) then f.addressee_id else f.requester_id end
  where f.requester_id = (select auth.uid()) or f.addressee_id = (select auth.uid())
  order by f.status, p.name
$$;

-- Invite chosen friends to a game I'm in (they get the game code).
create or replace function public.invite_friends_to_match(p_match uuid, p_users uuid[]) returns int
language plpgsql security definer set search_path = '' as $$
declare m public.matches; v_code text; v_pitch text; v_pitch_en text; v_name text; u uuid; n int := 0;
begin
  select * into m from public.matches where id = p_match;
  if not found then raise exception 'match_not_found'; end if;
  if not public.in_match(p_match) then raise exception 'not_in_match'; end if;
  if m.status <> 'open' or m.starts_at < now() then raise exception 'match_not_open'; end if;
  v_code := public.match_invite_code(p_match);
  select name_ar, name_en into v_pitch, v_pitch_en from public.pitches where id = m.pitch_id;
  select coalesce(name, '') into v_name from public.profiles where id = auth.uid();
  foreach u in array coalesce(p_users, '{}') loop
    continue when not exists (
      select 1 from public.friendships f where f.status = 'accepted'
        and ((f.requester_id = auth.uid() and f.addressee_id = u) or (f.requester_id = u and f.addressee_id = auth.uid())));
    continue when exists (select 1 from public.match_players where match_id = p_match and user_id = u);
    perform public._notify(u, 'match_invite', 'عزيمة على مباراة ⚽', 'You are invited to a game ⚽',
      v_name || ' عازمك على مباراة بـ' || v_pitch || ' (' || public._kw_time(m.starts_at) || ')',
      v_name || ' invited you to a game at ' || v_pitch_en || ' (' || public._kw_time(m.starts_at) || ')',
      jsonb_build_object('match_code', v_code, 'match_id', p_match));
    n := n + 1;
  end loop;
  return n;
end $$;

-- ================================================================ grants
do $$
declare f text;
begin
  foreach f in array array['set_pitch_policy(uuid, int, int)', 'booking_reliability(uuid)', 'rate_player(uuid, uuid, int)',
    'report_user(uuid, text, text, uuid)', 'admin_reports(text)', 'admin_resolve_report(uuid, text, text)',
    'friend_request(uuid)', 'friend_respond(uuid, boolean)', 'friend_remove(uuid)', 'my_friends()', 'invite_friends_to_match(uuid, uuid[])'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
grant execute on function public.player_conduct(uuid) to anon, authenticated;
revoke execute on function public._on_booking() from public, anon, authenticated;
