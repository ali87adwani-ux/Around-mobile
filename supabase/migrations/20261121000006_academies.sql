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
