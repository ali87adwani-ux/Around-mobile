-- Run ONCE on launch day (Supabase → SQL Editor), after turning off
-- Authentication → Sign In / Providers → "Allow anonymous sign-ins".
-- Removes the sample content so only real owners' pitches and academies appear.

begin;
-- Sample pitches (never submitted by an owner). Their sample bookings, games and reviews go with them.
delete from public.pitches where submitted_at is null and owner_id is null;
-- Sample tournaments and academies.
delete from public.tournaments;
delete from public.academies where owner_id is null;
-- Test accounts made with "Try without an account".
delete from auth.users where is_anonymous;
commit;
