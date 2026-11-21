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
