-- Subscriptions for pitch and academy owners.
-- Each approved pitch / academy gets a free first month, then a monthly invoice (default 100 KD).
-- Owners pay through the bank's payment link (KNET / Apple Pay) outside the app and tap "I paid";
-- an admin confirms. Unpaid listings are hidden after a grace period and come back once paid.

insert into public.app_settings (key, value) values
  ('subscription_price_pitch', '100'),
  ('subscription_price_academy', '100'),
  ('trial_days', '30'),
  ('grace_days', '7'),
  ('payment_link', '""')
on conflict (key) do nothing;

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('pitch', 'academy')),
  listing_id uuid not null,
  status text not null default 'trial' check (status in ('trial', 'active', 'past_due', 'suspended', 'cancelled')),
  price numeric(9, 3) not null,
  trial_ends_at timestamptz not null,
  paid_until timestamptz not null,
  created_at timestamptz not null default now(),
  unique (kind, listing_id)
);
create index if not exists subscriptions_owner_idx on public.subscriptions (owner_id);
alter table public.subscriptions enable row level security;
drop policy if exists "owners and admins see subscriptions" on public.subscriptions;
create policy "owners and admins see subscriptions" on public.subscriptions
  for select to authenticated using (owner_id = (select auth.uid()) or public.is_admin());

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.subscriptions (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  period_start timestamptz not null,
  period_end timestamptz not null,
  amount numeric(9, 3) not null,
  status text not null default 'unpaid' check (status in ('unpaid', 'claimed', 'paid', 'void')),
  due_at timestamptz not null,
  claimed_at timestamptz,
  paid_at timestamptz,
  marked_by uuid references public.profiles (id) on delete set null,
  payment_link text not null default '',
  note text not null default '',
  created_at timestamptz not null default now(),
  unique (subscription_id, period_start)
);
create index if not exists invoices_owner_idx on public.invoices (owner_id, created_at desc);
create index if not exists invoices_status_idx on public.invoices (status, due_at);
alter table public.invoices enable row level security;
drop policy if exists "owners and admins see invoices" on public.invoices;
create policy "owners and admins see invoices" on public.invoices
  for select to authenticated using (owner_id = (select auth.uid()) or public.is_admin());

create or replace function public._setting_num(p_key text, p_default numeric) returns numeric
language sql stable security definer set search_path = '' as $$
  select coalesce((select (value #>> '{}')::numeric from public.app_settings where key = p_key), p_default)
$$;

create or replace function public._listing_name(p_kind text, p_id uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case when p_kind = 'pitch' then (select name_ar from public.pitches where id = p_id)
              else (select name_ar from public.academies where id = p_id) end
$$;

create or replace function public._notify_admins(p_kind text, p_title_ar text, p_title_en text, p_body_ar text, p_body_en text, p_data jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  for r in select id from public.profiles where role = 'admin' loop
    perform public._notify(r.id, p_kind, p_title_ar, p_title_en, p_body_ar, p_body_en, p_data);
  end loop;
end $$;

-- Show / hide a listing as a system action (bypasses the owner guards).
create or replace function public._set_listing_active(p_kind text, p_id uuid, p_active boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('aldawri.system', 'on', true);
  if p_kind = 'pitch' then update public.pitches set active = p_active where id = p_id and status = 'approved';
  else update public.academies set active = p_active where id = p_id and status = 'approved'; end if;
  perform set_config('aldawri.system', 'off', true);
end $$;

-- Owners cannot switch a suspended listing back on themselves.
create or replace function public._guard_subscription_active() returns trigger
language plpgsql set search_path = '' as $$
declare v_kind text := case when tg_table_name = 'pitches' then 'pitch' else 'academy' end;
begin
  if new.active and not old.active and coalesce(current_setting('aldawri.system', true), '') <> 'on' and not public.is_admin()
     and exists (select 1 from public.subscriptions s where s.kind = v_kind and s.listing_id = new.id and s.status = 'suspended') then
    raise exception 'subscription_suspended';
  end if;
  return new;
end $$;
drop trigger if exists pitch_subscription_guard on public.pitches;
create trigger pitch_subscription_guard before update on public.pitches
  for each row execute function public._guard_subscription_active();
drop trigger if exists academy_subscription_guard on public.academies;
create trigger academy_subscription_guard before update on public.academies
  for each row execute function public._guard_subscription_active();

-- Starts the free month for an owner's approved listing (idempotent).
create or replace function public._ensure_subscription(p_kind text, p_id uuid, p_owner uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_trial timestamptz := now() + make_interval(days => public._setting_num('trial_days', 30)::int);
begin
  if p_owner is null or exists (select 1 from public.profiles where id = p_owner and role = 'admin') then return; end if;
  insert into public.subscriptions (owner_id, kind, listing_id, status, price, trial_ends_at, paid_until)
  values (p_owner, p_kind, p_id, 'trial', public._setting_num('subscription_price_' || p_kind, 100), v_trial, v_trial)
  on conflict (kind, listing_id) do update set owner_id = excluded.owner_id
    where public.subscriptions.owner_id is distinct from excluded.owner_id;
end $$;

create or replace function public._on_listing_owned() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_kind text := case when tg_table_name = 'pitches' then 'pitch' else 'academy' end;
begin
  if new.status = 'approved' and new.owner_id is not null
     and (tg_op = 'INSERT' or old.status is distinct from new.status or old.owner_id is distinct from new.owner_id) then
    perform public._ensure_subscription(v_kind, new.id, new.owner_id);
  end if;
  return new;
end $$;
drop trigger if exists pitch_subscription_start on public.pitches;
create trigger pitch_subscription_start after insert or update of status, owner_id on public.pitches
  for each row execute function public._on_listing_owned();
drop trigger if exists academy_subscription_start on public.academies;
create trigger academy_subscription_start after insert or update of status, owner_id on public.academies
  for each row execute function public._on_listing_owned();

-- Daily billing: issue next month's invoice 3 days before the paid period ends, remind on the due date,
-- hide the listing once the grace period has passed.
create or replace function public.run_billing() returns int
language plpgsql security definer set search_path = '' as $$
declare
  s record; i record; v_id uuid; v_n int := 0;
  v_grace int := public._setting_num('grace_days', 7)::int;
  v_link text := coalesce((select value #>> '{}' from public.app_settings where key = 'payment_link'), '');
begin
  -- Listings owned before subscriptions existed get their free month now.
  for s in select 'pitch' k, id, owner_id from public.pitches where status = 'approved' and owner_id is not null
           union all select 'academy', id, owner_id from public.academies where status = 'approved' and owner_id is not null loop
    perform public._ensure_subscription(s.k, s.id, s.owner_id);
  end loop;

  for s in select * from public.subscriptions where status in ('trial', 'active', 'past_due') and paid_until < now() + interval '3 days' loop
    if not exists (select 1 from public.invoices where subscription_id = s.id and period_start = s.paid_until) then
      insert into public.invoices (subscription_id, owner_id, period_start, period_end, amount, due_at, payment_link)
      values (s.id, s.owner_id, s.paid_until, s.paid_until + interval '1 month', s.price, s.paid_until, v_link)
      returning id into v_id;
      v_n := v_n + 1;
      perform public._notify(s.owner_id, 'invoice_new', 'فاتورة اشتراك جديدة 🧾', 'New subscription invoice 🧾',
        public._listing_name(s.kind, s.listing_id) || ': ' || s.price || ' د.ك · آخر موعد ' || to_char(s.paid_until at time zone 'Asia/Kuwait', 'DD/MM'),
        coalesce(public._listing_name(s.kind, s.listing_id), '') || ': ' || s.price || ' KD · due ' || to_char(s.paid_until at time zone 'Asia/Kuwait', 'DD/MM'),
        jsonb_build_object('invoice_id', v_id));
    end if;
  end loop;

  -- Overdue: past the due date → past_due; past the grace period → suspended and hidden.
  for i in select inv.*, sub.kind, sub.listing_id, sub.status sub_status from public.invoices inv join public.subscriptions sub on sub.id = inv.subscription_id
           where inv.status in ('unpaid', 'claimed') and inv.due_at < now() loop
    if i.due_at < now() - make_interval(days => v_grace) and i.status = 'unpaid' then
      if i.sub_status <> 'suspended' then
        update public.subscriptions set status = 'suspended' where id = i.subscription_id;
        perform public._set_listing_active(i.kind, i.listing_id, false);
        perform public._notify(i.owner_id, 'subscription_suspended', 'انوقف ظهور إعلانك', 'Your listing is paused',
          coalesce(public._listing_name(i.kind, i.listing_id), '') || ' انخفى من التطبيق لين تسدد الفاتورة.',
          'Hidden from the app until the invoice is paid.', jsonb_build_object('invoice_id', i.id));
      end if;
    elsif i.sub_status in ('trial', 'active') then
      update public.subscriptions set status = 'past_due' where id = i.subscription_id;
      perform public._notify(i.owner_id, 'invoice_due', 'تذكير: فاتورة مستحقة ⏰', 'Reminder: invoice due ⏰',
        'سدد خلال ' || v_grace || ' أيام عشان يظل إعلانك ظاهر.', 'Pay within ' || v_grace || ' days to keep your listing visible.', jsonb_build_object('invoice_id', i.id));
    end if;
  end loop;
  return v_n;
end $$;

-- Owner taps "I paid" after paying through the bank link.
create or replace function public.claim_invoice_paid(p_invoice uuid, p_note text default '') returns void
language plpgsql security definer set search_path = '' as $$
declare v public.invoices;
begin
  select * into v from public.invoices where id = p_invoice and owner_id = auth.uid();
  if not found then raise exception 'not_found'; end if;
  if v.status <> 'unpaid' then raise exception 'invalid_status'; end if;
  update public.invoices set status = 'claimed', claimed_at = now(), note = left(coalesce(p_note, ''), 300) where id = p_invoice;
  perform public._notify_admins('payment_claimed', 'صاحب إعلان يقول إنه دفع 💵', 'An owner says they paid 💵',
    coalesce((select name from public.profiles where id = v.owner_id), '') || ' · ' || v.amount || ' د.ك', v.amount || ' KD', jsonb_build_object('invoice_id', p_invoice));
end $$;

-- Admin confirms the money arrived: extends the subscription and shows the listing again.
create or replace function public.admin_mark_invoice(p_invoice uuid, p_status text) returns void
language plpgsql security definer set search_path = '' as $$
declare v public.invoices; s public.subscriptions;
begin
  perform public._require_admin();
  if p_status not in ('paid', 'unpaid', 'void') then raise exception 'invalid_status'; end if;
  select * into v from public.invoices where id = p_invoice;
  if not found then raise exception 'not_found'; end if;
  select * into s from public.subscriptions where id = v.subscription_id;
  update public.invoices set status = p_status, paid_at = case when p_status = 'paid' then now() end, marked_by = auth.uid() where id = p_invoice;
  if p_status = 'paid' then
    update public.subscriptions set status = 'active', paid_until = greatest(paid_until, v.period_end) where id = s.id;
    if s.status = 'suspended' then perform public._set_listing_active(s.kind, s.listing_id, true); end if;
    perform public._notify(v.owner_id, 'invoice_paid', 'وصلنا الدفع، شكراً ✅', 'Payment received, thank you ✅',
      coalesce(public._listing_name(s.kind, s.listing_id), '') || ' · ' || v.amount || ' د.ك', v.amount || ' KD', jsonb_build_object('invoice_id', p_invoice));
  elsif p_status = 'void' and s.status in ('past_due', 'suspended') then
    update public.subscriptions set status = 'active', paid_until = greatest(paid_until, v.period_end) where id = s.id;
    if s.status = 'suspended' then perform public._set_listing_active(s.kind, s.listing_id, true); end if;
  end if;
end $$;

-- Admin settings: prices, free period, grace, bank payment link. Prices apply to new invoices.
create or replace function public.admin_set_billing(p_price_pitch numeric, p_price_academy numeric, p_trial_days int, p_grace_days int, p_link text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public._require_admin();
  if p_price_pitch < 0 or p_price_academy < 0 or p_trial_days < 0 or p_grace_days < 0 then raise exception 'invalid_price'; end if;
  update public.app_settings set value = to_jsonb(p_price_pitch) where key = 'subscription_price_pitch';
  update public.app_settings set value = to_jsonb(p_price_academy) where key = 'subscription_price_academy';
  update public.app_settings set value = to_jsonb(p_trial_days) where key = 'trial_days';
  update public.app_settings set value = to_jsonb(p_grace_days) where key = 'grace_days';
  update public.app_settings set value = to_jsonb(coalesce(trim(p_link), '')) where key = 'payment_link';
  update public.subscriptions set price = case when kind = 'pitch' then p_price_pitch else p_price_academy end where status <> 'cancelled';
  update public.invoices set payment_link = coalesce(trim(p_link), '') where status = 'unpaid';
end $$;

-- Lists with the listing name, for owner and admin screens.
create or replace function public.billing_overview(p_all boolean default false)
returns table (subscription_id uuid, owner_id uuid, owner_name text, kind text, listing_id uuid, listing_name text, status text, price numeric,
               trial_ends_at timestamptz, paid_until timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_all then perform public._require_admin(); end if;
  return query
    select s.id, s.owner_id, coalesce(pr.name, ''), s.kind, s.listing_id, coalesce(public._listing_name(s.kind, s.listing_id), ''), s.status, s.price, s.trial_ends_at, s.paid_until
    from public.subscriptions s left join public.profiles pr on pr.id = s.owner_id
    where case when p_all then true else s.owner_id = auth.uid() end
    order by s.status = 'suspended' desc, s.paid_until;
end $$;

do $$ begin
  perform cron.schedule('aldawri-billing', '23 6 * * *', 'select public.run_billing()');
exception when others then
  raise notice 'pg_cron not available: run public.run_billing() daily';
end $$;

revoke execute on function public._setting_num(text, numeric), public._listing_name(text, uuid), public._notify_admins(text, text, text, text, text, jsonb),
  public._set_listing_active(text, uuid, boolean), public._guard_subscription_active(), public._ensure_subscription(text, uuid, uuid),
  public._on_listing_owned() from public, anon, authenticated;
revoke execute on function public.run_billing(), public.claim_invoice_paid(uuid, text), public.admin_mark_invoice(uuid, text),
  public.admin_set_billing(numeric, numeric, int, int, text), public.billing_overview(boolean) from public, anon;
grant execute on function public.claim_invoice_paid(uuid, text), public.admin_mark_invoice(uuid, text),
  public.admin_set_billing(numeric, numeric, int, int, text), public.billing_overview(boolean) to authenticated;

-- Admins can trigger the billing run from the dashboard.
create or replace function public.admin_run_billing() returns int
language plpgsql security definer set search_path = '' as $$
begin
  perform public._require_admin();
  return public.run_billing();
end $$;
revoke execute on function public.admin_run_billing() from public, anon;
grant execute on function public.admin_run_billing() to authenticated;
