-- Server notifications: an in-app inbox for every user, plus phone push through Expo.
-- Rows are written by database triggers when something happens that the user should know about.

create extension if not exists pg_net;

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null,
  title_ar text not null,
  title_en text not null,
  body_ar text not null default '',
  body_en text not null default '',
  data jsonb not null default '{}',
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);
alter table public.notifications enable row level security;
create policy "users read their notifications" on public.notifications
  for select to authenticated using (user_id = (select auth.uid()));
create policy "users delete their notifications" on public.notifications
  for delete to authenticated using (user_id = (select auth.uid()));
revoke insert, update on public.notifications from anon, authenticated;

create table if not exists public.push_tokens (
  token text primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  platform text not null default 'ios',
  lang text not null default 'ar' check (lang in ('ar', 'en')),
  updated_at timestamptz not null default now()
);
create index if not exists push_tokens_user_idx on public.push_tokens (user_id);
alter table public.push_tokens enable row level security;  -- no policies: only the functions below touch it

create or replace function public.register_push_token(p_token text, p_platform text, p_lang text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  if p_token !~ '^(Expo|Exponent)PushToken\[.+\]$' then raise exception 'invalid_token'; end if;
  insert into public.push_tokens (token, user_id, platform, lang, updated_at)
  values (p_token, auth.uid(), coalesce(p_platform, 'ios'), case when p_lang = 'en' then 'en' else 'ar' end, now())
  on conflict (token) do update set user_id = excluded.user_id, platform = excluded.platform, lang = excluded.lang, updated_at = now();
end $$;

create or replace function public.unregister_push_token(p_token text)
returns void language sql security definer set search_path = '' as $$
  delete from public.push_tokens where token = p_token and user_id = auth.uid();
$$;

create or replace function public.mark_notifications_read(p_ids uuid[] default null)
returns void language sql security definer set search_path = '' as $$
  update public.notifications set read_at = now()
   where user_id = auth.uid() and read_at is null and (p_ids is null or id = any (p_ids));
$$;

-- ---------------------------------------------------------------- delivery
create or replace function public._notify(p_user uuid, p_kind text, p_title_ar text, p_title_en text,
                                          p_body_ar text, p_body_en text, p_data jsonb default '{}')
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_user is null then return; end if;
  insert into public.notifications (user_id, kind, title_ar, title_en, body_ar, body_en, data)
  values (p_user, p_kind, p_title_ar, p_title_en, coalesce(p_body_ar, ''), coalesce(p_body_en, ''), coalesce(p_data, '{}'));
end $$;

-- Every new inbox row is also pushed to the user's phones, in the language each phone uses.
create or replace function public._push_notification() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_msgs jsonb;
begin
  select jsonb_agg(jsonb_build_object(
           'to', t.token, 'sound', 'default', 'priority', 'high',
           'title', case when t.lang = 'en' then new.title_en else new.title_ar end,
           'body', case when t.lang = 'en' then new.body_en else new.body_ar end,
           'data', new.data || jsonb_build_object('notification_id', new.id, 'kind', new.kind)))
    into v_msgs
    from public.push_tokens t where t.user_id = new.user_id;
  if v_msgs is not null then
    begin
      perform net.http_post(
        url := 'https://exp.host/--/api/v2/push/send',
        body := v_msgs,
        headers := '{"Content-Type": "application/json", "Accept": "application/json"}'::jsonb);
    exception when others then
      null;  -- a push failure must never block the action that caused it
    end;
  end if;
  return new;
end $$;
drop trigger if exists notification_push on public.notifications;
create trigger notification_push after insert on public.notifications
  for each row execute function public._push_notification();

create or replace function public._kw_time(ts timestamptz) returns text
language sql immutable set search_path = '' as $$
  select to_char(ts at time zone 'Asia/Kuwait', 'DD/MM HH24:MI')
$$;

-- ---------------------------------------------------------------- events
-- Someone joined a game: tell the organiser; tell a waitlisted player they got the spot; tell the organiser when it fills up.
create or replace function public._on_match_player() returns trigger
language plpgsql security definer set search_path = '' as $$
declare m public.matches; v_name text; v_pitch_ar text; v_pitch_en text; v_count int;
begin
  select * into m from public.matches where id = new.match_id;
  if not found or new.user_id = m.organizer_id then return new; end if;
  select coalesce(name, '') into v_name from public.profiles where id = new.user_id;
  select name_ar, name_en into v_pitch_ar, v_pitch_en from public.pitches where id = m.pitch_id;
  if auth.uid() is distinct from new.user_id then
    perform public._notify(new.user_id, 'waitlist_promoted', 'صار لك مكان! ⚽', 'You got a spot! ⚽',
      'انفتح مكان بمباراة ' || v_pitch_ar || ' (' || public._kw_time(m.starts_at) || ') وانضفت لها.',
      'A spot opened at ' || v_pitch_en || ' (' || public._kw_time(m.starts_at) || ') and you are in.',
      jsonb_build_object('match_id', m.id));
  end if;
  perform public._notify(m.organizer_id, 'match_joined', 'لاعب جديد بمباراتك', 'New player in your game',
    v_name || ' انضم لمباراتك بـ' || v_pitch_ar, v_name || ' joined your game at ' || v_pitch_en,
    jsonb_build_object('match_id', m.id));
  select count(*) into v_count from public.match_players where match_id = m.id;
  if v_count = m.max_players then
    perform public._notify(m.organizer_id, 'match_full', 'المباراة اكتملت ✅', 'Your game is full ✅',
      'كل الأماكن انحجزت بمباراة ' || public._kw_time(m.starts_at), 'Every spot is taken for ' || public._kw_time(m.starts_at),
      jsonb_build_object('match_id', m.id));
  end if;
  return new;
end $$;
drop trigger if exists match_player_notify on public.match_players;
create trigger match_player_notify after insert on public.match_players
  for each row execute function public._on_match_player();

-- A game was called off: tell everyone in it except whoever cancelled it.
create or replace function public._on_match_cancelled() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r record; v_pitch_ar text; v_pitch_en text;
begin
  if new.status <> 'cancelled' or old.status = 'cancelled' then return new; end if;
  select name_ar, name_en into v_pitch_ar, v_pitch_en from public.pitches where id = new.pitch_id;
  for r in select user_id from public.match_players where match_id = new.id and user_id is distinct from auth.uid() loop
    perform public._notify(r.user_id, 'match_cancelled', 'انلغت المباراة', 'Game cancelled',
      'مباراة ' || v_pitch_ar || ' (' || public._kw_time(new.starts_at) || ') انلغت.',
      'The game at ' || v_pitch_en || ' (' || public._kw_time(new.starts_at) || ') was cancelled.',
      jsonb_build_object('match_id', new.id));
  end loop;
  return new;
end $$;
drop trigger if exists match_cancel_notify on public.matches;
create trigger match_cancel_notify after update of status on public.matches
  for each row execute function public._on_match_cancelled();

-- Bookings: the pitch owner hears about new and cancelled bookings; a player hears if someone else cancelled theirs.
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
      perform public._notify(p.owner_id, 'booking_cancelled', 'انلغى حجز', 'Booking cancelled',
        p.name_ar || ' · ' || public._kw_time(new.starts_at) || ' صار فاضي.',
        p.name_en || ' · ' || public._kw_time(new.starts_at) || ' is free again.',
        jsonb_build_object('pitch_id', p.id, 'booking_id', new.id));
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
drop trigger if exists booking_notify on public.bookings;
create trigger booking_notify after insert or update of status on public.bookings
  for each row execute function public._on_booking();

-- Support replied to a ticket.
create or replace function public._on_support_reply() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_user uuid; v_subject text;
begin
  if not new.from_support then return new; end if;
  select user_id, subject into v_user, v_subject from public.support_tickets where id = new.ticket_id;
  perform public._notify(v_user, 'support_reply', 'رد من الدعم الفني 💬', 'Support replied 💬',
    v_subject, v_subject, jsonb_build_object('ticket_id', new.ticket_id));
  return new;
end $$;
drop trigger if exists support_reply_notify on public.support_messages;
create trigger support_reply_notify after insert on public.support_messages
  for each row execute function public._on_support_reply();

-- A submitted pitch was approved or rejected.
create or replace function public._on_pitch_review() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.status = 'pending' and new.status = 'approved' then
    perform public._notify(new.owner_id, 'pitch_approved', 'ملعبك صار ظاهر 🎉', 'Your pitch is live 🎉',
      new.name_ar || ' انقبل وصار اللاعبين يقدرون يحجزونه.', new.name_en || ' was approved and players can book it now.',
      jsonb_build_object('pitch_id', new.id));
  elsif old.status = 'pending' and new.status = 'rejected' then
    perform public._notify(new.owner_id, 'pitch_rejected', 'طلب الملعب ما انقبل', 'Pitch not approved',
      'راجع تفاصيل ' || new.name_ar || ' أو تواصل مع الدعم.', 'Check the details of ' || new.name_en || ' or contact support.',
      jsonb_build_object('pitch_id', new.id));
  end if;
  return new;
end $$;
drop trigger if exists pitch_review_notify on public.pitches;
create trigger pitch_review_notify after update of status on public.pitches
  for each row execute function public._on_pitch_review();

-- New child enrolled in an academy program.
create or replace function public._on_enrollment() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_owner uuid; v_prog_ar text; v_prog_en text;
begin
  select a.owner_id, pr.name_ar, pr.name_en into v_owner, v_prog_ar, v_prog_en
    from public.academy_programs pr join public.academies a on a.id = pr.academy_id where pr.id = new.program_id;
  perform public._notify(v_owner, 'enrollment_new', 'تسجيل جديد بالأكاديمية', 'New academy enrolment',
    new.child_name || ' انسجل ببرنامج ' || v_prog_ar, new.child_name || ' enrolled in ' || v_prog_en,
    jsonb_build_object('program_id', new.program_id));
  return new;
end $$;
drop trigger if exists enrollment_notify on public.academy_enrollments;
create trigger enrollment_notify after insert on public.academy_enrollments
  for each row execute function public._on_enrollment();

-- Admin announcement: goes to everyone's inbox and phone.
create or replace function public._on_announcement() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not new.active then return new; end if;
  insert into public.notifications (user_id, kind, title_ar, title_en, body_ar, body_en, data)
  select id, 'announcement', 'الدوري 📣', 'Al Dawri 📣', new.body_ar, new.body_en, jsonb_build_object('announcement_id', new.id)
  from public.profiles;
  return new;
end $$;
drop trigger if exists announcement_notify on public.announcements;
create trigger announcement_notify after insert on public.announcements
  for each row execute function public._on_announcement();

-- Live inbox updates in the app.
do $$ begin
  alter publication supabase_realtime add table public.notifications;
exception when others then null;
end $$;

-- ---------------------------------------------------------------- grants
revoke execute on function public._notify(uuid, text, text, text, text, text, jsonb), public._push_notification(),
  public._on_match_player(), public._on_match_cancelled(), public._on_booking(), public._on_support_reply(),
  public._on_pitch_review(), public._on_enrollment(), public._on_announcement() from public, anon, authenticated;
revoke execute on function public.register_push_token(text, text, text), public.unregister_push_token(text),
  public.mark_notifications_read(uuid[]) from public, anon;
grant execute on function public.register_push_token(text, text, text), public.unregister_push_token(text),
  public.mark_notifications_read(uuid[]) to authenticated;
