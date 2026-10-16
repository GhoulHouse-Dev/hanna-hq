begin;

do $$
begin
  create type public.organization_role as enum ('OWNER', 'ADMIN', 'OPERATOR', 'VIEWER');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.client_workspace_status as enum ('ACTIVE', 'PAUSED', 'ARCHIVED');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organizations_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

create table if not exists public.organization_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.organization_role not null default 'VIEWER',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create table if not exists public.client_workspaces (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  company_name text not null,
  slug text not null,
  business_id text,
  industry text,
  website text,
  phone text,
  email text,
  city text,
  service_area text,
  status public.client_workspace_status not null default 'ACTIVE',
  currency char(3) not null default 'EUR',
  timezone text not null default 'Europe/Helsinki',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, slug),
  constraint client_workspaces_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint client_workspaces_currency_format check (currency ~ '^[A-Z]{3}$')
);

create index if not exists organization_memberships_user_id_idx
  on public.organization_memberships (user_id);

create index if not exists client_workspaces_organization_status_idx
  on public.client_workspaces (organization_id, status, company_name);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists organizations_touch_updated_at on public.organizations;
create trigger organizations_touch_updated_at
before update on public.organizations
for each row execute function public.touch_updated_at();

drop trigger if exists organization_memberships_touch_updated_at on public.organization_memberships;
create trigger organization_memberships_touch_updated_at
before update on public.organization_memberships
for each row execute function public.touch_updated_at();

drop trigger if exists client_workspaces_touch_updated_at on public.client_workspaces;
create trigger client_workspaces_touch_updated_at
before update on public.client_workspaces
for each row execute function public.touch_updated_at();

insert into public.organizations (name, slug)
values ('GhoulHouse', 'ghoulhouse')
on conflict (slug) do update set name = excluded.name;

insert into public.organization_memberships (organization_id, user_id, role)
select
  o.id,
  ur.user_id,
  case
    when ur.role::text = 'jami' then 'OWNER'::public.organization_role
    else 'OPERATOR'::public.organization_role
  end
from public.user_roles ur
join public.organizations o on o.slug = 'ghoulhouse'
where ur.role::text in ('jami', 'hanna')
on conflict (organization_id, user_id)
do update set role = excluded.role;

alter table public.organizations enable row level security;
alter table public.organization_memberships enable row level security;
alter table public.client_workspaces enable row level security;

revoke all on table public.organizations from anon, authenticated;
revoke all on table public.organization_memberships from anon, authenticated;
revoke all on table public.client_workspaces from anon, authenticated;

grant select on table public.organizations to authenticated;
grant select on table public.organization_memberships to authenticated;
grant select, insert, update on table public.client_workspaces to authenticated;

drop policy if exists "Organization members can read organizations" on public.organizations;
create policy "Organization members can read organizations"
on public.organizations
for select
to authenticated
using (
  exists (
    select 1
    from public.organization_memberships om
    where om.organization_id = organizations.id
      and om.user_id = (select auth.uid())
  )
);

drop policy if exists "Users can read own organization memberships" on public.organization_memberships;
create policy "Users can read own organization memberships"
on public.organization_memberships
for select
to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "Organization members can read client workspaces" on public.client_workspaces;
create policy "Organization members can read client workspaces"
on public.client_workspaces
for select
to authenticated
using (
  exists (
    select 1
    from public.organization_memberships om
    where om.organization_id = client_workspaces.organization_id
      and om.user_id = (select auth.uid())
  )
);

drop policy if exists "Owners and admins can create client workspaces" on public.client_workspaces;
create policy "Owners and admins can create client workspaces"
on public.client_workspaces
for insert
to authenticated
with check (
  exists (
    select 1
    from public.organization_memberships om
    where om.organization_id = client_workspaces.organization_id
      and om.user_id = (select auth.uid())
      and om.role in ('OWNER'::public.organization_role, 'ADMIN'::public.organization_role)
  )
);

drop policy if exists "Operators can update client workspaces" on public.client_workspaces;
create policy "Operators can update client workspaces"
on public.client_workspaces
for update
to authenticated
using (
  exists (
    select 1
    from public.organization_memberships om
    where om.organization_id = client_workspaces.organization_id
      and om.user_id = (select auth.uid())
      and om.role in (
        'OWNER'::public.organization_role,
        'ADMIN'::public.organization_role,
        'OPERATOR'::public.organization_role
      )
  )
)
with check (
  exists (
    select 1
    from public.organization_memberships om
    where om.organization_id = client_workspaces.organization_id
      and om.user_id = (select auth.uid())
      and om.role in (
        'OWNER'::public.organization_role,
        'ADMIN'::public.organization_role,
        'OPERATOR'::public.organization_role
      )
  )
);

commit;
