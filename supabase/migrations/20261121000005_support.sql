-- Technical support: tickets with a message thread. Players see their own tickets; admins see all.

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin')
$$;
grant execute on function public.is_admin() to authenticated;

create table public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  category text not null check (category in ('booking', 'payment', 'account', 'pitch', 'academy', 'other')),
  subject text not null check (length(subject) between 3 and 120),
  status text not null default 'open' check (status in ('open', 'answered', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index support_tickets_user_idx on public.support_tickets (user_id, updated_at desc);
create index support_tickets_status_idx on public.support_tickets (status, updated_at desc);

create table public.support_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  from_support boolean not null default false,
  body text not null check (length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index support_messages_ticket_idx on public.support_messages (ticket_id, created_at);

alter table public.support_tickets enable row level security;
alter table public.support_messages enable row level security;

create policy "users see their tickets, admins see all" on public.support_tickets
  for select to authenticated using (user_id = (select auth.uid()) or public.is_admin());
create policy "users open tickets" on public.support_tickets
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "users close their tickets, admins update any" on public.support_tickets
  for update to authenticated using (user_id = (select auth.uid()) or public.is_admin());

create policy "thread visible to ticket owner and admins" on public.support_messages
  for select to authenticated using (
    public.is_admin() or exists (select 1 from public.support_tickets t where t.id = ticket_id and t.user_id = (select auth.uid()))
  );
create policy "ticket owner and admins post messages" on public.support_messages
  for insert to authenticated with check (
    author_id = (select auth.uid()) and (
      (from_support and public.is_admin())
      or (not from_support and exists (select 1 from public.support_tickets t where t.id = ticket_id and t.user_id = (select auth.uid())))
    )
  );

-- Keep ticket status and ordering in step with the thread.
create or replace function public.on_support_message() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.support_tickets
     set updated_at = now(),
         status = case when new.from_support then 'answered' else 'open' end
   where id = new.ticket_id;
  return new;
end $$;
create trigger support_message_added after insert on public.support_messages
  for each row execute function public.on_support_message();
