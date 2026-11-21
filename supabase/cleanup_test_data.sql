-- Removes the QA test user created during live testing, and everything linked to it
-- (bookings, game, team registration, child enrollment, support request, team).
delete from public.matches where organizer_id = 'aaaaaaaa-0000-4000-8000-000000000001';
delete from public.bookings where user_id = 'aaaaaaaa-0000-4000-8000-000000000001';
delete from public.tournament_teams where captain_id = 'aaaaaaaa-0000-4000-8000-000000000001';
delete from auth.users where id = 'aaaaaaaa-0000-4000-8000-000000000001';
