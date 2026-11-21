-- Pitch owner reports: bookings and revenue per Kuwait day for the last N days.
create or replace function public.owner_report(p_pitch uuid, p_days int default 30)
returns table (day date, bookings bigint, hours numeric, revenue numeric)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public._own_pitch(p_pitch);
  return query
    select d::date,
           count(b.id),
           coalesce(sum(extract(epoch from (b.ends_at - b.starts_at)) / 3600), 0),
           coalesce(sum(b.total), 0)
    from generate_series((now() at time zone 'Asia/Kuwait')::date - (least(p_days, 90) - 1), (now() at time zone 'Asia/Kuwait')::date, interval '1 day') d
    left join public.bookings b
      on b.pitch_id = p_pitch and b.status = 'confirmed' and (b.starts_at at time zone 'Asia/Kuwait')::date = d::date
    group by d order by d;
end $$;
revoke execute on function public.owner_report(uuid, int) from public, anon;
grant execute on function public.owner_report(uuid, int) to authenticated;
