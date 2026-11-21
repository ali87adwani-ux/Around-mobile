-- Al Dawri update 3: academy owners list their academy (admin approval).
-- Paste all of this in Supabase → SQL Editor → Run.

-- Academy owners list their academy themselves; an admin approves it before it goes live
-- (same flow as pitches).

alter table public.academies add column if not exists status text not null default 'approved'
  check (status in ('pending', 'approved', 'rejected'));
alter table public.academies add column if not exists submitted_at timestamptz;

create table if not exists public.academy_submissions (
  academy_id uuid primary key references public.academies (id) on delete cascade,
  owner_id uuid references public.profiles (id) on delete set null,
  contact_phone text not null default '',
  note text not null default '',
  reject_reason text not null default '',
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.academy_submissions enable row level security;
drop policy if exists "owners and admins see academy submissions" on public.academy_submissions;
create policy "owners and admins see academy submissions" on public.academy_submissions
  for select to authenticated using (owner_id = (select auth.uid()) or public.is_admin());

-- Owners may edit their academy's details, but never approve it themselves.
create or replace function public._guard_academy() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.active and new.status <> 'approved' then raise exception 'academy_not_approved'; end if;
  if tg_op = 'UPDATE' and not public.is_admin() and coalesce(current_setting('aldawri.system', true), '') <> 'on' then
    if new.status is distinct from old.status or new.owner_id is distinct from old.owner_id or new.rating is distinct from old.rating then
      raise exception 'not_allowed';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists academy_guard on public.academies;
create trigger academy_guard before insert or update on public.academies
  for each row execute function public._guard_academy();

create or replace function public.submit_academy(p_name text, p_area text, p_governorate text, p_about text, p_phone text, p_note text default '')
returns public.academies
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_row public.academies;
  v_tints text[][] := array[array['#0B2E6F', '#1E56B3'], array['#0F5F5C', '#1E9B8F'], array['#3A2F7A', '#6457C2'], array['#5C2A1E', '#B5573C'], array['#1F3A5C', '#3F7CB5']];
  v_i int := 1 + floor(random() * 5)::int;
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;
  if length(trim(coalesce(p_name, ''))) < 3 or length(trim(coalesce(p_area, ''))) < 2 then raise exception 'invalid_name'; end if;
  if p_governorate not in ('capital', 'hawalli', 'farwaniya', 'ahmadi', 'jahra', 'mubarak_alkabeer') then raise exception 'invalid_name'; end if;
  if length(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')) < 8 then raise exception 'invalid_phone'; end if;
  if (select count(*) from public.academies where owner_id = v_uid and status = 'pending') >= 2 then raise exception 'too_many_pending'; end if;

  insert into public.academies (owner_id, name_ar, name_en, area_ar, area_en, governorate, about_ar, about_en, tint, active, status, submitted_at)
  values (v_uid, trim(p_name), trim(p_name), trim(p_area), trim(p_area), p_governorate, left(trim(coalesce(p_about, '')), 600), left(trim(coalesce(p_about, '')), 600),
          array[v_tints[v_i][1], v_tints[v_i][2]], false, 'pending', now())
  returning * into v_row;
  insert into public.academy_submissions (academy_id, owner_id, contact_phone, note)
  values (v_row.id, v_uid, trim(p_phone), left(trim(coalesce(p_note, '')), 500));
  return v_row;
end $$;

create or replace function public.admin_review_academy(p_academy uuid, p_approve boolean, p_reason text default '')
returns void language plpgsql security definer set search_path = '' as $$
declare v_owner uuid;
begin
  perform public._require_admin();
  select owner_id into v_owner from public.academies where id = p_academy and status = 'pending';
  if not found then raise exception 'not_found'; end if;
  if p_approve then
    update public.academies set status = 'approved', active = true where id = p_academy;
    update public.profiles set role = 'academy' where id = v_owner and role = 'player';
  else
    update public.academies set status = 'rejected', active = false where id = p_academy;
  end if;
  update public.academy_submissions set reviewed_by = auth.uid(), reviewed_at = now(), reject_reason = left(coalesce(p_reason, ''), 300)
   where academy_id = p_academy;
end $$;

create or replace function public.admin_academy_submissions()
returns table (academy_id uuid, owner_id uuid, owner_name text, contact_phone text, note text, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public._require_admin();
  return query
    select s.academy_id, s.owner_id, coalesce(pr.name, ''), s.contact_phone, s.note, s.created_at
    from public.academy_submissions s
    join public.academies a on a.id = s.academy_id and a.status = 'pending'
    left join public.profiles pr on pr.id = s.owner_id
    order by s.created_at;
end $$;

create or replace function public.withdraw_academy(p_academy uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.academies where id = p_academy and owner_id = auth.uid() and status in ('pending', 'rejected');
  if not found then raise exception 'not_found'; end if;
end $$;

-- Tell the owner about the decision.
create or replace function public._on_academy_review() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.status = 'pending' and new.status = 'approved' then
    perform public._notify(new.owner_id, 'academy_approved', 'أكاديميتك صارت ظاهرة 🎉', 'Your academy is live 🎉',
      new.name_ar || ' انقبلت. ضيف برامجك من لوحة الأكاديمية عشان يبدأ أولياء الأمور يسجلون.',
      new.name_en || ' was approved. Add your programs from the academy dashboard so parents can enrol.',
      jsonb_build_object('academy_id', new.id));
  elsif old.status = 'pending' and new.status = 'rejected' then
    perform public._notify(new.owner_id, 'academy_rejected', 'طلب الأكاديمية ما انقبل', 'Academy not approved',
      'راجع تفاصيل ' || new.name_ar || ' أو تواصل مع الدعم.', 'Check the details of ' || new.name_en || ' or contact support.',
      jsonb_build_object('academy_id', new.id));
  end if;
  return new;
end $$;
drop trigger if exists academy_review_notify on public.academies;
create trigger academy_review_notify after update of status on public.academies
  for each row execute function public._on_academy_review();

-- Account deletion also removes academies still waiting for review.
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = '' as $$
declare v uuid := auth.uid();
begin
  if v is null then raise exception 'not_signed_in'; end if;
  if exists (select 1 from public.profiles where id = v and role = 'admin')
     and (select count(*) from public.profiles where role = 'admin') = 1 then
    raise exception 'last_admin';
  end if;
  update public.matches set status = 'cancelled' where organizer_id = v and status = 'open' and starts_at > now();
  update public.bookings set status = 'cancelled' where user_id = v and status = 'confirmed' and starts_at > now();
  delete from public.pitches where owner_id = v and status <> 'approved';
  update public.pitches set active = false, owner_id = null where owner_id = v;
  delete from public.academies where owner_id = v and status <> 'approved';
  -- The owner is giving up their academy: let this system update past the owner-change guard.
  perform set_config('aldawri.system', 'on', true);
  update public.academies set active = false, owner_id = null where owner_id = v;
  perform set_config('aldawri.system', 'off', true);
  delete from auth.users where id = v;
end $$;

revoke execute on function public._guard_academy(), public._on_academy_review() from public, anon, authenticated;
revoke execute on function public.submit_academy(text, text, text, text, text, text), public.admin_review_academy(uuid, boolean, text),
  public.admin_academy_submissions(), public.withdraw_academy(uuid) from public, anon;
grant execute on function public.submit_academy(text, text, text, text, text, text), public.admin_review_academy(uuid, boolean, text),
  public.admin_academy_submissions(), public.withdraw_academy(uuid) to authenticated;
