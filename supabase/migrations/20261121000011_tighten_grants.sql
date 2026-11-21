-- Trigger and internal helpers: never callable through the API.
revoke execute on function public.on_support_message(), public.promote_waitlist(), public._require_admin() from public, anon, authenticated;
-- Signed-in only (RLS helpers stay callable by authenticated because policies use them).
revoke execute on function public.cancel_enrollment(uuid), public.enroll_child(uuid, text, int), public.is_admin(),
  public.is_team_member(uuid), public.owns_academy(uuid), public.player_stats(uuid) from public, anon;
grant execute on function public.player_stats(uuid) to authenticated;
