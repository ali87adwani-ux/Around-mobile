-- Pitch owners list their own pitches (reviewed by an admin before they go live),
-- and every user can delete their account from inside the app (App Store requirement).

-- ---------------------------------------------------------------- pitch submissions
alter table public.pitches add column if not exists status text not null default 'approved'
  check (status in ('pending', 'approved', 'rejected'));
alter table public.pitches add column if not exists submitted_at timestamptz;

-- Private details only the owner and admins see (the owner's contact number, notes, review result).
create table if not exists public.pitch_submissions (
  pitch_id uuid primary key references public.pitches (id) on delete cascade,
  owner_id uuid references public.profiles (id) on delete set null,
  contact_phone text not null default '',
  note text not null default '',
  reject_reason text not null default '',
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.pitch_submissions enable row level security;
create policy "owners and admins see submissions" on public.pitch_submissions
  for select to authenticated using (owner_id = (select auth.uid()) or public.is_admin());

-- A pitch can only be shown to players once an admin approved it.
create or replace function public._guard_pitch_active() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.active and new.status <> 'approved' then raise exception 'pitch_not_approved'; end if;
  return new;
end $$;
drop trigger if exists pitch_active_guard on public.pitches;
create trigger pitch_active_guard before insert or update on public.pitches
  for each row execute function public._guard_pitch_active();

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
  if p_sizes is null or array_length(p_sizes, 1) is null or not (p_sizes <@ array[5, 7, 11]) then raise exception 'invalid_size'; end if;
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

-- Admin decision on a submitted pitch. Approving makes the submitter a pitch owner.
create or replace function public.admin_review_pitch(p_pitch uuid, p_approve boolean, p_reason text default '')
returns void language plpgsql security definer set search_path = '' as $$
declare v_owner uuid;
begin
  perform public._require_admin();
  select owner_id into v_owner from public.pitches where id = p_pitch and status = 'pending';
  if not found then raise exception 'not_found'; end if;
  if p_approve then
    update public.pitches set status = 'approved', active = true where id = p_pitch;
    update public.profiles set role = 'owner' where id = v_owner and role = 'player';
  else
    update public.pitches set status = 'rejected', active = false where id = p_pitch;
  end if;
  update public.pitch_submissions set reviewed_by = auth.uid(), reviewed_at = now(), reject_reason = left(coalesce(p_reason, ''), 300)
   where pitch_id = p_pitch;
end $$;

-- Pending submissions with the private contact details, for the admin dashboard.
create or replace function public.admin_pitch_submissions()
returns table (pitch_id uuid, owner_id uuid, owner_name text, contact_phone text, note text, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public._require_admin();
  return query
    select s.pitch_id, s.owner_id, coalesce(pr.name, ''), s.contact_phone, s.note, s.created_at
    from public.pitch_submissions s
    join public.pitches p on p.id = s.pitch_id and p.status = 'pending'
    left join public.profiles pr on pr.id = s.owner_id
    order by s.created_at;
end $$;

-- A rejected or pending pitch can be withdrawn by its owner.
create or replace function public.withdraw_pitch(p_pitch uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.pitches where id = p_pitch and owner_id = auth.uid() and status in ('pending', 'rejected');
  if not found then raise exception 'not_found'; end if;
end $$;

-- ---------------------------------------------------------------- delete account
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = '' as $$
declare v uuid := auth.uid();
begin
  if v is null then raise exception 'not_signed_in'; end if;
  if exists (select 1 from public.profiles where id = v and role = 'admin')
     and (select count(*) from public.profiles where role = 'admin') = 1 then
    raise exception 'last_admin';
  end if;
  -- Free the slots this user still holds and call off the games they organise.
  update public.matches set status = 'cancelled' where organizer_id = v and status = 'open' and starts_at > now();
  update public.bookings set status = 'cancelled' where user_id = v and status = 'confirmed' and starts_at > now();
  -- Their listings come down with the account.
  delete from public.pitches where owner_id = v and status <> 'approved';
  update public.pitches set active = false, owner_id = null where owner_id = v;
  update public.academies set active = false, owner_id = null where owner_id = v;
  -- Everything else is removed by the foreign keys (cascade / set null).
  delete from auth.users where id = v;
end $$;

revoke execute on function public._guard_pitch_active() from public, anon, authenticated;
revoke execute on function public.submit_pitch(text, text, text, text, numeric, int[], text, boolean, text[], int, int, text, text, double precision, double precision),
  public.admin_review_pitch(uuid, boolean, text), public.admin_pitch_submissions(), public.withdraw_pitch(uuid),
  public.delete_my_account() from public, anon;
grant execute on function public.submit_pitch(text, text, text, text, numeric, int[], text, boolean, text[], int, int, text, text, double precision, double precision),
  public.admin_review_pitch(uuid, boolean, text), public.admin_pitch_submissions(), public.withdraw_pitch(uuid),
  public.delete_my_account() to authenticated;
