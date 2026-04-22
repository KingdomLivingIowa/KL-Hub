-- Run this in the Supabase SQL editor if accepting an application updates the
-- application but does not create a row in clients after enabling RLS.
--
-- This assumes every authenticated Supabase user is trusted staff for KL Hub.
-- If you have non-staff authenticated users, replace "to authenticated" with
-- a role check that matches your auth/users setup.

alter table public.clients enable row level security;
alter table public.applications enable row level security;

drop policy if exists "staff can read clients" on public.clients;
create policy "staff can read clients"
on public.clients
for select
to authenticated
using (true);

drop policy if exists "staff can create clients" on public.clients;
create policy "staff can create clients"
on public.clients
for insert
to authenticated
with check (true);

drop policy if exists "staff can update clients" on public.clients;
create policy "staff can update clients"
on public.clients
for update
to authenticated
using (true)
with check (true);

drop policy if exists "staff can read applications" on public.applications;
create policy "staff can read applications"
on public.applications
for select
to authenticated
using (true);

drop policy if exists "staff can update applications" on public.applications;
create policy "staff can update applications"
on public.applications
for update
to authenticated
using (true)
with check (true);
