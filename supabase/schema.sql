create extension if not exists pgcrypto;

create table if not exists public.application_groups (
  group_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.roles (
  role_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  group_id uuid references public.application_groups(group_id) on delete cascade,
  role_title text not null,
  company text not null,
  external_link text default '',
  source text default '',
  internal_link text default '',
  date_posted date default current_date,
  date_applied date not null default current_date,
  work_mode text default 'In Person',
  employment_type text default 'Full Time',
  location text default '',
  referrer text default '',
  salary text default '',
  notes text default '',
  created_at timestamptz not null default now()
);

create table if not exists public.status_history (
  event_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role_id uuid not null references public.roles(role_id) on delete cascade,
  status text not null,
  changed_at date not null default current_date,
  notes text default '',
  created_at timestamptz not null default now()
);

alter table public.application_groups add column if not exists notes text default '';
alter table public.roles add column if not exists group_id uuid references public.application_groups(group_id) on delete cascade;
alter table public.roles alter column work_mode set default 'In Person';

alter table public.application_groups enable row level security;
alter table public.roles enable row level security;
alter table public.status_history enable row level security;

grant select, insert, update, delete on public.application_groups to authenticated;
grant select, insert, update, delete on public.roles to authenticated;
grant select, insert, update, delete on public.status_history to authenticated;

drop policy if exists "Users can read their application groups" on public.application_groups;
create policy "Users can read their application groups"
on public.application_groups for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert their application groups" on public.application_groups;
create policy "Users can insert their application groups"
on public.application_groups for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their application groups" on public.application_groups;
create policy "Users can update their application groups"
on public.application_groups for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their application groups" on public.application_groups;
create policy "Users can delete their application groups"
on public.application_groups for delete
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can read their roles" on public.roles;
create policy "Users can read their roles"
on public.roles for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert their roles" on public.roles;
create policy "Users can insert their roles"
on public.roles for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and (
    group_id is null
    or exists (
      select 1
      from public.application_groups
      where application_groups.group_id = roles.group_id
        and application_groups.user_id = (select auth.uid())
    )
  )
);

drop policy if exists "Users can update their roles" on public.roles;
create policy "Users can update their roles"
on public.roles for update
to authenticated
using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and (
    group_id is null
    or exists (
      select 1
      from public.application_groups
      where application_groups.group_id = roles.group_id
        and application_groups.user_id = (select auth.uid())
    )
  )
);

drop policy if exists "Users can delete their roles" on public.roles;
create policy "Users can delete their roles"
on public.roles for delete
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can read their status events" on public.status_history;
create policy "Users can read their status events"
on public.status_history for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert status events for their roles" on public.status_history;
create policy "Users can insert status events for their roles"
on public.status_history for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1
    from public.roles
    where roles.role_id = status_history.role_id
      and roles.user_id = (select auth.uid())
  )
);

drop policy if exists "Users can update their status events" on public.status_history;
create policy "Users can update their status events"
on public.status_history for update
to authenticated
using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1
    from public.roles
    where roles.role_id = status_history.role_id
      and roles.user_id = (select auth.uid())
  )
);

drop policy if exists "Users can delete their status events" on public.status_history;
create policy "Users can delete their status events"
on public.status_history for delete
to authenticated
using ((select auth.uid()) = user_id);
