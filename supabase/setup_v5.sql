-- Al Dawri update 5+6: one subscription per owner + merged monthly invoice, listing photos & editing, tournament extras,
-- owner booking actions, admin moderation, academy fees & attendance, venues with several courts, pitch staff.
-- Paste all of this in Supabase → SQL Editor → Run. Run it once.

-- Al Dawri v5
--  1. One subscription per owner (not per pitch) and ONE merged monthly invoice: subscription + tournament organising fees.
--  2. Photos, English names and full detail editing for pitches and academies (owners and admins).
--  3. Tournaments: edit details, registration deadline (auto-close), match length, roster check, invite a fixed team.
--  4. Owners cancel a player's booking or mark a no-show; player stats include tournaments.
--  5. Admin moderation: suspend or delete users, edit any listing.
--  6. Academies: monthly fee and attendance tracking per child.

-- ============================================================== 1. billing per owner, merged invoices
alter table public.subscriptions drop constraint if exists subscriptions_kind_listing_id_key;
alter table public.subscriptions alter column listing_id drop not null;
-- Collapse any per-listing rows into one per owner and kind (keeps the most generous dates).
delete from public.subscriptions s using public.subscriptions s2
 where s.owner_id = s2.owner_id and s.kind = s2.kind and (s.paid_until < s2.paid_until or (s.paid_until = s2.paid_until and s.id > s2.id));
update public.subscriptions set listing_id = null;
alter table public.subscriptions drop constraint if exists subscriptions_owner_kind_key;
alter table public.subscriptions add constraint subscriptions_owner_kind_key unique (owner_id, kind);

alter table public.invoices drop constraint if exists invoices_subscription_id_period_start_key;
alter table public.invoices alter column subscription_id drop not null;

create table if not exists public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  kind text not null check (kind in ('subscription', 'tournament_fee')),
  ref_id uuid not null,                       -- subscription id or tournament id
  period_start timestamptz,
  period_end timestamptz,
  label_ar text not null,
  label_en text not null,
  amount numeric(9, 3) not null
);
create unique index if not exists invoice_items_once on public.invoice_items (ref_id, period_start) where kind = 'subscription';
alter table public.invoice_items enable row level security;
drop policy if exists "owners and admins see invoice items" on public.invoice_items;
create policy "owners and admins see invoice items" on public.invoice_items for select to authenticated
  using (exists (select 1 from public.invoices i where i.id = invoice_id and (i.owner_id = (select auth.uid()) or public.is_admin())));

alter table public.pitches add column if not exists billing_hidden boolean not null default false;
alter table public.academies add column if not exists billing_hidden boolean not null default false;

-- The owner's subscription for a kind starts with the free period (idempotent). Listing args kept for the triggers.
create or replace function public._ensure_subscription(p_kind text, p_id uuid, p_owner uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_trial timestamptz := now() + make_interval(days => public._setting_num('trial_days', 30)::int);
begin
  if p_owner is null or exists (select 1 from public.profiles where id = p_owner and role = 'admin') then return; end if;
  insert into public.subscriptions (owner_id, kind, listing_id, status, price, trial_ends_at, paid_until)
  values (p_owner, p_kind, null, 'trial', public._setting_num('subscription_price_' || p_kind, 100), v_trial, v_trial)
  on conflict (owner_id, kind) do nothing;
end $$;

-- Owners cannot switch listings back on while their subscription is paused.
create or replace function public._guard_subscription_active() returns trigger
language plpgsql set search_path = '' as $$
declare v_kind text := case when tg_table_name = 'pitches' then 'pitch' else 'academy' end;
begin
  if new.active and not old.active and coalesce(current_setting('aldawri.system', true), '') <> 'on' and not public.is_admin()
     and exists (select 1 from public.subscriptions s where s.kind = v_kind and s.owner_id = new.owner_id and s.status = 'suspended') then
    raise exception 'subscription_suspended';
  end if;
  return new;
end $$;

-- Hide / show everything an owner lists because of billing (remembers what billing hid).
create or replace function public._billing_hide_owner(p_owner uuid, p_hide boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('aldawri.system', 'on', true);
  if p_hide then
    update public.pitches set active = false, billing_hidden = true where owner_id = p_owner and active and status = 'approved';
    update public.academies set active = false, billing_hidden = true where owner_id = p_owner and active and status = 'approved';
  else
    update public.pitches set active = true, billing_hidden = false where owner_id = p_owner and billing_hidden;
    update public.academies set active = true, billing_hidden = false where owner_id = p_owner and billing_hidden;
  end if;
  perform set_config('aldawri.system', 'off', true);
end $$;

create or replace function public._owner_listing_names(p_owner uuid, p_kind text) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(string_agg(n, '، ' order by n), '') from (
    select name_ar n from public.pitches where p_kind = 'pitch' and owner_id = p_owner and status = 'approved'
    union all select name_ar from public.academies where p_kind = 'academy' and owner_id = p_owner and status = 'approved') x
$$;

-- Daily: one invoice per owner with every subscription due in the next 3 days plus unbilled tournament fees;
-- reminders on the due date; pause the owner's listings after the grace period.
create or replace function public.run_billing() returns int
language plpgsql security definer set search_path = '' as $$
declare
  o record; s record; t record; i record;
  v_inv uuid; v_n int := 0; v_total numeric; v_due timestamptz;
  v_grace int := public._setting_num('grace_days', 7)::int;
  v_link text := coalesce((select value #>> '{}' from public.app_settings where key = 'payment_link'), '');
begin
  for s in select 'pitch' k, owner_id from public.pitches where status = 'approved' and owner_id is not null
           union select 'academy', owner_id from public.academies where status = 'approved' and owner_id is not null loop
    perform public._ensure_subscription(s.k, null, s.owner_id);
  end loop;

  for o in
    select owner_id from public.subscriptions where status in ('trial', 'active', 'past_due') and paid_until < now() + interval '3 days'
      and not exists (select 1 from public.invoice_items ii where ii.kind = 'subscription' and ii.ref_id = subscriptions.id and ii.period_start = subscriptions.paid_until)
    union
    select t2.organizer_id from public.tournaments t2
     where t2.status = 'finished' and t2.commission_rate > 0 and public._dues_amount(t2.id) > 0
       and not exists (select 1 from public.tournament_dues d where d.tournament_id = t2.id)
       and not exists (select 1 from public.invoice_items ii join public.invoices iv on iv.id = ii.invoice_id where ii.kind = 'tournament_fee' and ii.ref_id = t2.id and iv.status <> 'void')
  loop
    if o.owner_id is null then continue; end if;
    v_due := coalesce((select min(paid_until) from public.subscriptions where owner_id = o.owner_id and status in ('trial', 'active', 'past_due') and paid_until < now() + interval '3 days'), now() + interval '7 days');
    insert into public.invoices (subscription_id, owner_id, period_start, period_end, amount, due_at, payment_link)
    values (null, o.owner_id, v_due, v_due + interval '1 month', 0, v_due, v_link) returning id into v_inv;
    v_total := 0;
    for s in select * from public.subscriptions where owner_id = o.owner_id and status in ('trial', 'active', 'past_due') and paid_until < now() + interval '3 days'
               and not exists (select 1 from public.invoice_items ii where ii.kind = 'subscription' and ii.ref_id = subscriptions.id and ii.period_start = subscriptions.paid_until) loop
      insert into public.invoice_items (invoice_id, kind, ref_id, period_start, period_end, label_ar, label_en, amount)
      values (v_inv, 'subscription', s.id, s.paid_until, s.paid_until + interval '1 month',
              case when s.kind = 'pitch' then 'اشتراك الملاعب' else 'اشتراك الأكاديمية' end || ' · ' || public._owner_listing_names(s.owner_id, s.kind),
              case when s.kind = 'pitch' then 'Pitch subscription' else 'Academy subscription' end, s.price);
      v_total := v_total + s.price;
    end loop;
    for t in select * from public.tournaments t2 where t2.organizer_id = o.owner_id and t2.status = 'finished' and t2.commission_rate > 0 and public._dues_amount(t2.id) > 0
               and not exists (select 1 from public.tournament_dues d where d.tournament_id = t2.id)
               and not exists (select 1 from public.invoice_items ii join public.invoices iv on iv.id = ii.invoice_id where ii.kind = 'tournament_fee' and ii.ref_id = t2.id and iv.status <> 'void') loop
      insert into public.invoice_items (invoice_id, kind, ref_id, label_ar, label_en, amount)
      values (v_inv, 'tournament_fee', t.id, 'رسوم تنظيم: ' || t.name_ar, 'Organising fee: ' || t.name_en, public._dues_amount(t.id));
      v_total := v_total + public._dues_amount(t.id);
    end loop;
    if v_total = 0 then delete from public.invoices where id = v_inv; continue; end if;
    update public.invoices set amount = v_total where id = v_inv;
    v_n := v_n + 1;
    perform public._notify(o.owner_id, 'invoice_new', 'فاتورة جديدة 🧾', 'New invoice 🧾',
      v_total || ' د.ك · آخر موعد ' || to_char(v_due at time zone 'Asia/Kuwait', 'DD/MM'), v_total || ' KD · due ' || to_char(v_due at time zone 'Asia/Kuwait', 'DD/MM'),
      jsonb_build_object('invoice_id', v_inv));
  end loop;

  for i in select * from public.invoices where status in ('unpaid', 'claimed') and due_at < now() loop
    if i.status = 'unpaid' and i.due_at < now() - make_interval(days => v_grace) then
      if exists (select 1 from public.subscriptions where owner_id = i.owner_id and status <> 'suspended') then
        update public.subscriptions set status = 'suspended' where owner_id = i.owner_id;
        perform public._billing_hide_owner(i.owner_id, true);
        perform public._notify(i.owner_id, 'subscription_suspended', 'انوقف ظهور إعلاناتك', 'Your listings are paused',
          'انخفت ملاعبك وأكاديميتك من التطبيق لين تنسدد الفاتورة.', 'Hidden from the app until the invoice is paid.', jsonb_build_object('invoice_id', i.id));
      end if;
    elsif exists (select 1 from public.subscriptions where owner_id = i.owner_id and status in ('trial', 'active')) then
      update public.subscriptions set status = 'past_due' where owner_id = i.owner_id and status in ('trial', 'active');
      perform public._notify(i.owner_id, 'invoice_due', 'تذكير: فاتورة مستحقة ⏰', 'Reminder: invoice due ⏰',
        'سدد خلال ' || v_grace || ' أيام عشان تظل إعلاناتك ظاهرة.', 'Pay within ' || v_grace || ' days to keep your listings visible.', jsonb_build_object('invoice_id', i.id));
    end if;
  end loop;
  return v_n;
end $$;

-- Admin confirms payment: extends each subscription on the invoice, settles its tournament fees, shows listings again.
create or replace function public.admin_mark_invoice(p_invoice uuid, p_status text) returns void
language plpgsql security definer set search_path = '' as $$
declare v public.invoices; it record;
begin
  perform public._require_admin();
  if p_status not in ('paid', 'unpaid', 'void') then raise exception 'invalid_status'; end if;
  select * into v from public.invoices where id = p_invoice;
  if not found then raise exception 'not_found'; end if;
  update public.invoices set status = p_status, paid_at = case when p_status = 'paid' then now() end, marked_by = auth.uid() where id = p_invoice;
  if p_status = 'paid' then
    for it in select * from public.invoice_items where invoice_id = p_invoice loop
      if it.kind = 'subscription' then
        update public.subscriptions set status = 'active', paid_until = greatest(paid_until, it.period_end) where id = it.ref_id;
      else
        insert into public.tournament_dues (tournament_id, amount, marked_by) values (it.ref_id, it.amount, auth.uid())
        on conflict (tournament_id) do update set amount = excluded.amount, paid_at = now(), marked_by = excluded.marked_by;
      end if;
    end loop;
    -- Legacy single-subscription invoices.
    if v.subscription_id is not null then
      update public.subscriptions set status = 'active', paid_until = greatest(paid_until, v.period_end) where id = v.subscription_id;
    end if;
    if not exists (select 1 from public.invoices where owner_id = v.owner_id and status = 'unpaid' and due_at < now() - make_interval(days => public._setting_num('grace_days', 7)::int)) then
      update public.subscriptions set status = 'active' where owner_id = v.owner_id and status in ('suspended', 'past_due');
      perform public._billing_hide_owner(v.owner_id, false);
    end if;
    perform public._notify(v.owner_id, 'invoice_paid', 'وصلنا الدفع، شكراً ✅', 'Payment received, thank you ✅', v.amount || ' د.ك', v.amount || ' KD', jsonb_build_object('invoice_id', p_invoice));
  elsif p_status = 'void' then
    for it in select * from public.invoice_items where invoice_id = p_invoice and kind = 'subscription' loop
      update public.subscriptions set paid_until = greatest(paid_until, it.period_end) where id = it.ref_id;
    end loop;
    if not exists (select 1 from public.invoices where owner_id = v.owner_id and status = 'unpaid' and due_at < now()) then
      update public.subscriptions set status = 'active' where owner_id = v.owner_id and status in ('suspended', 'past_due');
      perform public._billing_hide_owner(v.owner_id, false);
    end if;
  end if;
end $$;

-- Same signature as before; listing_name now lists all the owner's listings of that kind.
create or replace function public.billing_overview(p_all boolean default false)
returns table (subscription_id uuid, owner_id uuid, owner_name text, kind text, listing_id uuid, listing_name text, status text, price numeric,
               trial_ends_at timestamptz, paid_until timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_all then perform public._require_admin(); end if;
  return query
    select s.id, s.owner_id, coalesce(pr.name, ''), s.kind, s.listing_id, public._owner_listing_names(s.owner_id, s.kind), s.status, s.price, s.trial_ends_at, s.paid_until
    from public.subscriptions s left join public.profiles pr on pr.id = s.owner_id
    where case when p_all then true else s.owner_id = auth.uid() end
    order by s.status = 'suspended' desc, s.paid_until;
end $$;

-- ============================================================== 2. listing photos & details
alter table public.pitches add column if not exists photos text[] not null default '{}';
alter table public.academies add column if not exists photos text[] not null default '{}';
alter table public.academies add column if not exists lat double precision;
alter table public.academies add column if not exists lng double precision;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('listing-photos', 'listing-photos', true, 5242880, '{image/jpeg,image/png,image/webp}')
on conflict (id) do nothing;
drop policy if exists "owners upload listing photos" on storage.objects;
drop policy if exists "owners delete listing photos" on storage.objects;
create policy "owners upload listing photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'listing-photos' and ((storage.foldername(name))[1] = (select auth.uid())::text or public.is_admin()));
create policy "owners delete listing photos" on storage.objects for delete to authenticated
  using (bucket_id = 'listing-photos' and ((storage.foldername(name))[1] = (select auth.uid())::text or public.is_admin()));

create or replace function public.update_pitch_details(
  p_pitch uuid, p_name_ar text, p_name_en text, p_area text, p_governorate text, p_address text, p_sizes int[], p_surface text,
  p_indoor boolean, p_lat double precision, p_lng double precision, p_photos text[]
) returns void language plpgsql security definer set search_path = '' as $$
declare v public.pitches;
begin
  select * into v from public.pitches where id = p_pitch;
  if not found then raise exception 'not_found'; end if;
  if v.owner_id is distinct from auth.uid() and not public.is_admin() then raise exception 'not_your_pitch'; end if;
  if length(trim(coalesce(p_name_ar, ''))) < 3 or length(trim(coalesce(p_area, ''))) < 2 then raise exception 'invalid_name'; end if;
  if p_governorate not in ('capital', 'hawalli', 'farwaniya', 'ahmadi', 'jahra', 'mubarak_alkabeer') then raise exception 'invalid_name'; end if;
  if p_sizes is null or array_length(p_sizes, 1) is null or not (p_sizes <@ array[5, 6, 7, 11]) then raise exception 'invalid_size'; end if;
  if coalesce(array_length(p_photos, 1), 0) > 8 then raise exception 'too_many_photos'; end if;
  update public.pitches set name_ar = trim(p_name_ar), name_en = coalesce(nullif(trim(p_name_en), ''), trim(p_name_ar)),
    area_ar = trim(p_area), area_en = trim(p_area), governorate = p_governorate,
    address_ar = trim(coalesce(p_address, '')), address_en = trim(coalesce(p_address, '')), sizes = p_sizes,
    surface = coalesce(p_surface, surface), indoor = coalesce(p_indoor, indoor), lat = p_lat, lng = p_lng, photos = coalesce(p_photos, '{}')
  where id = p_pitch;
end $$;

create or replace function public.update_academy_details(
  p_academy uuid, p_name_ar text, p_name_en text, p_area text, p_governorate text, p_about text,
  p_lat double precision, p_lng double precision, p_photos text[]
) returns void language plpgsql security definer set search_path = '' as $$
declare v public.academies;
begin
  select * into v from public.academies where id = p_academy;
  if not found then raise exception 'not_found'; end if;
  if v.owner_id is distinct from auth.uid() and not public.is_admin() then raise exception 'not_allowed'; end if;
  if length(trim(coalesce(p_name_ar, ''))) < 3 or length(trim(coalesce(p_area, ''))) < 2 then raise exception 'invalid_name'; end if;
  if coalesce(array_length(p_photos, 1), 0) > 8 then raise exception 'too_many_photos'; end if;
  perform set_config('aldawri.system', 'on', true);
  update public.academies set name_ar = trim(p_name_ar), name_en = coalesce(nullif(trim(p_name_en), ''), trim(p_name_ar)),
    area_ar = trim(p_area), area_en = trim(p_area), governorate = coalesce(p_governorate, governorate),
    about_ar = left(trim(coalesce(p_about, '')), 600), about_en = left(trim(coalesce(p_about, '')), 600), lat = p_lat, lng = p_lng, photos = coalesce(p_photos, '{}')
  where id = p_academy;
  perform set_config('aldawri.system', 'off', true);
end $$;

-- ============================================================== 3. tournaments extras
alter table public.tournaments add column if not exists reg_deadline date;
alter table public.tournaments add column if not exists slot_minutes int not null default 60;
alter table public.tournaments drop constraint if exists tournaments_slot_minutes_check;
alter table public.tournaments add constraint tournaments_slot_minutes_check check (slot_minutes in (60, 90, 120));

create or replace function public.update_tournament(
  p_t uuid, p_name_ar text, p_name_en text, p_fee numeric, p_prize numeric, p_prize2 numeric, p_rules text, p_max_teams int,
  p_starts_on date, p_reg_deadline date, p_min_players int, p_max_players int, p_slot_minutes int
) returns void language plpgsql security definer set search_path = '' as $$
declare v public.tournaments; v_teams int;
begin
  v := public._require_manage(p_t);
  if v.status in ('finished', 'cancelled', 'rejected') then raise exception 'invalid_status'; end if;
  if length(trim(coalesce(p_name_ar, ''))) < 3 then raise exception 'invalid_name'; end if;
  if p_slot_minutes not in (60, 90, 120) then raise exception 'invalid_duration'; end if;
  if p_min_players < 1 or p_max_players < p_min_players or p_max_players > 30 then raise exception 'invalid_players'; end if;
  select count(*) into v_teams from public.tournament_teams where tournament_id = p_t and status in ('pending', 'approved');
  if p_max_teams < greatest(v_teams, 3) or p_max_teams > 32 then raise exception 'invalid_teams'; end if;
  if p_fee <> v.entry_fee and exists (select 1 from public.tournament_teams where tournament_id = p_t and paid) then raise exception 'fee_locked'; end if;
  if p_reg_deadline is not null and p_reg_deadline > p_starts_on then raise exception 'invalid_date'; end if;
  if v.status = 'live' and (p_starts_on <> v.starts_on or p_max_teams <> v.max_teams or p_slot_minutes <> v.slot_minutes) then raise exception 'already_started'; end if;
  update public.tournaments set name_ar = trim(p_name_ar), name_en = coalesce(nullif(trim(p_name_en), ''), trim(p_name_ar)), entry_fee = p_fee,
    prize = p_prize, prize_second = p_prize2, rules = left(coalesce(p_rules, ''), 1500), max_teams = p_max_teams, starts_on = p_starts_on,
    reg_deadline = p_reg_deadline, min_players = p_min_players, max_players = p_max_players, slot_minutes = p_slot_minutes
  where id = p_t;
end $$;

-- Registration closes on the deadline.
create or replace function public._guard_reg_deadline() returns trigger
language plpgsql set search_path = '' as $$
declare v_deadline date;
begin
  select reg_deadline into v_deadline from public.tournaments where id = new.tournament_id;
  if v_deadline is not null and (now() at time zone 'Asia/Kuwait')::date > v_deadline then raise exception 'registration_closed'; end if;
  return new;
end $$;
drop trigger if exists team_reg_deadline on public.tournament_teams;
create trigger team_reg_deadline before insert on public.tournament_teams for each row execute function public._guard_reg_deadline();

-- Approved teams below the minimum roster (shown before generating the schedule).
create or replace function public.tournament_roster_check(p_t uuid)
returns table (team_id uuid, players int, min_players int) language sql stable security definer set search_path = '' as $$
  select tt.id, (select count(*)::int from public.team_players tp where tp.team_id = tt.id), t.min_players
  from public.tournament_teams tt join public.tournaments t on t.id = tt.tournament_id
  where tt.tournament_id = p_t and tt.status = 'approved' and (select count(*) from public.team_players tp where tp.team_id = tt.id) < t.min_players
$$;

-- Schedule in slots of the tournament's match length.
create or replace function public._schedule(p_t uuid, p_start date, p_days int[], p_start_hour int)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v public.tournaments; p public.pitches; f record;
  v_day date := p_start; v_min int; v_slot int; v_first int;
  v_b uuid; v_ts timestamptz; v_guard int;
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
      begin
        insert into public.bookings (pitch_id, user_id, starts_at, ends_at, status)
        values (v.pitch_id, v.organizer_id, v_ts, v_ts + make_interval(mins => v_slot), 'blocked') returning id into v_b;
        update public.fixtures set starts_at = v_ts, booking_id = v_b where id = f.id;
        v_min := v_min + v_slot;
        exit;
      exception when exclusion_violation then
        v_min := v_min + 30;
      end;
    end loop;
  end loop;
end $$;

create or replace function public.reschedule_fixture(p_fixture uuid, p_starts timestamptz)
returns void language plpgsql security definer set search_path = '' as $$
declare f public.fixtures; v public.tournaments; v_b uuid;
begin
  select * into f from public.fixtures where id = p_fixture;
  if not found then raise exception 'not_found'; end if;
  v := public._require_manage(f.tournament_id);
  if f.status <> 'scheduled' then raise exception 'invalid_status'; end if;
  if p_starts < now() then raise exception 'slot_in_past'; end if;
  if f.booking_id is not null then update public.bookings set status = 'cancelled' where id = f.booking_id; end if;
  begin
    insert into public.bookings (pitch_id, user_id, starts_at, ends_at, status)
    values (v.pitch_id, v.organizer_id, p_starts, p_starts + make_interval(mins => coalesce(v.slot_minutes, 60)), 'blocked') returning id into v_b;
  exception when exclusion_violation then
    if f.booking_id is not null then update public.bookings set status = 'blocked' where id = f.booking_id; end if;
    raise exception 'slot_taken';
  end;
  update public.fixtures set starts_at = p_starts, booking_id = v_b, reminded = false where id = p_fixture;
  if f.home_id is not null then
    perform public._notify_team(f.home_id, 'fixture_moved', 'تغيّر موعد مباراتكم 📅', 'Match time changed 📅', public._kw_time(p_starts), public._kw_time(p_starts), jsonb_build_object('fixture_id', p_fixture));
  end if;
  if f.away_id is not null then
    perform public._notify_team(f.away_id, 'fixture_moved', 'تغيّر موعد مباراتكم 📅', 'Match time changed 📅', public._kw_time(p_starts), public._kw_time(p_starts), jsonb_build_object('fixture_id', p_fixture));
  end if;
end $$;

-- Every 10 minutes: match reminders, and close registration once the deadline has passed.
create or replace function public.send_fixture_reminders() returns void
language plpgsql security definer set search_path = '' as $$
declare f record;
begin
  update public.tournaments set status = 'closed'
   where status = 'open' and reg_deadline is not null and (now() at time zone 'Asia/Kuwait')::date > reg_deadline;
  for f in select fx.*, t.name_ar, t.name_en from public.fixtures fx join public.tournaments t on t.id = fx.tournament_id
           where fx.status = 'scheduled' and not fx.reminded and fx.starts_at between now() and now() + interval '70 minutes'
             and fx.home_id is not null and fx.away_id is not null and t.status = 'live' loop
    perform public._notify_team(f.home_id, 'fixture_reminder', 'مباراتكم بعد ساعة ⏰', 'Your match is in an hour ⏰',
      public._team_name(f.home_id) || ' × ' || public._team_name(f.away_id) || ' · ' || public._kw_time(f.starts_at), f.name_en || ' · ' || public._kw_time(f.starts_at), jsonb_build_object('fixture_id', f.id));
    perform public._notify_team(f.away_id, 'fixture_reminder', 'مباراتكم بعد ساعة ⏰', 'Your match is in an hour ⏰',
      public._team_name(f.home_id) || ' × ' || public._team_name(f.away_id) || ' · ' || public._kw_time(f.starts_at), f.name_en || ' · ' || public._kw_time(f.starts_at), jsonb_build_object('fixture_id', f.id));
    update public.fixtures set reminded = true where id = f.id;
  end loop;
end $$;

-- Captain invites the members of one of their fixed teams (from the Teams page) with the tournament team code.
create or replace function public.invite_fixed_team(p_team uuid, p_fixed uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare v_tt public.tournament_teams; v_t public.tournaments; v_code text; r record; n int := 0;
begin
  select * into v_tt from public.tournament_teams where id = p_team;
  if not found or v_tt.captain_id is distinct from auth.uid() then raise exception 'not_allowed'; end if;
  if not exists (select 1 from public.team_members where team_id = p_fixed and user_id = auth.uid()) then raise exception 'not_allowed'; end if;
  select * into v_t from public.tournaments where id = v_tt.tournament_id;
  select code into v_code from public.team_invites where team_id = p_team;
  for r in select user_id from public.team_members where team_id = p_fixed and user_id <> auth.uid()
             and user_id not in (select user_id from public.team_players where tournament_id = v_t.id) loop
    perform public._notify(r.user_id, 'team_invite', 'دعوة للبطولة ⚽', 'Tournament invite ⚽',
      'الكابتن يدعوك تنضم لـ' || v_tt.name_ar || ' في ' || v_t.name_ar || ' · الكود ' || v_code,
      'Join ' || v_tt.name_en || ' in ' || v_t.name_en || ' · code ' || v_code, jsonb_build_object('invite_code', v_code));
    n := n + 1;
  end loop;
  return n;
end $$;

-- ============================================================== 4. owner booking actions & stats
alter table public.bookings add column if not exists no_show boolean not null default false;

create or replace function public.owner_cancel_booking(p_booking uuid, p_reason text default '') returns void
language plpgsql security definer set search_path = '' as $$
declare b public.bookings;
begin
  select * into b from public.bookings where id = p_booking and status = 'confirmed';
  if not found then raise exception 'booking_not_found'; end if;
  if not (public.is_admin() or exists (select 1 from public.pitches p where p.id = b.pitch_id and p.owner_id = auth.uid())) then raise exception 'not_your_pitch'; end if;
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
  if not (public.is_admin() or exists (select 1 from public.pitches p where p.id = b.pitch_id and p.owner_id = auth.uid())) then raise exception 'not_your_pitch'; end if;
  if b.starts_at > now() then raise exception 'not_started'; end if;
  update public.bookings set no_show = coalesce(p_no_show, true) where id = p_booking;
end $$;

-- owner_day gains the no-show flag (new function so the old one keeps working for older app versions).
create or replace function public.owner_day_v2(p_pitch uuid, p_day date)
returns table (id uuid, starts_at timestamptz, ends_at timestamptz, status text, size int, total numeric, player_name text, no_show boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (public.is_admin() or exists (select 1 from public.pitches p where p.id = p_pitch and p.owner_id = auth.uid())) then raise exception 'not_your_pitch'; end if;
  return query
    select b.id, b.starts_at, b.ends_at, b.status, b.size, b.total, coalesce(pr.name, ''), b.no_show
    from public.bookings b left join public.profiles pr on pr.id = b.user_id
    where b.pitch_id = p_pitch and b.status <> 'cancelled'
      and b.starts_at < ((p_day + 1)::timestamp at time zone 'Asia/Kuwait') and b.ends_at > (p_day::timestamp at time zone 'Asia/Kuwait')
    order by b.starts_at;
end $$;

-- Player stats include tournament goals, MVPs, titles and booking no-shows.
create or replace function public.player_stats(p_user uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'played', (select count(*) from public.match_players mp join public.matches m on m.id = mp.match_id where mp.user_id = p_user and m.status = 'played')
              + (select count(*) from public.fixtures f join public.team_players tp on tp.team_id in (f.home_id, f.away_id) where tp.user_id = p_user and f.status = 'played'),
    'noShows', (select count(*) from public.match_players mp join public.matches m on m.id = mp.match_id where mp.user_id = p_user and m.status = 'played' and not mp.attended)
               + (select count(*) from public.bookings where user_id = p_user and no_show),
    'mvp', (select count(*) from (select match_id, player_id, rank() over (partition by match_id order by count(*) desc) r from public.mvp_votes group by match_id, player_id) x where x.player_id = p_user and x.r = 1)
           + (select count(*) from public.fixtures where mvp_id = p_user),
    'bookings', (select count(*) from public.bookings where user_id = p_user and status = 'confirmed'),
    'goals', (select count(*) from public.match_events where player_id = p_user and kind = 'goal'),
    'cards', (select count(*) from public.match_events where player_id = p_user and kind in ('yellow', 'red')),
    'tournaments', (select count(distinct tournament_id) from public.team_players where user_id = p_user),
    'titles', (select count(*) from public.tournament_awards a join public.team_players tp on tp.team_id = a.team_id where a.kind = 'champion' and tp.user_id = p_user)
  )
$$;

-- ============================================================== 5. admin moderation
alter table public.profiles add column if not exists suspended boolean not null default false;

create or replace function public._block_suspended() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.profiles where id = auth.uid() and suspended) then raise exception 'account_suspended'; end if;
  return new;
end $$;
do $$
declare tbl text;
begin
  foreach tbl in array array['bookings', 'match_players', 'tournament_teams', 'team_players', 'academy_enrollments', 'support_tickets', 'pitch_reviews', 'matches'] loop
    execute format('drop trigger if exists block_suspended on public.%I', tbl);
    execute format('create trigger block_suspended before insert on public.%I for each row execute function public._block_suspended()', tbl);
  end loop;
end $$;

create or replace function public.admin_set_suspended(p_user uuid, p_suspended boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public._require_admin();
  if p_user = auth.uid() then raise exception 'cannot_demote_self'; end if;
  update public.profiles set suspended = p_suspended where id = p_user;
  perform public._billing_hide_owner(p_user, p_suspended);
  perform public._notify(p_user, case when p_suspended then 'account_suspended' else 'account_restored' end,
    case when p_suspended then 'انوقف حسابك' else 'رجع حسابك' end, case when p_suspended then 'Your account is suspended' else 'Your account is restored' end,
    case when p_suspended then 'تواصل مع الدعم الفني للتفاصيل.' else 'تقدر تستخدم التطبيق عادي.' end,
    case when p_suspended then 'Contact support for details.' else 'You can use the app again.' end, '{}'::jsonb);
end $$;

create or replace function public.admin_delete_user(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public._require_admin();
  if p_user = auth.uid() then raise exception 'cannot_demote_self'; end if;
  update public.matches set status = 'cancelled' where organizer_id = p_user and status = 'open' and starts_at > now();
  update public.bookings set status = 'cancelled' where user_id = p_user and status = 'confirmed' and starts_at > now();
  delete from public.pitches where owner_id = p_user and status <> 'approved';
  perform set_config('aldawri.system', 'on', true);
  update public.pitches set active = false, owner_id = null where owner_id = p_user;
  delete from public.academies where owner_id = p_user and status <> 'approved';
  update public.academies set active = false, owner_id = null where owner_id = p_user;
  perform set_config('aldawri.system', 'off', true);
  delete from auth.users where id = p_user;
end $$;

-- Admin user list gains the suspended flag (new function; the old one stays for older app versions).
create or replace function public.admin_users_v2(p_search text default '')
returns table (id uuid, name text, role text, suspended boolean, avatar_url text, created_at timestamptz, bookings bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public._require_admin();
  return query
    select p.id, p.name, p.role, p.suspended, p.avatar_url, p.created_at, (select count(*) from public.bookings b where b.user_id = p.id)
    from public.profiles p
    where coalesce(p_search, '') = '' or p.name ilike '%' || p_search || '%'
    order by p.created_at desc limit 300;
end $$;

-- ============================================================== 6. academy fees & attendance
create table if not exists public.enrollment_payments (
  enrollment_id uuid not null references public.academy_enrollments (id) on delete cascade,
  month date not null,
  paid_at timestamptz not null default now(),
  marked_by uuid references public.profiles (id) on delete set null,
  primary key (enrollment_id, month)
);
create table if not exists public.attendance (
  enrollment_id uuid not null references public.academy_enrollments (id) on delete cascade,
  day date not null,
  present boolean not null,
  marked_by uuid references public.profiles (id) on delete set null,
  primary key (enrollment_id, day)
);
alter table public.enrollment_payments enable row level security;
alter table public.attendance enable row level security;

create or replace function public._can_see_enrollment(p_enrollment uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.academy_enrollments e join public.academy_programs pr on pr.id = e.program_id
    where e.id = p_enrollment and (e.user_id = (select auth.uid()) or public.owns_academy(pr.academy_id) or public.is_admin()))
$$;
drop policy if exists "parents and academy owners see payments" on public.enrollment_payments;
create policy "parents and academy owners see payments" on public.enrollment_payments for select to authenticated using (public._can_see_enrollment(enrollment_id));
drop policy if exists "parents and academy owners see attendance" on public.attendance;
create policy "parents and academy owners see attendance" on public.attendance for select to authenticated using (public._can_see_enrollment(enrollment_id));

create or replace function public._require_academy_of_enrollment(p_enrollment uuid) returns public.academy_enrollments
language plpgsql security definer set search_path = '' as $$
declare e public.academy_enrollments;
begin
  select e2.* into e from public.academy_enrollments e2 join public.academy_programs pr on pr.id = e2.program_id
  where e2.id = p_enrollment and (public.owns_academy(pr.academy_id) or public.is_admin());
  if not found then raise exception 'not_allowed'; end if;
  return e;
end $$;

create or replace function public.academy_mark_paid(p_enrollment uuid, p_month date, p_paid boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare e public.academy_enrollments; v_month date := date_trunc('month', p_month)::date;
begin
  e := public._require_academy_of_enrollment(p_enrollment);
  if p_paid then
    insert into public.enrollment_payments (enrollment_id, month, marked_by) values (p_enrollment, v_month, auth.uid()) on conflict do nothing;
    perform public._notify(e.user_id, 'academy_fee_paid', 'تم استلام رسوم الأكاديمية ✅', 'Academy fee received ✅',
      e.child_name || ' · ' || to_char(v_month, 'MM/YYYY'), e.child_name || ' · ' || to_char(v_month, 'MM/YYYY'), jsonb_build_object('enrollment_id', p_enrollment));
  else
    delete from public.enrollment_payments where enrollment_id = p_enrollment and month = v_month;
  end if;
end $$;

create or replace function public.academy_mark_attendance(p_enrollment uuid, p_day date, p_present boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public._require_academy_of_enrollment(p_enrollment);
  if p_present is null then
    delete from public.attendance where enrollment_id = p_enrollment and day = p_day;
  else
    insert into public.attendance (enrollment_id, day, present, marked_by) values (p_enrollment, p_day, p_present, auth.uid())
    on conflict (enrollment_id, day) do update set present = excluded.present, marked_by = excluded.marked_by;
  end if;
end $$;

-- ============================================================== grants
revoke execute on function public._billing_hide_owner(uuid, boolean), public._owner_listing_names(uuid, text), public._guard_reg_deadline(),
  public._block_suspended(), public._require_academy_of_enrollment(uuid) from public, anon, authenticated;
revoke execute on function public._can_see_enrollment(uuid) from public, anon;
grant execute on function public._can_see_enrollment(uuid) to authenticated;
do $$
declare f text;
begin
  foreach f in array array[
    'update_pitch_details(uuid, text, text, text, text, text, int[], text, boolean, double precision, double precision, text[])',
    'update_academy_details(uuid, text, text, text, text, text, double precision, double precision, text[])',
    'update_tournament(uuid, text, text, numeric, numeric, numeric, text, int, date, date, int, int, int)',
    'tournament_roster_check(uuid)', 'invite_fixed_team(uuid, uuid)', 'owner_cancel_booking(uuid, text)', 'owner_mark_no_show(uuid, boolean)',
    'owner_day_v2(uuid, date)', 'admin_set_suspended(uuid, boolean)', 'admin_delete_user(uuid)', 'admin_users_v2(text)',
    'academy_mark_paid(uuid, date, boolean)', 'academy_mark_attendance(uuid, date, boolean)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

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
